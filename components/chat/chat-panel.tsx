"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import Link from "next/link"
import { MessageBubble } from "@/components/chat/message-bubble"
import { TypingIndicator } from "@/components/chat/typing-indicator"
import { Spinner } from "@/components/loaders/spinner"
import { AnimatePresence } from "framer-motion"
import { getSocket } from "@/lib/socket"
import {
  getMatrixClient,
  getOrCreateEncryptedDirectRoom,
  matrixEventContent,
  matrixUserIdForUsername,
  parseMatrixExpirySettings,
  parseMatrixExpiryStart,
  redactMatrixEvent,
  sendEncryptedExpiryStart,
  MATRIX_EXPIRY_KEY,
  MATRIX_EXPIRY_START_KEY,
} from "@/lib/matrix"
import type { MatrixEncryptedAttachment } from "@/lib/matrix"
import { PrivacyReceipt } from "@/components/chat/privacy-receipt"
import { Button } from "@/components/ui/button"
import { MATRIX_INTEGRITY_KEY, parseIntegrityMetadata } from "@/lib/integrity"
import type { IntegrityMetadata } from "@/lib/integrity"
import { onSocketEvent } from "@/lib/socket-events"
import type { LegacyMessage, SocketEventPayloads } from "@/shared/socket-events.cjs"

interface Message {
  id: string
  content: string
  timestamp: string
  occurredAt: number
  isOwn: boolean
  isDelivered?: boolean
  isRead?: boolean
  showDeliveryStatus?: boolean
  isEncoded?: boolean
  isLegacyRecord?: boolean
  selfDestruct?: number
  selfDestructStart?: "send" | "firstRead"
  expiresAt?: string | number | null
  integrity?: IntegrityMetadata | null
  isMatrixEncrypted?: boolean
  decryptionFailureReason?: string | null
  transactionId?: string
  attachment?: MatrixEncryptedAttachment
  onFirstRead?: () => void
}

export type MatrixConnectionStatus = "connecting" | "connected" | "reconnecting" | "catching-up" | "offline"

interface ChatPanelProps {
  userId: string
  username: string
  readReceiptsEnabled: boolean
  onRoomReady: (roomId: string) => void
  onConnectionStatusChange: (status: MatrixConnectionStatus) => void
}

function clockTime(value: number | string | Date) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

function readCurrentUser() {
  try {
    return typeof window === "undefined" ? {} : JSON.parse(localStorage.getItem("cipher-user") || "{}")
  } catch {
    return {}
  }
}

function mergeMessage(previous: Message[], incoming: Message) {
  return [...previous.filter((message) =>
    message.id !== incoming.id &&
    (!incoming.transactionId || message.transactionId !== incoming.transactionId),
  ), incoming]
    .sort((left, right) => left.occurredAt - right.occurredAt)
}

function collectExpiryStarts(events: any[], starts: Map<string, number>) {
  for (const event of events) {
    const marker = parseMatrixExpiryStart(event.getContent?.()?.[MATRIX_EXPIRY_START_KEY])
    if (!marker) continue
    const previous = starts.get(marker.eventId)
    starts.set(marker.eventId, previous === undefined ? marker.expiresAt : Math.min(previous, marker.expiresAt))
  }
}

