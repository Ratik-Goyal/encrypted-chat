export type Status = "online" | "offline" | "idle" | "dnd"
export type Timestamp = string | Date
export interface DirectoryUser {
  userId: string
  username: string
  profilePicture?: string
  status: Status
  isOnline: boolean
}
export interface LegacyMessage {
  id: string
  from: string
  to: string
  encrypted: string
  createdAt: Timestamp
  delivered?: boolean
  read?: boolean
  onBlockchain?: boolean
  blockchainTxHash?: string
  selfDestruct?: number
  selfDestructStart?: "send" | "firstRead"
  expiresAt?: Timestamp | null
}
export interface SocketEventPayloads {
  error: { message: string; statusCode: number }
  "user-registered": { userId: string; username: string }
  "user-online": { userId: string; status: Status }
  "user-offline": { userId: string; lastSeen: Timestamp }
  "user-status-changed": { userId: string; status: Status }
  "profile-picture-updated": { userId: string; profilePicture: string }
  "typing-status": { from: string; isTyping: boolean }
  "messages-read-local": { from: string }
  "messages-read": { from: string; to: string }
  "message-expiry-started": { messageId: string; expiresAt: Timestamp }
  "online-users": DirectoryUser[]
  "all-users": DirectoryUser[]
  "all-users-with-stats": Array<DirectoryUser & {
    email: string
    createdAt: Timestamp
    role: "user" | "admin"
    messageCount: number
  }>
  "new-message": LegacyMessage
  "message-delivered": { messageId: string }
  "conversation-history": { userId: string; messages: LegacyMessage[] }
  "unread-from-user": { from: string; count: number }
  "unread-count": { count: number }
  "privacy-updated": { showOnlineStatus: boolean; readReceipts: boolean; typingIndicator: boolean }
  "friend-request-received": { from: string; username: string }
  "blockchain-logs": Array<{ id: string; createdAt: Timestamp; blockchainTxHash?: string; onBlockchain: boolean }>
  "all-blockchain-logs": Array<{ createdAt: Timestamp; blockchainTxHash?: string; onBlockchain: boolean }>
  "system-stats": {
    totalUsers: number
    onlineUsers: number
    totalMessages: number
    blockchainMessages: number
    integrityBatchCount: number
    integrityAnchoredBatches: number
    integrityWaiting: number
    integrityChainConfigured: boolean
  }
  "recent-activities": Array<{ type: "user" | "message"; username?: string; timestamp: Timestamp }>
  "analytics-data": {
    hourly: Array<{ time: string; messages: number; users: number }>
    daily: Array<{ day: string; messages: number; users: number }>
  }
  "daily-message-stats": { daily: Array<{ date: string; messages: number }>; total: number }
}
export type SocketEventName = keyof SocketEventPayloads
export function isSocketEventPayload<K extends SocketEventName>(event: K, payload: unknown): payload is SocketEventPayloads[K]
export const schemas: Record<SocketEventName, { safeParse(payload: unknown): { success: boolean; data?: unknown } }>
