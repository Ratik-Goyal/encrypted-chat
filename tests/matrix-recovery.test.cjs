const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const test = require("node:test")
const ts = require("typescript")

// Exercise the real recovery functions with an SDK double, without accounts, passwords, or network access.
const source = fs.readFileSync(path.join(__dirname, "../lib/matrix.ts"), "utf8")
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const crossSigningSecrets = ["m.cross_signing.master", "m.cross_signing.self_signing", "m.cross_signing.user_signing"]

async function harness(t, { interrupted = false, publishedIdentity = false, complete = false, failOnce = false } = {}) {
  const userId = "@recovery-test:localhost"
  const key = { privateKey: new Uint8Array(32).fill(7), encodedPrivateKey: "test-recovery-key" }
  const session = { homeserver: "http://localhost:8008", userId, deviceId: "TEST", accessToken: "test-token" }
  const saved = new Map()
  const secrets = new Set(complete ? [...crossSigningSecrets, "m.megolm_backup.v1"] : [])
  const state = {
    defaultKeyId: interrupted ? "existing-key" : null,
    backup: interrupted ? { version: "existing-backup" } : null,
    backupCreations: 0,
    storageCreations: 0,
    signingAttempts: 0,
    resetAttempts: 0,
    localIdentity: false,
    storagePrivateKey: key.privateKey,
  }
  let callbacks
  let onSync
  const passwordChallenge = async (auth) => {
    if (!auth) {
      throw Object.assign(new Error("Password confirmation required"), {
        data: { session: "test-auth-session", flows: [{ stages: ["m.login.password"] }] },
      })
    }
    assert.equal(auth.type, "m.login.password")
    assert.equal(auth.session, "test-auth-session", "The password reply must include the server's authentication session")
    assert.equal(auth.identifier.user, "recovery-test")
  }
  const storeSecret = async (name) => {
    const returned = await callbacks.getSecretStorageKey({ keys: { [state.defaultKeyId]: {} } }, name)
    assert.ok(returned, "The SDK must be able to retrieve the generated recovery key")
    assert.equal(returned[0], state.defaultKeyId)
    assert.deepEqual(returned[1], state.storagePrivateKey)
    secrets.add(name)
  }
  const crypto = {
    setDeviceIsolationMode() {},
    createRecoveryKeyFromPassphrase: async () => ({
      privateKey: new Uint8Array(32).fill(9), encodedPrivateKey: "new-generated-recovery-key",
    }),
    resetEncryption: async (authenticate) => {
      await authenticate(passwordChallenge)
      state.resetAttempts += 1
      state.defaultKeyId = null
      secrets.clear()
      state.localIdentity = true
      publishedIdentity = true
      state.backupCreations += 1
      state.backup = { version: "reset-backup" }
    },
    getKeyBackupInfo: async () => state.backup,
    bootstrapSecretStorage: async (options) => {
      assert.notEqual(options.setupNewSecretStorage, true, "Retries must preserve the existing storage key")
      if (!state.defaultKeyId) {
        const generated = await options.createSecretStorageKey()
        state.storagePrivateKey = generated.privateKey
        state.defaultKeyId = "new-key"
        state.storageCreations += 1
        assert.equal(typeof callbacks.cacheSecretStorageKey, "function")
        callbacks.cacheSecretStorageKey(state.defaultKeyId, {}, generated.privateKey)
      }
      if (state.localIdentity) for (const name of crossSigningSecrets) await storeSecret(name)
      if (options.setupNewKeyBackup) {
        state.backupCreations += 1
        state.backup = { version: "new-backup" }
      }
      if (state.backup) await storeSecret("m.megolm_backup.v1")
    },
    bootstrapCrossSigning: async (options) => {
      state.signingAttempts += 1
      if (failOnce && state.signingAttempts === 1) throw new Error("Interrupted identity upload")
      await options.authUploadDeviceSigningKeys(passwordChallenge)
      state.localIdentity = true
      publishedIdentity = true
      for (const name of crossSigningSecrets) await storeSecret(name)
    },
    getCrossSigningStatus: async () => ({
      privateKeysCachedLocally: {
        masterKey: state.localIdentity,
        selfSigningKey: state.localIdentity,
        userSigningKey: state.localIdentity,
      },
    }),
    isCrossSigningReady: async () => state.localIdentity && publishedIdentity,
    isSecretStorageReady: async () => crossSigningSecrets.every((name) => secrets.has(name)) && secrets.has("m.megolm_backup.v1"),
    loadSessionBackupPrivateKeyFromSecretStorage: async () => assert.ok(secrets.has("m.megolm_backup.v1")),
    checkKeyBackupAndEnable: async () => ({ trustInfo: { trusted: true, matchesDecryptionKey: true } }),
    restoreKeyBackup: async () => ({ imported: 0, total: 0 }),
  }
  const client = {
    getCrypto: () => crypto,
    initRustCrypto: async () => {},
    on: (_event, callback) => { onSync = callback },
    off: () => {},
    startClient: async () => onSync("PREPARED"),
    stopClient() {},
    logout: async () => {},
    downloadKeysForUsers: async () => ({
      device_keys: { [userId]: {} },
      master_keys: publishedIdentity ? { [userId]: {} } : {},
    }),
    secretStorage: {
      getDefaultKeyId: async () => state.defaultKeyId,
      getKey: async () => state.defaultKeyId ? [state.defaultKeyId, {}] : null,
      checkKey: async (candidate) => candidate.every((value, index) => value === state.storagePrivateKey[index]),
      isStored: async (name) => secrets.has(name) ? { [state.defaultKeyId]: {} } : null,
    },
  }
  const storage = {
    getItem: (name) => saved.get(name) ?? null,
    setItem: (name, value) => saved.set(name, value),
    removeItem: (name) => saved.delete(name),
  }
  const sdk = {
    createClient: (options) => { if (options.cryptoCallbacks) callbacks = options.cryptoCallbacks; return client },
    ClientEvent: { Sync: "sync" },
    SyncState: { Prepared: "PREPARED", Error: "ERROR" },
  }
  const module = { exports: {} }
  const context = vm.createContext({
    module, exports: module.exports, Uint8Array, URL,
    process: { env: {} }, localStorage: storage, sessionStorage: storage,
    window: { setTimeout: (...args) => { const timer = setTimeout(...args); timer.unref(); return timer }, clearTimeout },
    AbortController,
    navigator: { locks: { request: async (_name, _options, callback) => callback({}) } },
    require: (name) => {
      if (name === "matrix-js-sdk") return sdk
      if (name === "matrix-js-sdk/lib/crypto-api") return { OnlySignedDevicesIsolationMode: class {} }
      if (name === "matrix-js-sdk/lib/crypto-api/recovery-key") return {
        decodeRecoveryKey: (value) => new Uint8Array(32).fill(value === "test-recovery-key" ? 7 : 8),
      }
      if (name === "@/lib/integrity") return {}
      throw new Error("Unexpected dependency: " + name)
    },
  })
  vm.runInContext(compiled + `
    exports.prepare = async (session, key, restore) => {
      const client = await createAuthenticatedClient(session);
      if (restore) pendingRecoveryRestore = { client, session };
      else pendingRecovery = { client, session, key };
    };
  `, context)
  const api = module.exports
  await api.prepare(session, key, interrupted)
  t.after(() => api.cancelPendingMatrixRecovery())
  return { api, state, saved, key }
}

