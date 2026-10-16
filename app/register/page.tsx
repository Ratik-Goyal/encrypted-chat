"use client"

import type React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Shield } from "lucide-react"
import { authenticateSocket } from "@/lib/socket"
import { cancelPendingMatrixRecovery, deactivateMatrixAccount, finishMatrixRecoveryRestore, finishMatrixRecoverySetup, generateNewMatrixRecoveryKey, registerMatrixAccount } from "@/lib/matrix"
import { MatrixRecoveryCard } from "@/components/auth/matrix-recovery-card"
import { MatrixKeyRestoreCard } from "@/components/auth/matrix-key-restore-card"

export default function RegisterPage() {
  const router = useRouter()
  const [username, setUsername] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [registrationToken, setRegistrationToken] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [recoveryKey, setRecoveryKey] = useState("")
  const [matrixAccountCreated, setMatrixAccountCreated] = useState(false)
  const [isFinishingRecovery, setIsFinishingRecovery] = useState(false)
  const [needsRecoveryRestore, setNeedsRecoveryRestore] = useState(false)
  const [isResettingRecovery, setIsResettingRecovery] = useState(false)
  const [restoreProgress, setRestoreProgress] = useState<{ stage: "fetch" | "load_keys"; successes?: number; failures?: number; total?: number } | null>(null)

  const createCipherAccount = async (deactivateMatrixOnReject: boolean) => {
    let response: Response
    try {
      response = await fetch(`${process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001"}/api/auth/register`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      })
    } catch (error) {
      if (deactivateMatrixOnReject) {
        throw new Error("Cipher could not confirm account creation. Your Matrix account was kept; retry registration or sign in if the Cipher account was created.", { cause: error })
      }
      throw error
    }
    let data: { error?: string }
    try {
      data = await response.json()
    } catch (error) {
      throw new Error(`Cipher returned an unreadable registration response (${response.status}). Your Matrix account was kept; retry registration or sign in if the Cipher account was created.`, { cause: error })
    }
    if (!response.ok) {
      const message = data.error || "Registration failed. Please try again."
      if (deactivateMatrixOnReject && response.status === 400) {
        try {
          await deactivateMatrixAccount(username, password)
          setMatrixAccountCreated(false)
          setRecoveryKey("")
        } catch {
          throw new Error(`${message} The new Matrix account could not be deactivated; ask the homeserver administrator to remove it before retrying.`)
        }
      }
      if (deactivateMatrixOnReject && response.status !== 400) {
        throw new Error(`${message} The Matrix account was kept to protect any Cipher account created before a lost response. Retry registration or sign in if the Cipher account exists.`)
      }
      throw new Error(message)
    }

    localStorage.removeItem("cipher-token")
    localStorage.setItem("cipher-user", JSON.stringify(data))
    authenticateSocket()
    setPassword("")
    setIsLoading(false)
    router.push("/user")
  }

  const handleRecoveryConfirm = async () => {
    setIsFinishingRecovery(true)
    setError("")
    try {
      await finishMatrixRecoverySetup(username, password, isResettingRecovery)
      setRecoveryKey("")
      setIsLoading(true)
      await createCipherAccount(matrixAccountCreated)
    } catch (recoveryError) {
      setError(recoveryError instanceof Error ? recoveryError.message : "Could not finish Matrix recovery setup.")
      setIsLoading(false)
    } finally {
      setIsFinishingRecovery(false)
    }
  }

  const handleGenerateRecoveryKey = async () => {
    setError("")
    try {
      const key = await generateNewMatrixRecoveryKey()
      setRecoveryKey(key)
      setIsResettingRecovery(true)
      setNeedsRecoveryRestore(false)
    } catch (keyError) {
      setError(keyError instanceof Error ? keyError.message : "Could not generate a recovery key.")
    }
  }

  const handleRecoveryCancel = async () => {
    await cancelPendingMatrixRecovery()
    setRecoveryKey("")
    setNeedsRecoveryRestore(false)
    setIsResettingRecovery(false)
    setError("")
  }

  const handleRecoveryRestore = async (key: string) => {
    setIsFinishingRecovery(true)
    setError("")
    setRestoreProgress(null)
    try {
      await finishMatrixRecoveryRestore(username, password, key, setRestoreProgress)
      setNeedsRecoveryRestore(false)
      setIsLoading(true)
      await createCipherAccount(matrixAccountCreated)
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Could not restore Matrix encryption keys.")
    } finally {
      setIsFinishingRecovery(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()

    if (password !== confirmPassword) {
      setError("Passwords don't match")
      return
    }

    if (password.length < 12) {
      setError("Password must be at least 12 characters")
      return
    }

    setIsLoading(true)
    setError("")
    try {
      const matrix = await registerMatrixAccount(username, password, registrationToken)
      const accountCreated = matrix.accountCreated || matrixAccountCreated
      setMatrixAccountCreated(accountCreated)
      if (matrix.recoveryRequired) {
        setNeedsRecoveryRestore(true)
        setIsLoading(false)
        return
      }
      if (matrix.recoveryKey) {
        setRecoveryKey(matrix.recoveryKey)
        setIsLoading(false)
        return
      }
      await createCipherAccount(accountCreated)
    } catch (matrixError) {
      setError(matrixError instanceof Error ? matrixError.message : "Could not connect to the Matrix homeserver.")
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {needsRecoveryRestore ? (
        <MatrixKeyRestoreCard error={error} isRestoring={isFinishingRecovery} progress={restoreProgress} onRestore={handleRecoveryRestore} onCancel={handleRecoveryCancel} onGenerateKey={handleGenerateRecoveryKey} />
      ) : recoveryKey ? (
        <MatrixRecoveryCard recoveryKey={recoveryKey} error={error} isSaving={isFinishingRecovery} isReset={isResettingRecovery} onConfirm={handleRecoveryConfirm} onCancel={handleRecoveryCancel} />
      ) : (
      <Card className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Create Account</h1>
          <p className="text-muted-foreground">Create a Cipher account and its matching Matrix identity.</p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive text-destructive text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              type="text"
              placeholder="johndoe"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="bg-background"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="bg-background"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="bg-background"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="bg-background"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="matrix-registration-token">Matrix registration token (if required)</Label>
            <Input
              id="matrix-registration-token"
              type="password"
              autoComplete="off"
              placeholder="Provided by your homeserver admin"
              value={registrationToken}
              onChange={(e) => setRegistrationToken(e.target.value)}
              className="bg-background"
            />
          </div>
          <Button type="submit" className="w-full transition-smooth" disabled={isLoading}>
            {isLoading ? "Creating account..." : "Create Account"}
          </Button>
        </form>

        <Separator className="my-6" />

        <div className="text-center text-sm">
          <span className="text-muted-foreground">Already have an account? </span>
          <Button variant="link" className="p-0 h-auto font-medium" onClick={() => router.push("/login")}>
            Sign in
          </Button>
        </div>
        <p className="mt-5 text-center text-xs text-muted-foreground">
          Your Matrix identity uses the same username and password. The homeserver must allow registration or issue you a registration token.
        </p>
      </Card>
      )}
    </div>
  )
}
