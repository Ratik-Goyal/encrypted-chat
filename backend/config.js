const path = require("path")
require("dotenv").config({ path: path.resolve(__dirname, "../.env") })

const parseCorsOrigin = (origin) => {
  return (origin || "http://localhost:3000").split(",").map((value) => value.trim()).filter(Boolean)
}

const isProduction = () => process.env.NODE_ENV === "production"
const isDevelopment = () => process.env.NODE_ENV === "development"
const boundedInteger = (value, fallback, minimum, maximum) => {
  const parsed = Number(value)
  return Number.isInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback
}
const jwtSecret = process.env.JWT_SECRET || (isProduction() ? "" : "cipher-dev-only-secret-not-for-production")
const mongoUri = process.env.MONGODB_URI
const corsOrigin = parseCorsOrigin(process.env.CORS_ORIGIN)
const socketIoAdapter = process.env.SOCKET_IO_ADAPTER || "memory"

if (corsOrigin.includes("*")) {
  throw new Error("CORS_ORIGIN must list explicit browser origins, such as http://localhost:3000. Wildcards cannot be used with cookie authentication.")
}

if (!["memory", "mongo"].includes(socketIoAdapter)) {
  throw new Error("SOCKET_IO_ADAPTER must be either memory or mongo")
}

if (isProduction()) {
  if (!mongoUri) throw new Error("MONGODB_URI is required in production")
  if (Buffer.byteLength(jwtSecret, "utf8") < 32) throw new Error("JWT_SECRET must be at least 32 bytes in production")
  if (["cipher-dev-only-secret-not-for-production", "replace-with-a-random-secret-of-at-least-32-characters"].includes(jwtSecret)) {
    throw new Error("JWT_SECRET must be generated for this deployment")
  }
  if (!process.env.CORS_ORIGIN || corsOrigin.length === 0) throw new Error("CORS_ORIGIN is required in production")
  for (const origin of corsOrigin) {
    let parsedOrigin
    try {
      parsedOrigin = new URL(origin)
    } catch {
      throw new Error("CORS_ORIGIN must contain valid HTTPS origins")
    }
    if (parsedOrigin.protocol !== "https:" || parsedOrigin.origin !== origin) {
      throw new Error("CORS_ORIGIN must contain valid HTTPS origins only")
    }
  }
}

module.exports = {
  port: Number(process.env.PORT || 3001),
  mongoUri,
  corsOrigin,
  jwtSecret,
  adminBootstrapEmail: process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase(),
  adminBootstrapPassword: process.env.ADMIN_BOOTSTRAP_PASSWORD,
  blockchainRpc: process.env.BLOCKCHAIN_RPC,
  blockchainContractAddress: process.env.BLOCKCHAIN_CONTRACT_ADDRESS,
  blockchainPrivateKey: process.env.BLOCKCHAIN_PRIVATE_KEY,
  blockchainChainId: boundedInteger(process.env.BLOCKCHAIN_CHAIN_ID, 0, 0, Number.MAX_SAFE_INTEGER) || null,
  blockchainConfirmations: boundedInteger(process.env.BLOCKCHAIN_CONFIRMATIONS, 1, 1, 64),
  integrityBatchIntervalMs: boundedInteger(process.env.INTEGRITY_BATCH_INTERVAL_MS, 30_000, 10_000, 3_600_000),
  integrityMaxBatchWaitMs: boundedInteger(process.env.INTEGRITY_MAX_BATCH_WAIT_MS, 300_000, 30_000, 86_400_000),
  integrityBatchSize: boundedInteger(process.env.INTEGRITY_BATCH_SIZE, 128, 1, 256),
  trustProxyHops: boundedInteger(process.env.TRUST_PROXY_HOPS, 0, 0, 16),
  socketIoAdapter,
  environment: process.env.NODE_ENV || "development",
  isProduction,
  isDevelopment,
}
