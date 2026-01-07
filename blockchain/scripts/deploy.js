const hre = require("hardhat");
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('🚀 Starting Hardhat deployment to Ganache...\n');

  // Get deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log('📋 Deploying with account:', deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log('💰 Account balance:', hre.ethers.formatEther(balance), 'ETH\n');

  // Deploy MessageStorage contract
  console.log('📤 Deploying MessageStorage...');
  const MessageStorage = await hre.ethers.getContractFactory('MessageStorage');
  const messageStorage = await MessageStorage.deploy();

  await messageStorage.waitForDeployment();
  const contractAddress = await messageStorage.getTarget();

  console.log('✅ MessageStorage deployed to:', contractAddress);
  console.log('🔗 Transaction:', messageStorage.deploymentTransaction().hash);

  // Save deployment info
  const deploymentInfo = {
    contractAddress,
    deploymentTime: new Date().toISOString(),
    network: 'ganache',
    deployer: deployer.address,
    blockNumber: messageStorage.deploymentTransaction().blockNumber
  };

  // Save to blockchain folder
  const deploymentPath = path.join(__dirname, '../deployment.json');
  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  
  // Also save to backend folder for the server to use
  const backendDeploymentPath = path.join(__dirname, '../../backend/deployment.json');
  fs.writeFileSync(backendDeploymentPath, JSON.stringify(deploymentInfo, null, 2));
  
  console.log('\n💾 Deployment info saved to:');
  console.log('   - blockchain/deployment.json');
  console.log('   - backend/deployment.json');
  console.log('\n📋 Update your .env files with:');
  console.log(`CONTRACT_ADDRESS=${contractAddress}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
