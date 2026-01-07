const { ethers } = require('ethers');
const config = require('./config');
const fs = require('fs');
const path = require('path');

// Load contract address from deployment.json if available
let CONTRACT_ADDRESS = config.contractAddress || process.env.CONTRACT_ADDRESS;

// Try to load from deployment.json
try {
  const deploymentPath = path.join(__dirname, 'deployment.json');
  if (fs.existsSync(deploymentPath)) {
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
    CONTRACT_ADDRESS = CONTRACT_ADDRESS || deployment.contractAddress;
    console.log('📄 Loaded contract address from deployment.json');
  }
} catch (error) {
  console.log('⚠️  No deployment.json found, using environment variable');
}

const CONTRACT_ABI = [
  "function storeMessage(address _to, bytes memory _encryptedData) public returns (uint256)",
  "function getMessage(uint256 _messageId) public view returns (address from, address to, bytes memory encryptedData, uint256 timestamp, bytes32 messageHash)",
  "function getUserMessages(address _user) public view returns (uint256[] memory)",
  "function getTotalMessages() public view returns (uint256)",
  "event MessageStored(uint256 indexed messageId, address indexed from, address indexed to, uint256 timestamp)"
];

class BlockchainService {
  constructor() {
    this.provider = null;
    this.contract = null;
    this.signer = null;
    this.isInitialized = false;
  }

  async initialize(providerUrl = null) {
    const rpcUrl = providerUrl || config.blockchainRpc || 'http://localhost:8545';
    try {
      console.log('🔗 Connecting to blockchain:', rpcUrl);
      this.provider = new ethers.JsonRpcProvider(rpcUrl);
      
      // Test connection
      const network = await this.provider.getNetwork();
      console.log('⛓️  Connected to chain ID:', Number(network.chainId));
      
      if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS === '0x0000000000000000000000000000000000000000') {
        console.warn('⚠️  Contract address not set. Please deploy contract first.');
        console.warn('   Run: npm run deploy:contract');
        this.isInitialized = false;
        return;
      }
      
      this.contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, this.provider);
      console.log('📍 Contract address:', CONTRACT_ADDRESS);
      
      // Verify contract exists
      const code = await this.provider.getCode(CONTRACT_ADDRESS);
      if (code === '0x') {
        console.error('❌ No contract found at address:', CONTRACT_ADDRESS);
        console.error('   Please deploy the contract first');
        this.isInitialized = false;
        return;
      }
      
      this.isInitialized = true;
      console.log('✅ Blockchain service initialized successfully');
    } catch (error) {
      console.error('❌ Blockchain initialization failed:', error.message);
      this.isInitialized = false;
    }
  }

  async storeMessage(fromAddress, toAddress, encryptedData, privateKey) {
    if (!this.isInitialized) {
      console.warn('⚠️  Blockchain not initialized, skipping storage');
      return null;
    }
    
    try {
      console.log('📤 Storing message on blockchain...');
      console.log('   From:', fromAddress);
      console.log('   To:', toAddress);
      
      const wallet = new ethers.Wallet(privateKey, this.provider);
      const contractWithSigner = this.contract.connect(wallet);
      
      // Convert encrypted data to bytes
      const encryptedBytes = ethers.hexlify(encryptedData);
      
      // Send transaction
      const tx = await contractWithSigner.storeMessage(toAddress, encryptedBytes, {
        gasLimit: 500000 // Set gas limit for Ganache
      });
      
      console.log('⏳ Transaction sent:', tx.hash);
      const receipt = await tx.wait();
      
      console.log('✅ Message stored on blockchain');
      console.log('   Block:', receipt.blockNumber);
      console.log('   Gas used:', receipt.gasUsed.toString());
      
      return receipt.hash;
    } catch (error) {
      console.error('❌ Failed to store on blockchain:', error.message);
      if (error.code === 'INSUFFICIENT_FUNDS') {
        console.error('   Account has insufficient ETH for gas');
      }
      return null;
    }
  }

  async getMessage(messageId) {
    if (!this.isInitialized) {
      return null;
    }
    
    try {
      const message = await this.contract.getMessage(messageId);
      return {
        from: message[0],
        to: message[1],
        encryptedData: message[2],
        timestamp: Number(message[3]),
        messageHash: message[4]
      };
    } catch (error) {
      console.error('❌ Failed to get message:', error.message);
      return null;
    }
  }

  async getUserMessages(userAddress) {
    if (!this.isInitialized) {
      return [];
    }
    
    try {
      const messageIds = await this.contract.getUserMessages(userAddress);
      return messageIds.map(id => Number(id));
    } catch (error) {
      console.error('❌ Failed to get user messages:', error.message);
      return [];
    }
  }

  async getTotalMessages() {
    if (!this.isInitialized) {
      return 0;
    }
    
    try {
      const total = await this.contract.getTotalMessages();
      return Number(total);
    } catch (error) {
      console.error('❌ Failed to get total messages:', error.message);
      return 0;
    }
  }

  // Get blockchain info
  async getBlockchainInfo() {
    if (!this.provider) {
      return null;
    }
    
    try {
      const network = await this.provider.getNetwork();
      const blockNumber = await this.provider.getBlockNumber();
      
      return {
        chainId: Number(network.chainId),
        blockNumber,
        contractAddress: CONTRACT_ADDRESS,
        isInitialized: this.isInitialized
      };
    } catch (error) {
      return null;
    }
  }
}

module.exports = new BlockchainService();