export function ChatPanel({ userId, username, readReceiptsEnabled, onRoomReady, onConnectionStatusChange }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isTyping, setIsTyping] = useState(false)
  const [isEncrypted, setIsEncrypted] = useState(false)
  const [privacyRoom, setPrivacyRoom] = useState<{ userId: string; username: string; peerUserId: string; roomId: string } | null>(null)
  const [canLoadMore, setCanLoadMore] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [matrixError, setMatrixError] = useState("")
  const [matrixConnectionStatus, setMatrixConnectionStatus] = useState<MatrixConnectionStatus>("connecting")
  const [isRetryingSync, setIsRetryingSync] = useState(false)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const shouldStickToBottom = useRef(true)
  const pendingHistoryScroll = useRef<{ roomId: string; scrollTop: number } | null>(null)
  const roomRef = useRef<{ client: Awaited<ReturnType<typeof getMatrixClient>>; room: any } | null>(null)
  const expiryStarts = useRef(new Map<string, number>())
  const sentExpiryMarkers = useRef(new Set<string>())
  const redactingEventIds = useRef(new Set<string>())

  const socket = getSocket()
  const currentUser = readCurrentUser()

  const retryMatrixSyncFromPanel = () => {
    setIsRetryingSync(true)
    window.location.reload()
  }

  useEffect(() => {
    if (!currentUser.userId || !userId || !username) {
      setMessages([])
      setIsLoading(Boolean(userId))
      setIsLoadingMore(false)
      setIsEncrypted(false)
      setPrivacyRoom(null)
      roomRef.current = null
      pendingHistoryScroll.current = null
      shouldStickToBottom.current = true
      setMatrixError("")
      setMatrixConnectionStatus("offline")
      onConnectionStatusChange("offline")
      onRoomReady("")
      return
    }

    let active = true
    let matrixClient: Awaited<ReturnType<typeof getMatrixClient>> | null = null
    let room: ReturnType<NonNullable<Awaited<ReturnType<typeof getMatrixClient>>["getRoom"]>> | null = null
    let timelineListener: ((event: any, eventRoom: any, toStartOfTimeline?: boolean) => void) | null = null
    let decryptedListener: ((event: any, error?: Error) => void) | null = null
    let localEchoListener: ((event: any, eventRoom: any) => void) | null = null
    let trustListener: ((changedUserId: string) => void) | null = null
    let typingListener: ((event: any, member: any) => void) | null = null
    let syncListener: ((state: string, previousState?: string | null, data?: { error?: Error & { errcode?: string; data?: { errcode?: string } } }) => void) | null = null
    let sdkEvents: typeof import("matrix-js-sdk") | null = null
    let cryptoApiEvents: typeof import("matrix-js-sdk/lib/crypto-api") | null = null
    let activeRoomId = ""
    const sentReceiptEventIds = new Set<string>()
    const retryingEventIds = new Set<string>()

    setMessages([])
    setIsLoading(true)
    setIsLoadingMore(false)
    setIsEncrypted(false)
    setPrivacyRoom(null)
    setCanLoadMore(true)
    roomRef.current = null
    pendingHistoryScroll.current = null
    shouldStickToBottom.current = true
    setMatrixError("")
    setMatrixConnectionStatus("connecting")
    onConnectionStatusChange("connecting")
    setIsTyping(false)
    expiryStarts.current.clear()
    sentExpiryMarkers.current.clear()
    redactingEventIds.current.clear()
    onRoomReady("")

    const upsert = (message: Message) => {
      if (active) setMessages((previous) => mergeMessage(previous, message))
    }

    const requestRedaction = (eventId: string) => {
      if (redactingEventIds.current.has(eventId) || !activeRoomId) return
      redactingEventIds.current.add(eventId)
      void redactMatrixEvent(activeRoomId, eventId).catch(() => {
        // The room may not allow this device to redact another member's event.
      })
    }

    const rememberExpiryStart = (event: any) => {
      const marker = parseMatrixExpiryStart(event.getContent?.()?.[MATRIX_EXPIRY_START_KEY])
      if (!marker) return false
      const previous = expiryStarts.current.get(marker.eventId)
      const expiresAt = previous === undefined ? marker.expiresAt : Math.min(previous, marker.expiresAt)
      expiryStarts.current.set(marker.eventId, expiresAt)
      if (active) {
        setMessages((items) => items.map((message) => message.id === marker.eventId ? { ...message, expiresAt } : message))
      }
      if (expiresAt <= Date.now()) requestRedaction(marker.eventId)
      return true
    }

    const legacyMessage = (message: LegacyMessage): Message => ({
      id: message.id,
      content: message.encrypted,
      timestamp: clockTime(message.createdAt),
      occurredAt: new Date(message.createdAt).getTime(),
      isOwn: message.from === currentUser.userId,
      isDelivered: message.delivered,
      isRead: message.read,
      isEncoded: true,
      isLegacyRecord: message.onBlockchain,
      selfDestruct: message.selfDestruct,
      selfDestructStart: message.selfDestructStart,
      expiresAt: message.expiresAt instanceof Date || typeof message.expiresAt === "string"
        ? new Date(message.expiresAt).getTime()
        : message.expiresAt,
    })

    const onConversationHistory = (data: SocketEventPayloads["conversation-history"]) => {
      if (data.userId !== userId || !active) return
      setMessages((previous) => data.messages.reduce((next, message) => mergeMessage(next, legacyMessage(message)), previous))
    }
    const onNewLegacyMessage = (message: LegacyMessage) => {
      const belongsToConversation =
        (message.from === userId && message.to === currentUser.userId) ||
        (message.from === currentUser.userId && message.to === userId)
      if (belongsToConversation && active) upsert(legacyMessage(message))
    }
    const onExpiryStarted = (data: SocketEventPayloads["message-expiry-started"]) => {
      setMessages((previous) => previous.map((message) =>
        message.id === data.messageId ? { ...message, expiresAt: new Date(data.expiresAt).getTime() } : message,
      ))
    }
    const onMessagesRead = (data: SocketEventPayloads["messages-read"]) => {
      if (data.from === currentUser.userId && data.to === userId) {
        setMessages((previous) => previous.map((message) => message.isOwn ? { ...message, isRead: true } : message))
      }
    }
    const onMessageDelivered = (data: SocketEventPayloads["message-delivered"]) => {
      setMessages((previous) => previous.map((message) =>
        message.id === data.messageId ? { ...message, isDelivered: true } : message,
      ))
    }

    const stopSocketListeners = [
      onSocketEvent(socket, "conversation-history", onConversationHistory),
      onSocketEvent(socket, "new-message", onNewLegacyMessage),
      onSocketEvent(socket, "message-expiry-started", onExpiryStarted),
      onSocketEvent(socket, "messages-read", onMessagesRead),
      onSocketEvent(socket, "message-delivered", onMessageDelivered),
    ]
    socket.emit("get-conversation", { user2: userId })

    const openEncryptedRoom = async () => {
      const [sdk, cryptoApi] = await Promise.all([
        import("matrix-js-sdk"),
        import("matrix-js-sdk/lib/crypto-api"),
      ])
      sdkEvents = sdk
      cryptoApiEvents = cryptoApi
      matrixClient = await getMatrixClient()
      syncListener = (state, _previousState, data) => {
        if (!active) return
        const status: MatrixConnectionStatus = state === sdk.SyncState.Prepared || state === sdk.SyncState.Syncing
          ? "connected"
          : state === sdk.SyncState.Catchup
            ? "catching-up"
            : state === sdk.SyncState.Reconnecting
              ? "reconnecting"
              : state === sdk.SyncState.Error || state === sdk.SyncState.Stopped
                ? "offline"
                : "connecting"
        setMatrixConnectionStatus(status)
        onConnectionStatusChange(status)
        if (state === sdk.SyncState.Error) {
          const error = data?.error
          const errcode = error?.errcode || error?.data?.errcode
          setMatrixError(errcode === "M_UNKNOWN_TOKEN"
            ? "Your saved Matrix session expired. Sign in again to reconnect."
            : error?.message || "Matrix sync stopped. Reload to retry.")
        } else if (state === sdk.SyncState.Prepared || state === sdk.SyncState.Syncing) {
          setMatrixError("")
        }
      }
      matrixClient.on(sdk.ClientEvent.Sync, syncListener)
      syncListener(matrixClient.getSyncState() || "")
      const peerMatrixUserId = matrixUserIdForUsername(username)
      activeRoomId = await getOrCreateEncryptedDirectRoom(peerMatrixUserId)
      if (!active) return

      room = matrixClient.getRoom(activeRoomId)
      if (!room || !room.hasEncryptionStateEvent()) {
        throw new Error("Cipher could not verify encryption for this Matrix room. Sending is disabled.")
      }
      const encryption = await matrixClient.getStateEvent(activeRoomId, "m.room.encryption", "")
      if (encryption.algorithm !== "m.megolm.v1.aes-sha2") {
        throw new Error("This Matrix room does not use the required encryption algorithm. Sending is disabled.")
      }

      roomRef.current = { client: matrixClient, room }
      setPrivacyRoom({ userId, username, peerUserId: peerMatrixUserId, roomId: activeRoomId })
      onRoomReady(activeRoomId)
      setIsEncrypted(true)
      const history = room.getLiveTimeline().getEvents()
      collectExpiryStarts(history, expiryStarts.current)
      const historyMessages = history
        .map((event) => matrixMessage(event, matrixClient!, matrixEventContent, expiryStarts.current))
        .filter((message): message is Message => message !== null)
      setMessages((previous) => historyMessages.reduce((next, message) => mergeMessage(next, message), previous))

      const processMatrixMessage = (event: any, eventRoom: any) => {
        if (eventRoom?.roomId !== activeRoomId) return
        if (rememberExpiryStart(event)) return
        const message = matrixMessage(event, matrixClient!, matrixEventContent, expiryStarts.current)
        if (!message) return
        if (message.expiresAt && new Date(message.expiresAt).getTime() <= Date.now()) {
          requestRedaction(message.id)
          return
        }
        upsert(message)
        if (
          !message.isOwn &&
          readReceiptsEnabled &&
          !document.hidden &&
          !sentReceiptEventIds.has(message.id)
        ) {
          sentReceiptEventIds.add(message.id)
          if (sentReceiptEventIds.size > 500) {
            const oldestEventId = sentReceiptEventIds.values().next().value
            if (oldestEventId) sentReceiptEventIds.delete(oldestEventId)
          }
          void matrixClient?.sendReadReceipt(event).catch(() => undefined)
        }
      }
      timelineListener = (event, eventRoom, toStartOfTimeline) => {
        if (!toStartOfTimeline) processMatrixMessage(event, eventRoom)
      }
      decryptedListener = (event) => {
        processMatrixMessage(event, matrixClient?.getRoom(event.getRoomId() || ""))
      }
      localEchoListener = (event, eventRoom) => {
        processMatrixMessage(event, eventRoom)
      }
      trustListener = (changedUserId) => {
        if (changedUserId !== peerMatrixUserId || !matrixClient || !room) return
        const client = matrixClient
        const activeRoom = room
        for (const failedEvent of activeRoom.getLiveTimeline().getEvents()) {
          const eventId = failedEvent.getId()
          if (
            failedEvent.getSender() !== peerMatrixUserId ||
            !eventId ||
            !failedEvent.isDecryptionFailure?.() ||
            retryingEventIds.has(eventId)
          ) continue

          retryingEventIds.add(eventId)
          const rawEvent = failedEvent.event
          const retryEvent = new sdk.MatrixEvent({
            ...rawEvent,
            content: rawEvent.content ? { ...rawEvent.content } : rawEvent.content,
          })
          void client.decryptEventIfNeeded(retryEvent).then(() => {
            if (active && !retryEvent.isDecryptionFailure()) processMatrixMessage(retryEvent, activeRoom)
          }).catch(() => undefined).finally(() => retryingEventIds.delete(eventId))
        }
      }
      matrixClient.on(sdk.RoomEvent.Timeline, timelineListener)
      matrixClient.on(sdk.MatrixEventEvent.Decrypted, decryptedListener)
      matrixClient.on(cryptoApi.CryptoEvent.UserTrustStatusChanged, trustListener)
      room.on(sdk.RoomEvent.LocalEchoUpdated, localEchoListener)

      typingListener = (_event, member) => {
        if (member?.roomId === activeRoomId && member.userId === peerMatrixUserId) setIsTyping(Boolean(member.typing))
      }
      matrixClient.on(sdk.RoomMemberEvent.Typing, typingListener)

      const onVisibilityChange = () => {
        if (document.hidden || !matrixClient || !room) return
        const latestPeerMessage = [...room.getLiveTimeline().getEvents()].reverse().find((event) =>
          event.getSender() === peerMatrixUserId && matrixEventContent(event),
        )
        if (latestPeerMessage && readReceiptsEnabled) void matrixClient.sendReadReceipt(latestPeerMessage).catch(() => undefined)
        if (readReceiptsEnabled) socket.emit("mark-as-read", { from: userId, to: currentUser.userId })
      }
      document.addEventListener("visibilitychange", onVisibilityChange)
      cleanupVisibility = () => document.removeEventListener("visibilitychange", onVisibilityChange)

      const latestPeerMessage = [...room.getLiveTimeline().getEvents()].reverse().find((event) =>
        event.getSender() === peerMatrixUserId && matrixEventContent(event),
      )
      if (latestPeerMessage && readReceiptsEnabled && !document.hidden) {
        void matrixClient.sendReadReceipt(latestPeerMessage).catch(() => undefined)
      }
      if (readReceiptsEnabled) socket.emit("mark-as-read", { from: userId, to: currentUser.userId })
      setIsLoading(false)
    }

    let cleanupVisibility: () => void = () => {}
    void openEncryptedRoom().catch((error) => {
      if (!active) return
      setMatrixError(error instanceof Error ? error.message : "Could not connect to the encrypted Matrix room.")
      setMatrixConnectionStatus("offline")
      onConnectionStatusChange("offline")
      setIsLoading(false)
    })

    return () => {
      active = false
      cleanupVisibility()
      stopSocketListeners.forEach((stopListening) => stopListening())
      if (matrixClient && sdkEvents && timelineListener) matrixClient.off(sdkEvents.RoomEvent.Timeline, timelineListener)
      if (matrixClient && sdkEvents && decryptedListener) matrixClient.off(sdkEvents.MatrixEventEvent.Decrypted, decryptedListener)
      if (matrixClient && cryptoApiEvents && trustListener) matrixClient.off(cryptoApiEvents.CryptoEvent.UserTrustStatusChanged, trustListener)
      if (room && sdkEvents && localEchoListener) room.off(sdkEvents.RoomEvent.LocalEchoUpdated, localEchoListener)
      if (matrixClient && sdkEvents && typingListener) matrixClient.off(sdkEvents.RoomMemberEvent.Typing, typingListener)
      if (matrixClient && sdkEvents && syncListener) matrixClient.off(sdkEvents.ClientEvent.Sync, syncListener)
      if (roomRef.current?.room === room) roomRef.current = null
    }
  }, [userId, username, currentUser.userId, socket, readReceiptsEnabled, onRoomReady, onConnectionStatusChange])

  const startFirstReadExpiry = (eventId: string, seconds: number) => {
    const activeRoom = roomRef.current
    if (!activeRoom || seconds <= 0 || expiryStarts.current.has(eventId) || sentExpiryMarkers.current.has(eventId)) return
    const expiresAt = Date.now() + seconds * 1000
    expiryStarts.current.set(eventId, expiresAt)
    sentExpiryMarkers.current.add(eventId)
    setMessages((previous) => previous.map((message) => message.id === eventId ? { ...message, expiresAt } : message))
    void sendEncryptedExpiryStart(activeRoom.room.roomId, eventId, expiresAt).catch(() => {
      setMatrixError("A message expiry timer started on this device, but Matrix could not sync it to the other device. Copies may remain.")
    })
  }

  const loadOlderMessages = async () => {
    const activeRoom = roomRef.current
    if (!activeRoom || isLoadingMore) return
    const scrollContainer = messagesContainerRef.current
    const scrollTop = scrollContainer?.scrollTop ?? 0
    setIsLoadingMore(true)
    setMatrixError("")
    try {
      const before = activeRoom.room.getLiveTimeline().getEvents().length
      await activeRoom.client.scrollback(activeRoom.room, 30)
      if (roomRef.current !== activeRoom) return
      const events = activeRoom.room.getLiveTimeline().getEvents()
      collectExpiryStarts(events, expiryStarts.current)
      const olderMessages = events
        .map((event: any) => matrixMessage(event, activeRoom.client, matrixEventContent, expiryStarts.current))
        .filter((message: Message | null): message is Message => message !== null)
      if (olderMessages.length && scrollContainer) {
        pendingHistoryScroll.current = { roomId: activeRoom.room.roomId, scrollTop }
      }
      setMessages((previous) => olderMessages.reduce((next: Message[], message: Message) => mergeMessage(next, message), previous))
      if (events.length <= before) setCanLoadMore(false)
    } catch (error) {
      if (roomRef.current === activeRoom) {
        setMatrixError(error instanceof Error ? error.message : "Could not load older Matrix messages.")
      }
    } finally {
      if (roomRef.current === activeRoom) setIsLoadingMore(false)
    }
  }

  useEffect(() => {
  const timer = window.setInterval(() => {
      const now = Date.now()
      setMessages((previous) => {
        const current = previous.filter((message) => {
          if (!message.expiresAt || new Date(message.expiresAt).getTime() > now) return true
          if (!message.isEncoded && !redactingEventIds.current.has(message.id)) {
            redactingEventIds.current.add(message.id)
            const activeRoom = roomRef.current
            if (activeRoom) void redactMatrixEvent(activeRoom.room.roomId, message.id).catch(() => undefined)
          }
          return false
        })
        return current.length === previous.length ? previous : current
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  useLayoutEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return
    const historyScroll = pendingHistoryScroll.current
    if (historyScroll) {
      pendingHistoryScroll.current = null
      if (roomRef.current?.room.roomId === historyScroll.roomId) {
        container.scrollTop = historyScroll.scrollTop
        shouldStickToBottom.current = false
      }
      return
    }
    if (shouldStickToBottom.current) {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" })
    }
  }, [messages, isTyping])

  if (!userId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center space-y-3 max-w-md px-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-primary">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637C20.25 5.016 19.098 3.61 17.49 3.402A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402C3.402 3.611 2.25 5.016 2.25 6.637v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold">Select a conversation</h3>
          <p className="text-sm text-muted-foreground">Choose someone to open a private, end-to-end encrypted Matrix room.</p>
        </div>
      </div>
    )
  }

  const currentPrivacyRoom = privacyRoom?.userId === userId && privacyRoom.username === username ? privacyRoom : null
  const needsSenderVerification = messages.some((message) =>
    message.decryptionFailureReason === "UNSIGNED_SENDER_DEVICE" ||
    message.decryptionFailureReason === "UNKNOWN_SENDER_DEVICE",
  )
  const needsMatrixSignIn = /session is missing|sign in|recovery key/i.test(matrixError)

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center bg-background"><Spinner size="lg" /></div>
  }

  return (
    <div
      ref={messagesContainerRef}
      onScroll={(event) => {
        const container = event.currentTarget
        shouldStickToBottom.current = container.scrollHeight - container.scrollTop - container.clientHeight <= 80
      }}
      className="flex-1 overflow-y-auto p-6 bg-background"
    >
      <PrivacyReceipt
        roomEncrypted={isEncrypted && Boolean(currentPrivacyRoom)}
        connectionUnavailable={matrixConnectionStatus === "offline"}
        needsIdentityVerification={needsSenderVerification}
        peerUserId={currentPrivacyRoom?.peerUserId}
        roomId={currentPrivacyRoom?.roomId}
      />
      {isEncrypted && canLoadMore && (
        <div className="mb-4 flex justify-center">
          <Button variant="outline" size="sm" disabled={isLoadingMore} onClick={() => void loadOlderMessages()}>
            {isLoadingMore ? "Loading older messages..." : "Load older messages"}
          </Button>
        </div>
      )}
      {matrixError && (
        <div role="alert" className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {matrixError}
        </div>
      )}
      {matrixConnectionStatus === "reconnecting" && (
        <div role="status" className="mb-4 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-muted-foreground">
          Matrix lost its connection and is retrying. Sending is paused until sync resumes.
        </div>
      )}
      {matrixConnectionStatus === "catching-up" && (
        <div role="status" className="mb-4 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-muted-foreground">
          Matrix reconnected and is catching up on missed events. Sending will resume when sync is live.
        </div>
      )}
      {matrixConnectionStatus === "connecting" && (
        <div role="status" className="mb-4 rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          Connecting to the encrypted Matrix room…
        </div>
      )}
      {matrixConnectionStatus === "offline" && (
        <div role="status" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-muted-foreground">
          {needsMatrixSignIn
            ? "Matrix needs you to sign in again or restore this device's existing encryption keys. Your recovery key and encrypted history will not be reset."
            : "Matrix sync stopped. Copy any unsent draft before retrying; sending will resume after the connection is restored."}
          {needsMatrixSignIn ? (
            <Button asChild variant="outline" size="sm" className="ml-3 mt-2">
              <Link href="/login">Sign in to reconnect</Link>
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="ml-3 mt-2" disabled={isRetryingSync} onClick={retryMatrixSyncFromPanel}>
              {isRetryingSync ? "Reloading…" : "Reload to retry"}
            </Button>
          )}
        </div>
      )}
      {messages.length === 0 ? (
        <div className="h-full flex items-center justify-center">
          <div className="text-center space-y-2">
            <p className="text-muted-foreground">No messages yet</p>
            <p className="text-sm text-muted-foreground">Your new messages will use this encrypted Matrix room.</p>
          </div>
        </div>
      ) : (
        <>
      <AnimatePresence>
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                {...message}
                onFirstRead={message.selfDestructStart === "firstRead" && !message.isOwn && !message.expiresAt
                  ? () => startFirstReadExpiry(message.id, message.selfDestruct || 0)
                  : undefined}
              />
            ))}
          </AnimatePresence>
          {isTyping && <TypingIndicator />}
        </>
      )}
    </div>
  )
}

