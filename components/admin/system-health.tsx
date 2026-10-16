"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Activity, Database, Wifi, Server } from "lucide-react"
import { cn } from "@/lib/utils"
import { getSocket } from "@/lib/socket"

type ServiceState = "checking" | "healthy" | "unavailable" | "not-configured"

const statusLabel: Record<ServiceState, string> = {
  checking: "Checking",
  healthy: "Healthy",
  unavailable: "Unavailable",
  "not-configured": "Not configured",
}

export function SystemHealth() {
  const socket = getSocket()
  const [health, setHealth] = useState({
    apiServer: "checking" as ServiceState,
    database: "checking" as ServiceState,
    websocket: (socket.connected ? "healthy" : "checking") as ServiceState,
    blockchain: "not-configured" as ServiceState,
  })

  useEffect(() => {
    let active = true
    const baseUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001"

    const checkBackend = async () => {
      try {
        const [live, ready] = await Promise.all([
          fetch(`${baseUrl}/health/live`, { cache: "no-store" }),
          fetch(`${baseUrl}/health/ready`, { cache: "no-store" }),
        ])
        const readiness = await ready.json()
        if (!active) return
        setHealth((previous) => ({
          ...previous,
          apiServer: live.ok ? "healthy" : "unavailable",
          database: ready.ok && readiness.status === "ready" ? "healthy" : "unavailable",
        }))
      } catch {
        if (active) setHealth((previous) => ({ ...previous, apiServer: "unavailable", database: "unavailable" }))
      }
    }

    const onConnect = () => setHealth((previous) => ({ ...previous, websocket: "healthy" }))
    const onDisconnect = () => setHealth((previous) => ({ ...previous, websocket: "unavailable" }))
    socket.on("connect", onConnect)
    socket.on("disconnect", onDisconnect)
    void checkBackend()
    const interval = window.setInterval(checkBackend, 10_000)

    return () => {
      active = false
      socket.off("connect", onConnect)
      socket.off("disconnect", onDisconnect)
      window.clearInterval(interval)
    }
  }, [socket])

  const coreHealthy = health.apiServer === "healthy" && health.database === "healthy" && health.websocket === "healthy"
  const coreChecking = health.apiServer === "checking" || health.database === "checking" || health.websocket === "checking"
  const metrics = [
    { label: "API Server", state: health.apiServer, detail: "Live health endpoint", icon: Server },
    { label: "Database", state: health.database, detail: "MongoDB readiness endpoint", icon: Database },
    { label: "WebSocket", state: health.websocket, detail: "Current socket connection", icon: Wifi },
    { label: "Batch proof worker", state: health.blockchain, detail: "Not connected to the app", icon: Activity },
  ]

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-semibold text-lg">System Health</h3>
        <Badge variant="secondary" className={cn(coreHealthy ? "bg-success/10 text-success border-success/20" : "bg-warning/10 text-warning border-warning/20")}>
          {coreHealthy ? "Core services healthy" : coreChecking ? "Checking core services" : "Core service issue"}
        </Badge>
      </div>

      <div className="space-y-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
            <div className="flex items-center gap-3">
              <div className={cn("p-2 rounded-lg", metric.state === "healthy" ? "bg-success/10" : "bg-muted")}>
                <metric.icon className={cn("h-4 w-4", metric.state === "healthy" ? "text-success" : "text-muted-foreground")} />
              </div>
              <div>
                <p className="font-medium text-sm">{metric.label}</p>
                <p className="text-xs text-muted-foreground">{metric.detail}</p>
              </div>
            </div>
            <span className="text-xs text-muted-foreground">{statusLabel[metric.state]}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}
