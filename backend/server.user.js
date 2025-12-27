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
const io = new Server(3000, {
  cors: {
    origin: ["http://localhost:3001"],
    methods: ["GET", "POST"]
  },
  pingInterval: 25000,
  pingTimeout: 60000
});

console.log("✅ User Backend running on port 3000");

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
    socket.emit("online-users", []);
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
