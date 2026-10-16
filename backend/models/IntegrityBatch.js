const mongoose = require("mongoose")

const integrityBatchSchema = new mongoose.Schema({
  root: { type: String, required: true, match: /^0x[0-9a-f]{64}$/ },
  leaves: { type: [String], required: true, select: false },
  leafCount: { type: Number, required: true, min: 1, max: 0xffffffff },
  status: { type: String, enum: ["queued", "anchored"], default: "queued", index: true },
  chainBatchId: { type: Number, default: null },
  transactionHash: { type: String, default: "" },
  blockNumber: { type: Number, default: null },
  anchoredAt: { type: Date, default: null },
}, { timestamps: true })

integrityBatchSchema.index({ status: 1, createdAt: 1 })

module.exports = mongoose.model("IntegrityBatch", integrityBatchSchema)
