"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { Search, Settings, ChevronLeft, ChevronRight, LogOut, UserPlus } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useEffect, useRef } from "react"
import { disconnectSocket, getSocket } from "@/lib/socket"
import { logoutMatrixSession } from "@/lib/matrix"
import { getMatrixClient } from "@/lib/matrix"
import { onSocketEvent } from "@/lib/socket-events"
import type { DirectoryUser, LegacyMessage, SocketEventPayloads } from "@/shared/socket-events.cjs"

interface User {
  userId: string
  username: string
  status: "online" | "offline" | "idle" | "dnd"
  lastMessage?: string
  lastMessageTime?: string
  unreadCount?: number
  hasEncryptedInvite?: boolean
  isOnline?: boolean
  profilePicture?: string
}

interface ChatSidebarProps {
  selectedUserId: string
  onSelectUser: (userId: string, username?: string) => void
  isCollapsed: boolean
  onToggleCollapse: () => void
}

const getStatusColor = (status: User["status"]) => {
  switch (status) {
    case "online":
      return "bg-success"
    case "idle":
      return "bg-amber-500"
    case "dnd":
      return "bg-red-500"
    case "offline":
      return "bg-muted"
  }
}

const playNotificationTone = () => {
  try {
    const context = new AudioContext()
    const oscillator = context.createOscillator()
    const volume = context.createGain()
    oscillator.frequency.value = 660
    volume.gain.value = 0.035
    oscillator.connect(volume)
    volume.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.12)
    oscillator.onended = () => void context.close()
  } catch {
    // Some browsers block audio until the user interacts with the page.
  }
}

