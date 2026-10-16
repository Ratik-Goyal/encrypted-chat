"use client"

import type { MatrixClient, MatrixEvent } from "matrix-js-sdk"
import type { RoomMessageEventContent } from "matrix-js-sdk/lib/@types/events"
import type { EncryptedFile } from "matrix-js-sdk/lib/@types/media"
import type { UIAuthCallback } from "matrix-js-sdk/lib/interactive-auth"
import { MATRIX_INTEGRITY_KEY, verifyMessageIntegrity } from "@/lib/integrity"
import type { IntegrityMetadata } from "@/lib/integrity"

type MatrixEventStore = import("matrix-js-sdk/lib/store/indexeddb").IndexedDBStore

const MATRIX_SESSION_KEY = "cipher-matrix-session"
const MATRIX_LOCK_NAME = "cipher-matrix-rust-crypto"
const MATRIX_SESSION_TTL_MS = 8 * 60 * 60 * 1000
const configuredAttachmentLimit = Number(process.env.NEXT_PUBLIC_MATRIX_ATTACHMENT_MAX_MB)
export const MATRIX_ATTACHMENT_MAX_MB = Number.isInteger(configuredAttachmentLimit) && configuredAttachmentLimit >= 1 && configuredAttachmentLimit <= 20
  ? configuredAttachmentLimit
  : 20
export const MATRIX_ATTACHMENT_MAX_BYTES = MATRIX_ATTACHMENT_MAX_MB * 1024 * 1024
export const MATRIX_EXPIRY_KEY = "com.cipher.expiry"
export const MATRIX_EXPIRY_START_KEY = "com.cipher.expiry_start"

export interface MatrixExpirySettings {
  seconds: number
  starts: "send" | "firstRead"
}

export interface MatrixExpiryStart {
  eventId: string
  expiresAt: number
}

export interface MatrixEncryptedAttachment {
  file: EncryptedFile
  filename: string
  mimetype: string
  size: number
}

const allowedExpirySeconds = new Set([10, 30, 60, 300])

export function parseMatrixExpirySettings(value: unknown): MatrixExpirySettings | null {
  if (!value || typeof value !== "object") return null
  const settings = value as Partial<MatrixExpirySettings>
  if (!allowedExpirySeconds.has(settings.seconds || 0) || !["send", "firstRead"].includes(settings.starts || "")) return null
  return { seconds: settings.seconds!, starts: settings.starts! }
}

export function parseMatrixExpiryStart(value: unknown): MatrixExpiryStart | null {
  if (!value || typeof value !== "object") return null
  const marker = value as Partial<MatrixExpiryStart>
  if (typeof marker.eventId !== "string" || !/^\$[^\s]{1,255}$/.test(marker.eventId)) return null
  if (!Number.isSafeInteger(marker.expiresAt) || (marker.expiresAt || 0) < 1) return null
  return { eventId: marker.eventId, expiresAt: marker.expiresAt! }
}

interface MatrixSession {
  homeserver: string
  userId: string
  deviceId: string
  accessToken: string
  expiresAt?: number
}

interface PendingRecovery {
  client: MatrixClient
  session: MatrixSession
  key: Awaited<ReturnType<NonNullable<ReturnType<MatrixClient["getCrypto"]>>["createRecoveryKeyFromPassphrase"]>>
  resetExisting?: boolean
}

interface PendingRecoveryRestore {
  client: MatrixClient
  session: MatrixSession
}

interface MatrixConnectionResult {
  recoveryKey: string | null
  accountCreated: boolean
  recoveryRequired?: boolean
}

let matrixClient: MatrixClient | null = null
let matrixEventStore: MatrixEventStore | null = null
let activeSession: MatrixSession | null = null
let releaseCryptoLock: (() => void) | null = null
let pendingRecovery: PendingRecovery | null = null
let pendingRecoveryRestore: PendingRecoveryRestore | null = null
let cachedSecretStorageKey: { keyId: string; privateKey: Uint8Array<ArrayBuffer> } | null = null
const roomSetupPromises = new Map<string, Promise<string>>()

function getMatrixConfig() {
  const homeserver = process.env.NEXT_PUBLIC_MATRIX_HOMESERVER_URL?.trim().replace(/\/$/, "")
  const serverName = process.env.NEXT_PUBLIC_MATRIX_SERVER_NAME?.trim()
  if (!homeserver || !serverName) {
    throw new Error("Matrix is not configured. Set NEXT_PUBLIC_MATRIX_HOMESERVER_URL and NEXT_PUBLIC_MATRIX_SERVER_NAME, then restart the app.")
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(homeserver)
  } catch {
    throw new Error("NEXT_PUBLIC_MATRIX_HOMESERVER_URL must be a valid HTTPS URL.")
  }
  if (parsedUrl.protocol !== "https:" && !["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname)) {
    throw new Error("The Matrix homeserver must use HTTPS outside local development.")
  }
  if (!/^[A-Za-z0-9.-]+(?::[0-9]+)?$/.test(serverName)) {
    throw new Error("NEXT_PUBLIC_MATRIX_SERVER_NAME must match the Matrix homeserver's server name.")
  }

  return { homeserver, serverName }
}

function normalizedUsername(username: string) {
  const value = username.trim().toLowerCase()
  if (!/^[a-z0-9_.-]{3,30}$/.test(value)) {
    throw new Error("Your Cipher username cannot be mapped to a Matrix account.")
  }
  return value
}

export function matrixUserIdForUsername(username: string) {
  const { serverName } = getMatrixConfig()
  return `@${normalizedUsername(username)}:${serverName}`
}

function matrixErrorData(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== "object") return {}
  const value = error as { data?: Record<string, unknown>; errcode?: unknown; message?: unknown }
  const data = value.data || {}
  return {
    ...data,
    errcode: typeof data.errcode === "string" ? data.errcode : typeof value.errcode === "string" ? value.errcode : undefined,
    message: typeof data.error === "string" ? data.error : typeof value.message === "string" ? value.message : undefined,
  }
}

function formatMatrixError(error: unknown) {
  const data = matrixErrorData(error)
  const errcode = data.errcode
  const message = typeof data.message === "string" ? data.message : "Matrix could not complete the request."
  if (errcode === "M_FORBIDDEN" || errcode === "M_DISABLED") {
    return "The Matrix homeserver rejected this sign-in or requires account approval. Check that the Matrix password matches your Cipher password, or ask the homeserver administrator."
  }
  if (errcode === "M_UNKNOWN_TOKEN") return "The saved Matrix session expired. Sign in again to reconnect."
  if (errcode === "M_USER_IN_USE") return "That Matrix username is already in use. Sign in with the Matrix account linked to this username."
  if (errcode === "M_INVALID_PASSWORD") return "The Matrix username or password is incorrect."
  return message.slice(0, 240)
}

