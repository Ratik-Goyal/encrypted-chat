"use client"

import { Card } from "@/components/ui/card"
import { Blocks, FileText, Zap, Clock3 } from "lucide-react"
import { useState, useEffect } from "react"
import { getSocket } from "@/lib/socket"
import { onSocketEvent } from "@/lib/socket-events"
import type { SocketEventPayloads } from "@/shared/socket-events.cjs"

export function BlockchainStats() {
  const socket = getSocket()
  const [stats, setStats] = useState({
    totalMessages: 0,
    blockchainMessages: 0,
    totalUsers: 0,
    integrityBatchCount: 0,
    integrityAnchoredBatches: 0,
    integrityWaiting: 0,
    integrityChainConfigured: false,
  })

  useEffect(() => {
    const onStats = (data: SocketEventPayloads["system-stats"]) => {
      setStats({
        totalMessages: data.totalMessages || 0,
        blockchainMessages: data.blockchainMessages || 0,
        totalUsers: data.totalUsers || 0,
        integrityBatchCount: data.integrityBatchCount || 0,
        integrityAnchoredBatches: data.integrityAnchoredBatches || 0,
        integrityWaiting: data.integrityWaiting || 0,
        integrityChainConfigured: data.integrityChainConfigured === true,
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
      label: "Cipher-stored legacy messages",
      value: stats.totalMessages.toLocaleString(),
      subtext: `${stats.totalUsers} users`,
      icon: Blocks,
    },
    {
      label: "Legacy chain records",
      value: stats.blockchainMessages.toLocaleString(),
      subtext: "Historical records from the old flow",
      icon: FileText,
    },
    {
      label: "Integrity proof batches",
      value: `${stats.integrityAnchoredBatches}/${stats.integrityBatchCount}`,
      subtext: stats.integrityChainConfigured ? "Anchored / total batches" : "Chain signer is not configured",
      icon: Zap,
    },
    {
      label: "Waiting commitments",
      value: stats.integrityWaiting.toLocaleString(),
      subtext: "Queued or waiting for a batch",
      icon: Clock3,
    },
  ]

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
      {statsData.map((stat) => (
        <Card key={stat.label} className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="p-3 rounded-lg bg-primary/10">
              <stat.icon className="h-6 w-6 text-primary" />
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{stat.label}</p>
            <p className="text-3xl font-bold">{stat.value}</p>
            <p className="text-xs text-muted-foreground">{stat.subtext}</p>
          </div>
        </Card>
      ))}
    </div>
  )
}
