"use client"

import { Card } from "@/components/ui/card"
import { Cpu, HardDrive, Activity, Clock } from "lucide-react"
import { Progress } from "@/components/ui/progress"

const metrics = [
  { label: "CPU Usage", value: 45, unit: "%", icon: Cpu, color: "text-chart-1" },
  { label: "Memory", value: 68, unit: "%", icon: HardDrive, color: "text-chart-2" },
  { label: "Network", value: 32, unit: "%", icon: Activity, color: "text-chart-3" },
  { label: "Response Time", value: 142, unit: "ms", icon: Clock, color: "text-success" },
]

export function PerformanceMetrics() {
  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
      {metrics.map((metric) => (
        <Card key={metric.label} className="p-6">
          <div className="flex items-center justify-between mb-4">
            <metric.icon className={`h-5 w-5 ${metric.color}`} />
            <span className="text-2xl font-bold">{metric.value}</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{metric.label}</span>
              <span className="font-medium">{metric.unit}</span>
            </div>
            {metric.unit === "%" && <Progress value={metric.value} className="h-2" />}
          </div>
        </Card>
      ))}
    </div>
  )
}