function matrixPasswordAuth(username: string, password: string): UIAuthCallback<void> {
  return async (makeRequest) => {
    try {
      return await makeRequest(null)
    } catch (error) {
      const data = matrixErrorData(error)
      if (typeof data.session !== "string") throw error
      const flows = Array.isArray(data.flows) ? data.flows as Array<{ stages?: string[] }> : []
      if (!flows.some((flow) => flow.stages?.length === 1 && flow.stages[0] === "m.login.password")) {
        throw new Error("The Matrix homeserver requires an identity confirmation Cipher cannot complete. Use a trusted Matrix client or ask the homeserver administrator.", { cause: error })
      }
      return makeRequest({
        type: "m.login.password",
        identifier: { type: "m.id.user", user: normalizedUsername(username) },
        password,
        session: data.session,
      })
    }
  }
}

function acquireCryptoLock() {
  if (typeof navigator === "undefined" || !navigator.locks) {
    throw new Error("This browser does not support the lock required for safe Matrix encryption storage. Use a current browser with Web Locks enabled.")
  }

  return new Promise<void>((resolve, reject) => {
    const controller = new AbortController()
    let acquired = false
    let settled = false
    let unlock: (() => void) | null = null
    const holdLock = new Promise<void>((release) => { unlock = release })
    const timeout = window.setTimeout(() => {
      if (acquired || settled) return
      settled = true
      controller.abort()
      reject(new Error("Matrix encryption is already active in another Cipher tab. Close the other tab and retry."))
    }, 8000)

    navigator.locks.request(MATRIX_LOCK_NAME, { mode: "exclusive", signal: controller.signal }, async (lock) => {
      if (!lock) throw new Error("Could not acquire the Matrix encryption storage lock.")
      acquired = true
      window.clearTimeout(timeout)
      releaseCryptoLock = () => {
        unlock?.()
        unlock = null
        releaseCryptoLock = null
      }
      if (!settled) {
        settled = true
        resolve()
      }
      await holdLock
    }).catch((error) => {
      window.clearTimeout(timeout)
      if (!settled) {
        settled = true
        reject(error instanceof Error ? error : new Error("Could not acquire the Matrix encryption storage lock."))
      }
    })
  })
}

function clearSavedMatrixSession() {
  try { sessionStorage.removeItem(MATRIX_SESSION_KEY) } catch { /* Storage may be unavailable. */ }
  try { localStorage.removeItem(MATRIX_SESSION_KEY) } catch { /* Storage may be unavailable. */ }
}

function readStoredMatrixSession(storage: "local" | "tab") {
  try {
    return storage === "local"
      ? localStorage.getItem(MATRIX_SESSION_KEY)
      : sessionStorage.getItem(MATRIX_SESSION_KEY)
  } catch {
    return null
  }
}

function saveSession(session: MatrixSession) {
  const savedSession = {
    ...session,
    expiresAt: session.expiresAt || Date.now() + MATRIX_SESSION_TTL_MS,
  }
  const serialized = JSON.stringify(savedSession)
  let saved = false
  try {
    localStorage.setItem(MATRIX_SESSION_KEY, serialized)
    saved = true
  } catch { /* Fall back to the current tab if persistent storage is unavailable. */ }
  try {
    sessionStorage.setItem(MATRIX_SESSION_KEY, serialized)
    saved = true
  } catch { /* The persistent copy may still be available. */ }
  if (!saved) throw new Error("Cipher could not save the Matrix session in this browser. Enable site storage and sign in again.")
}

function readSession(): MatrixSession | null {
  try {
    const serialized = readStoredMatrixSession("local") || readStoredMatrixSession("tab")
    if (!serialized) return null
    const value = JSON.parse(serialized || "null") as Partial<MatrixSession> | null
    const { homeserver } = getMatrixConfig()
    if (!value || value.homeserver !== homeserver || !value.userId || !value.deviceId || !value.accessToken) {
      clearSavedMatrixSession()
      return null
    }
    const expiresAt = Number.isSafeInteger(value.expiresAt) ? value.expiresAt! : Date.now() + MATRIX_SESSION_TTL_MS
    if (expiresAt <= Date.now()) {
      clearSavedMatrixSession()
      return null
    }
    const session = { ...value, expiresAt } as MatrixSession
    if (!readStoredMatrixSession("local") || !value.expiresAt) saveSession(session)
    return session
  } catch {
    clearSavedMatrixSession()
    return null
  }
}

async function hasLocalCrossSigningIdentity(crypto: NonNullable<ReturnType<MatrixClient["getCrypto"]>>) {
  const status = await crypto.getCrossSigningStatus()
  const hasLocalKeys =
    status.privateKeysCachedLocally.masterKey &&
    status.privateKeysCachedLocally.selfSigningKey &&
    status.privateKeysCachedLocally.userSigningKey
  return Boolean(hasLocalKeys && await crypto.isCrossSigningReady())
}

function deviceStorageKey(userId: string) {
  return `cipher-matrix-device:${userId}`
}

function clearDeviceKeySnapshots(userId: string) {
  const prefix = `cipher-matrix-device-keys:${encodeURIComponent(userId)}:`
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index)
    if (key?.startsWith(prefix)) localStorage.removeItem(key)
  }
}

async function waitForInitialSync(client: MatrixClient, clientEvents: typeof import("matrix-js-sdk").ClientEvent, syncStates: typeof import("matrix-js-sdk").SyncState) {
  let onSync: ((state: string, previousState?: string | null, data?: { error?: Error }) => void) | null = null
  const ready = new Promise<void>((resolve, reject) => {
    onSync = (state, _previousState, data) => {
      if (state === syncStates.Prepared) {
        client.off(clientEvents.Sync, onSync!)
        resolve()
      } else if (state === syncStates.Error) {
        client.off(clientEvents.Sync, onSync!)
        const error = data?.error
        if (matrixErrorData(error).errcode === "M_UNKNOWN_TOKEN") clearSavedMatrixSession()
        reject(new Error(error ? formatMatrixError(error) : "Matrix could not sync. Check the homeserver and browser network access.", { cause: error }))
      }
    }
    client.on(clientEvents.Sync, onSync)
  })

  await client.startClient({ initialSyncLimit: 30 })
  let syncTimeout = 0
  await Promise.race([
    ready,
    new Promise<never>((_, reject) => {
      syncTimeout = window.setTimeout(() => reject(new Error("Timed out while connecting to the Matrix homeserver.")), 45000)
    }),
  ]).finally(() => {
    window.clearTimeout(syncTimeout)
    if (onSync) client.off(clientEvents.Sync, onSync)
  })
}

