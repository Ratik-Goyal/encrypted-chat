import Link from "next/link"
import { Button } from "@/components/ui/button"
import { MessageSquare, Shield, Blocks } from "lucide-react"

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-4xl w-full text-center space-y-8">
        <div className="space-y-4">
          <h1 className="text-5xl font-bold text-balance">Cipher</h1>
          <p className="text-xl text-muted-foreground text-balance">Encrypted Matrix messaging with an inspectable privacy receipt</p>
        </div>

        <div className="grid md:grid-cols-3 gap-4 py-12">
          <div className="p-6 rounded-lg border border-border bg-card space-y-2">
            <MessageSquare className="h-8 w-8 text-primary" />
            <h3 className="font-semibold">Encrypted Direct Rooms</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">New messages use Matrix end-to-end encryption. Contacts can verify identity with QR scanning or emoji comparison.</p>
          </div>
          <div className="p-6 rounded-lg border border-border bg-card space-y-2">
            <Shield className="h-8 w-8 text-primary" />
            <h3 className="font-semibold">Honest Retention</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">Optional expiry timers hide messages and request Matrix redaction, but cannot erase offline copies or screenshots.</p>
          </div>
          <div className="p-6 rounded-lg border border-border bg-card space-y-2">
            <Blocks className="h-8 w-8 text-primary" />
            <h3 className="font-semibold">Integrity Commitments</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">The new contract accepts batch roots only; batch proofs are not wired into the app yet</p>
          </div>
        </div>

        <div className="flex gap-4 justify-center">
          <Link href="/user">
            <Button size="lg" className="transition-smooth">
              Open Chat
            </Button>
          </Link>
          <Link href="/admin">
            <Button size="lg" variant="outline" className="transition-smooth bg-transparent">
              Admin Dashboard
            </Button>
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">
          Cipher is not production-ready. Multi-device key recovery, retention and export across Matrix, and an independent security review are still required.
        </p>
      </div>
    </div>
  )
}
