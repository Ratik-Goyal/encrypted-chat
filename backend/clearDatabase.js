const mongoose = require("mongoose");
const User = require("./models/User");
const Conversation = require("./models/Conversation");
const Message = require("./models/Message");

mongoose.connect(
  "mongodb+srv://Ratik_Goyal:Ratikgoyal4647%26%26@cluster.iwpicqh.mongodb.net/?appName=Cluster"
).then(async () => {
  console.log("🟢 MongoDB connected");
  
  try {
    // Delete all data
    await User.deleteMany({});
    await Conversation.deleteMany({});
    await Message.deleteMany({});
    
    console.log("✅ All database collections cleared successfully");
    console.log("   - Users deleted");
    console.log("   - Conversations deleted");
    console.log("   - Messages deleted");
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Error clearing database:", error);
    process.exit(1);
  }
}).catch(err => {
  console.error("🔴 MongoDB connection error:", err);
  process.exit(1);
});
