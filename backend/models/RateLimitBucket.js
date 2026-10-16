const mongoose = require("mongoose")

const rateLimitBucketSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  count: { type: Number, required: true },
  resetAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
}, { versionKey: false, collection: "rate_limit_buckets" })

rateLimitBucketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

module.exports = mongoose.model("RateLimitBucket", rateLimitBucketSchema)