function matrixMessage(
  event: any,
  client: NonNullable<Awaited<ReturnType<typeof getMatrixClient>>>,
  getContent: typeof matrixEventContent,
  expiryStarts = new Map<string, number>(),
): Message | null {
  const content = getContent(event)
  const eventId = event.getId() || event.getTxnId()
  if (!content || !eventId) return null
  const timestamp = event.getTs()
  const decryptionFailureReason = event.isDecryptionFailure?.()
    ? typeof event.decryptionFailureReason === "string" ? event.decryptionFailureReason : "UNKNOWN_ERROR"
    : null
  const expiry = parseMatrixExpirySettings(event.getContent()?.[MATRIX_EXPIRY_KEY])
  const expiresAt = expiry?.starts === "send"
    ? timestamp + expiry.seconds * 1000
    : expiryStarts.get(eventId) || null
  const isMatrixEncrypted = typeof event.isEncrypted === "function" && event.isEncrypted()
  const rawAttachment = isMatrixEncrypted && content.msgtype === "m.file" && content.file && typeof content.file === "object"
    ? content.file as MatrixEncryptedAttachment["file"]
    : null
  const filename = typeof content.filename === "string" ? content.filename : content.body
  const attachment = rawAttachment ? {
    file: rawAttachment,
    filename,
    mimetype: typeof content.info?.mimetype === "string" ? content.info.mimetype : "application/octet-stream",
    size: typeof content.info?.size === "number" && Number.isFinite(content.info.size) ? content.info.size : 0,
  } satisfies MatrixEncryptedAttachment : undefined
  return {
    id: eventId,
    content: decryptionFailureReason || (attachment && content.body === filename) ? "" : content.body,
    timestamp: clockTime(timestamp),
    occurredAt: timestamp,
    isOwn: event.getSender() === client.getUserId(),
    isEncoded: false,
    isMatrixEncrypted,
    decryptionFailureReason,
    transactionId: event.getTxnId?.() || undefined,
    attachment,
    showDeliveryStatus: false,
    selfDestruct: expiry?.seconds,
    selfDestructStart: expiry?.starts,
    expiresAt,
    integrity: parseIntegrityMetadata(content[MATRIX_INTEGRITY_KEY]),
  }
}
