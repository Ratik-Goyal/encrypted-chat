const mongoose = require("mongoose")

const integrityWorkerLockSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  owner: { type: String, required: true },
  lockedUntil: { type: Date, required: true },
}, { versionKey: false, collection: "integrity_worker_locks" })

module.exports = mongoose.model("IntegrityWorkerLock", integrityWorkerLockSchema)
