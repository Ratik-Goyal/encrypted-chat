"use client"

import { AdminNav } from "@/components/admin/admin-nav"
import { AnalyticsCharts } from "@/components/admin/analytics-charts"
import { PerformanceMetrics } from "@/components/admin/performance-metrics"

export default function AdminAnalyticsPage() {
  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-muted-foreground mt-1">Detailed performance metrics and usage analytics</p>
        </div>
        <PerformanceMetrics />
        <AnalyticsCharts />
      </div>
    </div>
  )
}
