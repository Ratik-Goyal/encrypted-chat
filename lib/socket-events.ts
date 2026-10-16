import type { Socket } from "socket.io-client"
import { isSocketEventPayload } from "@/shared/socket-events.cjs"
import type { SocketEventName, SocketEventPayloads } from "@/shared/socket-events.cjs"

type RuntimeSocketListener = (...args: unknown[]) => void
type RuntimeSocket = {
  on: (event: string, listener: RuntimeSocketListener) => unknown
  off: (event: string, listener: RuntimeSocketListener) => unknown
}

export function onSocketEvent<K extends SocketEventName>(
  socket: Socket,
  event: K,
  handler: (payload: SocketEventPayloads[K]) => void,
) {
  const listener = (...args: unknown[]) => {
    const [payload] = args
    if (!isSocketEventPayload(event, payload)) {
      if (process.env.NODE_ENV !== "production") console.warn(`Ignored malformed Socket.IO event: ${event}`)
      return
    }
    handler(payload)
  }
  const runtimeSocket = socket as unknown as RuntimeSocket
  runtimeSocket.on(event, listener)
  return () => runtimeSocket.off(event, listener)
}
