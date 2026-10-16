"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { Timer, Flame } from "lucide-react"

interface SelfDestructMessageProps {
  content: string
  timestamp: string
  isOwn: boolean
  destructTime: number // in seconds
  onDestruct?: () => void
}

export function SelfDestructMessage({ content, timestamp, isOwn, destructTime, onDestruct }: SelfDestructMessageProps) {
  const [timeLeft, setTimeLeft] = useState(destructTime)
  const [isDestructing, setIsDestructing] = useState(false)

  useEffect(() => {
    if (timeLeft <= 0) {
      setIsDestructing(true)
      setTimeout(() => {
        onDestruct?.()
      }, 600)
      return
    }

    const interval = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1))
    }, 1000)

    return () => clearInterval(interval)
  }, [timeLeft, onDestruct])

  const progress = (timeLeft / destructTime) * 100

  if (isDestructing) {
    return (
      <motion.div
        initial={{ opacity: 1, scale: 1 }}
        animate={{ opacity: 0, scale: 0.8 }}
        transition={{ duration: 0.6 }}
        className={cn("flex gap-2 mb-3", isOwn ? "justify-end" : "justify-start")}
      >
        <div
          className={cn(
            "max-w-md px-4 py-2 rounded-lg relative overflow-hidden",
            isOwn ? "bg-primary text-primary-foreground" : "bg-card border border-border",
          )}
        >
          <Flame className="h-6 w-6 text-warning animate-pulse" />
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className={cn("flex gap-2 mb-3", isOwn ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "max-w-md px-4 py-2 rounded-lg relative overflow-hidden",
          isOwn ? "bg-primary text-primary-foreground" : "bg-card border border-border text-card-foreground",
          timeLeft <= 5 && "ring-2 ring-warning animate-pulse",
        )}
      >
        {/* Progress bar background */}
        <div
          className="absolute inset-0 bg-destructive/20 transition-all duration-1000"
          style={{ width: `${progress}%` }}
        />

        <div className="relative">
          <p className="text-sm leading-relaxed break-words">{content}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs opacity-70">{timestamp}</span>
            <div className="flex items-center gap-1">
              <Timer className="h-3 w-3" />
              <span className={cn("text-xs font-mono", timeLeft <= 5 && "text-warning font-semibold")}>
                {timeLeft}s
              </span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
