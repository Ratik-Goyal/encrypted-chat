import { useCallback, useState } from "react"
import { LockKeyhole, ShieldAlert } from "lucide-react"
import { IdentityVerification } from "@/components/chat/identity-verification"
import { MATRIX_ATTACHMENT_MAX_MB } from "@/lib/matrix"

interface PrivacyReceiptProps {
  roomEncrypted: boolean
  connectionUnavailable?: boolean
  needsIdentityVerification?: boolean
  peerUserId?: string
  roomId?: string
}

export function PrivacyReceipt({ roomEncrypted, connectionUnavailable = false, needsIdentityVerification = false, peerUserId = "", roomId = "" }: PrivacyReceiptProps) {
  const [securityAlert, setSecurityAlert] = useState<{ identity: string; message: string } | null>(null)
  const identity = `${peerUserId}:${roomId}`
  const onSecurityAlert = useCallback((message: string | null) => {
    setSecurityAlert(message ? { identity, message } : null)
  }, [identity])

  return (
    <div className="mb-5 space-y-2">
      {roomEncrypted && securityAlert?.identity === identity && (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {securityAlert.message}
        </div>
      )}
      <details open={roomEncrypted && needsIdentityVerification} className={`rounded-lg border p-4 ${roomEncrypted ? "border-success/30 bg-success/5" : "border-warning/30 bg-warning/5"}`}>
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium">
        {roomEncrypted ? <LockKeyhole className="h-4 w-4 text-success" /> : <ShieldAlert className="h-4 w-4 text-warning" />}
        {roomEncrypted
          ? "Matrix end-to-end encryption active"
          : connectionUnavailable
            ? "Matrix room status unavailable"
            : "Matrix room encryption not verified"}
      </summary>
      {!roomEncrypted ? (
        <p className="mt-3 text-sm text-muted-foreground">
          {connectionUnavailable
            ? "Cipher is not connected to Matrix, so it cannot check this room's encryption state. Sending is paused until the Matrix session reconnects."
            : "Cipher could not confirm that this room uses the required Matrix encryption. Sending is paused."}
        </p>
      ) : (
      <>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium">Message content</dt>
          <dd className="text-muted-foreground">Matrix encrypts messages on this device before they leave it. Cipher's app backend does not receive new message bodies.</dd>
        </div>
        <div>
          <dt className="font-medium">Trusted devices</dt>
          <dd className="text-muted-foreground">Cipher shares room keys with cross-signed Matrix devices and accepts messages only from those devices. A new or unsigned device may not decrypt messages until its owner verifies and cross-signs it.</dd>
        </div>
        <div>
          <dt className="font-medium">File attachments</dt>
          <dd className="text-muted-foreground">Files up to {MATRIX_ATTACHMENT_MAX_MB} MB are encrypted on this device before upload, and Cipher checks the ciphertext hash before decrypting a download. The homeserver can see upload timing and size; message expiry redacts the room event but cannot guarantee removal of the uploaded media or its backups.</dd>
        </div>
        <div>
          <dt className="font-medium">Homeserver metadata</dt>
          <dd className="text-muted-foreground">The Matrix homeserver can see room members, event timing, encrypted payload sizes, and connection metadata.</dd>
        </div>
        <div>
          <dt className="font-medium">Contact identity</dt>
          <dd className="text-muted-foreground">A matching Matrix username does not prove who owns the account. Verify by scanning a QR code in person or comparing the emoji code through a separate trusted channel. Cipher blocks sends while Matrix reports a changed identity that still needs approval.</dd>
          {roomEncrypted && peerUserId && roomId && <IdentityVerification key={identity} peerUserId={peerUserId} roomId={roomId} onSecurityAlert={onSecurityAlert} />}
        </div>
        <div>
          <dt className="font-medium">Expiry and older messages</dt>
          <dd className="text-muted-foreground">Optional Matrix expiry timers hide messages in Cipher and request room redaction. Offline devices, screenshots, copied text, and homeserver backups can retain data. Older prototype messages are labeled; the Cipher server could read them.</dd>
        </div>
        <div>
          <dt className="font-medium">Public-chain proof</dt>
          <dd className="text-muted-foreground">No messages or participants are submitted to or proven by a public chain.</dd>
        </div>
        <div>
          <dt className="font-medium">Recovery</dt>
          <dd className="text-muted-foreground">Matrix encrypted key backup is enabled after you save your one-time recovery key.</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">Encryption cannot prevent screenshots, copied text, compromised devices, or metadata collection by the homeserver.</p>
      </>
      )}
      </details>
    </div>
  )
}
