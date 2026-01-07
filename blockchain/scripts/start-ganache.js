#!/usr/bin/env node

/**
 * Ganache Setup Script
 * Starts Ganache with predefined accounts for development
 */

const ganache = require('ganache');

const server = ganache.server({
  wallet: {
    totalAccounts: 10,
    defaultBalance: 1000, // 1000 ETH per account
    mnemonic: 'test test test test test test test test test test test junk'
  },
  chain: {
    chainId: 1337,
    networkId: 1337
  },
  miner: {
    blockGasLimit: 12000000
  },
  logging: {
    verbose: true
  }
});

const PORT = 8545;

server.listen(PORT, async (err) => {
  if (err) {
    console.error('❌ Failed to start Ganache:', err);
    process.exit(1);
  }

  console.log('🎉 Ganache started successfully!\n');
  console.log('📡 RPC Server: http://localhost:' + PORT);
  console.log('⛓️  Chain ID: 1337');
  console.log('🔗 Network ID: 1337\n');

  const provider = server.provider;
  const accounts = await provider.request({
    method: 'eth_accounts',
    params: []
  });

  console.log('👛 Available Accounts (with 1000 ETH each):');
  console.log('==========================================\n');
  
  accounts.forEach((account, index) => {
    console.log(`(${index}) ${account}`);
  });

  console.log('\n🔑 Private Keys:');
  console.log('==========================================\n');
  
  // Get private keys from wallet
  const wallet = server.provider.getInitialAccounts();
  Object.entries(wallet).forEach(([address, account], index) => {
    console.log(`(${index}) ${account.secretKey}`);
  });

  console.log('\n📋 Mnemonic:');
  console.log('test test test test test test test test test test test junk\n');
  
  console.log('💡 Tips:');
  console.log('- Use account (0) for contract deployment');
  console.log('- Use accounts (1-9) for testing user wallets');
  console.log('- Add this network to MetaMask:');
  console.log('  Network Name: Ganache Local');
  console.log('  RPC URL: http://localhost:8545');
  console.log('  Chain ID: 1337');
  console.log('  Currency: ETH\n');
  
  console.log('⚡ Ganache is running... Press CTRL+C to stop\n');
  
  // Keep the process alive
  setInterval(() => {
    // This keeps Node.js event loop active
  }, 1000);
});

// Handle shutdown gracefully
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down Ganache...');
  server.close(() => {
    console.log('✅ Ganache stopped');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n\n👋 Shutting down Ganache...');
  server.close(() => {
    console.log('✅ Ganache stopped');
    process.exit(0);
  });
});
