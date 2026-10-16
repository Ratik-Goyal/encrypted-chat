"use client"

import { AdminNav } from "@/components/admin/admin-nav"
import { UsersTable } from "@/components/admin/users-table"

export default function AdminUsersPage() {
  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-muted-foreground mt-1">View and manage registered users</p>
        </div>
        <UsersTable />
      </div>
    </div>
  )
}
