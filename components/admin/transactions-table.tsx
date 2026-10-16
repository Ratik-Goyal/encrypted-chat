"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Search, ExternalLink, Copy, Check, ShieldAlert } from "lucide-react"
import { getSocket } from "@/lib/socket"
import { onSocketEvent } from "@/lib/socket-events"
import type { SocketEventPayloads } from "@/shared/socket-events.cjs"

interface Transaction {
  blockchainTxHash: string
  createdAt: string
  onBlockchain: boolean
}

export function TransactionsTable() {
  const socket = getSocket()
  const [searchTerm, setSearchTerm] = useState("")
  const [copiedHash, setCopiedHash] = useState<string | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])

  useEffect(() => {
    const onTransactions = (data: SocketEventPayloads["all-blockchain-logs"]) => {
      setTransactions(data.flatMap((transaction) => {
        if (!transaction.onBlockchain || !transaction.blockchainTxHash) return []
        return [{
          blockchainTxHash: transaction.blockchainTxHash,
          createdAt: new Date(transaction.createdAt).toISOString(),
          onBlockchain: true,
        }]
      }))
    }
    const stopTransactions = onSocketEvent(socket, "all-blockchain-logs", onTransactions)
    socket.emit("get-all-blockchain-logs")

    return () => {
      stopTransactions()
    }
  }, [socket])

  const filteredTransactions = transactions.filter((tx) =>
    tx.blockchainTxHash?.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return "Just now"
    if (minutes < 60) return `${minutes} min ago`
    if (hours < 24) return `${hours}h ago`
    return `${days}d ago`
  }

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash)
    setCopiedHash(hash)
    setTimeout(() => setCopiedHash(null), 2000)
  }

  const truncateHash = (hash: string) => {
    return `${hash.slice(0, 10)}...${hash.slice(-8)}`
  }

  return (
    <Card className="p-6">
      <div className="mb-5 flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <p className="text-sm text-muted-foreground">
          Historical prototype records only. The former contract may have published message data and recipient identifiers; those records cannot be removed from a public chain.
        </p>
      </div>
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search historical transaction hashes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 bg-background"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">Transaction Hash</th>
              <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">Time</th>
              <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">Type</th>
              <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">Status</th>
              <th className="text-right py-3 px-4 font-medium text-sm text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredTransactions.map((tx, index) => (
              <tr key={tx.blockchainTxHash || index} className="border-b border-border hover:bg-accent/50 transition-smooth">
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono text-primary">{truncateHash(tx.blockchainTxHash || "N/A")}</code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => copyHash(tx.blockchainTxHash)}
                      title="Copy hash"
                    >
                      {copiedHash === tx.blockchainTxHash ? (
                        <Check className="h-3 w-3 text-success" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </td>
                <td className="py-3 px-4 text-muted-foreground text-sm">{formatTimestamp(tx.createdAt)}</td>
                <td className="py-3 px-4">
                  <Badge variant="secondary" className="bg-muted">
                    Legacy commitment
                  </Badge>
                </td>
                <td className="py-3 px-4">
                  <Badge
                    variant="secondary"
                    className="bg-success/10 text-success border-success/20"
                  >
                    <div className="h-1.5 w-1.5 rounded-full mr-1.5 bg-success" />
                    Recorded on chain
                  </Badge>
                </td>
                <td className="py-3 px-4 text-right">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8" 
                    title="View on Sepolia Etherscan"
                    onClick={() => window.open(`https://sepolia.etherscan.io/tx/${tx.blockchainTxHash}`, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredTransactions.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No transactions found</p>
        </div>
      )}
    </Card>
  )
}
