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
  delivered: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model("Message", MessageSchema);
