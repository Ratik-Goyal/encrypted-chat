"use client"

import { io, type Socket } from "socket.io-client"

let socket: Socket | null = null

export const getSocket = () => {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001", {
      autoConnect: true,
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    })

    socket.on("connect_error", (error) => {
      if (error.message !== "Authentication failed" || typeof window === "undefined") return
      localStorage.removeItem("cipher-token")
      localStorage.removeItem("cipher-user")
      if (window.location.pathname === "/login" || window.location.pathname === "/register" || window.location.pathname === "/admin/login") return
      window.location.assign(window.location.pathname.startsWith("/admin") ? "/admin/login" : "/login")
    })

  }

  return socket
}

export const authenticateSocket = () => {
  const currentSocket = getSocket()
  currentSocket.auth = {}
  currentSocket.disconnect()
  currentSocket.connect()
}

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
