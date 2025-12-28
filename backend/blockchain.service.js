const { ethers } = require('ethers');
const config = require('./config');

const CONTRACT_ADDRESS = config.contractAddress || process.env.CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000';
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
  }

  async initialize(providerUrl = null) {
    const rpcUrl = providerUrl || config.blockchainRpc || 'http://localhost:8545';
    try {
      this.provider = new ethers.JsonRpcProvider(rpcUrl);
      this.contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, this.provider);
      console.log('✅ Blockchain service initialized');
    } catch (error) {
      console.error('❌ Blockchain initialization failed:', error.message);
    }
  }

  async storeMessage(fromAddress, toAddress, encryptedData, privateKey) {
    try {
      const wallet = new ethers.Wallet(privateKey, this.provider);
      const contractWithSigner = this.contract.connect(wallet);
      
      const encryptedBytes = ethers.hexlify(encryptedData);
      const tx = await contractWithSigner.storeMessage(toAddress, encryptedBytes);
      const receipt = await tx.wait();
      
      console.log('📦 Message stored on blockchain:', receipt.hash);
      return receipt.hash;
    } catch (error) {
      console.error('❌ Failed to store on blockchain:', error.message);
      return null;
    }
  }

  async getMessage(messageId) {
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
    try {
      const messageIds = await this.contract.getUserMessages(userAddress);
      return messageIds.map(id => Number(id));
    } catch (error) {
      console.error('❌ Failed to get user messages:', error.message);
      return [];
    }
  }
}

module.exports = new BlockchainService();
