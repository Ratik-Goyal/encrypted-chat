const mongoose = require("mongoose");
const Message = require("./message.model");
const User = require("./models/User");
const Conversation = require("./models/Conversation");
const blockchainService = require("./blockchain.service");

mongoose.connect(
  "mongodb+srv://Ratik_Goyal:Ratikgoyal4647%26%26@cluster.iwpicqh.mongodb.net/?appName=Cluster"
).then(() => {
  console.log("🟢 MongoDB connected");
  blockchainService.initialize().catch(err => {
    console.log("⚠️ Blockchain not available, using DB only");
  });
}).catch(err => {
  console.error("🔴 MongoDB error:", err.message);
  console.log("⚠️ Server continuing without database...");
});

const { Server } = require("socket.io");
const io = new Server(4000, {
  cors: {
    origin: ["http://localhost:4001"],
    methods: ["GET", "POST"]
  },
  pingInterval: 25000,
  pingTimeout: 60000
});

console.log("✅ Developer Backend running on port 4000");

const users = new Map();
const blockchainLogs = []; // Store all blockchain activity logs

io.on("connection", (socket) => {
  console.log("🔌 Developer connected:", socket.id);
  
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
    const onlineUserIds = Array.from(users.values()).map(u => u.walletAddress).filter(Boolean);
    io.emit("online-users", onlineUserIds);
    console.log("✅ User registered:", data.username, data.email);
  });

  socket.on("get-online-users", () => {
    const onlineUserIds = Array.from(users.values()).map(u => u.walletAddress).filter(Boolean);
    socket.emit("online-users", onlineUserIds);
  });

  socket.on("get-all-users", async () => {
    const allUsers = await User.find({}).select('walletAddress');
    const allUserIds = allUsers.map(u => u.walletAddress);
    const onlineUserIds = Array.from(users.keys());
    const offlineUsers = allUserIds.filter(id => !onlineUserIds.includes(id));
    socket.emit("all-users", offlineUsers);
  });

  socket.on("get-public-key", async (walletAddress) => {
    console.log("🔑 Fetching public key for:", walletAddress);
    const user = await User.findOne({ walletAddress });
    if (user) {
      console.log("✅ Public key found for:", walletAddress);
      socket.emit("public-key", user.publicKey);
    } else {
      console.log("⚠️ User not found:", walletAddress);
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

  // Get all blockchain logs
  socket.on("get-blockchain-logs", () => {
    socket.emit("blockchain-logs", blockchainLogs);
  });

  // Get all messages from database
  socket.on("get-all-messages", async () => {
    try {
      const messages = await Message.find({}).sort({ createdAt: -1 }).limit(100);
      socket.emit("all-messages", messages);
    } catch (error) {
      console.error("❌ Error fetching messages:", error);
      socket.emit("all-messages", []);
    }
  });

  // Get stats
  socket.on("get-stats", async () => {
    try {
      const totalMessages = await Message.countDocuments();
      const totalUsers = await User.countDocuments();
      const onlineUsers = Array.from(users.values()).filter(u => u.walletAddress).length;
      socket.emit("stats", { totalMessages, totalUsers, onlineUsers });
    } catch (error) {
      socket.emit("stats", { totalMessages: 0, totalUsers: 0, onlineUsers: 0 });
    }
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
    
    // Create blockchain log entry
    const blockchainLog = {
      id: blockchainLogs.length + 1,
      type: 'MESSAGE_STORED',
      from: data.from,
      to: data.to,
      encrypted: data.encrypted,
      encryptedPreview: JSON.stringify(data.encrypted).slice(0, 100) + '...',
      timestamp: Date.now(),
      txHash: '0x' + Buffer.from(JSON.stringify(data.encrypted).slice(0, 32)).toString('hex')
    };
    
    blockchainLogs.push(blockchainLog);
    
    console.log("📩 Encrypted message from", data.from, "to", data.to);
    console.log("🔒 Encrypted data (visible to devs):", JSON.stringify(data.encrypted).slice(0, 50), "...");
    console.log("⛓️  Blockchain log created:", blockchainLog.id);

    // Broadcast to ALL connected developer clients
    io.emit('blockchain-data', blockchainLog);

    const targetSocketId = Array.from(users.entries()).find(([socketId, userData]) => userData.walletAddress === data.to)?.[0];
    
    if (targetSocketId) {
      socket.to(targetSocketId).emit("receive-message", {
        from: data.from,
        encrypted: data.encrypted,
        timestamp: Date.now()
      });
    }
  });

  socket.on("disconnect", async () => {
    console.log("❌ User disconnected:", socket.id);
    const userData = users.get(socket.id);
    if (userData?.walletAddress) {
      await User.findOneAndUpdate(
        { walletAddress: userData.walletAddress },
        { lastSeen: new Date() }
      );
    }
    users.delete(socket.id);
    const onlineUserIds = Array.from(users.values()).map(u => u.walletAddress).filter(Boolean);
    io.emit("online-users", onlineUserIds);
  });
});
