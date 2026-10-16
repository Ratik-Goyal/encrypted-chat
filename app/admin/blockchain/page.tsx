"use client"

import { AdminNav } from "@/components/admin/admin-nav"
import { Card } from "@/components/ui/card"
import { Blocks, ShieldAlert } from "lucide-react"

export default function AdminBlockchainPage() {
  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Integrity commitments</h1>
          <p className="text-muted-foreground mt-1">The privacy-preserving contract is not yet connected to chat delivery.</p>
        </div>
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Blocks className="h-6 w-6 text-primary" />
            <h2 className="text-lg font-semibold">Batch proof pipeline: not configured</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            The replacement contract accepts owner-authorized batch roots and leaf counts. The backend does not create
            batches, submit transactions, store inclusion proofs, or verify them for users yet.
          </p>
          <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4">
            <ShieldAlert className="h-5 w-5 shrink-0 text-warning" />
            <p className="text-sm text-muted-foreground">
              Retire the former contract. If it was deployed, treat its message data and recipient identifiers as permanently public.
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}
