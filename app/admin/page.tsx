"use client"

import { AdminNav } from "@/components/admin/admin-nav"
import { StatsCards } from "@/components/admin/stats-cards"
import { SystemHealth } from "@/components/admin/system-health"
import { ActivityFeed } from "@/components/admin/activity-feed"
import { ActiveUsersChart } from "@/components/admin/active-users-chart"
import { MessageRateChart } from "@/components/admin/message-rate-chart"

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Monitor system activity and performance</p>
        </div>

        <StatsCards />

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <ActiveUsersChart />
            <MessageRateChart />
          </div>
          <div className="space-y-6">
            <SystemHealth />
            <ActivityFeed />
          </div>
        </div>
      </div>
    </div>
  )
}
