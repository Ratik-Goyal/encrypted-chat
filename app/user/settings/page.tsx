"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, User, Bell, Shield, Wallet, Save, Upload, Camera } from "lucide-react"
import { disconnectSocket, getSocket } from "@/lib/socket"
import { deactivateMatrixAccount, exportMatrixHistory, getMatrixClient, logoutMatrixSession } from "@/lib/matrix"
import { IdentityVerification } from "@/components/chat/identity-verification"

interface UserProfile {
  name: string
  email: string
  status: string
  userStatus: "online" | "offline" | "idle" | "dnd"
  profilePicture: string
}

interface NotificationPreferences {
  messageNotifications: boolean
  soundEnabled: boolean
  desktopNotifications: boolean
}

interface MatrixDeviceInfo {
  deviceId: string
  displayName: string
  lastSeenAt: number | null
  isCurrent: boolean
}

export default function SettingsPage() {
  const router = useRouter()
  const socket = getSocket()
  
  // Get user data from localStorage
  const currentUser = typeof window !== "undefined" ? JSON.parse(localStorage.getItem("cipher-user") || "{}") : {}
  
  const [profile, setProfile] = useState<UserProfile>({
    name: currentUser.username || "User",
    email: currentUser.email || "",
    status: currentUser.bio || "",
    userStatus: (currentUser.status || "online") as "online" | "offline" | "idle" | "dnd",
    profilePicture: currentUser.profilePicture || "",
  })

  const [notifications, setNotifications] = useState<NotificationPreferences>(() => {
    const defaults = { messageNotifications: true, soundEnabled: true, desktopNotifications: false }
    if (typeof window === "undefined") return defaults
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem("cipher-notifications") || "{}") }
    } catch {
      return defaults
    }
  })

  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  const [privacy, setPrivacy] = useState({
    showOnlineStatus: currentUser.privacy?.showOnlineStatus ?? true,
    readReceipts: currentUser.privacy?.readReceipts ?? true,
    typingIndicator: currentUser.privacy?.typingIndicator ?? true,
  })
  const [isSaving, setIsSaving] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isExportingMatrix, setIsExportingMatrix] = useState(false)
  const [matrixExportProgress, setMatrixExportProgress] = useState<{ completed: number; total: number } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [settingsNotice, setSettingsNotice] = useState("")
  const [matrixDevices, setMatrixDevices] = useState<MatrixDeviceInfo[]>([])
  const [matrixUserId, setMatrixUserId] = useState("")
  const [isLoadingMatrixDevices, setIsLoadingMatrixDevices] = useState(true)
  const [revokingDeviceId, setRevokingDeviceId] = useState("")

  useEffect(() => {
    let active = true
    void getMatrixClient().then(async (client) => {
      if (active) setMatrixUserId(client.getUserId() || "")
      const [{ devices }, currentDeviceId] = [await client.getDevices(), client.getDeviceId()]
      if (!active) return
      setMatrixDevices(devices.map((device) => ({
        deviceId: device.device_id,
        displayName: device.display_name || "Unnamed Matrix device",
        lastSeenAt: device.last_seen_ts || null,
        isCurrent: device.device_id === currentDeviceId,
      })).sort((left, right) => Number(right.isCurrent) - Number(left.isCurrent)))
    }).catch((error) => {
      if (active) setSettingsNotice(error instanceof Error ? error.message : "Could not load Matrix devices.")
    }).finally(() => {
      if (active) setIsLoadingMatrixDevices(false)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    localStorage.setItem("cipher-notifications", JSON.stringify(notifications))
  }, [notifications])

  const handlePhotoUpload = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "image/png,image/jpeg,image/webp"
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
          setSettingsNotice("Choose a PNG, JPEG, or WebP image smaller than 8 MB.")
          return
        }
        setUploadingPhoto(true)
        
        // Convert image to base64 for preview
        const reader = new FileReader()
        reader.onloadend = () => {
          const base64String = reader.result as string
          const image = new Image()
          image.onload = () => {
            const canvas = document.createElement("canvas")
            const scale = Math.min(1, 256 / Math.max(image.width, image.height))
            canvas.width = Math.max(1, Math.round(image.width * scale))
            canvas.height = Math.max(1, Math.round(image.height * scale))
            canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height)
            const profilePicture = canvas.toDataURL("image/webp", 0.75)
            socket.timeout(10000).emit("update-profile-picture", { profilePicture }, (error: Error | null, result: { success: boolean; message?: string }) => {
              setUploadingPhoto(false)
              if (error || !result?.success) {
                setSettingsNotice(result?.message || "Could not save profile photo. Choose a smaller image.")
                return
              }
              setProfile((previous) => ({ ...previous, profilePicture }))
              localStorage.setItem("cipher-user", JSON.stringify({ ...currentUser, profilePicture }))
              setSettingsNotice("Profile photo updated.")
            })
          }
          image.onerror = () => {
            setUploadingPhoto(false)
            setSettingsNotice("Could not read that image.")
          }
          image.src = base64String
        }
        reader.onerror = () => {
          setUploadingPhoto(false)
          setSettingsNotice("Could not read that image.")
        }
        reader.readAsDataURL(file)
      }
    }
    input.click()
  }

  useEffect(() => {
    // Load user data on mount
    if (currentUser.username) {
      setProfile({
        name: currentUser.username,
        email: currentUser.email || "",
        status: currentUser.bio || "",
        userStatus: (currentUser.status || "online") as "online" | "offline" | "idle" | "dnd",
        profilePicture: currentUser.profilePicture || "",
      })
    }
  }, [])

  const handleSave = () => {
    setIsSaving(true)
    setSettingsNotice("")
    socket.timeout(5000).emit("save-settings", { status: profile.userStatus, privacy, bio: profile.status }, (error: Error | null, result: { success: boolean; message?: string }) => {
      setIsSaving(false)
      if (error) {
        setSettingsNotice("Could not reach the server. Please try again.")
        return
      }
      if (!result?.success) {
        setSettingsNotice(result?.message || "Could not save settings. Please try again.")
        return
      }
      const updatedUser = { ...currentUser, status: profile.userStatus, privacy, bio: profile.status }
      localStorage.setItem("cipher-user", JSON.stringify(updatedUser))
      setSettingsNotice("Privacy and availability settings saved.")
    })
  }

  const handleDesktopNotifications = async (enabled: boolean) => {
    if (!enabled) {
      setNotifications((previous) => ({ ...previous, desktopNotifications: false }))
      return
    }
    if (!("Notification" in window)) {
      setSettingsNotice("This browser does not support desktop notifications.")
      return
    }
    const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission
    if (permission !== "granted") {
      setSettingsNotice("Allow notifications in your browser to enable desktop alerts.")
      return
    }
    setNotifications((previous) => ({ ...previous, desktopNotifications: true }))
    setSettingsNotice("Desktop alerts are enabled while Cipher is open in the background.")
  }

  const handleExport = async () => {
    setIsExporting(true)
    setSettingsNotice("")
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001"}/api/me/export`, {
        credentials: "include",
      })
      if (!response.ok) throw new Error((await response.json()).error || "Export failed")
      const downloadUrl = URL.createObjectURL(await response.blob())
      const anchor = document.createElement("a")
      anchor.href = downloadUrl
      anchor.download = "cipher-account-export.json"
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000)
      setSettingsNotice("Your account export has been downloaded.")
    } catch (error) {
      setSettingsNotice(error instanceof Error ? error.message : "Export failed")
    } finally {
      setIsExporting(false)
    }
  }

  const handleMatrixExport = async () => {
    setIsExportingMatrix(true)
    setMatrixExportProgress(null)
    setSettingsNotice("")
    try {
      const data = await exportMatrixHistory((completed, total) => setMatrixExportProgress({ completed, total }))
      const downloadUrl = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }))
      const anchor = document.createElement("a")
      anchor.href = downloadUrl
      anchor.download = "cipher-matrix-history-export.json"
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000)
      setSettingsNotice(`Matrix history export saved locally. ${data.rooms.length} direct rooms and ${data.rooms.reduce((total, room) => total + room.messages.length, 0)} messages exported.${data.decryptionFailures ? ` ${data.decryptionFailures} encrypted events could not be decrypted with this device's available keys.` : ""}`)
    } catch (error) {
      setSettingsNotice(error instanceof Error ? error.message : "Could not export Matrix history.")
    } finally {
      setIsExportingMatrix(false)
    }
  }

  const handleRevokeMatrixDevice = async (device: MatrixDeviceInfo) => {
    if (device.isCurrent) return
    if (!window.confirm(`Revoke Matrix device “${device.displayName}” (${device.deviceId})? It will no longer be able to connect, but previously saved copies may remain.`)) return
    const matrixPassword = window.prompt("Enter your Matrix account password to confirm device revocation.")
    if (!matrixPassword) return
    setRevokingDeviceId(device.deviceId)
    setSettingsNotice("")
    try {
      const client = await getMatrixClient()
      await client.deleteDevice(device.deviceId, {
        type: "m.login.password",
        identifier: { type: "m.id.user", user: currentUser.username },
        password: matrixPassword,
      })
      setMatrixDevices((previous) => previous.filter((current) => current.deviceId !== device.deviceId))
      setSettingsNotice(`Matrix device ${device.deviceId} was revoked. Data already copied or saved on it may remain.`)
    } catch (error) {
      setSettingsNotice(error instanceof Error ? error.message : "Could not revoke the Matrix device.")
    } finally {
      setRevokingDeviceId("")
    }
  }

  const handleDeleteAccount = async () => {
    if (!window.confirm("Delete your Cipher account and legacy messages, and ask the Matrix homeserver to deactivate your account and erase its data where supported? This cannot be undone. Other room members, federated homeservers, backups, and old public-chain records may retain copies.")) return
    const userId = currentUser.userId
    const deletionMarker = `cipher-matrix-delete:${userId}`
    const matrixAlreadyDeactivated = localStorage.getItem(deletionMarker) === "done"
    let matrixDeactivated = matrixAlreadyDeactivated
    let cipherOnlyDeletion = false
    let matrixPassword = ""
    if (!matrixAlreadyDeactivated) {
      const enteredPassword = window.prompt("Enter your current Matrix password to request Matrix account deactivation.")
      if (enteredPassword === null || enteredPassword.length === 0) return
      matrixPassword = enteredPassword
    }

    setIsDeleting(true)
    setSettingsNotice("")
    try {
      if (!matrixAlreadyDeactivated) {
        localStorage.setItem(deletionMarker, "pending")
        try {
          const result = await deactivateMatrixAccount(currentUser.username, matrixPassword)
          matrixDeactivated = true
          if (result.localStoresCleared) {
            localStorage.setItem(deletionMarker, "done")
          } else {
            const continueWithCipherOnly = window.confirm("The Matrix account was deactivated, but Cipher could not clear its local encryption database. Close other Cipher tabs and retry, or continue deleting Cipher and clear this browser's site data afterward.")
            if (!continueWithCipherOnly) {
              setIsDeleting(false)
              return
            }
            cipherOnlyDeletion = true
          }
        } catch (matrixError) {
          const detail = matrixError instanceof Error ? matrixError.message : "Matrix account deactivation could not be confirmed."
          const continueWithCipherOnly = window.confirm(`${detail}\n\nContinue deleting Cipher only? Your Matrix account or its data may remain on the homeserver.`)
          if (!continueWithCipherOnly) {
            setIsDeleting(false)
            return
          }
          cipherOnlyDeletion = true
        }
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001"}/api/me`, {
        method: "DELETE",
        credentials: "include",
      })
      if (!response.ok) throw new Error((await response.json()).error || "Account deletion failed")
      localStorage.removeItem(deletionMarker)
      if (cipherOnlyDeletion) await logoutMatrixSession()
      localStorage.removeItem("cipher-token")
      localStorage.removeItem("cipher-user")
      disconnectSocket()
      router.replace("/login")
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Account deletion failed"
      setSettingsNotice(matrixDeactivated
        ? `Matrix account deactivated, but Cipher deletion did not finish. Select delete again to retry the Cipher cleanup. ${detail}`
        : `Cipher deletion did not finish. Matrix deactivation may be incomplete. ${detail}`)
      setIsDeleting(false)
    }
  }

  const handleSignOut = async () => {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001"}/api/me/logout`, {
        method: "POST",
        credentials: "include",
      })
    } catch {
      // Clear the local session even when the server cannot be reached.
    } finally {
      await logoutMatrixSession()
      localStorage.removeItem("cipher-token")
      localStorage.removeItem("cipher-user")
      disconnectSocket()
      router.replace("/login")
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link href="/user">
            <Button variant="ghost" size="icon" className="transition-smooth">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-semibold">Settings</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Profile Section */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <User className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Profile</h2>
          </div>

          <div className="space-y-6">
            <div className="flex items-center gap-6">
              <div className="relative">
                <Avatar className="h-20 w-20">
                  {profile.profilePicture ? (
                    <img 
                      src={profile.profilePicture} 
                      alt="Profile" 
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                      {profile.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </AvatarFallback>
                  )}
                </Avatar>
                <button
                  onClick={handlePhotoUpload}
                  disabled={uploadingPhoto}
                  className="absolute bottom-0 right-0 h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-smooth disabled:opacity-50"
                >
                  {uploadingPhoto ? (
                    <div className="h-3 w-3 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Camera className="h-4 w-4" />
                  )}
                </button>
              </div>
              <Button 
                variant="outline" 
                className="transition-smooth bg-transparent" 
                onClick={handlePhotoUpload}
                disabled={uploadingPhoto}
              >
                <Upload className="h-4 w-4 mr-2" />
                {uploadingPhoto ? "Uploading..." : "Change Photo"}
              </Button>
            </div>

            <div className="space-y-4">
            <div className="space-y-2">
                <Label htmlFor="name">Display Name</Label>
                <Input
                  id="name"
                  value={profile.name}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                  className="bg-background"
                  disabled
                />
                <p className="text-xs text-muted-foreground">Username cannot be changed</p>
            </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  value={profile.email}
                  className="bg-background"
                  disabled
                />
                <p className="text-xs text-muted-foreground">Email cannot be changed</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status Message</Label>
                <Input
                  id="status"
                  value={profile.status}
                  onChange={(e) => setProfile({ ...profile, status: e.target.value })}
                  className="bg-background"
                  placeholder="What's on your mind?"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="userStatus">Availability Status</Label>
                <Select
                  value={profile.userStatus}
                  onValueChange={(value) =>
                    setProfile({ ...profile, userStatus: value as "online" | "offline" | "idle" | "dnd" })
                  }
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="online">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-success" />
                        <span>Online</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="idle">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-amber-500" />
                        <span>Idle</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="dnd">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-red-500" />
                        <span>Do Not Disturb</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="offline">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-muted" />
                        <span>Offline</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button className="transition-smooth" onClick={handleSave} disabled={isSaving}>
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
            {settingsNotice && <p role="status" className="text-sm text-muted-foreground">{settingsNotice}</p>}
          </div>
        </Card>

        {/* Notifications Section */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <Bell className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Notifications</h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Message Notifications</p>
                <p className="text-sm text-muted-foreground">Enable message alerts while Cipher is open</p>
              </div>
              <Switch
                checked={notifications.messageNotifications}
                onCheckedChange={(checked) => setNotifications({ ...notifications, messageNotifications: checked })}
              />
            </div>


            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Sound</p>
                <p className="text-sm text-muted-foreground">Play sound for notifications</p>
              </div>
              <Switch
                checked={notifications.soundEnabled}
                onCheckedChange={(checked) => setNotifications({ ...notifications, soundEnabled: checked })}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Desktop Notifications</p>
                <p className="text-sm text-muted-foreground">Show a desktop alert while Cipher is open in the background</p>
              </div>
              <Switch
                checked={notifications.desktopNotifications}
                onCheckedChange={handleDesktopNotifications}
              />
            </div>
          </div>
        </Card>

        {/* Privacy & Security Section */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <Shield className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Privacy & Security</h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Show Online Status</p>
                <p className="text-sm text-muted-foreground">Let others see when you're online</p>
              </div>
              <Switch
                checked={privacy.showOnlineStatus}
                onCheckedChange={(checked) => setPrivacy({ ...privacy, showOnlineStatus: checked })}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Read Receipts</p>
                <p className="text-sm text-muted-foreground">Show when you've read messages</p>
              </div>
              <Switch
                checked={privacy.readReceipts}
                onCheckedChange={(checked) => setPrivacy({ ...privacy, readReceipts: checked })}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Typing Indicator</p>
                <p className="text-sm text-muted-foreground">Show when you're typing</p>
              </div>
              <Switch
                checked={privacy.typingIndicator}
                onCheckedChange={(checked) => setPrivacy({ ...privacy, typingIndicator: checked })}
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-2 w-2 rounded-full bg-success" />
                <p className="text-sm font-medium">Matrix encryption</p>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                New direct messages use Matrix end-to-end encryption. Cipher shares room keys only with cross-signed devices, so verify a new device before expecting it to decrypt new messages. Open a conversation's privacy receipt to verify a contact by scanning a QR code in person or comparing emoji codes through a separate trusted channel. Optional expiry timers request room redaction but cannot erase uploaded attachments, offline copies, screenshots, or homeserver backups. Older prototype messages remain server-readable.
              </p>
            </div>

            <Separator />
            <div className="space-y-3">
              <div>
                <p className="font-medium">Matrix devices</p>
                <p className="text-sm text-muted-foreground">Review active Matrix sessions and revoke devices you no longer use. Cipher cannot erase data already copied to a device.</p>
              </div>
              {isLoadingMatrixDevices ? (
                <p className="text-sm text-muted-foreground">Loading Matrix devices…</p>
              ) : matrixDevices.length === 0 ? (
                <p className="text-sm text-muted-foreground">No Matrix devices were returned by the homeserver.</p>
              ) : (
                <ul className="space-y-2">
                  {matrixDevices.map((device) => (
                    <li key={device.deviceId} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                      <div className="min-w-0">
                        <p className="break-all text-sm font-medium">{device.displayName}{device.isCurrent ? " · This device" : ""}</p>
                        <p className="break-all text-xs text-muted-foreground">{device.deviceId}{device.lastSeenAt ? ` · Last seen ${new Date(device.lastSeenAt).toLocaleString()}` : ""}</p>
                      </div>
                      {device.isCurrent ? (
                        <span className="text-xs text-muted-foreground">Current session</span>
                      ) : (
                        <Button variant="outline" size="sm" disabled={revokingDeviceId === device.deviceId} onClick={() => void handleRevokeMatrixDevice(device)}>
                          {revokingDeviceId === device.deviceId ? "Revoking…" : "Revoke device"}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {matrixUserId && (
              <div className="space-y-3 rounded-md border p-4">
                <div>
                  <p className="font-medium">Link a Matrix device</p>
                  <p className="text-sm text-muted-foreground">Open this page on both devices. Keep them with you and compare QR codes or emoji to verify the target device. This cross-signs a device you control so Cipher can share encrypted room keys with it.</p>
                </div>
                <IdentityVerification peerUserId={matrixUserId} roomId="" isSelf />
              </div>
            )}

            <Separator />
            <div className="space-y-3">
              <div>
                <p className="font-medium">Your account data</p>
                <p className="text-sm text-muted-foreground">Cipher account data and Matrix direct-message history download as separate files. Matrix history is decrypted and assembled locally; messages this device cannot decrypt are reported. Deletion asks the homeserver to deactivate the Matrix account and erase data where supported, then clears this browser's Matrix crypto store when possible. Other room members, federated servers, and backups may retain copies.</p>
                <p className="text-xs text-muted-foreground">Cipher sign-out revokes Cipher sessions. Matrix sign-out revokes this browser's device; this page can revoke other active Matrix devices.</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={handleExport} disabled={isExporting}>
                  {isExporting ? "Preparing export..." : "Download my data"}
                </Button>
                <Button variant="outline" onClick={handleMatrixExport} disabled={isExportingMatrix}>
                  {isExportingMatrix
                    ? matrixExportProgress && matrixExportProgress.total > 0
                      ? `Exporting Matrix rooms ${matrixExportProgress.completed}/${matrixExportProgress.total}...`
                      : "Preparing Matrix export..."
                    : "Export Matrix history"}
                </Button>
                <Button variant="outline" onClick={handleSignOut}>
                  Sign out of Cipher and this Matrix device
                </Button>
                <Button variant="destructive" onClick={handleDeleteAccount} disabled={isDeleting}>
                  {isDeleting ? "Deleting account..." : "Delete account and messages"}
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* Blockchain Wallet Section */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <Wallet className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Blockchain Wallet</h2>
          </div>

          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-muted/50 border border-border">
              <p className="text-sm font-medium mb-1">Wallet Status</p>
              <div className="flex items-center gap-2">
                {currentUser.walletAddress ? (
                  <>
                    <div className="h-2 w-2 rounded-full bg-success" />
                    <p className="text-sm text-muted-foreground">Connected</p>
                  </>
                ) : (
                  <>
                    <div className="h-2 w-2 rounded-full bg-muted" />
                    <p className="text-sm text-muted-foreground">Not connected</p>
                  </>
                )}
              </div>
              {currentUser.walletAddress && (
                <p className="text-xs text-muted-foreground mt-2 font-mono">
                  {currentUser.walletAddress.substring(0, 6)}...{currentUser.walletAddress.substring(38)}
                </p>
              )}
            </div>

            <Button
              variant="outline"
              className="w-full transition-smooth bg-transparent"
              onClick={() => router.push("/user/blockchain")}
            >
              View Blockchain Activity
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
