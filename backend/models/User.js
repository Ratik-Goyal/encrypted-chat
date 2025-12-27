const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  walletAddress: { type: String, unique: true, index: true },
  publicKey: { type: String, required: true },
  username: { type: String, required: true },
  email: { type: String, required: true },
  lastSeen: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model("User", UserSchema);
