const mongoose = require("mongoose")

const integrityCommitmentSchema = new mongoose.Schema({
  commitment: { type: String, required: true, unique: true, match: /^0x[0-9a-f]{64}$/ },
  batchId: { type: mongoose.Schema.Types.ObjectId, ref: "IntegrityBatch", default: null },
}, { timestamps: { createdAt: true, updatedAt: false } })

integrityCommitmentSchema.index({ batchId: 1, createdAt: 1 })

module.exports = mongoose.model("IntegrityCommitment", integrityCommitmentSchema)
