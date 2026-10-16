import { NextRequest, NextResponse } from "next/server"

function configuredOrigin(value: string | undefined) {
  if (!value) return undefined
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : undefined
  } catch {
    return undefined
  }
}

function websocketOrigin(origin: string | undefined) {
  if (!origin) return undefined
  const url = new URL(origin)
  return `${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64")
  const isDevelopment = process.env.NODE_ENV === "development"
  const socketOrigin = configuredOrigin(process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001")
  const matrixOrigin = configuredOrigin(process.env.NEXT_PUBLIC_MATRIX_HOMESERVER_URL)
  const connectSources = [
    "'self'",
    socketOrigin,
    websocketOrigin(socketOrigin),
    matrixOrigin,
  ].filter(Boolean).join(" ")
  const imageSources = ["'self'", "data:", "blob:", matrixOrigin].filter(Boolean).join(" ")
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imageSources}`,
    "font-src 'self' data:",
    `connect-src ${connectSources}`,
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(process.env.NODE_ENV === "production" ? ["upgrade-insecure-requests"] : []),
  ].join("; ")

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set("Content-Security-Policy", csp)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set("Content-Security-Policy", csp)
  response.headers.set("Cache-Control", "private, no-store")
  return response
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
}
