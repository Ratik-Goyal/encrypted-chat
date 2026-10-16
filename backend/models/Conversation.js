const mongoose = require("mongoose")

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: String,
        required: true,
      },
    ],
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
)

conversationSchema.index({ participants: 1 })

module.exports = mongoose.model("Conversation", conversationSchema)
