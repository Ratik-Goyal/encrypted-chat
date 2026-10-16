"use client"

import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { MoreVertical } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useState, useEffect } from "react"
import { getSocket } from "@/lib/socket"
import { onSocketEvent } from "@/lib/socket-events"
import Link from "next/link"

interface ChatHeaderProps {
  userId: string
}

interface UserData {
  userId: string
  username: string
  status: string
  isOnline: boolean
}

export function ChatHeader({ userId }: ChatHeaderProps) {
  const socket = getSocket()
  const [user, setUser] = useState<UserData | null>(null)

  useEffect(() => {
    if (!userId) {
      setUser(null)
      return
    }

    // Fetch all users and find the selected one
    socket.emit("get-all-users")

    const onAllUsers = (users: import("@/shared/socket-events.cjs").DirectoryUser[]) => {
      const selectedUser = users.find((u) => u.userId === userId)
      if (selectedUser) {
        setUser({
          userId: selectedUser.userId,
          username: selectedUser.username,
          status: selectedUser.status || "offline",
          isOnline: selectedUser.isOnline || false,
        })
      }
    }

    const onUserOnline = (data: import("@/shared/socket-events.cjs").SocketEventPayloads["user-online"]) => {
      if (data.userId === userId) {
        setUser((prev) => prev ? { ...prev, status: data.status, isOnline: true } : null)
      }
    }

    const onUserOffline = (data: import("@/shared/socket-events.cjs").SocketEventPayloads["user-offline"]) => {
      if (data.userId === userId) {
        setUser((prev) => prev ? { ...prev, status: "offline", isOnline: false } : null)
      }
    }

    const stopAllUsers = onSocketEvent(socket, "all-users", onAllUsers)
    const stopUserOnline = onSocketEvent(socket, "user-online", onUserOnline)
    const stopUserOffline = onSocketEvent(socket, "user-offline", onUserOffline)

    return () => {
      stopAllUsers()
      stopUserOnline()
      stopUserOffline()
    }
  }, [userId, socket])

  if (!userId) {
    return (
      <div className="h-16 border-b border-border px-6 flex items-center justify-between bg-card">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-primary/10 text-primary">?</AvatarFallback>
          </Avatar>
          <div>
            <h3 className="font-semibold">Select a conversation</h3>
            <p className="text-sm text-muted-foreground">Choose a user to start chatting</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-16 border-b border-border px-6 flex items-center justify-between bg-card">
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10">
          <AvatarFallback className="bg-primary/10 text-primary">
            {user?.username?.substring(0, 2).toUpperCase() || "?"}
          </AvatarFallback>
        </Avatar>
        <div>
          <h3 className="font-semibold">{user?.username || "Loading..."}</h3>
          <p className="text-sm text-muted-foreground">
            {user?.isOnline ? "Online" : "Offline"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="transition-smooth">
              <MoreVertical className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-popover">
            <DropdownMenuItem asChild>
              <Link href={`/user/profile/${encodeURIComponent(userId)}`}>View Profile</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
