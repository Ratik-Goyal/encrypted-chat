const crypto = require("crypto")
const bcrypt = require("bcryptjs")
const mongoose = require("mongoose")
const config = require("../config")
const User = require("../models/User")

async function createAdmin() {
  const email = config.adminBootstrapEmail
  const password = config.adminBootstrapPassword
  if (!email || !password || password.length < 16 || Buffer.byteLength(password, "utf8") > 72) {
    throw new Error("Set ADMIN_BOOTSTRAP_EMAIL and a 16-72 byte ADMIN_BOOTSTRAP_PASSWORD")
  }
  if (!config.mongoUri) throw new Error("MONGODB_URI is required")

  await mongoose.connect(config.mongoUri)
  const existing = await User.findOne({ email })
  const username = existing?.username || `admin-${crypto.randomBytes(6).toString("hex")}`
  const userId = existing?.userId || `admin_${crypto.randomUUID()}`
  await User.updateOne(
    { email },
    {
      $set: {
        username,
        email,
        userId,
        password: await bcrypt.hash(password, 12),
        role: "admin",
      },
    },
    { upsert: true, runValidators: true },
  )
  console.log("Admin account provisioned")
}

createAdmin()
  .catch(() => {
    console.error("Admin provisioning failed")
    process.exitCode = 1
  })
  .finally(() => mongoose.disconnect())