test("fresh setup caches its generated key and finishes identity setup before checking readiness", async (t) => {
  const { api, state, saved } = await harness(t)
  await api.finishMatrixRecoverySetup("recovery-test", "test-password")
  assert.equal(state.backupCreations, 1)
  assert.equal(state.storageCreations, 1)
  assert.ok(saved.has("cipher-matrix-session"))
})

test("retry after an upload failure preserves the acknowledged recovery key and backup", async (t) => {
  const { api, state, saved } = await harness(t, { failOnce: true })
  await assert.rejects(api.finishMatrixRecoverySetup("recovery-test", "test-password"), /Interrupted identity upload/)
  assert.equal(saved.has("cipher-matrix-session"), false)
  await api.finishMatrixRecoverySetup("recovery-test", "test-password")
  assert.equal(state.backupCreations, 1)
  assert.equal(state.storageCreations, 1)
  assert.ok(saved.has("cipher-matrix-session"))
})

test("saved key resumes interrupted first setup after a reload without replacing storage or backup", async (t) => {
  const { api, state, saved } = await harness(t, { interrupted: true })
  await api.finishMatrixRecoveryRestore("recovery-test", "test-password", "test-recovery-key")
  assert.equal(state.defaultKeyId, "existing-key")
  assert.equal(state.backup.version, "existing-backup")
  assert.equal(state.backupCreations, 0)
  assert.ok(saved.has("cipher-matrix-session"))
})