async function createAuthenticatedClient(session: MatrixSession) {
  await acquireCryptoLock()
  let client: MatrixClient | null = null
  let eventStore: MatrixEventStore | null = null
  try {
    const sdk = await import("matrix-js-sdk")
    const clientOptions = {
      baseUrl: session.homeserver,
      accessToken: session.accessToken,
      userId: session.userId,
      deviceId: session.deviceId,
      verificationMethods: ["m.sas.v1", "m.qr_code.show.v1", "m.qr_code.scan.v1"],
      cryptoCallbacks: {
        cacheSecretStorageKey: (keyId, _keyInfo, privateKey) => {
          cachedSecretStorageKey = { keyId, privateKey }
        },
        getSecretStorageKey: async ({ keys }) => {
          const cached = cachedSecretStorageKey
          return cached && keys[cached.keyId] ? [cached.keyId, cached.privateKey] : null
        },
      },
    } satisfies Parameters<typeof sdk.createClient>[0]

    if (window.indexedDB) {
      const { IndexedDBStore } = await import("matrix-js-sdk/lib/store/indexeddb")
      eventStore = new IndexedDBStore({
        indexedDB: window.indexedDB,
        localStorage: window.localStorage,
        dbName: `cipher-matrix-events-${encodeURIComponent(session.userId)}`,
      })
      client = sdk.createClient({ ...clientOptions, store: eventStore })
      try {
        await eventStore.startup()
      } catch {
        console.warn("Cipher could not open its local Matrix history cache; older messages remain available from the homeserver.")
        await eventStore.destroy().catch(() => undefined)
        eventStore = null
        client.stopClient()
        client = sdk.createClient(clientOptions)
      }
    } else {
      client = sdk.createClient(clientOptions)
    }
    matrixClient = client
    activeSession = session
    await client.initRustCrypto({ cryptoDatabasePrefix: `cipher-${encodeURIComponent(session.userId)}` })

    const crypto = client.getCrypto()
    if (!crypto) throw new Error("Matrix end-to-end encryption did not initialize.")
    const cryptoApi = await import("matrix-js-sdk/lib/crypto-api")
    crypto.setDeviceIsolationMode(new cryptoApi.OnlySignedDevicesIsolationMode())

    await waitForInitialSync(client, sdk.ClientEvent, sdk.SyncState)
    matrixEventStore = eventStore
    return client
  } catch (error) {
    client?.stopClient()
    await eventStore?.destroy().catch(() => undefined)
    if (matrixEventStore === eventStore) matrixEventStore = null
    matrixClient = null
    activeSession = null
    releaseCryptoLock?.()
    throw error
  }
}

async function connectSession(session: MatrixSession, accountCreated = false): Promise<MatrixConnectionResult> {
  if (matrixClient && activeSession?.userId === session.userId) {
    return {
      recoveryKey: pendingRecovery?.key.encodedPrivateKey || null,
      accountCreated: false,
      recoveryRequired: Boolean(pendingRecoveryRestore),
    }
  }

  const previousSession = readSession()
  if (previousSession && previousSession.userId !== session.userId) clearSavedMatrixSession()
  if (matrixClient) await stopMatrixClient(true)
  try {
    const client = await createAuthenticatedClient(session)
    const crypto = client.getCrypto()
    if (!crypto) throw new Error("Matrix end-to-end encryption did not initialize.")

    const recoveryReady = await crypto.isSecretStorageReady()
    const status = await crypto.getSecretStorageStatus()
    if (status.defaultKeyId) {
      if (!(await hasLocalCrossSigningIdentity(crypto))) {
        pendingRecoveryRestore = { client, session }
        return { recoveryKey: null, accountCreated, recoveryRequired: true }
      }
    } else if (!recoveryReady) {
      const key = await crypto.createRecoveryKeyFromPassphrase()
      if (!key.encodedPrivateKey) throw new Error("Matrix did not provide a displayable recovery key. No messages were sent.")
      pendingRecovery = { client, session, key }
      return { recoveryKey: key.encodedPrivateKey, accountCreated }
    }

    saveSession(session)
    return { recoveryKey: null, accountCreated }
  } catch (error) {
    await stopMatrixClient(false)
    await revokeIssuedSession(session)
    throw error
  }
}

async function revokeIssuedSession(session: MatrixSession) {
  try {
    const sdk = await import("matrix-js-sdk")
    const client = sdk.createClient({
      baseUrl: session.homeserver,
      accessToken: session.accessToken,
      userId: session.userId,
      deviceId: session.deviceId,
    })
    client.stopClient()
    await Promise.race([
      client.logout(false).catch(() => undefined),
      new Promise<void>((resolve) => window.setTimeout(resolve, 3000)),
    ])
  } catch {
    // The access token is never persisted when crypto setup fails; homeserver revocation is best effort.
  }
}

export async function loginMatrixAccount(username: string, password: string): Promise<MatrixConnectionResult> {
  return loginMatrixAccountInternal(username, password, true)
}

