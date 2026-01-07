const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const solc = require('solc');

async function compileContract() {
  console.log('📝 Compiling MessageStorage.sol...');
  
  const contractPath = path.join(__dirname, '../../blockchain/MessageStorage.sol');
  const source = fs.readFileSync(contractPath, 'utf8');
  
  const input = {
    language: 'Solidity',
    sources: {
      'MessageStorage.sol': {
        content: source
      }
    },
    settings: {
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode']
        }
      }
    }
  };
  
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  
  if (output.errors) {
    output.errors.forEach(err => {
      console.error(err.formattedMessage);
    });
    if (output.errors.some(err => err.severity === 'error')) {
      throw new Error('Compilation failed');
    }
  }
  
  const contract = output.contracts['MessageStorage.sol'].MessageStorage;
  return {
    abi: contract.abi,
    bytecode: contract.evm.bytecode.object
  };
}

async function deployContract() {
  try {
    console.log('🚀 Starting deployment to Ganache...\n');
    
    // Connect to Ganache
    const provider = new ethers.JsonRpcProvider('http://localhost:8545');
    
    // Test connection
    const blockNumber = await provider.getBlockNumber();
    console.log('✅ Connected to Ganache (Block:', blockNumber, ')\n');
    
    // Get deployer account (Ganache default account #0)
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    const wallet = new ethers.Wallet(privateKey, provider);
    const deployerAddress = await wallet.getAddress();
    
    console.log('📋 Deployer address:', deployerAddress);
    const balance = await provider.getBalance(deployerAddress);
    console.log('💰 Balance:', ethers.formatEther(balance), 'ETH\n');
    
    // Compile contract
    const { abi, bytecode } = await compileContract();
    console.log('✅ Contract compiled successfully\n');
    
    // Deploy contract
    console.log('📤 Deploying MessageStorage contract...');
    const factory = new ethers.ContractFactory(abi, bytecode, wallet);
    const contract = await factory.deploy();
    
    await contract.waitForDeployment();
    const contractAddress = await contract.getTarget();
    
    console.log('✅ Contract deployed successfully!\n');
    console.log('📍 Contract Address:', contractAddress);
    console.log('🔗 Transaction Hash:', contract.deploymentTransaction().hash);
    console.log('\n🎉 Deployment Complete!\n');
    
    // Save contract info
    const deploymentInfo = {
      contractAddress,
      deploymentTime: new Date().toISOString(),
      network: 'ganache',
      deployer: deployerAddress,
      abi: abi
    };
    
    const deploymentPath = path.join(__dirname, '../deployment.json');
    fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
    console.log('💾 Deployment info saved to:', deploymentPath);
    
    console.log('\n📋 Next steps:');
    console.log('1. Update .env file with contract address:');
    console.log(`   CONTRACT_ADDRESS=${contractAddress}`);
    console.log('2. Restart the backend server');
    console.log('3. Update frontend .env with the same address\n');
    
    return contractAddress;
    
  } catch (error) {
    console.error('\n❌ Deployment failed:', error.message);
    process.exit(1);
  }
}

// Run deployment
if (require.main === module) {
  deployContract().catch(console.error);
}

module.exports = { deployContract };
