const express = require("express")
const http = require("http")
const socketIo = require("socket.io")
const mongoose = require("mongoose")
const cors = require("cors")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const config = require("./config")
const Logger = require("./utils/logger")
const { AppError, errorHandler } = require("./utils/errorHandler")
const { emitSocketEvent } = require("./utils/socket-events")
const { validateUserRegistration, sanitizeInput } = require("./utils/validation")
const User = require("./models/User")
const Message = require("./models/Message")
const Conversation = require("./models/Conversation")
const IntegrityCommitment = require("./models/IntegrityCommitment")
const IntegrityBatch = require("./models/IntegrityBatch")
const RateLimitBucket = require("./models/RateLimitBucket")
const integrityBatcher = require("./services/integrity-batcher")
const blockchainService = require("../blockchain/blockchain.service")
const { buildMerkleTree } = require("./utils/merkle")
const crypto = require("crypto")

const app = express()
const server = http.createServer(app)
const sessionCookieName = "cipher_session"
const sessionMaxAgeMs = 8 * 60 * 60 * 1000
let socketAdapterReady = config.socketIoAdapter !== "mongo"

const io = socketIo(server, {
  maxHttpBufferSize: 256 * 1024,
  cors: {
    origin: config.corsOrigin,
    methods: ["GET", "POST"],
    credentials: true,
  },
  allowRequest: (request, callback) => {
    const origin = request.headers.origin
    callback(null, (config.isDevelopment() && !origin) || Boolean(origin && config.corsOrigin.includes(origin)))
  },
})

app.disable("x-powered-by")
app.set("trust proxy", config.trustProxyHops)
app.use((request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff")
  response.setHeader("Referrer-Policy", "no-referrer")
  response.setHeader("X-Frame-Options", "DENY")
  next()
})
app.use(cors({ origin: config.corsOrigin, methods: ["GET", "POST", "DELETE"], credentials: true }))
app.use(express.json({ limit: "64kb" }))
app.get("/health/live", (_request, response) => response.json({ status: "ok" }))
app.get("/health/ready", (_request, response) => {
  const ready = mongoose.connection.readyState === 1 && socketAdapterReady
  response.status(ready ? 200 : 503).json({ status: ready ? "ready" : "not-ready" })
})

function readSessionCookie(header = "") {
  const prefix = `${sessionCookieName}=`
  const value = header.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix))
  if (!value) return ""
  try {
    return decodeURIComponent(value.slice(prefix.length))
  } catch {
    return ""
  }
}

function setSessionCookie(response, token) {
  const attributes = [
    `${sessionCookieName}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${Math.floor(sessionMaxAgeMs / 1000)}`,
  ]
  if (config.isProduction()) attributes.push("Secure")
  response.setHeader("Set-Cookie", attributes.join("; "))
  response.setHeader("Cache-Control", "private, no-store")
}

