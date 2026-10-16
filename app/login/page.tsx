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
import { cancelPendingMatrixRecovery, finishMatrixRecoveryRestore, finishMatrixRecoverySetup, generateNewMatrixRecoveryKey, loginMatrixAccount } from "@/lib/matrix"
import { MatrixRecoveryCard } from "@/components/auth/matrix-recovery-card"
import { MatrixKeyRestoreCard } from "@/components/auth/matrix-key-restore-card"

interface LoginResponse extends Record<string, unknown> {
  username: string
}

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [recoveryKey, setRecoveryKey] = useState("")
  const [pendingLogin, setPendingLogin] = useState<LoginResponse | null>(null)
  const [isFinishingRecovery, setIsFinishingRecovery] = useState(false)
  const [needsRecoveryRestore, setNeedsRecoveryRestore] = useState(false)
  const [isResettingRecovery, setIsResettingRecovery] = useState(false)
  const [restoreProgress, setRestoreProgress] = useState<{ stage: "fetch" | "load_keys"; successes?: number; failures?: number; total?: number } | null>(null)

  const finishLogin = (data: LoginResponse) => {
    localStorage.removeItem("cipher-token")
    localStorage.setItem("cipher-user", JSON.stringify(data))
    authenticateSocket()
    setRecoveryKey("")
    setNeedsRecoveryRestore(false)
    setIsResettingRecovery(false)
    setPendingLogin(null)
    setPassword("")
    setIsLoading(false)
    router.push("/user")
  }

  const handleRecoveryConfirm = async () => {
    setIsFinishingRecovery(true)
    setError("")
    try {
      const data = pendingLogin
      if (!data) throw new Error("The login session expired. Sign in again.")
      await finishMatrixRecoverySetup(data.username, password, isResettingRecovery)
      finishLogin(data)
    } catch (recoveryError) {
      setError(recoveryError instanceof Error ? recoveryError.message : "Could not finish Matrix recovery setup.")
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

  const handleRecoveryRestore = async (key: string) => {
    setIsFinishingRecovery(true)
    setError("")
    setRestoreProgress(null)
    try {
      const data = pendingLogin
      if (!data) throw new Error("The login session expired. Sign in again.")
      await finishMatrixRecoveryRestore(data.username, password, key, setRestoreProgress)
      finishLogin(data)
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Could not restore Matrix encryption keys.")
    } finally {
      setIsFinishingRecovery(false)
    }
  }

  const cancelRecovery = async () => {
    await cancelPendingMatrixRecovery()
    await fetch(`${process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001"}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
    }).catch(() => undefined)
    setRecoveryKey("")
    setNeedsRecoveryRestore(false)
    setIsResettingRecovery(false)
    setPendingLogin(null)
    setPassword("")
    setError("")
  }

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001"}/api/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      const data = await response.json() as LoginResponse
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Invalid email or password")

      try {
        const matrix = await loginMatrixAccount(data.username, password)
        if (matrix.recoveryRequired) {
          setPendingLogin(data)
          setNeedsRecoveryRestore(true)
          setIsLoading(false)
          return
        }
        if (matrix.recoveryKey) {
          setPendingLogin(data)
          setRecoveryKey(matrix.recoveryKey)
          setIsLoading(false)
          return
        }
        finishLogin(data)
      } catch (matrixError) {
        await fetch(`${process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001"}/api/auth/logout`, {
          method: "POST",
          credentials: "include",
        }).catch(() => undefined)
        throw matrixError
      }
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Sign-in failed")
      setPassword("")
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {needsRecoveryRestore ? (
        <MatrixKeyRestoreCard error={error} isRestoring={isFinishingRecovery} progress={restoreProgress} onRestore={handleRecoveryRestore} onCancel={cancelRecovery} onGenerateKey={handleGenerateRecoveryKey} />
      ) : recoveryKey ? (
        <MatrixRecoveryCard recoveryKey={recoveryKey} error={error} isSaving={isFinishingRecovery} isReset={isResettingRecovery} onConfirm={handleRecoveryConfirm} onCancel={cancelRecovery} />
      ) : (
      <Card className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Welcome to Cipher</h1>
          <p className="text-muted-foreground">Encrypted messaging is provided by your configured Matrix homeserver.</p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive text-destructive text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleEmailLogin} className="space-y-4">
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
            <Button type="submit" className="w-full transition-smooth" disabled={isLoading}>
              {isLoading ? "Signing in..." : "Sign In"}
            </Button>
        </form>

        <Separator className="my-6" />

        <div className="text-center text-sm">
          <span className="text-muted-foreground">Don't have an account? </span>
          <Button variant="link" className="p-0 h-auto font-medium" onClick={() => router.push("/register")}>
            Sign up
          </Button>
        </div>
        <p className="mt-5 text-center text-xs text-muted-foreground">
          Sign in with your Cipher username and password. Your matching Matrix account must use the same username and password.
        </p>
      </Card>
      )}
    </div>
  )
}
