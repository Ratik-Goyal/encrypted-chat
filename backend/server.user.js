const mongoose = require("mongoose");
const Message = require("./message.model");
const User = require("./models/User");
const Conversation = require("./models/Conversation");
const blockchainService = require("./blockchain.service");
const config = require("./config");

// Connection status tracking
let mongoConnected = false;
let blockchainReady = false;

// Connect to MongoDB but don't block server startup
const mongoUri = config.mongoUri || process.env.MONGODB_URI;
if (!mongoUri) {
  console.error("🔴 MONGODB_URI not set in environment variables!");
  console.log("⚠️ Server continuing without database...");
} else {
  mongoose.connect(mongoUri).then(() => {
    console.log("🟢 MongoDB connected");
    mongoConnected = true;
    blockchainService.initialize(config.blockchainRpc).catch(err => {
      console.log("⚠️ Blockchain not available, using DB only");
    }).then(() => {
      blockchainReady = true;
    });
  }).catch(err => {
    console.error("🔴 MongoDB error:", err.message);
    console.log("⚠️ Server continuing without database...");
    mongoConnected = false;
  });
}

const { Server } = require("socket.io");
const io = new Server(config.port, {
  cors: {
    origin: config.corsOrigin,
    methods: ["GET", "POST"]
  },
  pingInterval: 25000,
  pingTimeout: 60000
});

console.log(`✅ User Backend running on port ${config.port}`);

const users = new Map();
io.on("connection", (socket) => {
  
  socket.on("error", (error) => {
    console.error("❌ Socket error:", error);
  });

  users.set(socket.id, {
    connectedAt: new Date()
  });

  socket.emit("your-id", socket.id);

  socket.on("register-user", async (data) => {
    await User.findOneAndUpdate(
      { walletAddress: data.walletAddress },
      { 
        publicKey: data.publicKey, 
        username: data.username,
        email: data.email,
        lastSeen: new Date() 
      },
      { upsert: true, new: true }
    );
    users.set(socket.id, { walletAddress: data.walletAddress, username: data.username });
  });

  socket.on("get-online-users", () => {
    // Emit wallet addresses of all online users
    const onlineWallets = Array.from(users.values())
      .map(u => u.walletAddress)
      .filter(Boolean);
    socket.emit("online-users", onlineWallets);
  });

  socket.on("get-all-users", async () => {
    const allUsers = await User.find({}).select('walletAddress');
    const allUserIds = allUsers.map(u => u.walletAddress);
    const onlineUserIds = Array.from(users.keys());
    const offlineUsers = allUserIds.filter(id => !onlineUserIds.includes(id));
    socket.emit("all-users", offlineUsers);
  });

  socket.on("get-public-key", async (walletAddress) => {
    const user = await User.findOne({ walletAddress });
    if (user) {
      socket.emit("public-key", user.publicKey);
    } else {
      socket.emit("public-key", null);
    }
  });

  socket.on("get-user-profiles", async () => {
    const allUsers = await User.find({}, 'walletAddress username email');
    const profiles = {};
    allUsers.forEach(u => {
      profiles[u.walletAddress] = { username: u.username, email: u.email };
    });
    socket.emit("user-profiles", profiles);
  });

  socket.on("typing", ({ to }) => {
    const targetSocketId = Array.from(users.entries()).find(([socketId, userData]) => userData.walletAddress === to)?.[0];
    if (targetSocketId) {
      socket.to(targetSocketId).emit("typing", { userId: socket.id });
    }
  });

  socket.on("get-conversation", async ({ user1, user2 }) => {
    const messages = await Message.find({
      $or: [
        { from: user1, to: user2 },
        { from: user2, to: user1 }
      ]
    }).sort({ timestamp: 1 }).limit(50);
    socket.emit("conversation-history", messages);
  });

  socket.on("send-message", async(data) => {
    await Message.create({
      from: data.from,
      to: data.to,
      encrypted: data.encrypted
    });

    const participants = [data.from, data.to].sort();
    await Conversation.findOneAndUpdate(
      { participants },
      { lastMessageAt: new Date() },
      { upsert: true }
    );

    // Try to deliver in real-time if recipient is online
    const targetSocketId = Array.from(users.entries()).find(([socketId, userData]) => userData.walletAddress === data.to)?.[0];
    if (targetSocketId) {
      socket.to(targetSocketId).emit("receive-message", {
        from: data.from,
        encrypted: data.encrypted,
        timestamp: Date.now()
      });
    }
    // No else needed: message is stored and will be delivered when user comes online and fetches conversation
  });

  socket.on("disconnect", async () => {
    const userData = users.get(socket.id);
    if (userData?.walletAddress) {
      await User.findOneAndUpdate(
        { walletAddress: userData.walletAddress },
        { lastSeen: new Date() }
      );
    }
    users.delete(socket.id);
  });
});
