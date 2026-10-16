"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { getSocket } from "@/lib/socket"
import { onSocketEvent } from "@/lib/socket-events"
import type { SocketEventPayloads } from "@/shared/socket-events.cjs"

type User = Omit<SocketEventPayloads["all-users-with-stats"][number], "createdAt"> & { createdAt: string }

export function UsersTable() {
  const socket = getSocket()
  const [searchTerm, setSearchTerm] = useState("")
  const [users, setUsers] = useState<User[]>([])

  useEffect(() => {
    const onUsers = (fetchedUsers: SocketEventPayloads["all-users-with-stats"]) => {
      setUsers(fetchedUsers.map((user) => ({
        ...user,
        createdAt: new Date(user.createdAt).toISOString(),
      })))
    }
    const stopUsers = onSocketEvent(socket, "all-users-with-stats", onUsers)
    socket.emit("get-all-users-with-stats")

    return () => {
      stopUsers()
    }
  }, [socket])

  const filteredUsers = users.filter(
    (user) =>
      user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  return (
    <Card className="p-6">
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 bg-background"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">User</th>
              <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">Email</th>
              <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">Status</th>
              <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">Joined</th>
              <th className="text-right py-3 px-4 font-medium text-sm text-muted-foreground">Messages</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-muted-foreground">
                  No users found
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => (
                <tr key={user.userId} className="border-b border-border hover:bg-accent/50 transition-smooth">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-medium text-primary">
                          {user.username.substring(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <span className="font-medium">{user.username}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-muted-foreground">{user.email}</td>
                  <td className="py-3 px-4">
                    <Badge
                      variant="secondary"
                      className={cn(
                        user.isOnline
                          ? "bg-success/10 text-success border-success/20"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      <div
                        className={cn(
                          "h-1.5 w-1.5 rounded-full mr-1.5",
                          user.isOnline ? "bg-success" : "bg-muted-foreground",
                        )}
                      />
                      {user.isOnline ? "online" : "offline"}
                    </Badge>
                  </td>
                  <td className="py-3 px-4 text-muted-foreground">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4 text-right font-mono">{user.messageCount || 0}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
