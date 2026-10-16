"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { FileText, LoaderCircle, LockKeyhole, Paperclip, Send, X } from "lucide-react"
import { SelfDestructSelector } from "@/components/chat/self-destruct-selector"
import { MATRIX_ATTACHMENT_MAX_BYTES, MATRIX_ATTACHMENT_MAX_MB } from "@/lib/matrix"
import type { MatrixExpirySettings } from "@/lib/matrix"

interface MessageInputProps {
  userId: string
  isReady: boolean
  onSendMessage?: (message: string, messageId: string, expiry: MatrixExpirySettings | null) => Promise<void>
  onSendAttachment?: (file: File, caption: string, messageId: string, expiry: MatrixExpirySettings | null) => Promise<void>
  onTyping?: (isTyping: boolean) => void
}

interface FailedDraft {
  userId: string
  message: string
  messageId: string
  file: File | null
  expiry: MatrixExpirySettings | null
  error: string
}

export function MessageInput({ userId, isReady, onSendMessage, onSendAttachment, onTyping }: MessageInputProps) {
  const [message, setMessage] = useState("")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [messageId, setMessageId] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [sendError, setSendError] = useState("")
  const [failedDraft, setFailedDraft] = useState<FailedDraft | null>(null)
  const [selectedTime, setSelectedTime] = useState<number | null>(null)
  const [selectedStart, setSelectedStart] = useState<"send" | "firstRead">("send")
  const typingTimeout = useRef<number | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const isTyping = useRef(false)
  const sending = useRef(false)
  const activeUserId = useRef(userId)
  activeUserId.current = userId

  useEffect(() => () => {
    if (typingTimeout.current !== null) window.clearTimeout(typingTimeout.current)
    isTyping.current = false
    onTyping?.(false)
  }, [onTyping])

  useEffect(() => {
    setMessage("")
    setSelectedFile(null)
    setMessageId("")
    isTyping.current = false
    setSendError("")
    setFailedDraft(null)
    setSelectedTime(null)
    setSelectedStart("send")
  }, [userId])

  const handleMessageChange = (value: string) => {
    setMessage(value)
    setMessageId(value ? crypto.randomUUID() : "")
    setSendError("")
    if (!userId || !onTyping) return
    const typing = value.trim().length > 0
    if (typing !== isTyping.current) {
      isTyping.current = typing
      onTyping(typing)
    }
    if (typingTimeout.current !== null) window.clearTimeout(typingTimeout.current)
    if (value.trim()) {
      typingTimeout.current = window.setTimeout(() => {
        isTyping.current = false
        onTyping(false)
      }, 1200)
    }
  }

  const sendDraft = async (draft: Pick<FailedDraft, "message" | "messageId" | "file" | "expiry">) => {
    if (draft.file) {
      if (!onSendAttachment) throw new Error("File attachments are unavailable in this conversation.")
      await onSendAttachment(draft.file, draft.message, draft.messageId, draft.expiry)
    } else {
      if (!onSendMessage) throw new Error("Message sending is unavailable in this conversation.")
      await onSendMessage(draft.message, draft.messageId, draft.expiry)
    }
  }

  const handleSend = async () => {
    if (sending.current || failedDraft || !(message.trim() || selectedFile) || !userId || !isReady) return
    const draft = {
      userId,
      message,
      messageId: messageId || crypto.randomUUID(),
      file: selectedFile,
      expiry: selectedTime === null ? null : { seconds: selectedTime, starts: selectedStart },
    }

    sending.current = true
    setIsSending(true)
    setSendError("")
    setMessage("")
    setSelectedFile(null)
    setMessageId("")
    if (typingTimeout.current !== null) window.clearTimeout(typingTimeout.current)
    isTyping.current = false
    onTyping?.(false)

    try {
      await sendDraft(draft)
    } catch (error) {
      if (activeUserId.current === draft.userId) {
        setFailedDraft({
          ...draft,
          error: error instanceof Error ? error.message : "Could not send message. Try again.",
        })
      }
    } finally {
      sending.current = false
      setIsSending(false)
    }
  }

  const retryFailedDraft = async () => {
    const draft = failedDraft
    if (!draft || sending.current || draft.userId !== userId || !isReady) return
    sending.current = true
    setFailedDraft(null)
    setIsSending(true)
    try {
      await sendDraft(draft)
      setSendError("")
    } catch (error) {
      if (activeUserId.current === draft.userId) {
        setFailedDraft({
          ...draft,
          error: error instanceof Error ? error.message : "Could not send message. Try again.",
        })
      }
    } finally {
      sending.current = false
      setIsSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!userId) {
    return (
      <div className="border-t border-border p-4 bg-card">
        <div className="flex items-center justify-center h-12 text-muted-foreground text-sm">
          Select a conversation to start messaging
        </div>
      </div>
    )
  }

  return (
    <div className="border-t border-border p-4 bg-card">
      <SelfDestructSelector
        selectedTime={selectedTime}
        onSelect={setSelectedTime}
        selectedStart={selectedStart}
        onStartSelect={setSelectedStart}
      />
      <div className="flex items-end gap-2">
        <input
          ref={fileInput}
          type="file"
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose an encrypted attachment"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ""
            if (!file) return
            if (file.size <= 0 || file.size > MATRIX_ATTACHMENT_MAX_BYTES) {
              setSendError(`Choose a file between 1 byte and ${MATRIX_ATTACHMENT_MAX_MB} MB.`)
              return
            }
            setSendError("")
            setSelectedFile(file)
            if (!messageId) setMessageId(crypto.randomUUID())
          }}
        />
        <Button
          variant="outline"
          size="icon"
          aria-label="Attach a file"
          title={`Attach an end-to-end encrypted file (${MATRIX_ATTACHMENT_MAX_MB} MB max)`}
          onClick={() => fileInput.current?.click()}
          disabled={isSending || !isReady}
          className="h-12 w-12 shrink-0"
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <div className="flex-1 relative">
          <Textarea
            value={message}
            onChange={(e) => handleMessageChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="min-h-12 max-h-32 resize-none bg-background"
            rows={1}
            disabled={!isReady}
            aria-label={selectedFile ? "Optional file caption" : "Message"}
          />
        </div>
        <Button onClick={handleSend} disabled={(!message.trim() && !selectedFile) || isSending || Boolean(failedDraft) || !isReady} className="transition-smooth h-12">
          {isSending ? <LoaderCircle className="mr-2 h-5 w-5 animate-spin" /> : <Send className="h-5 w-5 mr-2" />}
          {isSending ? "Sending..." : selectedFile ? "Send file" : "Send"}
        </Button>
      </div>
      {selectedFile && (
        <div className="mt-2 flex items-center gap-2 rounded border border-border bg-background px-3 py-2 text-xs">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate" title={selectedFile.name}>{selectedFile.name} · {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB</span>
          <Button variant="ghost" size="icon" aria-label="Remove attachment" onClick={() => setSelectedFile(null)} disabled={isSending} className="h-7 w-7 shrink-0">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      {failedDraft?.userId === userId && (
        <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
          <span className="min-w-0 flex-1">Message not sent. Your {failedDraft.file ? "file" : "message"} is saved here. {failedDraft.error}</span>
          <Button variant="outline" size="sm" disabled={isSending || !isReady} onClick={() => void retryFailedDraft()}>Retry</Button>
          <Button variant="ghost" size="sm" disabled={isSending} onClick={() => { setFailedDraft(null); setSendError("") }}>Discard</Button>
        </div>
      )}
      {sendError && !failedDraft && <p role="alert" className="mt-2 text-xs text-destructive">{sendError}</p>}
      {isSending && <p role="status" aria-live="polite" className="mt-2 text-xs text-muted-foreground">Sending over Matrix encryption. You can keep writing while it finishes.</p>}
      <div className="flex items-center justify-end gap-2 mt-2 text-xs text-muted-foreground">
        {isReady ? <LockKeyhole className="h-3.5 w-3.5 text-success" /> : <div className="h-1.5 w-1.5 rounded-full bg-warning" />}
        <span>{isReady ? "Encrypted by Matrix for this conversation" : "Connect to an encrypted Matrix room before sending"}</span>
      </div>
    </div>
  )
}
