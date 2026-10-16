"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface RestoreProgress {
  stage: "fetch" | "load_keys"
  successes?: number
  failures?: number
  total?: number
}

interface MatrixKeyRestoreCardProps {
  error?: string
  isRestoring?: boolean
  progress?: RestoreProgress | null
  onRestore: (recoveryKey: string) => Promise<void>
  onCancel: () => Promise<void>
  onGenerateKey: () => Promise<void>
}

export function MatrixKeyRestoreCard({ error, isRestoring = false, progress, onRestore, onCancel, onGenerateKey }: MatrixKeyRestoreCardProps) {
  const [recoveryKey, setRecoveryKey] = useState("")
  const [isGeneratingKey, setIsGeneratingKey] = useState(false)
  const isBusy = isRestoring || isGeneratingKey

  const generateKey = async () => {
    setIsGeneratingKey(true)
    try {
      await onGenerateKey()
    } finally {
      setIsGeneratingKey(false)
    }
  }

  return (
    <Card className="w-full max-w-xl space-y-5 p-6">
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Restore encrypted history</p>
        <h1 className="text-2xl font-bold">Enter your Matrix recovery key</h1>
        <p className="text-sm text-muted-foreground">
          This account already has a system-generated recovery key from its first setup. Enter the key you saved to restore encrypted history on this device. It is checked in your browser and is not uploaded to Cipher.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="matrix-recovery-key">Recovery key</Label>
        <Input
          id="matrix-recovery-key"
          type="password"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={recoveryKey}
          onChange={(event) => setRecoveryKey(event.target.value)}
          disabled={isBusy}
          placeholder="Paste your saved recovery key"
          className="font-mono"
        />
      </div>

      {isRestoring && (
        <p role="status" aria-live="polite" className="rounded-md bg-muted p-3 text-sm">
          {!progress || progress.stage === "fetch"
            ? "Checking and downloading your encrypted key backup…"
            : `Restoring room keys: ${progress.successes || 0} of ${progress.total || "…"}${progress.failures ? ` · ${progress.failures} could not be imported` : ""}`}
        </p>
      )}
      {error && <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      <Button type="button" className="w-full" disabled={!recoveryKey.trim() || isBusy} onClick={() => void onRestore(recoveryKey)}>
        {isRestoring ? "Restoring encrypted keys…" : "Restore Matrix keys"}
      </Button>

      <div className="space-y-3 rounded-lg border p-4">
        <p className="text-sm font-medium">Don’t have your saved key?</p>
        <p className="text-sm text-muted-foreground">You can generate a new recovery key and reset encryption. This cannot recover older encrypted history. You will review the new key and confirm before anything is reset.</p>
        <Button type="button" variant="outline" className="w-full" disabled={isBusy} onClick={() => void generateKey()}>
          {isGeneratingKey ? "Generating recovery key…" : "Generate a new recovery key"}
        </Button>
      </div>

      <Button type="button" variant="ghost" className="w-full" disabled={isBusy} onClick={() => void onCancel()}>
        Cancel and sign out
      </Button>
    </Card>
  )
}
