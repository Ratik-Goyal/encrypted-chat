const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const Message = require("./message.model");
const User = require("./models/User");
const Conversation = require("./models/Conversation");
const blockchainService = require("../blockchain/blockchain.service");
const config = require("./config");

const app = express();
const httpServer = http.createServer(app);

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

// Health check endpoint (attached to Socket.IO server)
app.get("/health", (req, res) => {
  const health = {
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      server: "running",
      mongodb: mongoConnected ? "connected" : "disconnected",
      blockchain: blockchainReady ? "ready" : "initializing"
    },
    uptime: process.uptime()
  };
  
  const statusCode = mongoConnected ? 200 : 503;
  res.status(statusCode).json(health);
});

// Create Socket.IO server attached to the HTTP server
const { Server } = require("socket.io");
const io = new Server(httpServer, {
  cors: {
    origin: config.corsOrigin,
    methods: ["GET", "POST"]
  },
  pingInterval: 25000,
  pingTimeout: 60000
});

// Start the HTTP server (Socket.IO and Express both use this)
httpServer.listen(config.port, () => {
  console.log(`✅ Backend running on port ${config.port} (Socket.IO + HTTP)`);
});

const users = new Map();
io.on("connection", (socket) => {
  console.log("🔌 User connected:", socket.id);
  
  socket.on("error", (error) => {
    console.error("❌ Socket error:", error);
  });

  users.set(socket.id, {
    connectedAt: new Date()
  });

  socket.emit("your-id", socket.id);

  socket.on("register-user", async (data) => {
    console.log("📝 Registering user:", data.walletAddress, data.username);
    
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
    
    // Build online users list
    const onlineUserIds = Array.from(users.values()).map(u => u.walletAddress).filter(Boolean);
    console.log("🟢 Broadcasting online users:", onlineUserIds);
    
    // Broadcast to ALL connected clients including the newly registered one
    io.emit("online-users", onlineUserIds);
    
    // Also send all-users list to everyone
    const allUsersFromDb = await User.find({}).select('walletAddress');
    const allUserIds = allUsersFromDb.map(u => u.walletAddress).filter(Boolean);
    io.emit("all-users", allUserIds);
    
    // Send user profiles to everyone
    const allProfiles = await User.find({}, 'walletAddress username email');
    const profiles = {};
    allProfiles.forEach(u => {
      if (u.walletAddress) {
        profiles[u.walletAddress] = { username: u.username, email: u.email };
      }
    });
    io.emit("user-profiles", profiles);
    
    console.log("✅ User registered:", data.username, data.email, "- Total online:", onlineUserIds.length);
  });

  socket.on("get-online-users", () => {
    const onlineUserIds = Array.from(users.values()).map(u => u.walletAddress).filter(Boolean);
    socket.emit("online-users", onlineUserIds);
  });

  socket.on("get-all-users", async () => {
    const allUsers = await User.find({}).select('walletAddress');
    const allUserIds = allUsers.map(u => u.walletAddress).filter(id => id !== users.get(socket.id)?.walletAddress);
    socket.emit("all-users", allUserIds);
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
      if (u.walletAddress) {
        profiles[u.walletAddress] = { username: u.username, email: u.email };
      }
    });
    socket.emit("user-profiles", profiles);
  });

  socket.on("get-user-profile", async (walletAddress) => {
    const user = await User.findOne({ walletAddress }).select('username email walletAddress');
    if (user) {
      socket.emit("user-profile", { success: true, profile: user });
    } else {
      socket.emit("user-profile", { success: false, error: "User not found" });
    }
  });

  socket.on("get-blockchain-logs", async () => {
    try {
      const messages = await Message.find({})
        .sort({ timestamp: -1 })
        .limit(100);
      
      const logs = messages.map(msg => ({
        id: msg._id,
        from: msg.from,
        to: msg.to,
        encrypted: msg.encrypted,
        timestamp: msg.timestamp || msg.createdAt
      }));
      
      socket.emit("blockchain-logs", logs);
      console.log("📦 Sent blockchain logs:", logs.length, "messages");
    } catch (error) {
      console.error("Error fetching blockchain logs:", error);
      socket.emit("blockchain-logs", []);
    }
  });

  socket.on("get-stats", async () => {
    try {
      const totalMessages = await Message.countDocuments();
      const totalUsers = await User.countDocuments();
      const onlineUserIds = Array.from(users.values()).map(u => u.walletAddress).filter(Boolean);
      
      socket.emit("stats", {
        totalMessages,
        totalUsers,
        onlineUsers: onlineUserIds.length
      });
      console.log("📊 Sent stats - Messages:", totalMessages, "Users:", totalUsers, "Online:", onlineUserIds.length);
    } catch (error) {
      console.error("Error fetching stats:", error);
      socket.emit("stats", { totalMessages: 0, totalUsers: 0, onlineUsers: 0 });
    }
  });

  socket.on("typing", ({ to }) => {
    // Find socket ID by wallet address
    const targetSocketId = Array.from(users.entries()).find(([socketId, userData]) => userData.walletAddress === to)?.[0];
    if (targetSocketId) {
      const currentUser = users.get(socket.id);
      socket.to(targetSocketId).emit("typing", { userId: currentUser?.walletAddress || socket.id });
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
    const messageDoc = await Message.create({
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
    
    console.log("📩 Encrypted message from", data.from, "to", data.to);
    console.log("🔒 Encrypted data (visible to devs):", data.encrypted.slice(0, 50), "...");

    const blockchainData = {
      id: messageDoc._id,
      from: data.from,
      to: data.to,
      encrypted: data.encrypted,
      timestamp: messageDoc.timestamp || Date.now()
    };

    // Broadcast to ALL clients (including developer dashboards)
    io.emit('blockchain-data', blockchainData);

    // Find socket ID by wallet address for message delivery
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
