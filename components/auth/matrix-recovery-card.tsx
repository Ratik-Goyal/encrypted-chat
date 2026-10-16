"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

interface MatrixRecoveryCardProps {
  recoveryKey: string
  error?: string
  isSaving?: boolean
  isReset?: boolean
  onConfirm: () => Promise<void>
  onCancel?: () => Promise<void>
}

export function MatrixRecoveryCard({ recoveryKey, error, isSaving = false, isReset = false, onConfirm, onCancel }: MatrixRecoveryCardProps) {
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [resetConfirmed, setResetConfirmed] = useState(false)

  useEffect(() => {
    setSaved(false)
    setCopied(false)
    setResetConfirmed(false)
  }, [recoveryKey, isReset])

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(recoveryKey)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const downloadKey = () => {
    const url = URL.createObjectURL(new Blob([`${recoveryKey}\n`], { type: "text/plain;charset=utf-8" }))
    const link = document.createElement("a")
    link.href = url
    link.download = "cipher-recovery-key.txt"
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <Card className="w-full max-w-xl p-6 space-y-5">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">{isReset ? "Replace lost recovery key" : "One-time setup"}</p>
        <h1 className="text-2xl font-bold">Save your system-generated recovery key</h1>
        <p className="text-sm text-muted-foreground">
          This key protects your encrypted message backup. Cipher and the homeserver cannot recover it for you. Save it somewhere private and offline before continuing.
        </p>
      </div>

      {isReset && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          Continuing resets your encryption identity and replaces your encrypted backup. Older encrypted messages may become unreadable. Your contacts will need to verify your new identity. Nothing changes until you confirm below.
        </p>
      )}

      <div className="rounded-lg border bg-muted/40 p-4">
        <code className="block select-all break-all text-sm leading-6">{recoveryKey}</code>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="outline" onClick={copyKey} className="flex-1">
          {copied ? "Copied recovery key" : "Copy recovery key"}
        </Button>
        <Button type="button" variant="outline" onClick={downloadKey} className="flex-1">Download key</Button>
      </div>

      <label className="flex items-start gap-3 text-sm">
        <input className="mt-1" type="checkbox" checked={saved} disabled={isSaving} onChange={(event) => setSaved(event.target.checked)} />
        <span>I saved this key somewhere private and can access it if I lose this device.</span>
      </label>

      {isReset && (
        <label className="flex items-start gap-3 text-sm">
          <input className="mt-1" type="checkbox" checked={resetConfirmed} disabled={isSaving} onChange={(event) => setResetConfirmed(event.target.checked)} />
          <span>I understand this resets encryption and older encrypted messages may become unreadable.</span>
        </label>
      )}

      {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      <Button type="button" className="w-full" disabled={!saved || (isReset && !resetConfirmed) || isSaving} onClick={() => void onConfirm()}>
        {isSaving ? "Setting up encrypted backup..." : isReset ? "Reset encryption and continue" : "Finish secure setup"}
      </Button>
      {onCancel && (
        <Button type="button" variant="ghost" className="w-full" disabled={isSaving} onClick={() => void onCancel()}>
          Cancel and sign out
        </Button>
      )}
    </Card>
  )
}
