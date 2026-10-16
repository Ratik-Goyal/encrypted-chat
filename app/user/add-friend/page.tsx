"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ArrowLeft, Search, UserPlus, Check } from "lucide-react"
import { getSocket } from "@/lib/socket"
import { onSocketEvent } from "@/lib/socket-events"

interface SearchResult {
  userId: string
  username: string
  status: "online" | "offline" | "idle" | "dnd"
  isOnline: boolean
}

export default function AddFriendPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [addedUsers, setAddedUsers] = useState<Set<string>>(new Set())
  const [pendingUsers, setPendingUsers] = useState<Set<string>>(new Set())
  const [currentUserId, setCurrentUserId] = useState("")
  const [requestError, setRequestError] = useState("")
  const socket = getSocket()

  useEffect(() => {
    const onAllUsers = (users: SearchResult[]) => {
      setResults(users)
    }

    const stopAllUsers = onSocketEvent(socket, "all-users", onAllUsers)
    try {
      setCurrentUserId(JSON.parse(localStorage.getItem("cipher-user") || "{}").userId || "")
    } catch {
      setCurrentUserId("")
    }

    return () => {
      stopAllUsers()
    }
  }, [socket])

  const handleSearch = () => {
    if (searchQuery.trim()) {
      setResults([])
      socket.emit("get-all-users", { query: searchQuery.trim() })
    }
  }

  const handleAddFriend = (userId: string) => {
    setPendingUsers((previous) => new Set(previous).add(userId))
    setRequestError("")
    socket.timeout(5000).emit("send-friend-request", { to: userId }, (error: Error | null, response: { success?: boolean; message?: string }) => {
      setPendingUsers((previous) => {
        const next = new Set(previous)
        next.delete(userId)
        return next
      })
      if (!error && response?.success) {
        setAddedUsers((previous) => new Set(previous).add(userId))
      } else {
        setRequestError(response?.message || "Could not send the friend request. Try again.")
      }
    })
  }

  const filteredResults = results.filter(
    (user) =>
      user.userId !== currentUserId &&
      user.username.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link href="/user">
            <Button variant="ghost" size="icon" className="transition-smooth">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-semibold">Add Friend</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        <Card className="p-6">
          <div className="flex gap-2 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search username prefix..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pl-9 bg-background"
              />
            </div>
            <Button onClick={handleSearch} className="transition-smooth">
              Search
            </Button>
          </div>
          {requestError && <p role="alert" className="mb-4 text-sm text-destructive">{requestError}</p>}

          {filteredResults.length > 0 && (
            <div className="space-y-3">
              {filteredResults.map((user) => (
                <div
                  key={user.userId}
                  className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border border-border"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-primary/10 text-primary">
                          {user.username
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div
                        className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card ${
                          user.isOnline ? "bg-success" : "bg-muted"
                        }`}
                      />
                    </div>
                    <div>
                      <p className="font-medium">{user.username}</p>
                      <p className="text-sm text-muted-foreground">{user.status}</p>
                    </div>
                  </div>
                  {addedUsers.has(user.userId) ? (
                    <Button variant="outline" disabled className="transition-smooth bg-transparent">
                      <Check className="h-4 w-4 mr-2" />
                      Request Sent
                    </Button>
                  ) : (
                    <Button onClick={() => handleAddFriend(user.userId)} disabled={pendingUsers.has(user.userId)} className="transition-smooth">
                      <UserPlus className="h-4 w-4 mr-2" />
                      {pendingUsers.has(user.userId) ? "Sending..." : "Add Friend"}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {filteredResults.length === 0 && searchQuery && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No users found</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
