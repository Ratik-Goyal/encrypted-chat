const assert = require("node:assert/strict")
const { spawn, spawnSync } = require("node:child_process")
const { randomBytes } = require("node:crypto")
const path = require("node:path")
const test = require("node:test")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const mongoose = require("mongoose")
const { MongoMemoryServer } = require("mongodb-memory-server")
const { io } = require("socket.io-client")
const User = require("../models/User")
const Message = require("../models/Message")
const Conversation = require("../models/Conversation")

test("configuration fails closed for missing production secrets and wildcard cookie origins", () => {
  const environment = {
    ...process.env,
    NODE_ENV: "production",
    MONGODB_URI: "mongodb://127.0.0.1:1/config_test_only",
    JWT_SECRET: randomBytes(32).toString("hex"),
    CORS_ORIGIN: "https://cipher.test",
    SOCKET_IO_ADAPTER: "memory",
  }
  const load = (overrides) => spawnSync(process.execPath, ["-e", "require('./config')"], {
    cwd: path.join(__dirname, ".."),
    env: { ...environment, ...overrides },
    encoding: "utf8",
    windowsHide: true,
    timeout: 5000,
  })
  assert.equal(load({}).status, 0)
  assert.equal(load({ NODE_ENV: "development", CORS_ORIGIN: "http://localhost:3000" }).status, 0)
  for (const corsOrigin of ["*", "http://localhost:3000,*"]) {
    const result = load({ NODE_ENV: "development", CORS_ORIGIN: corsOrigin })
    assert.ifError(result.error)
    assert.equal(result.status, 1)
    assert.ok(result.stderr.includes("CORS_ORIGIN"))
  }
  for (const [key, value] of [
    ["MONGODB_URI", ""],
    ["JWT_SECRET", ""],
    ["JWT_SECRET", "cipher-dev-only-secret-not-for-production"],
    ["CORS_ORIGIN", ""],
    ["CORS_ORIGIN", "*"],
    ["CORS_ORIGIN", "http://cipher.test"],
    ["CORS_ORIGIN", "https://cipher.test/path"],
    ["SOCKET_IO_ADAPTER", "unknown"],
  ]) {
    const result = load({ [key]: value })
    assert.ifError(result.error)
    assert.equal(result.status, 1, `${key} must be rejected`)
    assert.ok(result.stderr.includes(key === "CORS_ORIGIN" ? "CORS" : key), `The startup error must identify ${key}`)
  }
})

function eventFrom(socket, event) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, listener)
      reject(new Error(`Timed out waiting for ${event}`))
    }, 5000)
    const listener = (payload) => {
      clearTimeout(timer)
      resolve(payload)
    }
    socket.once(event, listener)
  })
}

