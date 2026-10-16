"use client"

import { Card } from "@/components/ui/card"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts"
import { useState, useEffect } from "react"
import { getSocket } from "@/lib/socket"
import { onSocketEvent } from "@/lib/socket-events"
import type { SocketEventPayloads } from "@/shared/socket-events.cjs"

export function ActiveUsersChart() {
  const socket = getSocket()
  const [stats, setStats] = useState({ onlineUsers: 0 })

  useEffect(() => {
    const onStats = (data: SocketEventPayloads["system-stats"]) => {
      setStats({ onlineUsers: data.onlineUsers || 0 })
    }
    const stopStats = onSocketEvent(socket, "system-stats", onStats)
    socket.emit("get-stats")

    const interval = setInterval(() => {
      socket.emit("get-stats")
    }, 10000)

    return () => {
      stopStats()
      clearInterval(interval)
    }
  }, [socket])

  const data = [
    { time: "Now", users: stats.onlineUsers },
  ]

  return (
    <Card className="p-6">
      <div className="mb-6">
        <h3 className="font-semibold text-lg">Active Users</h3>
        <p className="text-sm text-muted-foreground">Current online users: {stats.onlineUsers}</p>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis 
            dataKey="time" 
            stroke="hsl(var(--foreground))" 
            fontSize={12}
            tick={{ fill: "white" }}
            style={{ fill: "white" }}
          />
          <YAxis 
            stroke="hsl(var(--foreground))" 
            fontSize={12}
            tick={{ fill: "white" }}
            style={{ fill: "white" }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              color: "hsl(var(--foreground))",
            }}
          />
          <Legend wrapperStyle={{ color: "hsl(var(--foreground))" }} />
          <Line type="monotone" dataKey="users" stroke="#6366f1" strokeWidth={2} name="Online Users" />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  )
}
