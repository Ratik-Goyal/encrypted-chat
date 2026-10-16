"use client"

import { useEffect, useState, type ReactNode } from "react"
import { usePathname, useRouter } from "next/navigation"

export function AdminAuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    let active = true
    if (pathname === "/admin/login") {
      setAllowed(true)
      return () => { active = false }
    }

    setAllowed(false)
    void fetch(`${process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001"}/api/me`, {
      credentials: "include",
      cache: "no-store",
    }).then(async (response) => {
      if (!response.ok) throw new Error("Session required")
      const user = await response.json()
      if (!active) return
      if (user.role !== "admin") throw new Error("Admin access required")
      localStorage.setItem("cipher-user", JSON.stringify(user))
      localStorage.removeItem("cipher-token")
      setAllowed(true)
    }).catch(() => {
      if (!active) return
      localStorage.removeItem("cipher-user")
      localStorage.removeItem("cipher-token")
      router.replace("/admin/login")
    })
    return () => { active = false }
  }, [pathname, router])

  return allowed ? children : null
}