async function loginMatrixAccountInternal(username: string, password: string, provisionIfMissing: boolean): Promise<MatrixConnectionResult> {
  const { homeserver, serverName } = getMatrixConfig()
  const localpart = normalizedUsername(username)
  const expectedUserId = `@${localpart}:${serverName}`

  if (matrixClient && activeSession?.userId === expectedUserId) {
    return {
      recoveryKey: pendingRecovery?.key.encodedPrivateKey || null,
      accountCreated: false,
      recoveryRequired: Boolean(pendingRecoveryRestore),
    }
  }

  const sdk = await import("matrix-js-sdk")
  const loginClient = sdk.createClient({ baseUrl: homeserver })
  const deviceId = localStorage.getItem(deviceStorageKey(expectedUserId)) || undefined
  let response: Awaited<ReturnType<typeof loginClient.loginRequest>>
  try {
    response = await loginClient.loginRequest({
      type: "m.login.password",
      identifier: { type: "m.id.user", user: localpart },
      password,
      device_id: deviceId,
      initial_device_display_name: "Cipher web",
    })
  } catch (error) {
    if (provisionIfMissing && matrixErrorData(error).errcode === "M_FORBIDDEN") {
      try {
        return await registerMatrixAccountInternal(localpart, password, undefined, false)
      } catch (registrationError) {
        if (matrixErrorData(registrationError).errcode === "M_USER_IN_USE") {
          try {
            return await loginMatrixAccountInternal(localpart, password, false)
          } catch (existingLoginError) {
            throw new Error("A Matrix account with this username already exists. Its password must match your Cipher password; ask the homeserver administrator if it does not.", { cause: existingLoginError })
          }
        }
        throw registrationError
      }
    }
    throw new Error(formatMatrixError(error), { cause: error })
  }

  if (response.user_id !== expectedUserId) {
    await revokeIssuedSession({ homeserver, userId: response.user_id, deviceId: response.device_id, accessToken: response.access_token })
    throw new Error(`The Matrix account must be ${expectedUserId} so it matches this Cipher username.`)
  }
  localStorage.setItem(deviceStorageKey(expectedUserId), response.device_id)
  return connectSession({ homeserver, userId: response.user_id, deviceId: response.device_id, accessToken: response.access_token })
}

export async function registerMatrixAccount(username: string, password: string, registrationToken?: string): Promise<MatrixConnectionResult> {
  return registerMatrixAccountInternal(username, password, registrationToken, true)
}

async function registerMatrixAccountInternal(username: string, password: string, registrationToken: string | undefined, loginIfExisting: boolean): Promise<MatrixConnectionResult> {
  const { homeserver, serverName } = getMatrixConfig()
  const localpart = normalizedUsername(username)
  const expectedUserId = `@${localpart}:${serverName}`
  const sdk = await import("matrix-js-sdk")
  const registrationClient = sdk.createClient({ baseUrl: homeserver })
  const baseRequest = {
    username: localpart,
    password,
    initial_device_display_name: "Cipher web",
  }

  let response: Awaited<ReturnType<typeof registrationClient.registerRequest>> | null = null
  let request: Parameters<typeof registrationClient.registerRequest>[0] = baseRequest
  const completedStages = new Set<string>()
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      response = await registrationClient.registerRequest(request)
      break
    } catch (error) {
      const data = matrixErrorData(error)
      if (data.errcode === "M_USER_IN_USE") {
        if (loginIfExisting) return loginMatrixAccountInternal(localpart, password, false)
        throw error
      }
      const flows = Array.isArray(data.flows) ? data.flows as Array<{ stages?: string[] }> : []
      const flow = flows.find((candidate) => {
        const stages = candidate.stages || []
        return stages.length > 0 && stages.every((stage) => ["m.login.dummy", "m.login.registration_token"].includes(stage))
      })
      if (!flow) {
        if (flows.length) {
          throw new Error("The Matrix homeserver requires an enrollment step not supported in Cipher. Complete registration in Element or ask the homeserver administrator, then retry.", { cause: error })
        }
        throw new Error(formatMatrixError(error), { cause: error })
      }

      const stage = (flow.stages || []).find((value) => !completedStages.has(value))
      if (!stage) throw new Error(formatMatrixError(error), { cause: error })
      if (stage === "m.login.registration_token" && !registrationToken?.trim()) {
        throw new Error("This Matrix homeserver requires a registration token. Enter the token supplied by its administrator.", { cause: error })
      }
      completedStages.add(stage)
      request = {
        ...baseRequest,
        auth: {
          type: stage,
          ...(typeof data.session === "string" ? { session: data.session } : {}),
          ...(stage === "m.login.registration_token" ? { token: registrationToken!.trim() } : {}),
        },
      }
    }
  }

  if (!response?.access_token || !response.device_id || response.user_id !== expectedUserId) {
    if (response?.access_token && response.device_id) {
      await revokeIssuedSession({ homeserver, userId: response.user_id, deviceId: response.device_id, accessToken: response.access_token })
    }
    throw new Error(`The Matrix account must be ${expectedUserId} and the homeserver must return a device session.`)
  }
  localStorage.setItem(deviceStorageKey(expectedUserId), response.device_id)
  try {
    return await connectSession({ homeserver, userId: response.user_id, deviceId: response.device_id, accessToken: response.access_token }, true)
  } catch (error) {
    try {
      await deactivateMatrixAccount(localpart, password)
    } catch {
      throw new Error("Matrix registration succeeded, but Cipher could not finish encryption setup or deactivate the new Matrix account. Ask the homeserver administrator to remove it before retrying.")
    }
    throw error
  }
}

export async function generateNewMatrixRecoveryKey() {
  const pending = pendingRecoveryRestore
  if (!pending) throw new Error("Sign in again before generating a new recovery key.")
  const crypto = pending.client.getCrypto()
  if (!crypto) throw new Error("Matrix end-to-end encryption is unavailable.")
  const key = await crypto.createRecoveryKeyFromPassphrase()
  if (!key.encodedPrivateKey) throw new Error("Matrix did not generate a displayable recovery key. Please retry.")

  // Generate locally first. Encryption and backups change only after explicit reset confirmation.
  pendingRecovery = { ...pending, key, resetExisting: true }
  pendingRecoveryRestore = null
  return key.encodedPrivateKey
}

export async function finishMatrixRecoverySetup(username: string, password: string, confirmEncryptionReset = false) {
  if (!pendingRecovery) throw new Error("There is no Matrix recovery setup waiting for confirmation.")
  if (!password) throw new Error("Enter your password again to finish Matrix identity-key setup.")
  const { client, session, key } = pendingRecovery
  const crypto = client.getCrypto()
  if (!crypto) throw new Error("Matrix end-to-end encryption is unavailable.")
  const authenticate = matrixPasswordAuth(username, password)

  if (pendingRecovery.resetExisting) {
    if (!confirmEncryptionReset) throw new Error("Confirm that resetting encryption may make older encrypted messages unreadable before continuing.")
    cachedSecretStorageKey?.privateKey.fill(0)
    cachedSecretStorageKey = null
    await crypto.resetEncryption(authenticate)
    pendingRecovery.resetExisting = false
  }

  const storedKey = await client.secretStorage.getKey()
  if (storedKey) {
    if (!(await client.secretStorage.checkKey(key.privateKey, storedKey[1]))) {
      throw new Error("The Matrix recovery key changed during setup. Sign in again and restore it with the saved key.")
    }
    cachedSecretStorageKey = { keyId: storedKey[0], privateKey: key.privateKey }
  }

  await crypto.bootstrapSecretStorage({
    setupNewKeyBackup: !(await crypto.getKeyBackupInfo()),
    createSecretStorageKey: async () => key,
  })
  await crypto.bootstrapCrossSigning({
    authUploadDeviceSigningKeys: authenticate,
  })
  if (!(await hasLocalCrossSigningIdentity(crypto)) || !(await crypto.isSecretStorageReady())) {
    throw new Error("Matrix did not finish setting up your encryption identity and key backup. Retry before sending messages.")
  }

  saveSession(session)
  pendingRecovery = null
}

