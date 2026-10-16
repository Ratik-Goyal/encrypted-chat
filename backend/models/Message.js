const mongoose = require("mongoose")

const messageSchema = new mongoose.Schema(
  {
    from: {
      type: String,
      required: true,
    },
    to: {
      type: String,
      required: true,
    },
    encrypted: {
      type: String,
      required: true,
    },
    delivered: {
      type: Boolean,
      default: false,
    },
    read: {
      type: Boolean,
      default: false,
    },
    onBlockchain: {
      type: Boolean,
      default: false,
    },
    blockchainTxHash: {
      type: String,
      default: "",
    },
    selfDestruct: {
      type: Number,
      default: 0,
    },
    selfDestructStart: {
      type: String,
      enum: ["send", "firstRead"],
      default: "send",
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    id: {
      type: String,
      unique: true,
      required: true,
    },
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
  },
  { timestamps: true },
)

messageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
messageSchema.index({ conversationId: 1, createdAt: -1 })
messageSchema.index({ from: 1, to: 1, read: 1 })

module.exports = mongoose.model("Message", messageSchema)
