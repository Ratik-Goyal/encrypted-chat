"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { Check, CheckCheck, Download, LockKeyhole, ShieldAlert } from "lucide-react"
import { motion } from "framer-motion"
import { IntegrityReceipt } from "@/components/chat/integrity-receipt"
import { downloadEncryptedMatrixAttachment } from "@/lib/matrix"
import type { MatrixEncryptedAttachment } from "@/lib/matrix"
import type { IntegrityMetadata } from "@/lib/integrity"

interface MessageBubbleProps {
  content: string
  timestamp: string
  isOwn: boolean
  isDelivered?: boolean
  isRead?: boolean
  showDeliveryStatus?: boolean
  isEncoded?: boolean
  isLegacyRecord?: boolean
  selfDestruct?: number
  selfDestructStart?: "send" | "firstRead"
  expiresAt?: string | number | Date | null
  integrity?: IntegrityMetadata | null
  isMatrixEncrypted?: boolean
  decryptionFailureReason?: string | null
  attachment?: MatrixEncryptedAttachment
  onFirstRead?: () => void
}

export function MessageBubble({
  content,
  timestamp,
  isOwn,
  isDelivered = true,
  isRead = false,
  showDeliveryStatus = true,
  isEncoded = false,
  isLegacyRecord = false,
  selfDestruct = 0,
  selfDestructStart = "send",
  expiresAt = null,
  integrity = null,
  isMatrixEncrypted = false,
  decryptionFailureReason = null,
  attachment,
  onFirstRead,
}: MessageBubbleProps) {
  const bubbleRef = useRef<HTMLDivElement | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState("")
  const firstReadRef = useRef(onFirstRead)
  const firstReadStarted = useRef(false)

  useEffect(() => { firstReadRef.current = onFirstRead }, [onFirstRead])

  useEffect(() => {
    if (isOwn || selfDestructStart !== "firstRead" || selfDestruct <= 0 || expiresAt) return
    const element = bubbleRef.current
    if (!element) return
    let isVisible = false
    const startIfVisible = () => {
      if (isVisible && document.visibilityState === "visible" && !firstReadStarted.current) {
        firstReadStarted.current = true
        firstReadRef.current?.()
      }
    }
    const observer = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting && entry.intersectionRatio >= 0.5
      startIfVisible()
    }, { threshold: 0.5 })
    observer.observe(element)
    document.addEventListener("visibilitychange", startIfVisible)
    return () => {
      observer.disconnect()
      document.removeEventListener("visibilitychange", startIfVisible)
    }
  }, [expiresAt, isOwn, selfDestruct, selfDestructStart])

  // Historical prototype records are Base64-encoded; Matrix messages arrive decrypted by the SDK.
  const decodeMessage = (encodedContent: string) => {
    try {
      const binary = atob(encodedContent)
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
      return new TextDecoder().decode(bytes)
    } catch {
      return encodedContent // Return original if decoding fails
    }
  }

  const displayContent = isEncoded ? decodeMessage(content) : content

  const handleAttachmentDownload = async () => {
    if (!attachment || isDownloading) return
    setIsDownloading(true)
    setDownloadError("")
    try {
      const blob = await downloadEncryptedMatrixAttachment(attachment)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = safeFilename(attachment.filename)
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Could not decrypt this attachment.")
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <motion.div
      ref={bubbleRef}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.15 }}
      className={cn("flex gap-2 mb-3 group", isOwn ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "max-w-md px-4 py-2 rounded-lg transition-smooth",
          isOwn ? "bg-primary text-primary-foreground" : "bg-card border border-border text-card-foreground",
        )}
      >
        {decryptionFailureReason ? (
          <div role="status" className="flex items-start gap-2 rounded-md border border-current/20 bg-background/10 p-2 text-xs leading-relaxed">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{decryptionNotice(decryptionFailureReason)}</span>
          </div>
        ) : displayContent ? (
          <p className="text-sm leading-relaxed break-words">{displayContent}</p>
        ) : null}
        {attachment && (
          <button
            type="button"
            onClick={() => void handleAttachmentDownload()}
            disabled={isDownloading}
            className="my-1 inline-flex max-w-full items-center gap-2 rounded border border-current/20 px-3 py-2 text-left text-sm hover:bg-background/10 disabled:opacity-60"
            aria-label={`${isDownloading ? "Decrypting" : "Download encrypted file"}: ${safeFilename(attachment.filename)}`}
          >
            <Download className="h-4 w-4 shrink-0" />
            <span className="min-w-0 truncate">{isDownloading ? "Decrypting file..." : safeFilename(attachment.filename)}</span>
            <span className="shrink-0 text-xs opacity-70">{formatFileSize(attachment.size)}</span>
          </button>
        )}
        {downloadError && <p role="alert" className="mt-1 text-xs text-destructive">{downloadError}</p>}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs opacity-70">{timestamp}</span>
          {selfDestruct > 0 && (
            <span className="text-xs opacity-70">
              {expiresAt
                ? "Timer active"
                : selfDestructStart === "firstRead" ? "Timer starts on first read" : "Disappears soon"}
            </span>
          )}
          {isEncoded && <span className="text-[10px] font-medium opacity-70">Legacy · not encrypted</span>}
          {!isEncoded && decryptionFailureReason && <span className="inline-flex items-center gap-1 text-[10px] opacity-80"><ShieldAlert className="h-3 w-3" />Encrypted · unavailable</span>}
          {!isEncoded && !decryptionFailureReason && isMatrixEncrypted && <LockKeyhole className="h-3 w-3 opacity-70" aria-label="End-to-end encrypted by Matrix" />}
          {!isEncoded && !decryptionFailureReason && !isMatrixEncrypted && <span className="inline-flex items-center gap-1 text-[10px] text-warning"><ShieldAlert className="h-3 w-3" />Not end-to-end encrypted</span>}
          {isLegacyRecord && <span className="text-xs opacity-70" title="Historical chain record; not an identity or privacy proof">Legacy chain record</span>}
          {isOwn && showDeliveryStatus && (
            <span className="ml-auto">
              {isRead ? (
                <CheckCheck className="h-3 w-3 text-success" />
              ) : isDelivered ? (
                <CheckCheck className="h-3 w-3 opacity-50" />
              ) : (
                <Check className="h-3 w-3 opacity-50" />
              )}
            </span>
          )}
        </div>
        {integrity && <IntegrityReceipt message={displayContent} metadata={integrity} />}
      </div>
    </motion.div>
  )
}

function decryptionNotice(reason: string) {
  if (reason === "UNSIGNED_SENDER_DEVICE" || reason === "UNKNOWN_SENDER_DEVICE") {
    return "Matrix blocked this encrypted message because the sender device is not cross-signed. Open the encryption panel above and start identity verification with the sender using QR or matching emoji in person or through another trusted channel. If they added a device, they must restore their existing Matrix recovery key and cross-sign it from a trusted session. Cipher retries blocked messages after verification; refresh if one remains unavailable."
  }
  if (reason === "SENDER_IDENTITY_PREVIOUSLY_VERIFIED") {
    return "Cipher withheld this message because the sender's previously verified identity changed. Confirm the new identity with the sender before continuing."
  }
  return "This encrypted message could not be decrypted on this device. Restore its Matrix key backup or ask the sender to share the key from a trusted device."
}

function safeFilename(filename: string) {
  return Array.from(filename, (character) => {
    const code = character.charCodeAt(0)
    return character === "/" || character === "\\" || code < 32 || code === 127 ? "_" : character
  }).join("").slice(0, 255) || "encrypted-attachment"
}

function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "File"
  return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`
}
