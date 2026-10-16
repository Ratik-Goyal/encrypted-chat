"use client"

import { useCallback, useEffect, useState } from "react"
import { LoaderCircle, ShieldCheck, ShieldAlert, UploadCloud } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { IntegrityMetadata, IntegrityReceipt as IntegrityReceiptData } from "@/lib/integrity"
import {
  getIntegrityReceipt,
  queueIntegrityCommitment,
  verifyAnchoredBatchOnChain,
  verifyMerkleProof,
  verifyMessageIntegrity,
} from "@/lib/integrity"

type ReceiptState = "checking" | "not-found" | "queued" | "valid" | "chain-pending" | "chain-unavailable" | "chain-invalid" | "invalid" | "unavailable"

interface IntegrityReceiptProps {
  message: string
  metadata: IntegrityMetadata
}

export function IntegrityReceipt({ message, metadata }: IntegrityReceiptProps) {
  const [state, setState] = useState<ReceiptState>("checking")
  const [receipt, setReceipt] = useState<IntegrityReceiptData | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    setBusy(true)
    try {
      if (!(await verifyMessageIntegrity(message, metadata))) {
        setReceipt(null)
        setState("invalid")
        return
      }
      const result = await getIntegrityReceipt(metadata.commitment)
      if (result.status === "anchored") {
        setReceipt(result.receipt)
        if (!(await verifyMerkleProof(metadata.commitment, result.receipt.proof, result.receipt.root))) {
          setState("invalid")
          return
        }
        const chainCheck = await verifyAnchoredBatchOnChain(result.receipt)
        setState(chainCheck === "verified" ? "valid" : chainCheck === "invalid" ? "chain-invalid" : chainCheck === "pending" ? "chain-pending" : "chain-unavailable")
      } else {
        setReceipt(null)
        setState(result.status)
      }
    } catch {
      setReceipt(null)
      setState("unavailable")
    } finally {
      setBusy(false)
    }
  }, [message, metadata])

  useEffect(() => { void refresh() }, [refresh])

  const queue = async () => {
    setBusy(true)
    try {
      await queueIntegrityCommitment(metadata.commitment)
      await refresh()
    } catch {
      setState("unavailable")
      setBusy(false)
    }
  }

  if (state === "checking") {
    return <span className="mt-2 inline-flex items-center gap-1 text-[10px] opacity-75"><LoaderCircle className="h-3 w-3 animate-spin" />Checking message integrity</span>
  }

  if (state === "valid" && receipt) {
    return (
      <details className="mt-2 text-[10px] opacity-80">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1">
          <ShieldCheck className="h-3 w-3 text-success" /> Merkle proof and on-chain root verified · batch {receipt.batchId}
        </summary>
        <div className="mt-1 space-y-1 break-all">
          <p>The message matches its Merkle proof, and the configured read-only RPC confirmed the contract root, event, and block. This check is independent of Cipher's API but still trusts the configured RPC provider.</p>
          <p>Chain {receipt.chainId} · block {receipt.blockNumber}</p>
          <p>Contract: {receipt.contractAddress}</p>
          <p>Transaction: {receipt.transactionHash}</p>
          <p>Merkle root: {receipt.root}</p>
          <p>Inclusion path: {receipt.proof.join(" ") || "single-leaf batch"}</p>
        </div>
      </details>
    )
  }

  if ((state === "chain-unavailable" || state === "chain-pending") && receipt) {
    return (
      <div className="mt-2 text-[10px] opacity-80">
        <details>
          <summary className="inline-flex cursor-pointer list-none items-center gap-1">
            <ShieldAlert className="h-3 w-3 text-warning" /> Merkle proof valid · {state === "chain-pending" ? "awaiting chain confirmations" : "chain not independently checked"}
          </summary>
          <div className="mt-1 space-y-1 break-all">
            <p>The message and inclusion path match. Cipher could not confirm the root independently on the configured chain.</p>
            <p>Chain {receipt.chainId} · block {receipt.blockNumber} · batch {receipt.batchId}</p>
            <p>Contract: {receipt.contractAddress}</p>
            <p>Transaction: {receipt.transactionHash}</p>
            <p>If no public read-only RPC is configured, set one along with the expected chain ID and contract address. If it is configured, retry when the provider is available.</p>
          </div>
        </details>
        <Button variant="ghost" size="sm" className="mt-1 h-6 px-1 text-[10px]" disabled={busy} onClick={() => void refresh()}>
          {busy ? <LoaderCircle className="mr-1 h-3 w-3 animate-spin" /> : <ShieldAlert className="mr-1 h-3 w-3" />}
          Retry chain check
        </Button>
      </div>
    )
  }

  if (state === "chain-invalid") {
    return <span role="alert" className="mt-2 inline-flex items-center gap-1 text-[10px] text-destructive"><ShieldAlert className="h-3 w-3" />On-chain batch did not match the receipt or configured contract</span>
  }

  if (state === "invalid") {
    return <span role="alert" className="mt-2 inline-flex items-center gap-1 text-[10px] text-destructive"><ShieldAlert className="h-3 w-3" />Message integrity check failed</span>
  }

  if (state === "not-found") {
    return (
      <Button variant="ghost" size="sm" className="mt-1 h-6 px-1 text-[10px]" disabled={busy} onClick={() => void queue()}>
        <UploadCloud className="mr-1 h-3 w-3" />Queue integrity proof
      </Button>
    )
  }

  return (
    <Button variant="ghost" size="sm" className="mt-1 h-6 px-1 text-[10px]" disabled={busy} onClick={() => void refresh()}>
      {busy ? <LoaderCircle className="mr-1 h-3 w-3 animate-spin" /> : <ShieldAlert className="mr-1 h-3 w-3" />}
      {state === "queued" ? "Proof queued · refresh" : "Proof service unavailable · retry"}
    </Button>
  )
}
