"use client"

import { Card } from "@/components/ui/card"
import { Blocks } from "lucide-react"

export function BlockchainPanel() {
  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-3">
        <Blocks className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Integrity commitments</h3>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">
        New-message integrity receipts appear in each chat bubble. They check that the decrypted message matches its salted commitment and that the commitment belongs to an anchored batch. A proof does not verify who sent a message or whether it is true. Blockchain anchoring can be delayed or unavailable without interrupting chat. Older deployments of the previous contract may contain public message data.
      </p>
    </Card>
  )
}
