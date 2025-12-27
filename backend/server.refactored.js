const mongoose = require("mongoose");
const { Server } = require("socket.io");
const config = require("./config");
const Logger = require("./utils/logger");
const { AppError, errorHandler } = require("./utils/errorHandler");
const { validateUserRegistration, validateMessage } = require("./utils/validation");
const Message = require("./message.model");
const User = require("./models/User");
const Conversation = require("./models/Conversation");
const blockchainService = require("./blockchain.service");

// Database Connection
mongoose.connect(config.mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  Logger.success("MongoDB connected successfully");
  blockchainService.initialize().catch(() => {
    Logger.warn("Blockchain not available, using DB only");
  });
}).catch(err => {
  Logger.error("MongoDB connection failed", err);
  process.exit(1);
});

// Socket.IO Server
const io = new Server(config.port, {
  cors: {
    origin: config.corsOrigin,
    methods: ["GET", "POST"],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

Logger.success(`Server running on port ${config.port}`);
Logger.info(`Environment: ${config.nodeEnv}`);
Logger.info(`CORS Origin: ${config.corsOrigin}`);

// In-memory user tracking
const connectedUsers = new Map();

// Socket Event Handlers
io.on("connection", (socket) => {
  Logger.info(`User connected: ${socket.id}`);

  connectedUsers.set(socket.id, {
    socketId: socket.id,
    connectedAt: new Date()
  });

  socket.emit("your-id", socket.id);

  // User Registration
  socket.on("register-user", async (data) => {
    try {
      const validatedData = validateUserRegistration(data);
      
      const user = await User.findOneAndUpdate(
        { walletAddress: validatedData.walletAddress },
        { 
          ...validatedData,
          lastSeen: new Date() 
        },
        { upsert: true, new: true }
      );
      
      connectedUsers.set(socket.id, {
        ...connectedUsers.get(socket.id),
        walletAddress: validatedData.walletAddress,
        username: validatedData.username
      });
      
      io.emit("online-users", Array.from(connectedUsers.keys()));
      Logger.success(`User registered: ${validatedData.username}`);
      
    } catch (error) {
      errorHandler(error, socket);
    }
  });

  // Get Online Users
  socket.on("get-online-users", () => {
    socket.emit("online-users", Array.from(connectedUsers.keys()));
  });

  // Get All Users
  socket.on("get-all-users", async () => {
    try {
      const allUsers = await User.find({}).select('walletAddress username');
      const allUserIds = allUsers.map(u => u.walletAddress);
      const onlineUserIds = Array.from(connectedUsers.keys());
      const offlineUsers = allUserIds.filter(id => !onlineUserIds.includes(id));
      socket.emit("all-users", offlineUsers);
    } catch (error) {
      errorHandler(error, socket);
    }
  });

  // Get Public Key
  socket.on("get-public-key", async (walletAddress) => {
    try {
      Logger.debug(`Fetching public key for: ${walletAddress}`);
      const user = await User.findOne({ walletAddress });
      
      if (!user) {
        throw new AppError('User not found', 404);
      }
      
      socket.emit("public-key", user.publicKey);
      Logger.debug(`Public key sent for: ${walletAddress}`);
      
    } catch (error) {
      errorHandler(error, socket);
    }
  });

  // Get User Profiles
  socket.on("get-user-profiles", async () => {
    try {
      const users = await User.find({}, 'walletAddress username email');
      const profiles = {};
      users.forEach(u => {
        profiles[u.walletAddress] = { 
          username: u.username, 
          email: u.email 
        };
      });
      socket.emit("user-profiles", profiles);
    } catch (error) {
      errorHandler(error, socket);
    }
  });

  // Typing Indicator
  socket.on("typing", ({ to }) => {
    if (connectedUsers.has(to)) {
      socket.to(to).emit("typing", { userId: socket.id });
    }
  });

  // Get Conversation History
  socket.on("get-conversation", async ({ user1, user2 }) => {
    try {
      const messages = await Message.find({
        $or: [
          { from: user1, to: user2 },
          { from: user2, to: user1 }
        ]
      }).sort({ timestamp: 1 }).limit(50);
      
      socket.emit("conversation-history", messages);
      Logger.debug(`Conversation history sent: ${messages.length} messages`);
      
    } catch (error) {
      errorHandler(error, socket);
    }
  });

  // Send Message
  socket.on("send-message", async (data) => {
    try {
      if (!validateMessage(data.encrypted)) {
        throw new AppError('Invalid message format', 400);
      }

      const messageDoc = await Message.create({
        from: data.from,
        to: data.to,
        encrypted: data.encrypted,
        timestamp: Date.now()
      });

      const participants = [data.from, data.to].sort();
      await Conversation.findOneAndUpdate(
        { participants },
        { lastMessageAt: new Date() },
        { upsert: true }
      );
      
      Logger.info(`Message: ${data.from.slice(0, 8)} → ${data.to.slice(0, 8)}`);
      Logger.debug(`Encrypted data length: ${data.encrypted.length} bytes`);

      const blockchainData = {
        from: data.from,
        to: data.to,
        encrypted: data.encrypted,
        timestamp: Date.now()
      };

      socket.emit('blockchain-data', blockchainData);

      if (connectedUsers.has(data.to)) {
        socket.to(data.to).emit("receive-message", {
          from: data.from,
          encrypted: data.encrypted,
          timestamp: Date.now()
        });
        socket.to(data.to).emit('blockchain-data', blockchainData);
      }
      
    } catch (error) {
      errorHandler(error, socket);
    }
  });

  // Disconnect Handler
  socket.on("disconnect", async () => {
    try {
      const userData = connectedUsers.get(socket.id);
      
      if (userData?.walletAddress) {
        await User.findOneAndUpdate(
          { walletAddress: userData.walletAddress },
          { lastSeen: new Date() }
        );
      }
      
      connectedUsers.delete(socket.id);
      io.emit("online-users", Array.from(connectedUsers.keys()));
      Logger.info(`User disconnected: ${socket.id}`);
      
    } catch (error) {
      Logger.error("Disconnect error", error);
    }
  });
});

// Graceful Shutdown
process.on('SIGTERM', () => {
  Logger.warn('SIGTERM received, shutting down gracefully');
  io.close(() => {
    mongoose.connection.close(false, () => {
      Logger.info('Server closed');
      process.exit(0);
    });
  });
});

process.on('unhandledRejection', (err) => {
  Logger.error('Unhandled Rejection', err);
  if (config.isProduction()) {
    process.exit(1);
  }
});

module.exports = io;
