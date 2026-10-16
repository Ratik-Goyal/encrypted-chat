const { z } = require("zod")

const status = z.enum(["online", "offline", "idle", "dnd"])
const timestamp = z.union([z.string().min(1), z.date()])
const count = z.number().int().nonnegative()
const userId = z.string().min(1).max(128)
const directoryUser = z.object({
  userId,
  username: z.string().min(1).max(30),
  profilePicture: z.string().max(120 * 1024).optional(),
  status,
  isOnline: z.boolean(),
}).passthrough()
const legacyMessage = z.object({
  id: z.string().min(1).max(128),
  from: userId,
  to: userId,
  encrypted: z.string().max(100 * 1024),
  createdAt: timestamp,
  delivered: z.boolean().optional(),
  read: z.boolean().optional(),
  onBlockchain: z.boolean().optional(),
  blockchainTxHash: z.string().optional(),
  selfDestruct: z.number().nonnegative().optional(),
  selfDestructStart: z.enum(["send", "firstRead"]).optional(),
  expiresAt: z.union([timestamp, z.null()]).optional(),
}).passthrough()

const schemas = {
  error: z.object({ message: z.string().min(1).max(240), statusCode: z.number().int().min(400).max(599) }),
  "user-registered": z.object({ userId, username: z.string().min(1).max(30) }),
  "user-online": z.object({ userId, status }),
  "user-offline": z.object({ userId, lastSeen: timestamp }),
  "user-status-changed": z.object({ userId, status }),
  "profile-picture-updated": z.object({ userId, profilePicture: z.string().max(120 * 1024) }),
  "typing-status": z.object({ from: userId, isTyping: z.boolean() }),
  "messages-read-local": z.object({ from: userId }),
  "messages-read": z.object({ from: userId, to: userId }),
  "message-expiry-started": z.object({ messageId: z.string().min(1).max(128), expiresAt: timestamp }),
  "online-users": z.array(directoryUser).max(10000),
  "all-users": z.array(directoryUser).max(100),
  "all-users-with-stats": z.array(z.object({
    userId,
    username: z.string().min(1).max(30),
    email: z.string().email().max(254),
    status,
    isOnline: z.boolean(),
    createdAt: timestamp,
    role: z.enum(["user", "admin"]),
    messageCount: count,
  }).passthrough()).max(10000),
  "new-message": legacyMessage,
  "message-delivered": z.object({ messageId: z.string().min(1).max(128) }),
  "conversation-history": z.object({ userId, messages: z.array(legacyMessage).max(500) }),
  "unread-from-user": z.object({ from: userId, count }),
  "unread-count": z.object({ count }),
  "privacy-updated": z.object({
    showOnlineStatus: z.boolean(),
    readReceipts: z.boolean(),
    typingIndicator: z.boolean(),
  }),
  "friend-request-received": z.object({ from: userId, username: z.string().min(1).max(30) }),
  "blockchain-logs": z.array(z.object({
    id: z.string().min(1).max(128),
    createdAt: timestamp,
    blockchainTxHash: z.string().max(128).optional(),
    onBlockchain: z.boolean(),
  }).passthrough()).max(50),
  "all-blockchain-logs": z.array(z.object({
    createdAt: timestamp,
    blockchainTxHash: z.string().max(128).optional(),
    onBlockchain: z.boolean(),
  }).passthrough()).max(100),
  "system-stats": z.object({
    totalUsers: count,
    onlineUsers: count,
    totalMessages: count,
    blockchainMessages: count,
    integrityBatchCount: count,
    integrityAnchoredBatches: count,
    integrityWaiting: count,
    integrityChainConfigured: z.boolean(),
  }),
  "recent-activities": z.array(z.object({
    type: z.enum(["user", "message"]),
    username: z.string().min(1).max(30).optional(),
    timestamp,
  })).max(20),
  "analytics-data": z.object({
    hourly: z.array(z.object({ time: z.string().min(1).max(32), messages: count, users: count })).length(24),
    daily: z.array(z.object({ day: z.string().min(1).max(16), messages: count, users: count })).length(7),
  }),
  "daily-message-stats": z.object({
    daily: z.array(z.object({ date: z.string().min(1).max(32), messages: count })).length(7),
    total: count,
  }),
}

function isSocketEventPayload(event, payload) {
  return schemas[event]?.safeParse(payload).success === true
}

module.exports = { schemas, isSocketEventPayload }
