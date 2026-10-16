"use client"

import { Button } from "@/components/ui/button"
import { Timer } from "lucide-react"
import { cn } from "@/lib/utils"

interface SelfDestructSelectorProps {
  selectedTime: number | null
  onSelect: (seconds: number | null) => void
  selectedStart: "send" | "firstRead"
  onStartSelect: (start: "send" | "firstRead") => void
}

const timeOptions = [
  { label: "10 sec", value: 10 },
  { label: "30 sec", value: 30 },
  { label: "1 min", value: 60 },
  { label: "5 min", value: 300 },
]

export function SelfDestructSelector({ selectedTime, onSelect, selectedStart, onStartSelect }: SelfDestructSelectorProps) {
  return (
    <div className={cn("mb-2 rounded-md border px-3 py-2", selectedTime !== null && "border-warning/40 bg-warning/5")}>
      <div className="flex flex-wrap items-center gap-2">
        <Timer className={cn("h-4 w-4", selectedTime !== null ? "text-warning" : "text-muted-foreground")} />
        <label htmlFor="message-expiry" className="text-xs font-medium">Message expiry</label>
        <select
          id="message-expiry"
          value={selectedTime ?? ""}
          onChange={(event) => onSelect(event.target.value ? Number(event.target.value) : null)}
          className="rounded-md border bg-background px-2 py-1 text-xs"
        >
          <option value="">Off</option>
          {timeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
      {selectedTime !== null && (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">Timer starts:</span>
            <Button variant={selectedStart === "send" ? "default" : "outline"} size="sm" onClick={() => onStartSelect("send")}>When sent</Button>
            <Button variant={selectedStart === "firstRead" ? "default" : "outline"} size="sm" onClick={() => onStartSelect("firstRead")}>When first opened</Button>
          </div>
          <p className="text-[11px] text-muted-foreground">Best effort: Cipher hides the message and requests Matrix redaction when the timer ends. Copies, screenshots, offline devices, and homeserver backups may remain.</p>
        </div>
      )}
    </div>
  )
}
