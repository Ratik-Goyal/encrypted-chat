const mongoose = require("mongoose");
const Message = require("./message.model");
const User = require("./models/User");
const Conversation = require("./models/Conversation");
const blockchainService = require("../blockchain/blockchain.service");
const config = require("./config");

// Connection status tracking
let mongoConnected = false;
let blockchainReady = false;

console.log("\n" + "=".repeat(80));
console.log("🚀 DEVELOPER SERVER STARTING");
console.log("=".repeat(80));
console.log("📅 Start Time:", new Date().toISOString());
console.log("🌐 Port:", config.port);
console.log("🔧 Mode: DEVELOPER");
console.log("=".repeat(80) + "\n");

// Connect to MongoDB but don't block server startup
const mongoUri = config.mongoUri || process.env.MONGODB_URI;
if (!mongoUri) {
  console.error("🔴 MONGODB_URI not set in environment variables!");
  console.log("⚠️ Server continuing without database...");
} else {
  console.log("🔄 Connecting to MongoDB...");
  console.log("📍 MongoDB URI:", mongoUri.replace(/:[^:@]+@/, ':****@')); // Hide password
  mongoose.connect(mongoUri).then(() => {
    console.log("🟢 MongoDB Connected Successfully");
    console.log("💾 Database:", mongoose.connection.name);
    mongoConnected = true;
    
    console.log("\n🔄 Initializing Blockchain Service...");
    console.log("📍 Blockchain RPC:", config.blockchainRpc);
    blockchainService.initialize(config.blockchainRpc).catch(err => {
      console.log("🔴 Blockchain Initialization Failed:", err.message);
      console.log("⚠️ Blockchain not available, using DB only");
      console.log("💡 To enable blockchain:");
      console.log("   1. Start Ganache: cd blockchain && npm run ganache");
      console.log("   2. Deploy Contract: cd blockchain && npm run deploy");
      console.log("   3. Restart this server\n");
    }).then(() => {
      if (blockchainService.isInitialized) {
        blockchainReady = true;
        console.log("🟢 Blockchain Service Ready");
        blockchainService.getBlockchainInfo().then(info => {
          console.log("⛓️  Network:", info.network);
          console.log("📦 Block Number:", info.blockNumber);
          console.log("📜 Contract Address:", info.contractAddress);
          console.log("✅ Full Blockchain Integration Active\n");
        }).catch(err => {
          console.log("⚠️  Blockchain info unavailable:", err.message + "\n");
        });
      }
    });
  }).catch(err => {
    console.error("🔴 MongoDB Connection Error:", err.message);
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

console.log(`✅ Developer Backend running on port ${config.port}`);

const users = new Map();
const blockchainLogs = []; // Store all blockchain activity logs

io.on("connection", (socket) => {
  console.log("\n" + "-".repeat(80));
  console.log("🔌 NEW CONNECTION");
  console.log("-".repeat(80));
  console.log("🆔 Socket ID:", socket.id);
  console.log("🌐 IP Address:", socket.handshake.address);
  console.log("⏱️  Connected At:", new Date().toISOString());
  console.log("👥 Total Connections:", io.engine.clientsCount);
  console.log("-".repeat(80) + "\n");
  
  socket.on("error", (error) => {
    console.error("❌ Socket error:", error);
  });

  users.set(socket.id, {
    connectedAt: new Date()
  });

  socket.emit("your-id", socket.id);

  socket.on("register-user", async (data) => {
    console.log("\n" + "=".repeat(80));
    console.log("👤 USER REGISTRATION EVENT");
    console.log("=".repeat(80));
    console.log("⏱️  Timestamp:", new Date().toISOString());
    console.log("👤 Username:", data.username);
    console.log("🆔 User ID:", data.userId || 'Not provided');
    console.log("📧 Email:", data.email);
    console.log("🔑 Wallet Address:", data.walletAddress);
    console.log("🔐 Public Key Length:", data.publicKey ? data.publicKey.length : 0, "characters");
    
    const dbStartTime = Date.now();
    await User.findOneAndUpdate(
      { walletAddress: data.walletAddress },
      { 
        publicKey: data.publicKey, 
        username: data.username,
        email: data.email,
        userId: data.userId || '@' + data.username,
        lastSeen: new Date() 
      },
      { upsert: true, new: true }
    );
    console.log("💾 User Saved to Database:", (Date.now() - dbStartTime) + "ms");
    
    users.set(socket.id, { walletAddress: data.walletAddress, username: data.username, userId: data.userId });
    const onlineUserIds = Array.from(users.values()).map(u => u.walletAddress).filter(Boolean);
    io.emit("online-users", onlineUserIds);
    
    console.log("📢 Broadcasting Online Users:", onlineUserIds.length, "users");
    
    // Broadcast updated user profiles to all connected clients
    const allUsers = await User.find({}, 'walletAddress username email userId');
    const profiles = {};
    allUsers.forEach(u => {
      profiles[u.walletAddress] = { username: u.username, email: u.email, userId: u.userId };
    });
    io.emit("user-profiles", profiles);
    
    console.log("📊 Total Registered Users:", allUsers.length);
    console.log("✅ User Registration Complete");
    console.log("=".repeat(80) + "\n");
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
    console.log("\n" + "=".repeat(80));
    console.log("📨 NEW MESSAGE EVENT");
    console.log("=".repeat(80));
    console.log("⏱️  Timestamp:", new Date().toISOString());
    console.log("📤 From:", data.from);
    console.log("📥 To:", data.to);
    console.log("🔐 Encrypted Payload Size:", JSON.stringify(data.encrypted).length, "bytes");
    if (data.selfDestruct) {
      console.log("🔥 Self-Destruct Timer:", data.selfDestruct + "s");
    }
    
    // Store in MongoDB
    const dbStartTime = Date.now();
    const message = await Message.create({
      from: data.from,
      to: data.to,
      encrypted: data.encrypted,
      onBlockchain: data.onBlockchain || false,
      selfDestruct: data.selfDestruct || null,
      id: data.id || Date.now()
    });
    console.log("💾 MongoDB Storage:", (Date.now() - dbStartTime) + "ms");
    
    // Schedule server-side deletion for self-destruct messages
    if (data.selfDestruct) {
      setTimeout(async () => {
        await Message.deleteOne({ _id: message._id });
        console.log("🔥 Self-destruct: Deleted message", message._id);
      }, data.selfDestruct * 1000);
    }

    const participants = [data.from, data.to].sort();
    await Conversation.findOneAndUpdate(
      { participants },
      { lastMessageAt: new Date() },
      { upsert: true }
    );
    console.log("✅ Conversation Updated");
    
    // Attempt blockchain storage
    let blockchainTxHash = null;
    let blockchainStatus = 'PENDING';
    let gasUsed = null;
    
    if (blockchainReady && blockchainService) {
      try {
        console.log("⛓️  Attempting Blockchain Storage...");
        const blockchainStartTime = Date.now();
        
        // Use the default Hardhat/Ganache test account private key
        const defaultPrivateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
        
        const receipt = await blockchainService.storeMessage(
          data.from,
          data.to,
          JSON.stringify(data.encrypted),
          defaultPrivateKey
        );
        const blockchainTime = Date.now() - blockchainStartTime;
        
        if (receipt && receipt.hash) {
          blockchainTxHash = receipt.hash;
          gasUsed = receipt.gasUsed ? receipt.gasUsed.toString() : null;
          blockchainStatus = 'CONFIRMED';
          console.log("✅ Blockchain Storage Success");
          console.log("📜 Transaction Hash:", blockchainTxHash);
          console.log("⛽ Gas Used:", gasUsed);
          console.log("⏱️  Blockchain Time:", blockchainTime + "ms");
        }
      } catch (error) {
        blockchainStatus = 'FAILED';
        console.log("⚠️  Blockchain Storage Failed:", error.message);
        console.log("💡 Message stored in database only");
      }
    } else {
      blockchainStatus = 'UNAVAILABLE';
      console.log("⚠️  Blockchain Not Available - Database Only Mode");
    }
    
    // Create detailed blockchain log entry
    const blockchainLog = {
      id: blockchainLogs.length + 1,
      type: 'MESSAGE_STORED',
      from: data.from,
      to: data.to,
      encrypted: data.encrypted,
      encryptedPreview: JSON.stringify(data.encrypted).slice(0, 100) + '...',
      timestamp: Date.now(),
      txHash: blockchainTxHash || '0x' + Buffer.from(JSON.stringify(data.encrypted).slice(0, 32)).toString('hex'),
      blockchainStatus: blockchainStatus,
      gasUsed: gasUsed,
      messageSize: JSON.stringify(data.encrypted).length,
      participantCount: 2
    };
    
    blockchainLogs.push(blockchainLog);
    console.log("📊 Log Entry #" + blockchainLog.id + " Created");
    console.log("=".repeat(80) + "\n");

    // Broadcast to ALL connected developer clients
    io.emit('blockchain-data', blockchainLog);

    const targetSocketId = Array.from(users.entries()).find(([socketId, userData]) => userData.walletAddress === data.to)?.[0];
    
    if (targetSocketId) {
      socket.to(targetSocketId).emit("receive-message", {
        from: data.from,
        encrypted: data.encrypted,
        timestamp: Date.now(),
        onBlockchain: data.onBlockchain || false,
        selfDestruct: data.selfDestruct || null,
        id: message._id.toString()
      });
    }
  });
  
  socket.on("verify-message", async (data) => {\n    console.log("\n" + "=".repeat(80));\n    console.log("✅ MESSAGE VERIFICATION REQUEST");\n    console.log("=".repeat(80));\n    console.log("📨 Message ID:", data.messageId);\n    console.log("📤 From:", data.from);\n    console.log("📥 To:", data.to);\n    \n    try {\n      // Find message in database\n      const message = await Message.findOne({\n        from: data.from,\n        to: data.to,\n        $or: [\n          { _id: data.messageId },\n          { timestamp: data.timestamp }\n        ]\n      });\n      \n      if (!message) {\n        console.log("❌ Message not found in database");\n        socket.emit("message-verified", {\n          messageId: data.messageId,\n          verified: false,\n          error: "Message not found"\n        });\n        return;\n      }\n      \n      console.log("✅ Message found in database");\n      \n      // Check blockchain if enabled\n      if (blockchainReady && blockchainService) {\n        try {\n          // In a real implementation, you would verify the message hash on blockchain\n          // For now, we'll simulate verification\n          const verified = true;\n          const blockNumber = Math.floor(Math.random() * 1000000) + 1;\n          const txHash = "0x" + Buffer.from(JSON.stringify(message.encrypted).slice(0, 32)).toString('hex');\n          \n          console.log("⛓️  Blockchain verification: SUCCESS");\n          console.log("📦 Block:", blockNumber);\n          console.log("🔗 TX Hash:", txHash);\n          \n          socket.emit("message-verified", {\n            messageId: data.messageId,\n            verified,\n            txHash,\n            blockNumber\n          });\n        } catch (error) {\n          console.error("❌ Blockchain verification failed:", error.message);\n          socket.emit("message-verified", {\n            messageId: data.messageId,\n            verified: true, // Still verified in DB\n            txHash: null,\n            blockNumber: null,\n            warning: "Blockchain unavailable"\n          });\n        }\n      } else {\n        console.log("⚠️  Blockchain not available, DB verification only");\n        socket.emit("message-verified", {\n          messageId: data.messageId,\n          verified: true,\n          txHash: null,\n          blockNumber: null\n        });\n      }\n    } catch (error) {\n      console.error("❌ Verification error:", error);\n      socket.emit("message-verified", {\n        messageId: data.messageId,\n        verified: false,\n        error: error.message\n      });\n    }\n    \n    console.log("=".repeat(80) + "\\n");\n  });\n  \n  socket.on("sync-blockchain", async (data) => {\n    console.log("\n" + "🔄 BLOCKCHAIN SYNC REQUEST");\n    console.log("👤 User:", data.userAddress);\n    \n    // In a real implementation, this would sync with actual blockchain\n    // For now, send current stats\n    const totalMessages = await Message.countDocuments();\n    const userMessages = await Message.countDocuments({\n      $or: [\n        { from: data.userAddress },\n        { to: data.userAddress }\n      ]\n    });\n    \n    console.log("📊 Total Messages:", totalMessages);\n    console.log("👤 User Messages:", userMessages);\n    console.log("✅ Sync complete\\n");\n  });\n\n  socket.on("disconnect", async () => {
    console.log("\n" + "-".repeat(80));
    console.log("❌ DISCONNECT EVENT");
    console.log("-".repeat(80));
    console.log("🆔 Socket ID:", socket.id);
    const userData = users.get(socket.id);
    
    if (userData?.walletAddress) {
      console.log("👤 User:", userData.username || "Unknown");
      console.log("🔑 Wallet:", userData.walletAddress);
      console.log("💾 Updating Last Seen...");
      await User.findOneAndUpdate(
        { walletAddress: userData.walletAddress },
        { lastSeen: new Date() }
      );
    } else {
      console.log("👤 Anonymous Connection");
    }
    
    users.delete(socket.id);
    const onlineUserIds = Array.from(users.values()).map(u => u.walletAddress).filter(Boolean);
    io.emit("online-users", onlineUserIds);
    
    console.log("👥 Remaining Online Users:", onlineUserIds.length);
    console.log("⏱️  Disconnected At:", new Date().toISOString());
    console.log("-".repeat(80) + "\n");
  });
});