test("missing secrets from an existing identity cannot silently replace that identity", async (t) => {
  const { api, state, saved } = await harness(t, { interrupted: true, publishedIdentity: true })
  await assert.rejects(api.finishMatrixRecoveryRestore("recovery-test", "test-password", "test-recovery-key"), /missing a cross-signing key/)
  assert.equal(state.signingAttempts, 0)
  assert.equal(saved.has("cipher-matrix-session"), false)
})

test("complete existing identity restores with its saved key and preserves its backup", async (t) => {
  const { api, state, saved } = await harness(t, { interrupted: true, publishedIdentity: true, complete: true })
  await api.finishMatrixRecoveryRestore("recovery-test", "test-password", "test-recovery-key")
  assert.equal(state.defaultKeyId, "existing-key")
  assert.equal(state.backup.version, "existing-backup")
  assert.equal(state.backupCreations, 0)
  assert.ok(saved.has("cipher-matrix-session"))
})

test("incorrect recovery key is rejected before changing identity or persisting a session", async (t) => {
  const { api, state, saved } = await harness(t, { interrupted: true })
  await assert.rejects(api.finishMatrixRecoveryRestore("recovery-test", "test-password", "wrong-key"), /does not match/)
  assert.equal(state.signingAttempts, 0)
  assert.equal(saved.has("cipher-matrix-session"), false)
})

test("replacement key is generated for display without modifying existing encryption or backups", async (t) => {
  const { api, state, saved } = await harness(t, { interrupted: true, publishedIdentity: true })
  const generated = await api.generateNewMatrixRecoveryKey()
  assert.equal(generated, "new-generated-recovery-key")
  assert.equal(api.getPendingMatrixRecoveryKey(), generated)
  assert.equal(state.defaultKeyId, "existing-key")
  assert.equal(state.backup.version, "existing-backup")
  assert.equal(state.resetAttempts, 0)
  assert.equal(saved.has("cipher-matrix-session"), false)
})

test("replacement encryption setup requires explicit confirmation", async (t) => {
  const { api, state, saved } = await harness(t, { interrupted: true, publishedIdentity: true })
  await api.generateNewMatrixRecoveryKey()
  await assert.rejects(api.finishMatrixRecoverySetup("recovery-test", "test-password"), /Confirm that resetting encryption/)
  assert.equal(state.resetAttempts, 0)
  assert.equal(state.backup.version, "existing-backup")
  assert.equal(saved.has("cipher-matrix-session"), false)
})

test("confirmed reset installs the exact displayed key and finishes secure setup", async (t) => {
  const { api, state, saved } = await harness(t, { interrupted: true, publishedIdentity: true })
  await api.generateNewMatrixRecoveryKey()
  await api.finishMatrixRecoverySetup("recovery-test", "test-password", true)
  assert.equal(state.resetAttempts, 1)
  assert.equal(state.defaultKeyId, "new-key")
  assert.ok(state.storagePrivateKey.every((value) => value === 9))
  assert.ok(saved.has("cipher-matrix-session"))
})

test("retry after a confirmed reset does not reset the identity and backup again", async (t) => {
  const { api, state, saved } = await harness(t, { interrupted: true, publishedIdentity: true, failOnce: true })
  await api.generateNewMatrixRecoveryKey()
  await assert.rejects(api.finishMatrixRecoverySetup("recovery-test", "test-password", true), /Interrupted identity upload/)
  assert.equal(saved.has("cipher-matrix-session"), false)
  await api.finishMatrixRecoverySetup("recovery-test", "test-password", true)
  assert.equal(state.resetAttempts, 1)
  assert.equal(state.backupCreations, 1)
  assert.equal(state.storageCreations, 1)
  assert.ok(saved.has("cipher-matrix-session"))
})

test("canceling a generated replacement preserves the original identity and backup", async (t) => {
  const { api, state, saved } = await harness(t, { interrupted: true, publishedIdentity: true })
  await api.generateNewMatrixRecoveryKey()
  await api.cancelPendingMatrixRecovery()
  assert.equal(state.resetAttempts, 0)
  assert.equal(state.defaultKeyId, "existing-key")
  assert.equal(state.backup.version, "existing-backup")
  assert.equal(api.getPendingMatrixRecoveryKey(), null)
  assert.equal(saved.has("cipher-matrix-session"), false)
})
