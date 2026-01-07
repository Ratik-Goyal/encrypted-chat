const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Conversation",
    index: true
  },
  from: { type: String, index: true },
  to: { type: String, index: true },
  encrypted: { type: [Number], required: true },
  delivered: { type: Boolean, default: false },
  read: { type: Boolean, default: false },
  readAt: { type: Date },
  deleted: { type: Boolean, default: false },
  onBlockchain: { type: Boolean, default: false },
  selfDestruct: { type: Number, default: null }, // seconds until auto-delete
  id: { type: String, index: true }
}, { timestamps: true });

module.exports = mongoose.model("Message", MessageSchema);
