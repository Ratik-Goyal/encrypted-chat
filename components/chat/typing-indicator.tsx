"use client"

import { motion } from "framer-motion"

export function TypingIndicator() {
  return (
    <div className="flex gap-2 items-center px-4 py-2 max-w-min rounded-lg bg-card border border-border">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="h-2 w-2 rounded-full bg-muted-foreground"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 1,
            repeat: Number.POSITIVE_INFINITY,
            delay: i * 0.15,
          }}
        />
      ))}
    </div>
  )
}
