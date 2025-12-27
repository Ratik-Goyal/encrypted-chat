const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

async function deployContract() {
  try {
    // Connect to local blockchain (Hardhat/Ganache)
    const provider = new ethers.JsonRpcProvider('http://localhost:8545');
    
    // Get deployer account
    const accounts = await provider.listAccounts();
    if (accounts.length === 0) {
      console.error('❌ No accounts found. Start Hardhat/Ganache first.');
      return;
    }
    
    const deployer = await provider.getSigner(0);
    console.log('📝 Deploying with account:', await deployer.getAddress());
    
    // Read compiled contract (you'll need to compile first)
    const contractPath = path.join(__dirname, '../blockchain/MessageStorage.sol');
    console.log('📄 Contract file:', contractPath);
    
    // For now, just show instructions
    console.log('\n📋 To deploy the contract:');
    console.log('1. Install Hardhat: npm install --save-dev hardhat');
    console.log('2. Initialize: npx hardhat');
    console.log('3. Copy MessageStorage.sol to contracts/');
    console.log('4. Run: npx hardhat compile');
    console.log('5. Deploy: npx hardhat run scripts/deploy.js --network localhost');
    console.log('\n✅ Contract will store encrypted messages on blockchain');
    console.log('🔒 Only users with private keys can decrypt');
    console.log('👁️ Developers can see encrypted data on-chain\n');
    
  } catch (error) {
    console.error('❌ Deployment error:', error.message);
  }
}

deployContract();