export async function finishMatrixRecoveryRestore(
  username: string,
  password: string,
  recoveryKey: string,
  onProgress?: (progress: { stage: "fetch" | "load_keys"; successes?: number; failures?: number; total?: number }) => void,
) {
  const pending = pendingRecoveryRestore
  if (!pending) throw new Error("There is no Matrix key restore waiting to finish. Sign in again.")
  if (!password) throw new Error("Enter your Matrix password again to restore encrypted keys.")

  const { decodeRecoveryKey } = await import("matrix-js-sdk/lib/crypto-api/recovery-key")
  let privateKey: Uint8Array<ArrayBuffer>
  try {
    privateKey = decodeRecoveryKey(recoveryKey.trim())
  } catch {
    throw new Error("That recovery key is not in a valid Matrix format. Check it and try again.")
  }

  try {
    const crypto = pending.client.getCrypto()
    if (!crypto) throw new Error("Matrix end-to-end encryption is unavailable.")

    const defaultKeyId = await pending.client.secretStorage.getDefaultKeyId()
    const storedKey = await pending.client.secretStorage.getKey(defaultKeyId)
    if (!defaultKeyId || !storedKey || storedKey[0] !== defaultKeyId || !(await pending.client.secretStorage.checkKey(privateKey, storedKey[1]))) {
      throw new Error("That recovery key does not match this Matrix account. Check the key and try again.")
    }
    cachedSecretStorageKey = { keyId: defaultKeyId, privateKey }

    const crossSigningSecrets = ["m.cross_signing.master", "m.cross_signing.self_signing", "m.cross_signing.user_signing"] as const
    let missingCrossSigningSecret = false
    for (const secretName of crossSigningSecrets) {
      const encryptedSecret = await pending.client.secretStorage.isStored(secretName)
      if (!encryptedSecret?.[defaultKeyId]) missingCrossSigningSecret = true
    }
    if (missingCrossSigningSecret) {
      // An interrupted first setup has no published identity yet. Never replace an existing identity's missing keys.
      const keys = await pending.client.downloadKeysForUsers([pending.session.userId])
      const userId = pending.session.userId
      if (!keys.device_keys?.[userId] || Object.keys(keys.failures || {}).length ||
          keys.master_keys?.[userId] || keys.self_signing_keys?.[userId] || keys.user_signing_keys?.[userId]) {
        throw new Error("This account is missing a cross-signing key from its Matrix backup. Restore its identity in a trusted Matrix client before using Cipher.")
      }
    }

    await crypto.bootstrapCrossSigning({
      authUploadDeviceSigningKeys: matrixPasswordAuth(username, password),
    })
    if (!(await hasLocalCrossSigningIdentity(crypto))) {
      throw new Error("Matrix could not save the restored cross-signing keys on this device. Your recovery key was not changed; retry the restore before sending messages.")
    }

    // Resume interrupted setup using the existing storage and backup keys, without replacing a backup.
    await crypto.bootstrapSecretStorage({ setupNewKeyBackup: !(await crypto.getKeyBackupInfo()) })

    let restored = { imported: 0, total: 0 }
    const backupInfo = await crypto.getKeyBackupInfo()
    if (backupInfo) {
      const encryptedBackupKey = await pending.client.secretStorage.isStored("m.megolm_backup.v1")
      if (!encryptedBackupKey?.[defaultKeyId]) {
        throw new Error("This account's encrypted message-key backup is not available under its recovery key.")
      }
      await crypto.loadSessionBackupPrivateKeyFromSecretStorage()
      const backupStatus = await crypto.checkKeyBackupAndEnable()
      if (!backupStatus?.trustInfo.trusted || !backupStatus.trustInfo.matchesDecryptionKey) {
        throw new Error("Matrix could not verify the encrypted key backup. Cipher refused to import it.")
      }
      restored = await crypto.restoreKeyBackup({ progressCallback: onProgress })
    }

    if (!(await hasLocalCrossSigningIdentity(crypto)) || !(await crypto.isSecretStorageReady())) {
      throw new Error("Matrix key recovery is incomplete. Do not send messages from this device yet.")
    }
    saveSession(pending.session)
    pendingRecoveryRestore = null
    return restored
  } catch (error) {
    if (cachedSecretStorageKey?.privateKey === privateKey) cachedSecretStorageKey = null
    privateKey.fill(0)
    throw error
  }
}

export async function cancelPendingMatrixRecovery() {
  const session = pendingRecoveryRestore?.session || pendingRecovery?.session || null
  await stopMatrixClient(false)
  if (session) await revokeIssuedSession(session)
}

export function getPendingMatrixRecoveryKey() {
  return pendingRecovery?.key.encodedPrivateKey || null
}

export async function getMatrixClient() {
  if (pendingRecoveryRestore) throw new Error("Your Matrix encryption keys need restoring. Sign in to reconnect securely.")
  if (pendingRecovery) throw new Error("Finish your one-time Matrix recovery setup before opening messages.")
  if (matrixClient) return matrixClient
  const session = readSession()
  if (!session) throw new Error("Your Matrix session is missing. Sign in again to reconnect encrypted messaging.")

  const client = await createAuthenticatedClient(session)
  const crypto = client.getCrypto()
  if (!crypto) {
    await stopMatrixClient(false)
    throw new Error("Matrix end-to-end encryption could not be initialized. Sign in again before sending messages.")
  }

  const status = await crypto.getSecretStorageStatus()
  if (!status.ready) {
    if (status.defaultKeyId) {
      pendingRecoveryRestore = { client, session }
      throw new Error("Your Matrix encryption keys need restoring. Sign in to reconnect securely.")
    }
    await stopMatrixClient(false)
    throw new Error("Matrix encryption recovery is incomplete. Sign in again and finish recovery setup before chatting.")
  }

  if (!(await hasLocalCrossSigningIdentity(crypto))) {
    pendingRecoveryRestore = { client, session }
    throw new Error("Your Matrix device needs its existing recovery key before it can send encrypted messages. Sign in to restore it.")
  }
  return client
}

