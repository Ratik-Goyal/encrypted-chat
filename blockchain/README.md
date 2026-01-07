# 🔗 Blockchain Module

This folder contains all blockchain-related files for SecureChat.

## 📁 Structure

```
blockchain/
├── contracts/              # Solidity smart contracts
│   └── MessageStorage.sol  # Main message storage contract
├── scripts/                # Deployment and utility scripts
│   ├── start-ganache.js    # Start local Ganache blockchain
│   ├── deploy.js           # Hardhat deployment script
│   └── deploy-solc.js      # Alternative solc deployment
├── test/                   # Contract tests (coming soon)
├── artifacts/              # Compiled contracts (auto-generated)
├── cache/                  # Hardhat cache (auto-generated)
├── hardhat.config.js       # Hardhat configuration
├── package.json            # Dependencies
└── .env.example            # Environment template
```

## 🚀 Quick Start

### 1. Install Dependencies
```bash
cd blockchain
npm install
```

### 2. Start Ganache
```bash
npm run ganache
```

### 3. Deploy Contract (in another terminal)
```bash
npm run deploy
```

### 4. Run Tests
```bash
npm test
```

## 📜 Available Scripts

| Script | Description |
|--------|-------------|
| `npm run ganache` | Start local Ganache blockchain |
| `npm run compile` | Compile smart contracts |
| `npm run deploy` | Deploy to Ganache with Hardhat |
| `npm run deploy:solc` | Deploy using solc compiler |
| `npm run console` | Open Hardhat console |
| `npm test` | Run contract tests |
| `npm run clean` | Clean build artifacts |

## 📋 Smart Contract

### MessageStorage.sol

Stores encrypted messages on the Ethereum blockchain.

**Functions:**
- `storeMessage(address _to, bytes _encryptedData)` - Store a message
- `getMessage(uint256 _messageId)` - Retrieve a message
- `getUserMessages(address _user)` - Get user's message IDs
- `getTotalMessages()` - Get total message count

**Events:**
- `MessageStored(messageId, from, to, timestamp)` - Emitted when message stored

## ⚙️ Configuration

### Ganache Network
- **RPC URL:** http://localhost:8545
- **Chain ID:** 1337
- **Network ID:** 1337

### Test Accounts
Account #0 (Deployer): `0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266`
Private Key: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`

## 🔐 Security Note

⚠️ **Never use Ganache accounts on mainnet!**  
These are well-known test accounts with public private keys.