test("HTTP and Socket.IO enforce account and admin boundaries", { timeout: 120_000 }, async (t) => {
  const mongo = await MongoMemoryServer.create()
  const sockets = []
  let backend
  let backendExit
  t.after(async () => {
    for (const socket of sockets) socket.disconnect()
    if (backend && backend.exitCode === null && backend.signalCode === null) {
      backend.kill()
      await backendExit
    }
    await mongoose.disconnect()
    await mongo.stop()
  })

  const secret = randomBytes(32).toString("hex")
  const origin = "https://cipher.test"
  const password = "integration-only-password"
  const uri = mongo.getUri("cipher_access_control")
  await mongoose.connect(uri)
  const passwordHash = await bcrypt.hash(password, 4)
  await User.insertMany(["alice", "bob", "charlie", "operator"].map((name) => ({
    userId: name,
    username: name,
    email: `${name}@cipher.test`,
    password: passwordHash,
    role: name === "operator" ? "admin" : "user",
  })))
  const ab = await Conversation.create({ participants: ["alice", "bob"] })
  const bc = await Conversation.create({ participants: ["bob", "charlie"] })
  await Message.insertMany([
    { id: "alice-bob", from: "alice", to: "bob", encrypted: "YWxpY2UtYm9i", conversationId: ab._id },
    { id: "bob-charlie", from: "bob", to: "charlie", encrypted: "Ym9iLWNoYXJsaWU=", conversationId: bc._id },
    { id: "expired", from: "alice", to: "bob", encrypted: "ZXhwaXJlZA==", conversationId: ab._id, expiresAt: new Date(0) },
  ])

  backend = spawn(process.execPath, [path.join(__dirname, "../server.js")], {
    cwd: path.join(__dirname, ".."),
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: "0",
      MONGODB_URI: uri,
      JWT_SECRET: secret,
      CORS_ORIGIN: origin,
      SOCKET_IO_ADAPTER: "memory",
      TRUST_PROXY_HOPS: "0",
      BLOCKCHAIN_RPC: "",
      BLOCKCHAIN_CONTRACT_ADDRESS: "",
      BLOCKCHAIN_CHAIN_ID: "",
      BLOCKCHAIN_PRIVATE_KEY: "",
    },
  })
  backendExit = new Promise((resolve) => backend.once("exit", resolve))
  const port = await new Promise((resolve, reject) => {
    let output = ""
    const timer = setTimeout(() => reject(new Error(`Backend startup timed out: ${output}`)), 30_000)
    backend.once("error", (error) => { clearTimeout(timer); reject(error) })
    backend.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Backend exited (${code}): ${output}`)) })
    const onData = (chunk) => {
      output = (output + chunk.toString()).slice(-16000)
      const match = output.match(/Server running on port (\d+)/)
      if (match) { clearTimeout(timer); resolve(Number(match[1])) }
    }
    backend.stdout.on("data", onData)
    backend.stderr.on("data", onData)
  })
  const url = `http://127.0.0.1:${port}`
  const preflight = await fetch(`${url}/api/auth/login`, {
    method: "OPTIONS",
    headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" },
    signal: AbortSignal.timeout(10_000),
  })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get("access-control-allow-origin"), origin)
  assert.equal(preflight.headers.get("access-control-allow-credentials"), "true")
  const blockedPreflight = await fetch(`${url}/api/auth/login`, {
    method: "OPTIONS",
    headers: { Origin: "https://untrusted.test", "Access-Control-Request-Method": "POST" },
    signal: AbortSignal.timeout(10_000),
  })
  assert.equal(blockedPreflight.headers.get("access-control-allow-origin"), null)
  const request = (route, { cookie, requestOrigin = origin, ...options } = {}) => fetch(`${url}${route}`, {
    ...options,
    signal: AbortSignal.timeout(10_000),
    headers: { "Content-Type": "application/json", ...(requestOrigin ? { Origin: requestOrigin } : {}), ...(cookie ? { Cookie: cookie } : {}) },
  })
  const cookies = {}
  for (const name of ["alice", "bob", "charlie", "operator"]) {
    const response = await request("/api/auth/login", { method: "POST", body: JSON.stringify({ email: `${name}@cipher.test`, password }) })
    assert.equal(response.headers.get("access-control-allow-origin"), origin)
    assert.equal(response.headers.get("access-control-allow-credentials"), "true")
    assert.equal(response.status, 200)
    const header = response.headers.get("set-cookie")
    assert.match(header, /HttpOnly/)
    assert.match(header, /SameSite=Strict/)
    assert.match(header, /Secure/)
    assert.equal(response.headers.get("cache-control"), "private, no-store")
    cookies[name] = header.split(";")[0]
  }
  const connect = async (cookie, { rejected = false, socketOrigin = origin } = {}) => {
    const socket = io(url, {
      autoConnect: false,
      transports: ["websocket"],
      reconnection: false,
      timeout: 3000,
      extraHeaders: { Origin: socketOrigin, ...(cookie ? { Cookie: cookie } : {}) },
      // A caller-controlled claimed role or identity must never grant privileges.
      auth: { userId: "operator", role: "admin" },
    })
    sockets.push(socket)
    const result = eventFrom(socket, rejected ? "connect_error" : "connect")
    socket.connect()
    await result
    assert.equal(socket.connected, !rejected)
    return socket
  }
  const alice = await connect(cookies.alice)
  const bob = await connect(cookies.bob)
  const charlie = await connect(cookies.charlie)
  const admin = await connect(cookies.operator)
  const emitFor = (socket, event, data, responseEvent) => {
    const result = eventFrom(socket, responseEvent)
    socket.emit(event, data)
    return result
  }

  await t.test("missing, forged, expired, and wrong-origin credentials are rejected", async () => {
    const expired = jwt.sign({ userId: "alice", tokenVersion: 0 }, secret, { expiresIn: -1, issuer: "cipher-api", audience: "cipher-client" })
    for (const cookie of [undefined, "cipher_session=forged", `cipher_session=${expired}`]) {
      assert.equal((await request("/api/me", { cookie })).status, 401)
      assert.equal((await request("/api/me/export", { cookie })).status, 401)
      await connect(cookie, { rejected: true })
    }
    for (const requestOrigin of [null, "https://untrusted.test"]) {
      assert.equal((await request("/api/me/logout", { method: "POST", cookie: cookies.alice, requestOrigin })).status, 403)
    }
    await connect(cookies.alice, { rejected: true, socketOrigin: "https://untrusted.test" })
    assert.equal((await request("/api/me", { cookie: cookies.alice })).status, 200)
  })

  await t.test("every admin event rejects normal users and accepts the operator", async () => {
    const adminEvents = [
      ["get-stats", "system-stats"],
      ["get-all-users-with-stats", "all-users-with-stats"],
      ["get-all-blockchain-logs", "all-blockchain-logs"],
      ["get-recent-activities", "recent-activities"],
      ["get-analytics-data", "analytics-data"],
      ["get-daily-message-stats", "daily-message-stats"],
    ]
    const leaked = []
    const record = (event) => { if (adminEvents.some(([, response]) => response === event)) leaked.push(event) }
    alice.onAny(record)
    try {
      for (const [event, response] of adminEvents) {
        const denied = await alice.timeout(5000).emitWithAck(event, {})
        assert.deepEqual(denied, { success: false, message: "Admin access required" })
        assert.ok(await emitFor(admin, event, {}, response))
      }
      assert.deepEqual(leaked, [])
    } finally { alice.offAny(record) }
  })

  await t.test("history and export are scoped to the session despite forged participant IDs", async () => {
    const own = await emitFor(alice, "get-conversation", { user2: "bob" }, "conversation-history")
    assert.deepEqual(own.messages.map((message) => message.id), ["alice-bob"])
    const other = await emitFor(charlie, "get-conversation", { user1: "alice", user2: "bob" }, "conversation-history")
    assert.deepEqual(other.messages.map((message) => message.id), ["bob-charlie"])
    const exported = await request("/api/me/export", { cookie: cookies.charlie })
    assert.equal(exported.status, 200)
    const data = await exported.json()
    assert.equal(data.profile.userId, "charlie")
    assert.equal(data.profile.password, undefined)
    assert.deepEqual(data.messages.map((message) => message.id), ["bob-charlie"])
    const directory = await emitFor(charlie, "get-all-users", {}, "all-users")
    assert.ok(directory.length >= 4)
    for (const user of directory) {
      assert.equal(user.password, undefined)
      assert.equal(user.email, undefined)
      assert.equal(user.tokenVersion, undefined)
    }
  })

  await t.test("read mutations reject impersonation and receipts reach only the participants", async () => {
    const denied = await charlie.timeout(5000).emitWithAck("mark-as-read", { from: "alice", to: "bob" })
    assert.equal(denied.success, false)
    assert.equal((await Message.findOne({ id: "alice-bob" })).read, false)
    const leaks = []
    const record = (data) => leaks.push(data)
    charlie.on("messages-read", record)
    try {
      const sent = eventFrom(alice, "messages-read")
      const received = eventFrom(bob, "messages-read")
      bob.emit("mark-as-read", { from: "alice", to: "bob" })
      assert.deepEqual(await sent, { from: "alice", to: "bob" })
      assert.deepEqual(await received, { from: "alice", to: "bob" })
      assert.equal((await Message.findOne({ id: "alice-bob" })).read, true)
      // Bound the observation window for an event that must never be broadcast.
      await new Promise((resolve) => setTimeout(resolve, 100))
      assert.deepEqual(leaks, [])
    } finally { charlie.off("messages-read", record) }
  })

  await t.test("legacy message sending is disabled and friend request identity comes from the session", async () => {
    const before = await Message.countDocuments({ id: "forged-message" })
    const result = await charlie.timeout(5000).emitWithAck("send-message", { from: "alice", to: "bob", id: "forged-message", encrypted: "fake" })
    assert.equal(result.success, false)
    assert.match(result.message, /encrypted Matrix room/)
    assert.equal(await Message.countDocuments({ id: "forged-message" }), before)
    const delivered = eventFrom(bob, "friend-request-received")
    const requested = await charlie.timeout(5000).emitWithAck("send-friend-request", { from: "alice", to: "bob" })
    assert.equal(requested.success, true)
    assert.deepEqual(await delivered, { from: "charlie", username: "charlie" })
  })

  await t.test("unexpected socket errors do not expose internal exception messages", async () => {
    const notification = eventFrom(charlie, "error")
    const result = await charlie.timeout(5000).emitWithAck("save-settings", null)
    assert.deepEqual(result, { success: false, message: "An unexpected error occurred" })
    assert.deepEqual(await notification, { message: "An unexpected error occurred", statusCode: 500 })
  })

  await t.test("revocation disconnects every account socket and rejects the old cookie", async () => {
    const aliceSecond = await connect(cookies.alice)
    const closed = [eventFrom(alice, "disconnect"), eventFrom(aliceSecond, "disconnect")]
    const response = await request("/api/me/logout", { method: "POST", cookie: cookies.alice })
    assert.equal(response.status, 200)
    await Promise.all(closed)
    assert.equal((await request("/api/me", { cookie: cookies.alice })).status, 401)
    await connect(cookies.alice, { rejected: true })
    assert.equal((await request("/api/me", { cookie: cookies.bob })).status, 200)
  })
})