export async function getOrCreateEncryptedDirectRoom(peerUserId: string) {
  const peer = peerUserId.trim()
  if (!peer.startsWith("@")) throw new Error("Invalid Matrix conversation identity.")
  const existing = roomSetupPromises.get(peer)
  if (existing) return existing
  const pending = createOrJoinEncryptedDirectRoom(peer)
  roomSetupPromises.set(peer, pending)
  void pending.finally(() => {
    if (roomSetupPromises.get(peer) === pending) roomSetupPromises.delete(peer)
  }).catch(() => undefined)
  return pending
}

async function createOrJoinEncryptedDirectRoom(peer: string) {
  const client = await getMatrixClient()
  if (peer === client.getUserId()) throw new Error("Invalid Matrix conversation identity.")

  const matchesPeer = (room: NonNullable<ReturnType<MatrixClient["getRoom"]>>) =>
    room.getMember(peer)?.membership === "join" &&
    room.getJoinedMemberCount() === 2 &&
    room.getMyMembership() === "join"

  const activeRoom = client.getRooms().find((room) =>
    room.hasEncryptionStateEvent() &&
    room.currentState.getStateEvents("m.room.encryption", "")?.getContent().algorithm === "m.megolm.v1.aes-sha2" &&
    matchesPeer(room),
  )
  if (activeRoom) return activeRoom.roomId

  const invitation = client.getRooms().find((room) =>
    room.hasEncryptionStateEvent() &&
    room.getMyMembership() === "invite" &&
    room.getInvitedAndJoinedMemberCount() === 2 &&
    room.currentState.getStateEvents("m.room.encryption", "")?.getContent().algorithm === "m.megolm.v1.aes-sha2" &&
    room.getMember(peer)?.membership === "join",
  )
  if (invitation) {
    const joined = await client.joinRoom(invitation.roomId)
    const encryption = await client.getStateEvent(joined.roomId, "m.room.encryption", "")
    if (encryption.algorithm === "m.megolm.v1.aes-sha2") return joined.roomId
  }

  const sdk = await import("matrix-js-sdk")
  const created = await client.createRoom({
    visibility: sdk.Visibility.Private,
    preset: sdk.Preset.PrivateChat,
    invite: [peer],
    is_direct: true,
    initial_state: [{
      type: "m.room.encryption",
      state_key: "",
      content: { algorithm: "m.megolm.v1.aes-sha2" },
    }, {
      type: sdk.EventType.RoomPowerLevels,
      state_key: "",
      content: { redact: 0 },
    }],
  })
  const encryption = await client.getStateEvent(created.room_id, "m.room.encryption", "")
  if (encryption.algorithm !== "m.megolm.v1.aes-sha2") {
    throw new Error("The Matrix homeserver did not create an encrypted room. Cipher blocked sending the message.")
  }
  return created.room_id
}

export async function sendEncryptedMatrixMessage(
  roomId: string,
  text: string,
  transactionId: string,
  integrity: IntegrityMetadata,
  expiry: MatrixExpirySettings | null = null,
) {
  if (!(await verifyMessageIntegrity(text, integrity))) {
    throw new Error("The message integrity commitment could not be verified. Cipher blocked sending.")
  }
  const client = await getMatrixClient()
  const sdk = await import("matrix-js-sdk")
  const encryption = await client.getStateEvent(roomId, "m.room.encryption", "")
  if (encryption.algorithm !== "m.megolm.v1.aes-sha2") {
    throw new Error("This Matrix room is not using the required encryption algorithm. Cipher blocked sending the message.")
  }
  const crypto = client.getCrypto()
  const peer = client.getRoom(roomId)?.getJoinedMembers().find((member) => member.userId !== client.getUserId())
  if (crypto && peer && (await crypto.getUserVerificationStatus(peer.userId)).needsUserApproval) {
    throw new Error("This contact's Matrix identity changed. Verify the new identity in the privacy receipt before sending.")
  }
  const content = {
    msgtype: sdk.MsgType.Text,
    body: text,
    [MATRIX_INTEGRITY_KEY]: integrity,
    ...(expiry ? { [MATRIX_EXPIRY_KEY]: expiry } : {}),
  } as RoomMessageEventContent
  return client.sendEvent(roomId, sdk.EventType.RoomMessage, content, transactionId)
}

export async function sendEncryptedMatrixAttachment(
  roomId: string,
  file: File,
  caption: string,
  transactionId: string,
  expiry: MatrixExpirySettings | null = null,
) {
  if (file.size <= 0 || file.size > MATRIX_ATTACHMENT_MAX_BYTES) {
    throw new Error(`Choose a file between 1 byte and ${MATRIX_ATTACHMENT_MAX_MB} MB.`)
  }
  const client = await getMatrixClient()
  const sdk = await import("matrix-js-sdk")
  const encryption = await client.getStateEvent(roomId, "m.room.encryption", "")
  if (encryption.algorithm !== "m.megolm.v1.aes-sha2") {
    throw new Error("This Matrix room is not using the required encryption algorithm. Cipher blocked the upload.")
  }
  const crypto = client.getCrypto()
  const peer = client.getRoom(roomId)?.getJoinedMembers().find((member) => member.userId !== client.getUserId())
  if (crypto && peer && (await crypto.getUserVerificationStatus(peer.userId)).needsUserApproval) {
    throw new Error("This contact's Matrix identity changed. Verify the new identity in the privacy receipt before sending.")
  }

  const wasm = await import("@matrix-org/matrix-sdk-crypto-wasm")
  await wasm.initAsync()
  const plaintext = new Uint8Array(await file.arrayBuffer())
  let encrypted: ReturnType<typeof wasm.Attachment.encrypt>
  try {
    encrypted = wasm.Attachment.encrypt(plaintext)
  } finally {
    plaintext.fill(0)
  }
  try {
    const mediaEncryptionInfo = encrypted.mediaEncryptionInfo
    if (!mediaEncryptionInfo) throw new Error("Matrix did not create attachment encryption metadata.")
    const encryptionInfo = JSON.parse(mediaEncryptionInfo) as Omit<EncryptedFile, "url">
    const upload = await client.uploadContent(new Blob([new Uint8Array(encrypted.encryptedData).buffer], { type: "application/octet-stream" }), {
      type: "application/octet-stream",
      includeFilename: false,
    })
    if (!upload.content_uri.startsWith("mxc://")) throw new Error("The Matrix homeserver returned an invalid attachment URL.")
    const content = {
      msgtype: sdk.MsgType.File,
      body: caption.trim() || file.name,
      filename: file.name,
      file: { ...encryptionInfo, url: upload.content_uri } satisfies EncryptedFile,
      info: { mimetype: file.type || "application/octet-stream", size: file.size },
      ...(expiry ? { [MATRIX_EXPIRY_KEY]: expiry } : {}),
    } as RoomMessageEventContent
    return await client.sendEvent(roomId, sdk.EventType.RoomMessage, content, transactionId)
  } finally {
    encrypted.free()
  }
}

