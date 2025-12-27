require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  mongoUri: process.env.MONGODB_URI,
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3001',
  jwtSecret: process.env.JWT_SECRET,
  contractAddress: process.env.CONTRACT_ADDRESS,
  blockchainRpc: process.env.BLOCKCHAIN_RPC || 'http://localhost:8545',
  
  isProduction: () => process.env.NODE_ENV === 'production',
  isDevelopment: () => process.env.NODE_ENV === 'development'
};