function clearSessionCookie(response) {
  const attributes = [
    `${sessionCookieName}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ]
  if (config.isProduction()) attributes.push("Secure")
  response.setHeader("Set-Cookie", attributes.join("; "))
  response.setHeader("Cache-Control", "private, no-store")
}

function createSessionToken(user) {
  return jwt.sign(
    { userId: user.userId, tokenVersion: user.tokenVersion },
    config.jwtSecret,
    { expiresIn: "8h", issuer: "cipher-api", audience: "cipher-client" },
  )
}

function publicUser(user) {
  return {
    userId: user.userId,
    username: user.username,
    email: user.email,
    profilePicture: user.profilePicture,
    status: user.status,
    role: user.role,
    privacy: user.privacy,
    bio: user.bio,
  }
}

app.use("/api", (request, response, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return next()
  const origin = request.get("origin")
  if (!origin || !config.corsOrigin.includes(origin)) {
    return response.status(403).json({ error: "Request origin is not allowed" })
  }
  next()
})

app.post("/api/auth/login", async (request, response, next) => {
  try {
    const { email, password, admin = false } = request.body || {}
    if (
      typeof email !== "string" || email.length > 254 ||
      typeof password !== "string" || Buffer.byteLength(password, "utf8") > 72 ||
      typeof admin !== "boolean"
    ) {
      return response.status(400).json({ error: "Enter a valid email and password" })
    }
    if (!await takeRateLimit(`login:${admin ? "admin:" : "user:"}${request.ip}`, 8, 15 * 60_000)) {
      return response.status(429).json({ error: "Too many sign-in attempts. Try again later." })
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() })
    const passwordMatches = user && await bcrypt.compare(password, user.password)
    if (!passwordMatches || (admin && user.role !== "admin")) {
      return response.status(401).json({ error: "Invalid email or password" })
    }

    setSessionCookie(response, createSessionToken(user))
    response.json(publicUser(user))
    Logger.success("User logged in")
  } catch (error) {
    next(error)
  }
})

app.post("/api/auth/register", async (request, response, next) => {
  try {
    if (!await takeRateLimit(`register:${request.ip}`, 5, 15 * 60_000)) {
      return response.status(429).json({ error: "Too many registration attempts. Try again later." })
    }
    const data = request.body || {}
    const validation = validateUserRegistration(data)
    if (!validation.isValid) return response.status(400).json({ error: validation.errors.join(", ") })

    const email = data.email.trim().toLowerCase()
    const username = sanitizeInput(data.username).toLowerCase()
    const existingUser = await User.findOne({ $or: [{ email }, { username }] })
    if (existingUser) {
      return response.status(409).json({ error: existingUser.email === email ? "Email already registered" : "Username already taken" })
    }

    const user = new User({
      username,
      email,
      password: await bcrypt.hash(data.password, 12),
      userId: `user_${crypto.randomUUID()}`,
    })
    await user.save()
    setSessionCookie(response, createSessionToken(user))
    response.status(201).json(publicUser(user))
    emitSocketEvent(io.to(adminRoom), "user-registered", { userId: user.userId, username: user.username })
    Logger.success("User registered")
  } catch (error) {
    next(error)
  }
})

app.post("/api/auth/logout", (_request, response) => {
  clearSessionCookie(response)
  response.json({ success: true })
})

const authenticateHttp = async (request, response, next) => {
  try {
    const token = readSessionCookie(request.headers.cookie)
    if (!token) return response.status(401).json({ error: "Authentication required" })

    const claims = jwt.verify(token, config.jwtSecret, { issuer: "cipher-api", audience: "cipher-client" })
    const user = await User.findOne({ userId: claims.userId }).select("_id userId tokenVersion")
    if (!user || claims.tokenVersion !== user.tokenVersion) {
      return response.status(401).json({ error: "Session expired" })
    }
    request.authUser = user
    next()
  } catch {
    response.status(401).json({ error: "Invalid session" })
  }
}

app.get("/api/me", authenticateHttp, async (request, response, next) => {
  try {
    const user = await User.findById(request.authUser._id).select("userId username email profilePicture status role privacy bio")
    if (!user) return response.status(404).json({ error: "Account not found" })
    response.setHeader("Cache-Control", "private, no-store")
    response.json(publicUser(user))
  } catch (error) {
    next(error)
  }
})

app.post("/api/integrity/commitments", authenticateHttp, async (request, response, next) => {
  const commitment = request.body?.commitment
  if (typeof commitment !== "string" || !/^0x[0-9a-f]{64}$/i.test(commitment)) {
    return response.status(400).json({ error: "A SHA-256 commitment is required" })
  }
  if (!await takeRateLimit(`integrity-submit:${request.authUser.userId}`, 2000, 60 * 60_000)) {
    return response.status(429).json({ error: "Integrity submission limit reached. Try again later." })
  }

  try {
    await IntegrityCommitment.updateOne(
      { commitment: commitment.toLowerCase() },
      { $setOnInsert: { commitment: commitment.toLowerCase() } },
      { upsert: true },
    )
    response.setHeader("Cache-Control", "private, no-store")
    response.status(202).json({ status: "queued" })
  } catch (error) {
    if (error?.code === 11000) return response.status(202).json({ status: "queued" })
    next(error)
  }
})

app.get("/api/integrity/proofs/:commitment", async (request, response, next) => {
  response.setHeader("Cache-Control", "no-store")
  const commitment = request.params.commitment.toLowerCase()
  if (!/^0x[0-9a-f]{64}$/.test(commitment)) return response.status(400).json({ error: "Invalid commitment" })
  if (!await takeRateLimit(`integrity-proof:${request.ip}`, 120, 60_000)) {
    return response.status(429).json({ error: "Proof lookup limit reached. Try again later." })
  }

  try {
    const record = await IntegrityCommitment.findOne({ commitment }).select("batchId").lean()
    if (!record) return response.status(404).json({ status: "not-found" })
    if (!record.batchId) return response.status(202).json({ status: "queued" })

    const batch = await IntegrityBatch.findById(record.batchId).select("+leaves").lean()
    if (!batch || batch.status !== "anchored" || !Number.isInteger(batch.chainBatchId)) {
      return response.status(202).json({ status: "queued" })
    }
    if (!config.blockchainRpc || !config.blockchainContractAddress || !config.blockchainChainId) {
      return response.status(503).json({ error: "Blockchain verification is not configured" })
    }

    await blockchainService.initialize(config.blockchainRpc, config.blockchainContractAddress, config.blockchainChainId)
    const [chainBatch, chainInfo] = await Promise.all([
      blockchainService.getBatch(batch.chainBatchId),
      blockchainService.getBlockchainInfo(),
    ])
    if (chainBatch.merkleRoot.toLowerCase() !== batch.root || chainBatch.leafCount !== batch.leafCount) {
      return response.status(503).json({ error: "The stored integrity receipt does not match its on-chain batch" })
    }
    if (batch.leaves.length !== batch.leafCount) return response.status(503).json({ error: "The stored integrity batch has an invalid leaf count" })
    const tree = buildMerkleTree(batch.leaves)
    if (tree.root !== batch.root) return response.status(503).json({ error: "The stored integrity batch failed its Merkle root check" })

    const index = batch.leaves.indexOf(commitment)
    if (index < 0) return response.status(503).json({ error: "The commitment is missing from its stored batch" })
    const proof = tree.proofFor(index)
    response.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300")
    return response.json({
      status: "anchored",
      commitment,
      proof,
      root: batch.root,
      leafCount: batch.leafCount,
      batchId: batch.chainBatchId,
      transactionHash: batch.transactionHash,
      blockNumber: batch.blockNumber,
      chainId: chainInfo.chainId,
      contractAddress: chainInfo.contractAddress,
    })
  } catch (error) {
    next(error)
  }
})

app.get("/api/me/export", authenticateHttp, async (request, response, next) => {
  if (!await takeRateLimit(`export:${request.authUser.userId}`, 2, 60 * 60_000)) {
    return response.status(429).json({ error: "Export limit reached. Try again later." })
  }
  try {
    const user = await User.findById(request.authUser._id).select("-password").lean()
    if (!user) return response.status(404).json({ error: "Account not found" })

    response.setHeader("Content-Type", "application/json; charset=utf-8")
    response.setHeader("Content-Disposition", 'attachment; filename="cipher-account-export.json"')
    response.setHeader("Cache-Control", "private, no-store")
    response.write(`{"exportedAt":${JSON.stringify(new Date().toISOString())},"profile":${JSON.stringify(user)},"messages":[`)

    const cursor = Message.find({
      $and: [
        { $or: [{ from: user.userId }, { to: user.userId }] },
        { $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] },
      ],
    })
      .sort({ createdAt: 1 })
      .lean()
      .cursor()
    let first = true
    for await (const message of cursor) {
      if (response.destroyed) break
      if (!first) response.write(",")
      first = false
      if (!response.write(JSON.stringify(message))) await new Promise((resolve) => response.once("drain", resolve))
    }
    response.end("]}")
  } catch (error) {
    if (response.headersSent) response.destroy(error)
    else next(error)
  }
})

app.post("/api/me/logout", authenticateHttp, async (request, response, next) => {
  if (!await takeRateLimit(`logout:${request.authUser.userId}`, 10, 60 * 60_000)) {
    return response.status(429).json({ error: "Too many logout requests" })
  }
  try {
    await User.updateOne({ _id: request.authUser._id }, { $inc: { tokenVersion: 1 } })
    io.in(userRoom(request.authUser.userId)).disconnectSockets(true)
    clearSessionCookie(response)
    response.json({ success: true })
  } catch (error) {
    next(error)
  }
})

app.delete("/api/me", authenticateHttp, async (request, response, next) => {
  if (!await takeRateLimit(`delete:${request.authUser.userId}`, 3, 60 * 60_000)) {
    return response.status(429).json({ error: "Too many deletion attempts" })
  }
  try {
    const user = await User.findById(request.authUser._id).select("_id userId")
    if (!user) return response.status(404).json({ error: "Account not found" })

    await Promise.all([
      Message.deleteMany({ $or: [{ from: user.userId }, { to: user.userId }] }),
      Conversation.deleteMany({ participants: user.userId }),
      User.updateMany({}, { $pull: { friends: user._id, friendRequests: { from: user._id } } }),
    ])
    await User.deleteOne({ _id: user._id })
    io.in(userRoom(user.userId)).disconnectSockets(true)
    clearSessionCookie(response)
    response.json({ success: true })
  } catch (error) {
    next(error)
  }
})

app.use((error, _request, response, _next) => {
  void _next
  Logger.error("HTTP request failed")
  response.status(500).json({ error: "Request failed" })
})

const userRoom = (userId) => `user:${userId}`
const adminRoom = "admins"
async function takeRateLimit(key, limit, windowMs) {
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs
  const resetAt = new Date(windowStart + windowMs)
  const bucketId = crypto.createHash("sha256").update(`${windowStart}:${windowMs}:${key}`).digest("hex")
  const update = {
    $setOnInsert: { resetAt, expiresAt: new Date(resetAt.getTime() + windowMs) },
    $inc: { count: 1 },
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const bucket = await RateLimitBucket.findOneAndUpdate(
        { _id: bucketId },
        update,
        { upsert: true, new: true, setDefaultsOnInsert: false },
      ).lean()
      return bucket.count <= limit
    } catch (error) {
      if (error?.code !== 11000 || attempt > 0) throw error
    }
  }
  return false
}

io.use(async (socket, next) => {
  const token = readSessionCookie(socket.request.headers.cookie)
  if (!token) return next(new Error("Authentication failed"))

  try {
    const claims = jwt.verify(token, config.jwtSecret, { issuer: "cipher-api", audience: "cipher-client" })
    const user = await User.findOne({ userId: claims.userId }).select("userId username role tokenVersion privacy status")
    if (!user || claims.tokenVersion !== user.tokenVersion) throw new Error("Invalid session")
    socket.data.userId = user.userId
    socket.data.username = user.username
    socket.data.role = user.role
    socket.data.privacy = user.privacy
    socket.data.status = user.status
    socket.data.sessionExpiresAt = claims.exp * 1000
    next()
  } catch {
    next(new Error("Authentication failed"))
  }
})

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 5000,
    })
    await RateLimitBucket.createIndexes()
    Logger.success("MongoDB connected successfully")
  } catch (error) {
    Logger.error(`MongoDB connection error (${error?.code || error?.name || "unknown"})`)
    if (config.environment !== "development" || config.mongoUri) throw error
    Logger.info("Attempting fallback to In-Memory MongoDB server...")
    try {
      const { MongoMemoryServer } = require("mongodb-memory-server")
      const mongoServer = await MongoMemoryServer.create()
      memoryServer = mongoServer
      const mongoUri = mongoServer.getUri()
      await mongoose.connect(mongoUri)
      await RateLimitBucket.createIndexes()
      Logger.success("Connected to In-Memory MongoDB Server successfully!")
    } catch (fallbackError) {
      Logger.error("In-Memory MongoDB connection failed")
      throw fallbackError
    }
  }
}

const configureSocketAdapter = async () => {
  if (config.socketIoAdapter !== "mongo") return
  const hello = await mongoose.connection.db.admin().command({ hello: 1 })
  if (!hello.setName && hello.msg !== "isdbgrid") {
    throw new Error("SOCKET_IO_ADAPTER=mongo requires MongoDB replica-set or sharded-cluster change streams")
  }

  const { createAdapter } = require("@socket.io/mongo-adapter")
  const collection = mongoose.connection.db.collection("socket.io-adapter-events")
  await collection.createIndex({ createdAt: 1 }, { expireAfterSeconds: 3600, name: "socketio_event_ttl" })
  io.adapter(createAdapter(collection, { addCreatedAtField: true }))
  socketAdapterReady = true
  Logger.success("MongoDB Socket.IO adapter enabled")
}

// Socket.IO connection
io.on("connection", (socket) => {
  Logger.info("New client connected:", socket.id)

  const sessionTimeout = setTimeout(
    () => socket.disconnect(true),
    Math.max(0, socket.data.sessionExpiresAt - Date.now()),
  )
  socket.once("disconnect", () => clearTimeout(sessionTimeout))

  if (socket.data.userId) {
    socket.join(userRoom(socket.data.userId))
    socket.join("authenticated")
    if (socket.data.role === "admin") socket.join(adminRoom)
    const initialStatus = socket.data.status && socket.data.status !== 'offline' ? socket.data.status : 'online'
    socket.data.status = initialStatus
    User.updateOne({ userId: socket.data.userId }, { isOnline: true, status: initialStatus, lastSeen: new Date() }).catch(() =>
      Logger.error("Failed to update online status"),
    )
    if (socket.data.privacy?.showOnlineStatus !== false) {
      emitSocketEvent(io.to("authenticated"), "user-online", { userId: socket.data.userId, status: initialStatus })
    }
  }

  const asyncHandler = (handler) => async (...args) => {
    try {
      if (!await takeRateLimit(`socket:${socket.data.userId}`, 300, 60_000)) throw new AppError("Too many requests", 429)
      await handler(...args)
    } catch (error) {
      const acknowledge = args[args.length - 1]
      if (typeof acknowledge === 'function') {
        acknowledge({ success: false, message: error.isOperational ? error.message : 'An unexpected error occurred' })
      }
      errorHandler(error, socket)
    }
  }

  const requireUser = (admin = false) => {
    if (!socket.data.userId) throw new AppError("Authentication required", 401)
    if (admin && socket.data.role !== "admin") throw new AppError("Admin access required", 403)
    return socket.data.userId
  }

  socket.on(
    'save-settings',
    asyncHandler(async (data = {}, acknowledge) => {
      const userId = requireUser()
      const keys = ['showOnlineStatus', 'readReceipts', 'typingIndicator']
      if (!['online', 'offline', 'idle', 'dnd'].includes(data.status)) throw new AppError('Invalid status', 400)
      if (!data.privacy || keys.some((key) => typeof data.privacy[key] !== 'boolean')) {
        throw new AppError('Invalid privacy settings', 400)
      }
      if (typeof data.bio !== 'string' || data.bio.length > 500) throw new AppError('Status message is too long', 400)
      const privacy = Object.fromEntries(keys.map((key) => [key, data.privacy[key]]))
      await User.updateOne({ userId }, { status: data.status, lastSeen: new Date(), privacy, bio: sanitizeInput(data.bio) })
      const accountSockets = await io.in(userRoom(userId)).fetchSockets()
      accountSockets.forEach((accountSocket) => {
        accountSocket.data.status = data.status
        accountSocket.data.privacy = privacy
      })
      if (privacy.typingIndicator === false) {
        emitSocketEvent(io.to('authenticated'), 'typing-status', { from: userId, isTyping: false })
      }
      emitSocketEvent(io.to('authenticated'), 'user-status-changed', {
        userId,
        status: privacy.showOnlineStatus ? data.status : 'offline',
      })
      acknowledge?.({ success: true })
    }),
  )

  socket.on(
    'update-profile-picture',
    asyncHandler(async (data = {}, acknowledge) => {
      const userId = requireUser()
      const profilePicture = data.profilePicture
      if (
        typeof profilePicture !== 'string' ||
        Buffer.byteLength(profilePicture) > 120 * 1024 ||
        !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(profilePicture)
      ) {
        throw new AppError('Choose a PNG, JPEG, or WebP image smaller than 90 KB', 400)
      }
      await User.updateOne({ userId }, { profilePicture })
      emitSocketEvent(io.to('authenticated'), 'profile-picture-updated', { userId, profilePicture })
      acknowledge?.({ success: true })
    }),
  )

  socket.on(
    'typing-status',
    asyncHandler(async (data = {}) => {
      const from = requireUser()
      if (typeof data.to !== 'string' || data.to === from || typeof data.isTyping !== 'boolean') {
        throw new AppError('Invalid typing status', 400)
      }
      if (socket.data.privacy?.typingIndicator !== false) {
        emitSocketEvent(io.to(userRoom(data.to)), 'typing-status', { from, isTyping: data.isTyping })
      }
    }),
  )

  socket.on(
    'get-user-profile',
    asyncHandler(async (data = {}, acknowledge) => {
      requireUser()
      if (typeof data.userId !== 'string' || data.userId.length > 100) throw new AppError('Invalid profile request', 400)
      const user = await User.findOne({ userId: data.userId }).select('userId username profilePicture status privacy bio createdAt')
      if (!user) throw new AppError('User not found', 404)
      const profile = {
        userId: user.userId,
        username: user.username,
        profilePicture: user.profilePicture,
        status: user.privacy?.showOnlineStatus === false ? 'offline' : user.status,
        bio: user.bio,
        createdAt: user.createdAt,
      }
      acknowledge?.({ success: true, profile })
    }),
  )

  const activeMessageFilter = () => ({ $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] })

  const markConversationRead = async (peerId) => {
    const userId = requireUser()
    const unread = await Message.find({ from: peerId, to: userId, read: false, ...activeMessageFilter() })
      .limit(500)
      .select('_id id selfDestruct selfDestructStart expiresAt')
    const now = Date.now()
    const operations = unread.map((message) => {
      const update = { read: true }
      if (message.selfDestruct > 0 && message.selfDestructStart === 'firstRead' && !message.expiresAt) {
        update.expiresAt = new Date(now + message.selfDestruct * 1000)
      }
      return { updateOne: { filter: { _id: message._id }, update: { $set: update } } }
    })
    if (operations.length) await Message.bulkWrite(operations)

    emitSocketEvent(io.to(userRoom(userId)), 'messages-read-local', { from: peerId })
    if (socket.data.privacy?.readReceipts !== false) {
      emitSocketEvent(io.to(userRoom(peerId)).to(userRoom(userId)), 'messages-read', { from: peerId, to: userId })
    }
    unread.forEach((message) => {
      if (message.selfDestruct > 0 && message.selfDestructStart === 'firstRead' && !message.expiresAt) {
        const expiresAt = new Date(now + message.selfDestruct * 1000)
        emitSocketEvent(io.to(userRoom(peerId)).to(userRoom(userId)), 'message-expiry-started', {
          messageId: message.id,
          expiresAt,
        })
      }
    })
  }

  // User directory exposes only fields intended for other users.
  socket.on(
    'get-online-users',
    asyncHandler(async () => {
      requireUser()
      const users = await User.find({ isOnline: true }).select('userId username profilePicture status privacy isOnline')
      emitSocketEvent(socket, 'online-users', users.map((user) => ({
        userId: user.userId,
        username: user.username,
        profilePicture: user.profilePicture,
        status: user.privacy?.showOnlineStatus === false ? 'offline' : user.status,
        isOnline: user.privacy?.showOnlineStatus !== false && user.isOnline,
      })))
    }),
  )

  socket.on(
    'get-all-users',
    asyncHandler(async (data = {}) => {
      requireUser()
      const query = typeof data.query === 'string' ? data.query.trim().toLowerCase() : ''
      if (query.length > 30) throw new AppError('Search text is too long', 400)
      if (query && !/^[a-z0-9_.-]+$/.test(query)) return emitSocketEvent(socket, 'all-users', [])
      const prefix = query.replace(/\./g, '\\.')
      const filter = query ? { username: { $regex: `^${prefix}`, $options: 'i' } } : {}
      const users = await User.find(filter)
        .select('userId username profilePicture status privacy isOnline')
        .sort({ username: 1 })
        .limit(query ? 25 : 100)
      emitSocketEvent(socket, 'all-users', users.map((user) => ({
        userId: user.userId,
        username: user.username,
        profilePicture: user.profilePicture,
        status: user.privacy?.showOnlineStatus === false ? 'offline' : user.status,
        isOnline: user.privacy?.showOnlineStatus !== false && user.isOnline,
      })))
    }),
  )

  socket.on(
    'get-all-users-with-stats',
    asyncHandler(async () => {
      requireUser(true)
      const [users, counts] = await Promise.all([
        User.find().select('userId username email status isOnline privacy createdAt role'),
        Message.aggregate([
          { $project: { participants: ['$from', '$to'] } },
          { $unwind: '$participants' },
          { $group: { _id: '$participants', messageCount: { $sum: 1 } } },
        ]),
      ])
      const countByUser = new Map(counts.map((item) => [item._id, item.messageCount]))
      emitSocketEvent(socket, 'all-users-with-stats', users.map((user) => ({
        ...user.toObject(),
        status: user.privacy?.showOnlineStatus === false ? 'offline' : user.status,
        isOnline: user.privacy?.showOnlineStatus !== false && user.isOnline,
        messageCount: countByUser.get(user.userId) || 0,
      })))
    }),
  )

  socket.on(
    'send-message',
    asyncHandler(async () => {
      requireUser()
      throw new AppError('Cipher message delivery now requires an encrypted Matrix room.', 410)
    }),
  )

  socket.on(
    'mark-as-read',
    asyncHandler(async (data = {}) => {
      const userId = requireUser()
      if (typeof data.from !== 'string' || data.to !== userId || data.from === userId) {
        throw new AppError('Invalid conversation', 400)
      }
      await markConversationRead(data.from)
    }),
  )

  socket.on(
    'get-unread-from-user',
    asyncHandler(async (data = {}) => {
      const userId = requireUser()
      if (typeof data.from !== 'string' || data.to !== userId) throw new AppError('Invalid conversation', 400)
      const unreadCount = await Message.countDocuments({
        from: data.from,
        to: userId,
        read: false,
        ...activeMessageFilter(),
      })
      emitSocketEvent(socket, 'unread-from-user', { from: data.from, count: unreadCount })
    }),
  )

  socket.on(
    'get-unread-count',
    asyncHandler(async () => {
      const userId = requireUser()
      const count = await Message.countDocuments({ to: userId, read: false, ...activeMessageFilter() })
      emitSocketEvent(socket, 'unread-count', { count })
    }),
  )

  socket.on(
    'get-conversation',
    asyncHandler(async (data = {}) => {
      const userId = requireUser()
      const peerId = data.user2
      if (typeof peerId !== 'string' || peerId === userId) throw new AppError('Invalid conversation', 400)
      const participants = [userId, peerId]
      const pairFilter = {
        $and: [
          { $or: [{ from: participants[0], to: participants[1] }, { from: participants[1], to: participants[0] }] },
          activeMessageFilter(),
        ],
      }
      const messages = await Message.find(pairFilter).sort({ createdAt: -1 }).limit(500).lean()
      messages.reverse()
      const pendingDelivery = messages.filter((message) => message.to === userId && !message.delivered)
      if (pendingDelivery.length) {
        await Message.updateMany({ id: { $in: pendingDelivery.map((message) => message.id) }, delivered: false }, { delivered: true })
        pendingDelivery.forEach((message) => {
          message.delivered = true
          emitSocketEvent(io.to(userRoom(message.from)), 'message-delivered', { messageId: message.id })
        })
      }
      emitSocketEvent(socket, 'conversation-history', { userId: peerId, messages })
    }),
  )

  socket.on(
    'update-status',
    asyncHandler(async (data = {}) => {
      const userId = requireUser()
      if (!['online', 'offline', 'idle', 'dnd'].includes(data.status)) throw new AppError('Invalid status', 400)
      await User.updateOne({ userId }, { status: data.status, lastSeen: new Date() })
      const accountSockets = await io.in(userRoom(userId)).fetchSockets()
      accountSockets.forEach((accountSocket) => { accountSocket.data.status = data.status })
      if (socket.data.privacy?.showOnlineStatus !== false) {
        emitSocketEvent(io.to('authenticated'), 'user-status-changed', { userId, status: data.status })
      }
    }),
  )

  socket.on(
    'update-privacy',
    asyncHandler(async (data = {}) => {
      const userId = requireUser()
      const keys = ['showOnlineStatus', 'readReceipts', 'typingIndicator']
      if (keys.some((key) => typeof data[key] !== 'boolean')) throw new AppError('Invalid privacy settings', 400)
      const privacy = Object.fromEntries(keys.map((key) => [key, data[key]]))
      await User.updateOne({ userId }, { privacy })
      const accountSockets = await io.in(userRoom(userId)).fetchSockets()
      accountSockets.forEach((accountSocket) => { accountSocket.data.privacy = privacy })
      emitSocketEvent(io.to('authenticated'), 'user-status-changed', {
        userId,
        status: privacy.showOnlineStatus ? socket.data.status || 'online' : 'offline',
      })
      emitSocketEvent(socket, 'privacy-updated', privacy)
    }),
  )

  socket.on(
    'send-friend-request',
    asyncHandler(async (data = {}, acknowledge) => {
      const from = requireUser()
      if (!await takeRateLimit(`friend-requests:${from}`, 30, 60 * 60_000)) {
        throw new AppError('Friend request limit reached. Try again later.', 429)
      }
      if (typeof data.to !== 'string' || data.to === from) throw new AppError('Choose a valid recipient', 400)
      const [recipient, sender] = await Promise.all([
        User.findOne({ userId: data.to }),
        User.findOne({ userId: from }).select('_id username userId'),
      ])
      if (!recipient || !sender) throw new AppError('User not found', 404)
      const alreadyRequested = recipient.friendRequests.some(
        (request) => String(request.from) === String(sender._id) && request.status === 'pending',
      )
      if (!alreadyRequested) {
        recipient.friendRequests.push({ from: sender._id, status: 'pending' })
        await recipient.save()
      }
      acknowledge?.({ success: true })
      emitSocketEvent(io.to(userRoom(recipient.userId)), 'friend-request-received', {
        from: sender.userId,
        username: sender.username,
      })
    }),
  )

  socket.on(
    'get-blockchain-logs',
    asyncHandler(async () => {
      const userId = requireUser()
      const messages = await Message.find({
        $or: [{ from: userId }, { to: userId }],
        onBlockchain: true,
        ...activeMessageFilter(),
      }).sort({ createdAt: -1 }).limit(50).select('id createdAt blockchainTxHash onBlockchain')
      emitSocketEvent(socket, 'blockchain-logs', messages)
    }),
  )

  socket.on(
    'get-stats',
    asyncHandler(async () => {
      requireUser(true)
      const [totalUsers, onlineUsers, totalMessages, blockchainMessages, integrityBatchCount, integrityAnchoredBatches, unbatchedCommitments, queuedBatchLeaves] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ isOnline: true, 'privacy.showOnlineStatus': { $ne: false } }),
        Message.countDocuments(activeMessageFilter()),
        Message.countDocuments({ onBlockchain: true }),
        IntegrityBatch.countDocuments(),
        IntegrityBatch.countDocuments({ status: 'anchored' }),
        IntegrityCommitment.countDocuments({ batchId: null }),
        IntegrityBatch.aggregate([
          { $match: { status: 'queued' } },
          { $group: { _id: null, leafCount: { $sum: '$leafCount' } } },
        ]),
      ])
      const integrityWaiting = unbatchedCommitments + (queuedBatchLeaves[0]?.leafCount || 0)
      const integrityChainConfigured = Boolean(config.blockchainRpc && config.blockchainContractAddress && config.blockchainChainId && config.blockchainPrivateKey)
      emitSocketEvent(socket, 'system-stats', {
        totalUsers,
        onlineUsers,
        totalMessages,
        blockchainMessages,
        integrityBatchCount,
        integrityAnchoredBatches,
        integrityWaiting,
        integrityChainConfigured,
      })
    }),
  )

  socket.on(
    'get-all-blockchain-logs',
    asyncHandler(async () => {
      requireUser(true)
      const messages = await Message.find({ onBlockchain: true })
        .sort({ createdAt: -1 })
        .limit(100)
        .select('blockchainTxHash createdAt onBlockchain')
      emitSocketEvent(socket, 'all-blockchain-logs', messages)
    }),
  )

  socket.on(
    'get-recent-activities',
    asyncHandler(async () => {
      requireUser(true)
      const [recentUsers, recentMessages] = await Promise.all([
        User.find().sort({ createdAt: -1 }).limit(10).select('username createdAt'),
        Message.find().sort({ createdAt: -1 }).limit(10).select('createdAt'),
      ])
      const activities = [
        ...recentUsers.map((user) => ({ type: 'user', username: user.username, timestamp: user.createdAt })),
        ...recentMessages.map((message) => ({ type: 'message', timestamp: message.createdAt })),
      ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      emitSocketEvent(socket, 'recent-activities', activities.slice(0, 20))
    }),
  )

  socket.on(
    'get-analytics-data',
    asyncHandler(async () => {
      requireUser(true)
      const now = new Date()
      const hourly = await Promise.all(Array.from({ length: 24 }, async (_, index) => {
        const start = new Date(now.getTime() - (23 - index) * 60 * 60 * 1000)
        const end = new Date(start.getTime() + 60 * 60 * 1000)
        const [messages, users] = await Promise.all([
          Message.countDocuments({ createdAt: { $gte: start, $lt: end } }),
          User.countDocuments({ lastSeen: { $gte: start, $lt: end } }),
        ])
        return { time: start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }), messages, users }
      }))
      const daily = await Promise.all(Array.from({ length: 7 }, async (_, index) => {
        const start = new Date(now)
        start.setDate(start.getDate() - (6 - index))
        start.setHours(0, 0, 0, 0)
        const end = new Date(start)
        end.setDate(end.getDate() + 1)
        const [messages, users] = await Promise.all([
          Message.countDocuments({ createdAt: { $gte: start, $lt: end } }),
          User.countDocuments({ lastSeen: { $gte: start, $lt: end } }),
        ])
        return { day: start.toLocaleDateString('en-US', { weekday: 'short' }), messages, users }
      }))
      emitSocketEvent(socket, 'analytics-data', { hourly, daily })
    }),
  )

  socket.on(
    'get-daily-message-stats',
    asyncHandler(async () => {
      requireUser(true)
      const now = new Date()
      const daily = await Promise.all(Array.from({ length: 7 }, async (_, index) => {
        const start = new Date(now)
        start.setDate(start.getDate() - (6 - index))
        start.setHours(0, 0, 0, 0)
        const end = new Date(start)
        end.setDate(end.getDate() + 1)
        const messages = await Message.countDocuments({ createdAt: { $gte: start, $lt: end } })
        return { date: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), messages }
      }))
      const total = await Message.countDocuments(activeMessageFilter())
      emitSocketEvent(socket, 'daily-message-stats', { daily, total })
    }),
  )

  socket.on('disconnect', async () => {
    Logger.info('Client disconnected:', socket.id)
    const userId = socket.data.userId
    if (!userId) return
    try {
      emitSocketEvent(io.to('authenticated'), 'typing-status', { from: userId, isTyping: false })
      const remaining = await io.in(userRoom(userId)).fetchSockets()
      if (remaining.length > 0) return
      const lastSeen = new Date()
      const user = await User.findOneAndUpdate(
        { userId },
        { isOnline: false, status: 'offline', lastSeen },
        { new: true },
      ).select('privacy')
      if (user?.privacy?.showOnlineStatus !== false) emitSocketEvent(io.to('authenticated'), 'user-offline', { userId, lastSeen })
    } catch {
      Logger.error('Failed to update offline status')
    }
  })
})
let memoryServer
let isShuttingDown = false

async function startServer() {
  await connectDB()
  await configureSocketAdapter()
  if (isShuttingDown) return
  integrityBatcher.start()
  server.listen(config.port, () => Logger.success(`Server running on port ${server.address().port}`))
}

async function shutdown(signal) {
  if (isShuttingDown) return
  isShuttingDown = true
  Logger.info(`Received ${signal}; shutting down`)
  await integrityBatcher.stop()
  await new Promise((resolve) => io.close(resolve))
  await mongoose.disconnect()
  if (memoryServer) await memoryServer.stop()
  process.exitCode = 0
}

process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))

startServer().catch(() => {
  Logger.error('Server startup failed')
  process.exitCode = 1
})