export async function downloadEncryptedMatrixAttachment(attachment: MatrixEncryptedAttachment) {
  const client = await getMatrixClient()
  const file = attachment.file
  if (!file.url.startsWith("mxc://") || file.v !== "v2" || !file.hashes?.sha256) {
    throw new Error("This encrypted attachment has invalid Matrix metadata.")
  }
  const token = client.getAccessToken()
  if (!token) throw new Error("Your Matrix session expired. Sign in again to download this file.")

  const authenticatedUrl = client.mxcUrlToHttp(file.url, undefined, undefined, undefined, false, true, true)
  if (!authenticatedUrl) throw new Error("Matrix could not resolve the encrypted attachment URL.")
  let response = await fetch(authenticatedUrl, { headers: { Authorization: `Bearer ${token}` }, credentials: "omit" })
  if (!response.ok && [401, 404, 405].includes(response.status)) {
    const publicUrl = client.mxcUrlToHttp(file.url, undefined, undefined, undefined, false, true, false)
    if (publicUrl) response = await fetch(publicUrl, { credentials: "omit" })
  }
  if (!response.ok) throw new Error("The Matrix homeserver could not retrieve this attachment.")
  const contentLength = Number(response.headers.get("content-length") || 0)
  if (contentLength > MATRIX_ATTACHMENT_MAX_BYTES + 1024) throw new Error(`This attachment is larger than Cipher's ${MATRIX_ATTACHMENT_MAX_MB} MB download limit.`)
  const ciphertext = new Uint8Array(await response.arrayBuffer())
  if (ciphertext.byteLength > MATRIX_ATTACHMENT_MAX_BYTES + 1024) throw new Error(`This attachment is larger than Cipher's ${MATRIX_ATTACHMENT_MAX_MB} MB download limit.`)

  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", ciphertext))
  const digestBase64 = btoa(String.fromCharCode(...digest)).replace(/=+$/, "")
  if (digestBase64 !== file.hashes.sha256) throw new Error("The encrypted attachment failed its Matrix integrity check.")

  const wasm = await import("@matrix-org/matrix-sdk-crypto-wasm")
  await wasm.initAsync()
  const mediaEncryptionInfo: Partial<EncryptedFile> = { ...file }
  delete mediaEncryptionInfo.url
  const encrypted = new wasm.EncryptedAttachment(ciphertext, JSON.stringify(mediaEncryptionInfo))
  try {
    const plaintext = wasm.Attachment.decrypt(encrypted)
    try {
      return new Blob([new Uint8Array(plaintext).buffer], { type: attachment.mimetype || "application/octet-stream" })
    } finally {
      plaintext.fill(0)
    }
  } finally {
    encrypted.free()
  }
}

export async function sendEncryptedExpiryStart(roomId: string, eventId: string, expiresAt: number) {
  const client = await getMatrixClient()
  const encryption = await client.getStateEvent(roomId, "m.room.encryption", "")
  if (encryption.algorithm !== "m.megolm.v1.aes-sha2") throw new Error("This room is not encrypted. Cipher did not send expiry metadata.")
  const sdk = await import("matrix-js-sdk")
  const content = {
    msgtype: sdk.MsgType.Notice,
    body: "",
    [MATRIX_EXPIRY_START_KEY]: { eventId, expiresAt } satisfies MatrixExpiryStart,
  } as RoomMessageEventContent
  return client.sendEvent(roomId, sdk.EventType.RoomMessage, content, crypto.randomUUID())
}

export async function redactMatrixEvent(roomId: string, eventId: string) {
  const client = await getMatrixClient()
  return client.redactEvent(roomId, eventId, crypto.randomUUID(), { reason: "Cipher message expiry timer elapsed" })
}

export async function exportMatrixHistory(onProgress?: (completedRooms: number, totalRooms: number) => void) {
  const [client, sdk] = await Promise.all([getMatrixClient(), import("matrix-js-sdk")])
  const directRooms = client.getAccountData(sdk.EventType.Direct)?.getContent() || {}
  const directRoomIds = new Set(Object.values(directRooms).flat().filter((roomId): roomId is string => typeof roomId === "string"))
  const rooms = client.getRooms().filter((room) => {
    const algorithm = room.currentState.getStateEvents(sdk.EventType.RoomEncryption, "")?.getContent().algorithm
    const peerCount = room.getJoinedMemberCount() === 2
    const isDirect = directRoomIds.has(room.roomId) || Boolean(room.getDMInviter())
    return isDirect && peerCount && room.getMyMembership() === "join" && algorithm === "m.megolm.v1.aes-sha2"
  })
  const result: {
    exportedAt: string
    account: string | null
    source: string
    rooms: Array<{ roomId: string; peerUserId: string | null; messages: Array<{ eventId: string; eventType: string; timestamp: string; sender: string | null; content: Record<string, unknown> }> }>
    decryptionFailures: number
  } = {
    exportedAt: new Date().toISOString(),
    account: client.getUserId(),
    source: "Matrix rooms marked direct by the account; plaintext is assembled locally in this browser.",
    rooms: [],
    decryptionFailures: 0,
  }

  for (const [index, room] of rooms.entries()) {
    let pages = 0
    while (room.oldState.paginationToken !== null) {
      const priorToken = room.oldState.paginationToken
      const priorEventCount = room.getLiveTimeline().getEvents().length
      await client.scrollback(room, 100)
      pages += 1
      if (room.oldState.paginationToken === priorToken && room.getLiveTimeline().getEvents().length <= priorEventCount) break
      if (pages >= 5000) throw new Error("Matrix history export stopped after 500,000 events in one room. Export this room with a trusted Matrix client or narrow the retained history first.")
    }

    const peer = room.getMembersWithMembership("join").find((member) => member.userId !== client.getUserId())
    const messages: Array<{ eventId: string; eventType: string; timestamp: string; sender: string | null; content: Record<string, unknown> }> = []
    for (const event of room.getLiveTimeline().getEvents()) {
      if (event.isEncrypted()) {
        try {
          await client.decryptEventIfNeeded(event)
        } catch {
          result.decryptionFailures += 1
          continue
        }
      }
      if (event.isDecryptionFailure()) {
        result.decryptionFailures += 1
        continue
      }
      const eventType = event.getType()
      if (event.isRedacted() || ![sdk.EventType.RoomMessage, sdk.EventType.Sticker, sdk.EventType.Reaction].some((messageType) => messageType === eventType)) continue
      const content = eventType === sdk.EventType.RoomMessage ? matrixEventContent(event) : event.getContent()
      const eventId = event.getId()
      if (!content || !eventId) continue
      messages.push({
        eventId,
        eventType,
        timestamp: new Date(event.getTs()).toISOString(),
        sender: event.getSender() || null,
        content: JSON.parse(JSON.stringify(content)) as Record<string, unknown>,
      })
      if (messages.length > 250_000) throw new Error("Matrix history export exceeded the 250,000 message browser safety limit. Export this account with a trusted Matrix client.")
    }
    result.rooms.push({ roomId: room.roomId, peerUserId: peer?.userId || null, messages })
    onProgress?.(index + 1, rooms.length)
  }
  return result
}

