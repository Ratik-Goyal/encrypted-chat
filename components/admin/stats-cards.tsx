"use client"

import { Card } from "@/components/ui/card"
import { Users, MessageSquare, Shield, TrendingUp } from "lucide-react"
import { useState, useEffect } from "react"
import { getSocket } from "@/lib/socket"
import { onSocketEvent } from "@/lib/socket-events"
import type { SocketEventPayloads } from "@/shared/socket-events.cjs"

export function StatsCards() {
  const socket = getSocket()
  const [stats, setStats] = useState({
    totalUsers: 0,
    onlineUsers: 0,
    totalMessages: 0,
    blockchainMessages: 0,
  })

  useEffect(() => {
    const onStats = (data: SocketEventPayloads["system-stats"]) => {
      setStats({
        totalUsers: data.totalUsers || 0,
        onlineUsers: data.onlineUsers || 0,
        totalMessages: data.totalMessages || 0,
        blockchainMessages: data.blockchainMessages || 0,
      })
    }
    const stopStats = onSocketEvent(socket, "system-stats", onStats)
    socket.emit("get-stats")

    // Refresh stats every 10 seconds
    const interval = setInterval(() => {
      socket.emit("get-stats")
    }, 10000)

    return () => {
      stopStats()
      clearInterval(interval)
    }
  }, [socket])

  const statsData = [
    {
      label: "Total Users",
      value: stats.totalUsers.toLocaleString(),
      icon: Users,
    },
    {
      label: "Legacy messages",
      value: stats.totalMessages.toLocaleString(),
      icon: MessageSquare,
    },
    {
      label: "Legacy chain records",
      value: stats.blockchainMessages.toLocaleString(),
      icon: Shield,
    },
    {
      label: "Active Now",
      value: stats.onlineUsers.toLocaleString(),
      icon: TrendingUp,
    },
  ]

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
      {statsData.map((stat) => (
        <Card key={stat.label} className="p-6">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{stat.label}</p>
              <p className="text-3xl font-bold">{stat.value}</p>
            </div>
            <div className="p-3 rounded-lg bg-primary/10">
              <stat.icon className="h-6 w-6 text-primary" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}