export function ChatSidebar({ selectedUserId, onSelectUser, isCollapsed, onToggleCollapse }: ChatSidebarProps) {
  const router = useRouter()
  const socket = getSocket()
  const [users, setUsers] = useState<User[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const usersRef = useRef<User[]>([])

  useEffect(() => {
    let matrixClient: Awaited<ReturnType<typeof getMatrixClient>> | null = null
    let matrixTimelineListener: ((event: any, room: any, toStartOfTimeline?: boolean) => void) | null = null
    let matrixDecryptedListener: ((event: any, error?: Error) => void) | null = null
    let matrixMembershipListener: ((room: any, membership: string) => void) | null = null
    let matrixSdkEvents: typeof import("matrix-js-sdk") | null = null
    let disposed = false
    const seenMatrixEventIds = new Set<string>()

    const onAllUsers = (fetchedUsers: DirectoryUser[]) => {
      const mappedUsers = fetchedUsers.map((user) => ({
        userId: user.userId,
        username: user.username,
        status: user.status,
        isOnline: user.isOnline,
        profilePicture: user.profilePicture || "",
        unreadCount: 0,
      }))
      usersRef.current = mappedUsers
      setUsers(mappedUsers)
      if (matrixClient) refreshPendingInvites(matrixClient)
      
      // Fetch unread counts for each user
      const currentUser = typeof window !== "undefined" ? JSON.parse(localStorage.getItem("cipher-user") || "{}") : {}
      if (currentUser.userId) {
        fetchedUsers.forEach((user) => {
          socket.emit("get-unread-from-user", { from: user.userId, to: currentUser.userId })
        })
      }
    }
    const onUnreadFromUser = (data: SocketEventPayloads["unread-from-user"]) => {
      setUsers((prev) => prev.map((user) =>
        user.userId === data.from ? { ...user, unreadCount: data.count } : user,
      ))
    }
    const onUserOnline = (data: SocketEventPayloads["user-online"]) => {
      setUsers((prev) => prev.map((user) => user.userId === data.userId
        ? { ...user, status: data.status, isOnline: true }
        : user,
      ))
    }
    const onUserOffline = (data: SocketEventPayloads["user-offline"]) => {
      setUsers((prev) => prev.map((user) => user.userId === data.userId
        ? { ...user, status: "offline", isOnline: false }
        : user,
      ))
    }
    const onUserStatusChanged = (data: SocketEventPayloads["user-status-changed"]) => {
      setUsers((previous) => previous.map((user) => user.userId === data.userId
        ? { ...user, status: data.status, isOnline: data.status !== "offline" }
        : user,
      ))
    }
    const onProfilePictureUpdated = (data: SocketEventPayloads["profile-picture-updated"]) => {
      setUsers((previous) => previous.map((user) => user.userId === data.userId
        ? { ...user, profilePicture: data.profilePicture }
        : user,
      ))
    }
    const onNewMessage = (message: LegacyMessage) => {
      const currentUser = typeof window !== "undefined" ? JSON.parse(localStorage.getItem("cipher-user") || "{}") : {}
      if (message.to !== currentUser.userId) return
      setUsers((prev) => prev.map((user) => user.userId === message.from
        ? { ...user, unreadCount: (user.unreadCount || 0) + 1 }
        : user,
      ))
      if (!document.hidden) return
      try {
        const preferences = JSON.parse(localStorage.getItem("cipher-notifications") || "{}")
        if (preferences.messageNotifications === false) return
        if (preferences.desktopNotifications && "Notification" in window && Notification.permission === "granted") {
          const notification = new Notification("New Cipher message", {
            body: "You have a new message.",
            icon: "/favicon-32x32.png",
          })
          notification.onclick = () => {
            window.focus()
            onSelectUser(message.from)
            notification.close()
          }
        }
        if (preferences.soundEnabled) playNotificationTone()
      } catch {
        // Ignore malformed local preferences and notification failures.
      }
    }
    const onMessagesRead = (data: SocketEventPayloads["messages-read"]) => {
      const currentUser = typeof window !== "undefined" ? JSON.parse(localStorage.getItem("cipher-user") || "{}") : {}
      if (data.to === currentUser.userId) {
        setUsers((prev) => prev.map((user) =>
          user.userId === data.from ? { ...user, unreadCount: 0 } : user,
        ))
      }
    }
    const onMessagesReadLocal = (data: SocketEventPayloads["messages-read-local"]) => {
      setUsers((previous) => previous.map((user) =>
        user.userId === data.from ? { ...user, unreadCount: 0 } : user,
      ))
    }

    const refreshPendingInvites = (client: Awaited<ReturnType<typeof getMatrixClient>>) => {
      const myUserId = client.getUserId()
      if (!myUserId) return
      const invitedUserIds = new Set<string>()
      for (const room of client.getRooms()) {
        const myMembership = room.getMember(myUserId)
        const peer = room.getMembersWithMembership("join").find((member) => member.userId !== myUserId)
        const encryption = room.currentState.getStateEvents("m.room.encryption", "")?.getContent()
        if (
          room.getMyMembership() !== "invite" ||
          room.getInvitedAndJoinedMemberCount() !== 2 ||
          !myMembership?.events.member?.getContent().is_direct ||
          encryption?.algorithm !== "m.megolm.v1.aes-sha2" ||
          !peer
        ) continue

        const peerUsername = peer.userId.slice(1).split(":", 1)[0].toLowerCase()
        const knownCipherUser = usersRef.current.find((user) => user.username.toLowerCase() === peerUsername)
        if (knownCipherUser) invitedUserIds.add(knownCipherUser.userId)
      }
      setUsers((previous) => previous.map((user) => ({
        ...user,
        hasEncryptedInvite: invitedUserIds.has(user.userId),
      })))
    }

    const processIncomingMatrixMessage = (
      event: any,
      room: any,
      client: Awaited<ReturnType<typeof getMatrixClient>>,
    ) => {
      if (
        event.getType() !== "m.room.message" ||
        event.getSender() === client.getUserId() ||
        !room?.hasEncryptionStateEvent() ||
        room.currentState.getStateEvents("m.room.encryption", "")?.getContent().algorithm !== "m.megolm.v1.aes-sha2"
      ) return

      const eventId = event.getId()
      if (!eventId || seenMatrixEventIds.has(eventId)) return
      const members = room.getJoinedMembers?.() || []
      const peers = members.filter((member: any) => member.userId !== client.getUserId())
      if (peers.length !== 1 || members.length !== 2) return
      const peerUsername = peers[0].userId.slice(1).split(":", 1)[0].toLowerCase()
      const peer = usersRef.current.find((user) => user.username.toLowerCase() === peerUsername)
      if (!peer || peer.userId === selectedUserId) return
      seenMatrixEventIds.add(eventId)
      if (seenMatrixEventIds.size > 500) {
        const oldestEventId = seenMatrixEventIds.values().next().value
        if (oldestEventId) seenMatrixEventIds.delete(oldestEventId)
      }

      setUsers((previous) => previous.map((user) => user.userId === peer.userId
        ? { ...user, unreadCount: (user.unreadCount || 0) + 1 }
        : user,
      ))
      if (!document.hidden) return
      try {
        const preferences = JSON.parse(localStorage.getItem("cipher-notifications") || "{}")
        if (preferences.messageNotifications === false) return
        if (preferences.desktopNotifications && "Notification" in window && Notification.permission === "granted") {
          const notification = new Notification("New encrypted Cipher message", {
            body: "You have a new encrypted message.",
            icon: "/favicon-32x32.png",
          })
          notification.onclick = () => {
            window.focus()
            onSelectUser(peer.userId, peer.username)
            notification.close()
          }
        }
        if (preferences.soundEnabled) playNotificationTone()
      } catch {
        // Ignore malformed local preferences and notification failures.
      }
    }

    void getMatrixClient().then(async (client) => {
      if (disposed) return
      const sdk = await import("matrix-js-sdk")
      if (disposed) return
      matrixSdkEvents = sdk
      matrixClient = client
      refreshPendingInvites(client)
      matrixTimelineListener = (event, room, toStartOfTimeline) => {
        if (!toStartOfTimeline) processIncomingMatrixMessage(event, room, client)
      }
      matrixDecryptedListener = (event) => {
        processIncomingMatrixMessage(event, client.getRoom(event.getRoomId() || ""), client)
      }
      client.on(sdk.RoomEvent.Timeline, matrixTimelineListener)
      client.on(sdk.MatrixEventEvent.Decrypted, matrixDecryptedListener)
      matrixMembershipListener = () => refreshPendingInvites(client)
      client.on(sdk.RoomEvent.MyMembership, matrixMembershipListener)
    }).catch(() => undefined)

    const stopSocketListeners = [
      onSocketEvent(socket, "all-users", onAllUsers),
      onSocketEvent(socket, "unread-from-user", onUnreadFromUser),
      onSocketEvent(socket, "user-online", onUserOnline),
      onSocketEvent(socket, "user-offline", onUserOffline),
      onSocketEvent(socket, "user-status-changed", onUserStatusChanged),
      onSocketEvent(socket, "profile-picture-updated", onProfilePictureUpdated),
      onSocketEvent(socket, "new-message", onNewMessage),
      onSocketEvent(socket, "messages-read", onMessagesRead),
      onSocketEvent(socket, "messages-read-local", onMessagesReadLocal),
    ]

    socket.emit("get-all-users")

    return () => {
      disposed = true
      if (matrixClient && matrixSdkEvents && matrixTimelineListener) matrixClient.off(matrixSdkEvents.RoomEvent.Timeline, matrixTimelineListener)
      if (matrixClient && matrixSdkEvents && matrixDecryptedListener) matrixClient.off(matrixSdkEvents.MatrixEventEvent.Decrypted, matrixDecryptedListener)
      if (matrixClient && matrixSdkEvents && matrixMembershipListener) matrixClient.off(matrixSdkEvents.RoomEvent.MyMembership, matrixMembershipListener)
      stopSocketListeners.forEach((stopListening) => stopListening())
    }
  }, [socket, onSelectUser, selectedUserId])

  useEffect(() => {
    if (selectedUserId) {
      setUsers((previous) => previous.map((user) => user.userId === selectedUserId
        ? { ...user, unreadCount: 0 }
        : user,
      ))
    }
  }, [selectedUserId])

  const handleLogout = async () => {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001"}/api/me/logout`, {
        method: "POST",
        credentials: "include",
      })
    } catch {
      // Clear the local session even when the server cannot be reached.
    } finally {
      await logoutMatrixSession()
      localStorage.removeItem("cipher-token")
      localStorage.removeItem("cipher-user")
      disconnectSocket()
      router.replace("/login")
    }
  }

  // Get current user from localStorage
  const currentUser = typeof window !== "undefined" ? JSON.parse(localStorage.getItem("cipher-user") || "{}") : {}

  // Filter out current user and apply search
  const filteredUsers = users.filter((user) =>
    user.userId !== currentUser.userId && // Don't show current user in the list
    user.username.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className={cn("border-r border-border bg-card transition-all duration-300", isCollapsed ? "w-16" : "w-80")}>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          {!isCollapsed && <h2 className="font-semibold text-lg">Messages</h2>}
          <Button variant="ghost" size="icon" onClick={onToggleCollapse} className="transition-smooth">
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        {/* Search & Add Friend */}
        {!isCollapsed && (
          <div className="p-4 space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search conversations" 
                className="pl-9 bg-background border-border"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Button
              variant="outline"
              className="w-full transition-smooth bg-transparent"
              onClick={() => router.push("/user/add-friend")}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Add Friend
            </Button>
          </div>
        )}

        {/* Users List */}
        <div className="flex-1 overflow-y-auto">
          {filteredUsers.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              {users.length === 0 ? "No users found" : "No matches found"}
            </div>
          ) : (
            filteredUsers.map((user) => (
              <button
                key={user.userId}
                title={user.hasEncryptedInvite ? `Encrypted invitation from ${user.username}. Select to open it.` : undefined}
                onClick={() => {
                  setUsers((previous) => previous.map((entry) => entry.userId === user.userId ? { ...entry, unreadCount: 0 } : entry))
                  onSelectUser(user.userId, user.username)
                }}
                className={cn(
                  "w-full p-4 flex items-center gap-3 transition-smooth hover:bg-accent/50 border-l-2",
                  selectedUserId === user.userId ? "bg-primary/10 border-primary" : "border-transparent",
                  isCollapsed && "justify-center",
                )}
              >
              <div className="relative">
                <Avatar className="h-10 w-10">
                  {user.profilePicture ? (
                    <img 
                      src={user.profilePicture} 
                      alt={user.username} 
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {user.username.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  )}
                </Avatar>
                <div
                  className={cn(
                    "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card",
                    getStatusColor(user.status),
                  )}
                />
              </div>
                {!isCollapsed && (
                  <div className="flex-1 text-left min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm truncate">{user.username}</span>
                      {user.isOnline && (
                        <span className="text-xs text-success">Online</span>
                      )}
                    </div>
                    <p className={cn("text-sm truncate", user.hasEncryptedInvite ? "text-warning" : "text-muted-foreground")}>
                      {user.hasEncryptedInvite ? "Encrypted invite · Select to open" : user.status}
                    </p>
                  </div>
                )}
                {!isCollapsed && (user.unreadCount || 0) > 0 && (
                  <div className="h-5 min-w-5 px-1.5 rounded-full bg-primary flex items-center justify-center">
                    <span className="text-xs font-medium text-primary-foreground">{user.unreadCount}</span>
                  </div>
                )}
              </button>
            ))
          )}
        </div>

        {/* Settings & Logout */}
        {!isCollapsed && (
          <div className="p-4 border-t border-border space-y-2">
            <Link href="/user/settings">
              <Button variant="ghost" className="w-full justify-start transition-smooth">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </Button>
            </Link>
            <Button
              variant="ghost"
              className="w-full justify-start transition-smooth text-error"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
