require('dotenv').config({ path: require('path').join(__dirname, '.env') });

// Also try to load from parent .env if blockchain-specific one doesn't exist
if (!process.env.CONTRACT_ADDRESS) {
  require('dotenv').config({ path: require('path').join(__dirname, '..', 'backend', '.env') });
}

module.exports = {
  contractAddress: process.env.CONTRACT_ADDRESS,
  blockchainRpc: process.env.BLOCKCHAIN_RPC || 'http://localhost:8545',
  privateKey: process.env.PRIVATE_KEY,
  
  // Network configuration
  networkId: parseInt(process.env.NETWORK_ID || '1337', 10),
  gasLimit: parseInt(process.env.GAS_LIMIT || '3000000', 10),
  
  isProduction: () => process.env.NODE_ENV === 'production',
  isDevelopment: () => process.env.NODE_ENV === 'development'
};
