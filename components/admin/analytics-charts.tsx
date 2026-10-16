"use client"

import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import { useState, useEffect } from "react"
import { getSocket } from "@/lib/socket"
import { onSocketEvent } from "@/lib/socket-events"
import type { SocketEventPayloads } from "@/shared/socket-events.cjs"

export function AnalyticsCharts() {
  const socket = getSocket()
  const [hourlyData, setHourlyData] = useState<SocketEventPayloads["analytics-data"]["hourly"]>([])
  const [dailyData, setDailyData] = useState<SocketEventPayloads["analytics-data"]["daily"]>([])

  useEffect(() => {
    const onAnalytics = (data: SocketEventPayloads["analytics-data"]) => {
      setHourlyData(data.hourly)
      setDailyData(data.daily)
    }
    const stopAnalytics = onSocketEvent(socket, "analytics-data", onAnalytics)
    socket.emit("get-analytics-data")

    const interval = setInterval(() => {
      socket.emit("get-analytics-data")
    }, 30000)

    return () => {
      stopAnalytics()
      clearInterval(interval)
    }
  }, [socket])
  return (
    <Card className="p-6">
      <Tabs defaultValue="hourly" className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg">Usage Analytics</h3>
          <TabsList className="bg-muted">
            <TabsTrigger value="hourly">Hourly</TabsTrigger>
            <TabsTrigger value="daily">Daily</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="hourly" className="space-y-6">
          <div className="space-y-2">
            <h4 className="font-medium">Activity Overview (Last 24 Hours)</h4>
            {hourlyData.length === 0 ? (
              <div className="h-[350px] flex items-center justify-center text-muted-foreground">
                Loading data...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={hourlyData}>
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
                <Line type="monotone" dataKey="messages" stroke="#6366f1" strokeWidth={2} name="Messages" />
                <Line
                  type="monotone"
                  dataKey="users"
                  stroke="#10b981"
                  strokeWidth={2}
                  name="Active Users"
                />
              </LineChart>
            </ResponsiveContainer>
            )}
          </div>
        </TabsContent>

        <TabsContent value="daily" className="space-y-6">
          <div className="space-y-2">
            <h4 className="font-medium">Weekly Summary</h4>
            {dailyData.length === 0 ? (
              <div className="h-[350px] flex items-center justify-center text-muted-foreground">
                Loading data...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis 
                  dataKey="day" 
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
                <Bar dataKey="messages" fill="#6366f1" radius={[8, 8, 0, 0]} name="Messages" />
                <Bar dataKey="users" fill="#10b981" radius={[8, 8, 0, 0]} name="Users" />
              </BarChart>
            </ResponsiveContainer>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  )
}
