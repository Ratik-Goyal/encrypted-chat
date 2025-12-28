require('dotenv').config();

// Parse CORS_ORIGIN - can be comma-separated string or single value
// Special: "*" or "all" allows all origins (development only)
const parseCorsOrigin = (origin) => {
  // Allow all origins in development if explicitly set to "*" or "all"
  if (origin === '*' || origin === 'all' || origin === 'true') {
    if (process.env.NODE_ENV === 'production') {
      console.warn('⚠️  WARNING: CORS set to allow all origins in production! This is insecure.');
    }
    return true; // Socket.IO accepts true for all origins
  }
  
  if (!origin) {
    // In development, allow all origins by default for convenience
    if (process.env.NODE_ENV !== 'production') {
      return true;
    }
    return ['http://localhost:3001', 'http://localhost:4001'];
  }
  
  if (Array.isArray(origin)) return origin;
  // Split by comma and trim whitespace
  return origin.split(',').map(o => o.trim()).filter(Boolean);
};

module.exports = {
  port: parseInt(process.env.PORT || '3000', 10),
  mongoUri: process.env.MONGODB_URI,
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: parseCorsOrigin(process.env.CORS_ORIGIN),
  jwtSecret: process.env.JWT_SECRET,
  contractAddress: process.env.CONTRACT_ADDRESS,
  blockchainRpc: process.env.BLOCKCHAIN_RPC || 'http://localhost:8545',
  
  isProduction: () => process.env.NODE_ENV === 'production',
  isDevelopment: () => process.env.NODE_ENV === 'development'
};
