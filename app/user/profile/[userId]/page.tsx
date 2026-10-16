"use client"

import { use, useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, MessageSquare, Shield, Clock } from "lucide-react"
import { getSocket } from "@/lib/socket"

interface PublicProfile {
  userId: string
  username: string
  profilePicture?: string
  status: string
  bio?: string
  createdAt: string
}

export default function UserProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params)
  const socket = getSocket()
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    setProfile(null)
    setError("")
    socket.timeout(5000).emit("get-user-profile", { userId }, (timeout: Error | null, result: { success: boolean; message?: string; profile?: PublicProfile }) => {
      if (timeout) {
        setError("Could not load profile. Check your connection and try again.")
      } else if (result?.success && result.profile) {
        setProfile(result.profile)
      } else {
        setError(result?.message || "User not found")
      }
    })
  }, [socket, userId])

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="p-8 text-center space-y-4">
          <p className="text-muted-foreground">{error || "Loading profile..."}</p>
          <Link href="/user"><Button variant="outline">Back to chat</Button></Link>
        </Card>
      </div>
    )
  }

  const initials = profile.username.slice(0, 2).toUpperCase()

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link href="/user">
            <Button variant="ghost" size="icon" className="transition-smooth"><ArrowLeft className="h-5 w-5" /></Button>
          </Link>
          <h1 className="text-2xl font-semibold">Profile</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <Card className="p-8">
          <div className="flex flex-col items-center text-center space-y-4">
            <Avatar className="h-24 w-24">
              {profile.profilePicture ? (
                <img src={profile.profilePicture} alt={`${profile.username}'s profile`} className="h-full w-full object-cover" />
              ) : (
                <AvatarFallback className="bg-primary/10 text-primary text-3xl">{initials}</AvatarFallback>
              )}
            </Avatar>
            <div>
              <h2 className="text-2xl font-bold">{profile.username}</h2>
              {profile.bio && <p className="text-muted-foreground mt-1">{profile.bio}</p>}
            </div>
            <Badge variant="secondary">Identity not verified here</Badge>
          </div>
        </Card>

        <div className="grid md:grid-cols-3 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-8 w-8 text-primary" />
              <div><p className="text-2xl font-bold">{profile.status}</p><p className="text-sm text-muted-foreground">Presence</p></div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <Shield className="h-8 w-8 text-destructive" />
              <div><p className="text-2xl font-bold">Off</p><p className="text-sm text-muted-foreground">End-to-end encryption</p></div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{new Date(profile.createdAt).toLocaleDateString()}</p>
                <p className="text-sm text-muted-foreground">Member since</p>
              </div>
            </div>
          </Card>
        </div>

        <Card className="p-6 bg-muted/30 border-border">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium">Identity and message privacy</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                This profile alone does not establish who owns the account. Open a conversation's privacy receipt to verify Matrix identity with a QR code in person or compare emoji codes through a separate trusted channel. Older prototype messages may be readable by the Cipher service.
              </p>
            </div>
          </div>
        </Card>

        <Link href={`/user?userId=${encodeURIComponent(profile.userId)}`}>
          <Button className="w-full transition-smooth"><MessageSquare className="h-4 w-4 mr-2" />Open chat</Button>
        </Link>
      </div>
    </div>
  )
}
