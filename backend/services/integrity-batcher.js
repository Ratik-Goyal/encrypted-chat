const crypto = require("crypto")
const IntegrityBatch = require("../models/IntegrityBatch")
const IntegrityCommitment = require("../models/IntegrityCommitment")
const IntegrityWorkerLock = require("../models/IntegrityWorkerLock")
const blockchainService = require("../../blockchain/blockchain.service")
const config = require("../config")
const Logger = require("../utils/logger")
const { buildMerkleTree } = require("../utils/merkle")

const lockId = "integrity-batcher"
const workerId = crypto.randomUUID()
const lockDurationMs = 3 * 60_000
let timer = null
let running = false
let lockHeartbeat = null

async function acquireLock() {
  const now = new Date()
  try {
    const lock = await IntegrityWorkerLock.findOneAndUpdate(
      { _id: lockId, $or: [{ lockedUntil: { $lte: now } }, { owner: workerId }] },
      { $set: { owner: workerId, lockedUntil: new Date(now.getTime() + lockDurationMs) } },
      { upsert: true, new: true },
    ).lean()
    return lock?.owner === workerId
  } catch (error) {
    if (error?.code === 11000) return false
    throw error
  }
}

async function prepareNextBatch() {
  const existing = await IntegrityBatch.findOne({ status: "queued" }).sort({ createdAt: 1 }).select("+leaves")
  if (existing) {
    await IntegrityCommitment.updateMany(
      { commitment: { $in: existing.leaves }, batchId: null },
      { $set: { batchId: existing._id } },
    )
    return existing
  }

  const commitments = await IntegrityCommitment.find({ batchId: null })
    .sort({ createdAt: 1, _id: 1 })
    .limit(config.integrityBatchSize)
    .select("commitment")
    .lean()
  if (!commitments.length) return null
  if (commitments.length < config.integrityBatchSize &&
    Date.now() - commitments[0].createdAt.getTime() < config.integrityMaxBatchWaitMs) return null

  const leaves = commitments.map(({ commitment }) => commitment)
  const tree = buildMerkleTree(leaves)
  const batch = await IntegrityBatch.create({ root: tree.root, leaves, leafCount: leaves.length, status: "queued" })
  await IntegrityCommitment.updateMany(
    { commitment: { $in: leaves }, batchId: null },
    { $set: { batchId: batch._id } },
  )
  return batch
}

async function runBatcher() {
  if (running) return
  try {
    if (!(await acquireLock())) return
  } catch {
    Logger.error("Integrity batch worker could not acquire its database lease")
    return
  }
  running = true
  lockHeartbeat = setInterval(() => {
    IntegrityWorkerLock.updateOne(
      { _id: lockId, owner: workerId },
      { $set: { lockedUntil: new Date(Date.now() + lockDurationMs) } },
    ).catch(() => undefined)
  }, 30_000)
  lockHeartbeat.unref?.()
  try {
    const batch = await prepareNextBatch()
    if (!batch || !config.blockchainRpc || !config.blockchainContractAddress || !config.blockchainChainId || !config.blockchainPrivateKey) return

    await blockchainService.initialize(config.blockchainRpc, config.blockchainContractAddress, config.blockchainChainId)
    const result = await blockchainService.commitBatch(
      batch.root,
      batch.leafCount,
      config.blockchainPrivateKey,
      config.blockchainConfirmations,
    )
    await IntegrityBatch.updateOne({ _id: batch._id, status: "queued" }, {
      $set: {
        status: "anchored",
        chainBatchId: result.batchId,
        transactionHash: result.transactionHash,
        blockNumber: result.blockNumber,
        anchoredAt: new Date(),
      },
    })
  } catch {
    Logger.error("Integrity batch remains queued; the next worker cycle will retry")
  } finally {
    running = false
    if (lockHeartbeat) clearInterval(lockHeartbeat)
    lockHeartbeat = null
    await IntegrityWorkerLock.updateOne({ _id: lockId, owner: workerId }, { $set: { lockedUntil: new Date(0) } }).catch(() => undefined)
  }
}

function start() {
  if (timer) return
  timer = setInterval(() => void runBatcher(), config.integrityBatchIntervalMs)
  timer.unref?.()
  void runBatcher()
}

async function stop() {
  if (timer) clearInterval(timer)
  timer = null
  while (running) await new Promise((resolve) => setTimeout(resolve, 25))
}

module.exports = { start, stop }
