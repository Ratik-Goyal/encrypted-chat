import type { ReactNode } from "react"
import { AdminAuthGate } from "@/components/admin/admin-auth-gate"

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminAuthGate>{children}</AdminAuthGate>
}
