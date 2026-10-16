"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { LayoutDashboard, Users, Blocks, Activity, ArrowLeft, LogOut } from "lucide-react"
import { disconnectSocket } from "@/lib/socket"

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/blockchain", label: "Blockchain", icon: Blocks },
  { href: "/admin/analytics", label: "Analytics", icon: Activity },
]

export function AdminNav() {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001"}/api/me/logout`, {
        method: "POST",
        credentials: "include",
      })
    } catch {
      // Clear the local session even when the server cannot be reached.
    } finally {
      localStorage.removeItem("cipher-token")
      localStorage.removeItem("cipher-user")
      localStorage.removeItem("cipher-admin-token")
      disconnectSocket()
      router.replace("/admin/login")
    }
  }

  return (
    <div className="border-b border-border bg-card sticky top-0 z-50">
      <div className="px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="transition-smooth">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <span className="font-bold text-lg">Cipher Admin</span>
          </Link>

          <nav className="flex items-center gap-1">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href}>
                <Button
                  variant="ghost"
                  className={cn("transition-smooth", pathname === item.href && "bg-accent text-accent-foreground")}
                >
                  <item.icon className="h-4 w-4 mr-2" />
                  {item.label}
                </Button>
              </Link>
            ))}
          </nav>
        </div>

        <Button variant="ghost" className="transition-smooth" onClick={handleLogout}>
          <LogOut className="h-4 w-4 mr-2" />
          Sign out
        </Button>
      </div>
    </div>
  )
}
