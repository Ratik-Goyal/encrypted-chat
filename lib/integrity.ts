export const MATRIX_INTEGRITY_KEY = "com.cipher.integrity"

export interface IntegrityMetadata {
  version: 1
  algorithm: "sha-256+cipher-merkle-v1"
  salt: string
  commitment: string
}

export interface IntegrityReceipt {
  status: "anchored"
  commitment: string
  proof: string[]
  root: string
  leafCount: number
  batchId: number
  transactionHash: string
  blockNumber: number
  chainId: number
  contractAddress: string
}

export type IntegrityLookup =
  | { status: "not-found" }
  | { status: "queued" }
  | { status: "anchored"; receipt: IntegrityReceipt }

export type OnChainVerification = "verified" | "invalid" | "pending" | "unavailable"

const MESSAGE_DOMAIN = new TextEncoder().encode("cipher-message-integrity-v1\0")

function toHex(bytes: Uint8Array) {
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`
}

function fromHex(value: string) {
  if (!/^0x[0-9a-f]{64}$/i.test(value)) throw new Error("Invalid integrity commitment")
  return Uint8Array.from(value.slice(2).match(/.{2}/g) || [], (byte) => Number.parseInt(byte, 16))
}

function toBase64(bytes: Uint8Array) {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))
}

function fromBase64(value: string) {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function concatBytes(...parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0))
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

async function sha256(bytes: Uint8Array) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource))
}

export async function createIntegrityMetadata(message: string): Promise<IntegrityMetadata> {
  const salt = crypto.getRandomValues(new Uint8Array(32))
  const commitment = await sha256(concatBytes(MESSAGE_DOMAIN, salt, new TextEncoder().encode(message)))
  return {
    version: 1,
    algorithm: "sha-256+cipher-merkle-v1",
    salt: toBase64(salt),
    commitment: toHex(commitment),
  }
}

export function parseIntegrityMetadata(value: unknown): IntegrityMetadata | null {
  if (!value || typeof value !== "object") return null
  const candidate = value as Partial<IntegrityMetadata>
  if (candidate.version !== 1 || candidate.algorithm !== "sha-256+cipher-merkle-v1" ||
    typeof candidate.salt !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(candidate.salt) || typeof candidate.commitment !== "string" ||
    !/^0x[0-9a-f]{64}$/i.test(candidate.commitment)) return null
  try {
    if (fromBase64(candidate.salt).length !== 32) return null
  } catch {
    return null
  }
  return candidate as IntegrityMetadata
}

export async function verifyMessageIntegrity(message: string, metadata: IntegrityMetadata) {
  const computed = await sha256(concatBytes(
    MESSAGE_DOMAIN,
    fromBase64(metadata.salt),
    new TextEncoder().encode(message),
  ))
  return toHex(computed) === metadata.commitment.toLowerCase()
}

function leafHash(commitment: string) {
  return sha256(concatBytes(new Uint8Array([0]), fromHex(commitment)))
}

async function parentHash(left: Uint8Array, right: Uint8Array) {
  const [first, second] = compareBytes(left, right) <= 0 ? [left, right] : [right, left]
  return sha256(concatBytes(new Uint8Array([1]), first, second))
}

function compareBytes(left: Uint8Array, right: Uint8Array) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index]
  }
  return 0
}

export async function verifyMerkleProof(commitment: string, siblings: string[], root: string) {
  if (!Array.isArray(siblings) || siblings.length > 32) return false
  try {
    let node = await leafHash(commitment)
    for (const sibling of siblings) node = await parentHash(node, fromHex(sibling))
    return toHex(node) === root.toLowerCase()
  } catch {
    return false
  }
}

// Selectors and event topic are Keccak hashes of declarations in IntegrityCommitments.sol.
const BATCHES_SELECTOR = "0xb32c4d8d" // batches(uint256)
const TOTAL_BATCHES_SELECTOR = "0x69ff6abb" // totalBatches()
const BATCH_COMMITTED_TOPIC = "0x13216a7e95ea1c32585e7edf18b75e811bebd43799cd79101789ce18172ab1b8" // BatchCommitted(uint256,bytes32,uint32,uint64)
const chainVerificationCache = new Map<string, { checkedAt: number; result: Promise<OnChainVerification> }>()

export function verifyAnchoredBatchOnChain(receipt: IntegrityReceipt): Promise<OnChainVerification> {
  const key = [
    process.env.NEXT_PUBLIC_BLOCKCHAIN_READ_RPC_URL,
    process.env.NEXT_PUBLIC_BLOCKCHAIN_CONTRACT_ADDRESS?.toLowerCase(),
    process.env.NEXT_PUBLIC_BLOCKCHAIN_CHAIN_ID,
    process.env.NEXT_PUBLIC_BLOCKCHAIN_CONFIRMATIONS || "1",
    receipt.chainId,
    receipt.contractAddress.toLowerCase(),
    receipt.batchId,
    receipt.root.toLowerCase(),
    receipt.leafCount,
    receipt.transactionHash.toLowerCase(),
    receipt.blockNumber,
  ].join(":")
  const cached = chainVerificationCache.get(key)
  if (cached && Date.now() - cached.checkedAt < 30_000) return cached.result

  const entry = { checkedAt: Date.now(), result: verifyAnchoredBatchOnChainUncached(receipt) }
  chainVerificationCache.set(key, entry)
  if (chainVerificationCache.size > 128) {
    const oldest = chainVerificationCache.keys().next().value
    if (oldest) chainVerificationCache.delete(oldest)
  }
  void entry.result.then((result) => {
    if (chainVerificationCache.get(key) !== entry) return
    if (result === "unavailable") chainVerificationCache.delete(key)
    else entry.checkedAt = Date.now() - (result === "pending" ? 25_000 : 0)
  })
  return entry.result
}

async function callReadRpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    signal: AbortSignal.timeout(12_000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  })
  if (!response.ok) throw new Error("Read-only chain RPC request failed")
  const result = await response.json() as { result?: T; error?: unknown }
  if (result.error || result.result === undefined) throw new Error("Read-only chain RPC returned an error")
  return result.result
}

function rpcQuantity(value: string) {
  if (!/^0x[0-9a-f]+$/i.test(value)) throw new Error("Invalid chain quantity")
  return BigInt(value)
}

function decodeWord(value: string, index: number) {
  if (!/^0x[0-9a-f]+$/i.test(value)) throw new Error("Invalid contract result")
  const words = value.slice(2)
  const start = index * 64
  if (words.length < start + 64) throw new Error("Incomplete contract result")
  return words.slice(start, start + 64).toLowerCase()
}

async function verifyAnchoredBatchOnChainUncached(receipt: IntegrityReceipt): Promise<OnChainVerification> {
  const rpcUrl = process.env.NEXT_PUBLIC_BLOCKCHAIN_READ_RPC_URL
  const contractAddress = process.env.NEXT_PUBLIC_BLOCKCHAIN_CONTRACT_ADDRESS
  const configuredChainId = Number(process.env.NEXT_PUBLIC_BLOCKCHAIN_CHAIN_ID)
  const requiredConfirmations = Number(process.env.NEXT_PUBLIC_BLOCKCHAIN_CONFIRMATIONS || "1")
  if (!rpcUrl || !contractAddress || !Number.isSafeInteger(configuredChainId) || configuredChainId < 1 ||
    !Number.isSafeInteger(requiredConfirmations) || requiredConfirmations < 1 || requiredConfirmations > 100_000) {
    return "unavailable"
  }
  try {
    const parsedRpcUrl = new URL(rpcUrl)
    if (!["https:", "http:"].includes(parsedRpcUrl.protocol) || (process.env.NODE_ENV === "production" && parsedRpcUrl.protocol !== "https:")) {
      return "unavailable"
    }
  } catch {
    return "unavailable"
  }
  if (!/^0x[0-9a-f]{40}$/i.test(contractAddress) || !/^0x[0-9a-f]{40}$/i.test(receipt.contractAddress) ||
    !/^0x[0-9a-f]{64}$/i.test(receipt.transactionHash) || !/^0x[0-9a-f]{64}$/i.test(receipt.root) ||
    !Number.isSafeInteger(receipt.batchId) || receipt.batchId < 0 || !Number.isSafeInteger(receipt.leafCount) || receipt.leafCount < 1 ||
    receipt.leafCount > 0xffffffff || !Number.isSafeInteger(receipt.blockNumber) || receipt.blockNumber < 0) return "invalid"
  if (receipt.chainId !== configuredChainId || receipt.contractAddress.toLowerCase() !== contractAddress.toLowerCase()) return "invalid"

  try {
    const chainId = await callReadRpc<string>(rpcUrl, "eth_chainId", [])
    const code = await callReadRpc<string>(rpcUrl, "eth_getCode", [contractAddress, "latest"])
    if (rpcQuantity(chainId) !== BigInt(configuredChainId) || !/^0x[0-9a-f]+$/i.test(code) || code.length <= 2) return "invalid"

    const batchIdArg = receipt.batchId.toString(16).padStart(64, "0")
    const [totalBatchesResult, batchResult] = await Promise.all([
      callReadRpc<string>(rpcUrl, "eth_call", [{ to: contractAddress, data: TOTAL_BATCHES_SELECTOR }, "latest"]),
      callReadRpc<string>(rpcUrl, "eth_call", [{ to: contractAddress, data: `${BATCHES_SELECTOR}${batchIdArg}` }, "latest"]),
    ])
    const totalBatches = BigInt(`0x${decodeWord(totalBatchesResult, 0)}`)
    const chainRoot = `0x${decodeWord(batchResult, 0)}`
    const chainLeafCount = BigInt(`0x${decodeWord(batchResult, 1)}`)
    if (BigInt(receipt.batchId) >= totalBatches || chainRoot !== receipt.root.toLowerCase() || chainLeafCount !== BigInt(receipt.leafCount)) return "invalid"

    const transaction = await callReadRpc<{
      status?: string
      blockNumber?: string
      blockHash?: string
      logs?: Array<{ address?: string; topics?: string[]; data?: string }>
    } | null>(rpcUrl, "eth_getTransactionReceipt", [receipt.transactionHash])
    if (!transaction?.blockNumber || !transaction.blockHash || transaction.status !== "0x1" ||
      rpcQuantity(transaction.blockNumber) !== BigInt(receipt.blockNumber)) return "invalid"
    const committedLog = transaction.logs?.find((log) => log.address?.toLowerCase() === contractAddress.toLowerCase() &&
      log.topics?.[0]?.toLowerCase() === BATCH_COMMITTED_TOPIC &&
      log.topics?.[1]?.toLowerCase() === `0x${batchIdArg}` &&
      log.topics?.[2]?.toLowerCase() === receipt.root.toLowerCase() &&
      log.data && decodeWord(log.data, 0) === receipt.leafCount.toString(16).padStart(64, "0"))
    if (!committedLog) return "invalid"

    const block = await callReadRpc<{ hash?: string } | null>(rpcUrl, "eth_getBlockByNumber", [transaction.blockNumber, false])
    if (!block?.hash || block.hash.toLowerCase() !== transaction.blockHash.toLowerCase()) return "invalid"
    const head = await callReadRpc<string>(rpcUrl, "eth_blockNumber", [])
    if (rpcQuantity(head) - rpcQuantity(transaction.blockNumber) + BigInt(1) < BigInt(requiredConfirmations)) return "pending"
    return "verified"
  } catch {
    return "unavailable"
  }
}

const backendUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001"

export async function queueIntegrityCommitment(commitment: string) {
  const response = await fetch(`${backendUrl}/api/integrity/commitments`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ commitment }),
  })
  if (!response.ok && response.status !== 202) throw new Error("The integrity commitment could not be queued")
}

export async function getIntegrityReceipt(commitment: string): Promise<IntegrityLookup> {
  const response = await fetch(`${backendUrl}/api/integrity/proofs/${encodeURIComponent(commitment)}`, {
    cache: "no-store",
  })
  if (response.status === 404) return { status: "not-found" }
  if (response.status === 202) return { status: "queued" }
  if (!response.ok) throw new Error("The integrity proof service is temporarily unavailable")
  const value = await response.json() as IntegrityReceipt
  if (value.status !== "anchored" || value.commitment !== commitment.toLowerCase() ||
    !Array.isArray(value.proof) || !Number.isInteger(value.leafCount) ||
    !Number.isInteger(value.batchId) || !Number.isInteger(value.blockNumber)) {
    throw new Error("The integrity proof service returned an invalid receipt")
  }
  return { status: "anchored", receipt: value }
}
