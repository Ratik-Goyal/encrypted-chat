"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ChatSidebar } from "@/components/chat/chat-sidebar"
import { ChatPanel } from "@/components/chat/chat-panel"
import type { MatrixConnectionStatus } from "@/components/chat/chat-panel"
import { ChatHeader } from "@/components/chat/chat-header"
import { MessageInput } from "@/components/chat/message-input"
import { getSocket } from "@/lib/socket"
import { getMatrixClient, sendEncryptedMatrixAttachment, sendEncryptedMatrixMessage } from "@/lib/matrix"
import type { MatrixExpirySettings } from "@/lib/matrix"
import { createIntegrityMetadata, queueIntegrityCommitment } from "@/lib/integrity"
import type { IntegrityMetadata } from "@/lib/integrity"
import { onSocketEvent } from "@/lib/socket-events"
import type { DirectoryUser } from "@/shared/socket-events.cjs"

function readUser() {
  try {
    return typeof window === "undefined" ? {} : JSON.parse(localStorage.getItem("cipher-user") || "{}")
  } catch {
    return {}
  }
}

export default function UserPage() {
  const router = useRouter()
  const socket = getSocket()
  const [selectedUserId, setSelectedUserId] = useState("")
  const [selectedUsername, setSelectedUsername] = useState("")
  const [activeRoomId, setActiveRoomId] = useState("")
  const [matrixConnectionStatus, setMatrixConnectionStatus] = useState<MatrixConnectionStatus>("offline")
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const pendingIntegrity = useRef(new Map<string, IntegrityMetadata>())
  const currentUser = readUser()

  useEffect(() => {
    if (!localStorage.getItem("cipher-user")) {
      router.push("/login")
      return
    }
    const requestedUserId = new URLSearchParams(window.location.search).get("userId")
    if (requestedUserId) setSelectedUserId(requestedUserId)

    const onAllUsers = (users: DirectoryUser[]) => {
      const selected = users.find((user) => user.userId === requestedUserId)
      if (selected) setSelectedUsername(selected.username)
    }
    const stopAllUsers = onSocketEvent(socket, "all-users", onAllUsers)
    socket.emit("get-all-users")
    return () => {
      stopAllUsers()
    }
  }, [router, socket])

  const handleSelectUser = useCallback((userId: string, username?: string) => {
    setSelectedUserId(userId)
    setSelectedUsername(username || "")
    setActiveRoomId("")
    setMatrixConnectionStatus("connecting")
  }, [])

  const handleRoomReady = useCallback((roomId: string) => {
    setActiveRoomId(roomId)
  }, [])

  const handleConnectionStatusChange = useCallback((status: MatrixConnectionStatus) => {
    setMatrixConnectionStatus(status)
  }, [])

  const handleSendMessage = async (message: string, messageId: string, expiry: MatrixExpirySettings | null) => {
    if (!activeRoomId) throw new Error("Wait for the encrypted Matrix room to finish connecting.")
    let integrity = pendingIntegrity.current.get(messageId)
    if (!integrity) {
      integrity = await createIntegrityMetadata(message)
      pendingIntegrity.current.set(messageId, integrity)
      if (pendingIntegrity.current.size > 20) {
        const oldestId = pendingIntegrity.current.keys().next().value
        if (oldestId) pendingIntegrity.current.delete(oldestId)
      }
    }
    await sendEncryptedMatrixMessage(activeRoomId, message, messageId, integrity, expiry)
    pendingIntegrity.current.delete(messageId)
    void queueIntegrityCommitment(integrity.commitment).catch(() => undefined)
  }

  const handleSendAttachment = async (file: File, caption: string, messageId: string, expiry: MatrixExpirySettings | null) => {
    if (!activeRoomId) throw new Error("Wait for the encrypted Matrix room to finish connecting.")
    await sendEncryptedMatrixAttachment(activeRoomId, file, caption, messageId, expiry)
  }

  const handleTyping = (isTyping: boolean) => {
    if (!activeRoomId) return
    if (currentUser.privacy?.typingIndicator === false) return
    void getMatrixClient()
      .then((client) => client.sendTyping(activeRoomId, isTyping, 10_000))
      .catch(() => undefined)
  }

  return (
    <div className="flex h-screen bg-background">
      <ChatSidebar
        selectedUserId={selectedUserId}
        onSelectUser={handleSelectUser}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <ChatHeader userId={selectedUserId} />
        <ChatPanel
          userId={selectedUserId}
          username={selectedUsername}
          readReceiptsEnabled={currentUser.privacy?.readReceipts !== false}
          onRoomReady={handleRoomReady}
          onConnectionStatusChange={handleConnectionStatusChange}
        />
        <MessageInput
          userId={selectedUserId}
          isReady={Boolean(selectedUsername && activeRoomId && matrixConnectionStatus === "connected")}
          onSendMessage={handleSendMessage}
          onSendAttachment={handleSendAttachment}
          onTyping={handleTyping}
        />
      </div>
    </div>
  )
}