export async function logoutMatrixSession() {
  const session = readSession()
  const hadClient = Boolean(matrixClient)
  await stopMatrixClient(true)
  if (!hadClient && session) await revokeIssuedSession(session)
}

async function clearLocalMatrixStores(client: MatrixClient, userId: string) {
  try {
    await acquireCryptoLock()
    try {
      await client.clearStores({ cryptoDatabasePrefix: `cipher-${encodeURIComponent(userId)}` })
      return await clearMatrixEventCache(userId)
    } finally {
      releaseCryptoLock?.()
    }
  } catch {
    return false
  }
}

async function clearMatrixEventCache(userId: string) {
  if (!window.indexedDB) return true
  return new Promise<boolean>((resolve) => {
    const request = window.indexedDB.deleteDatabase(`cipher-matrix-events-${encodeURIComponent(userId)}`)
    request.onsuccess = () => resolve(true)
    request.onerror = () => resolve(false)
    request.onblocked = () => resolve(false)
  })
}

export async function deactivateMatrixAccount(username: string, password: string) {
  const { homeserver, serverName } = getMatrixConfig()
  const localpart = normalizedUsername(username)
  const expectedUserId = `@${localpart}:${serverName}`
  const sdk = await import("matrix-js-sdk")
  const loginClient = sdk.createClient({ baseUrl: homeserver })

  let response: Awaited<ReturnType<typeof loginClient.loginRequest>>
  try {
    response = await loginClient.loginRequest({
      type: "m.login.password",
      identifier: { type: "m.id.user", user: localpart },
      password,
      device_id: localStorage.getItem(deviceStorageKey(expectedUserId)) || undefined,
      initial_device_display_name: "Cipher account deletion",
    })
  } catch (error) {
    if (matrixErrorData(error).errcode === "M_USER_DEACTIVATED") {
      await stopMatrixClient(false)
      const client = sdk.createClient({ baseUrl: homeserver })
      const localStoresCleared = await clearLocalMatrixStores(client, expectedUserId)
      clearSavedMatrixSession()
      localStorage.removeItem(deviceStorageKey(expectedUserId))
      return { localStoresCleared }
    }
    throw new Error(`Could not authenticate with the Matrix homeserver. Cipher account deletion has not started. ${formatMatrixError(error)}`, { cause: error })
  }

  const session = {
    homeserver,
    userId: response.user_id,
    deviceId: response.device_id,
    accessToken: response.access_token,
  }
  if (response.user_id !== expectedUserId || !response.device_id || !response.access_token) {
    await revokeIssuedSession(session)
    throw new Error(`The Matrix account must be ${expectedUserId}. Cipher account deletion has not started.`)
  }

  const client = sdk.createClient({
    baseUrl: homeserver,
    accessToken: response.access_token,
    userId: response.user_id,
    deviceId: response.device_id,
  })
  try {
    await client.deactivateAccount({
      type: "m.login.password",
      identifier: { type: "m.id.user", user: localpart },
      password,
    }, true)
  } catch (error) {
    client.stopClient()
    await revokeIssuedSession(session)
    throw new Error(`The Matrix homeserver could not deactivate this account. Cipher account deletion has not started. ${formatMatrixError(error)}`, { cause: error })
  }

  client.stopClient()
  await stopMatrixClient(false)
  const localStoresCleared = await clearLocalMatrixStores(client, expectedUserId)
  clearSavedMatrixSession()
  localStorage.removeItem(deviceStorageKey(expectedUserId))
  clearDeviceKeySnapshots(expectedUserId)
  return { localStoresCleared }
}

async function stopMatrixClient(revokeSession: boolean) {
  const client = matrixClient
  const eventStore = matrixEventStore
  const hadLocalSession = Boolean(client || eventStore || pendingRecovery || pendingRecoveryRestore)
  matrixClient = null
  matrixEventStore = null
  activeSession = null
  pendingRecovery?.key.privateKey.fill(0)
  pendingRecovery = null
  pendingRecoveryRestore = null
  cachedSecretStorageKey?.privateKey.fill(0)
  cachedSecretStorageKey = null
  roomSetupPromises.clear()
  if (revokeSession || hadLocalSession) {
    clearSavedMatrixSession()
  }
  if (client) {
    client.stopClient()
    if (revokeSession) {
      await Promise.race([
        client.logout(false).catch(() => undefined),
        new Promise<void>((resolve) => window.setTimeout(resolve, 3000)),
      ])
    }
  }
  if (eventStore) {
    await eventStore.save(true).catch(() => undefined)
    await eventStore.destroy().catch(() => undefined)
  }
  releaseCryptoLock?.()
}

export function matrixEventContent(event: MatrixEvent) {
  const content = event.getContent()
  if (parseMatrixExpiryStart(content[MATRIX_EXPIRY_START_KEY])) return null
  return event.getType() === "m.room.message" && typeof content.body === "string" ? content : null
}
