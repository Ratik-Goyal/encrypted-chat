"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ArrowLeft, Wallet } from "lucide-react"
import { BlockchainPanel } from "@/components/user/blockchain-panel"

export default function UserBlockchainPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link href="/user/settings">
            <Button variant="ghost" size="icon" className="transition-smooth">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-semibold">Blockchain Activity</h1>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <Wallet className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Wallet Information</h2>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border border-border">
              <div>
                <p className="text-sm font-medium mb-1">Wallet connection</p>
                <p className="text-xs text-muted-foreground">No personal wallet connection is required. Cipher’s operator submits batch roots; your account and message content are not included on chain.</p>
              </div>
            </div>
          </div>
        </Card>

        <BlockchainPanel />
      </div>
    </div>
  )
}
