import { ethers } from 'ethers';

class WalletService {
  constructor() {
    this.provider = null;
    this.signer = null;
    this.address = null;
    this.chainId = null;
  }

  // Check if MetaMask is installed
  isMetaMaskInstalled() {
    return typeof window !== 'undefined' && typeof window.ethereum !== 'undefined';
  }

  // Connect to MetaMask wallet
  async connectWallet() {
    if (!this.isMetaMaskInstalled()) {
      throw new Error('MetaMask is not installed. Please install MetaMask extension.');
    }

    try {
      // Request account access
      const accounts = await window.ethereum.request({ 
        method: 'eth_requestAccounts' 
      });

      // Create ethers provider
      this.provider = new ethers.BrowserProvider(window.ethereum);
      this.signer = await this.provider.getSigner();
      this.address = await this.signer.getAddress();
      
      // Get chain ID
      const network = await this.provider.getNetwork();
      this.chainId = Number(network.chainId);

      console.log('✅ Wallet connected:', this.address);
      console.log('🔗 Chain ID:', this.chainId);

      // Setup event listeners
      this.setupEventListeners();

      return {
        address: this.address,
        chainId: this.chainId
      };
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      throw error;
    }
  }

  // Switch to Ganache network
  async switchToGanache() {
    const ganacheChainId = '0x539'; // 1337 in hex
    
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: ganacheChainId }],
      });
      console.log('✅ Switched to Ganache network');
    } catch (switchError) {
      // This error code indicates that the chain has not been added to MetaMask
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: ganacheChainId,
              chainName: 'Ganache Local',
              nativeCurrency: {
                name: 'Ethereum',
                symbol: 'ETH',
                decimals: 18
              },
              rpcUrls: ['http://127.0.0.1:8545'],
              blockExplorerUrls: null,
            }],
          });
          console.log('✅ Added and switched to Ganache network');
        } catch (addError) {
          console.error('Failed to add Ganache network:', addError);
          throw addError;
        }
      } else {
        throw switchError;
      }
    }
  }

  // Get current wallet address
  getAddress() {
    return this.address;
  }

  // Get signer for transactions
  getSigner() {
    return this.signer;
  }

  // Get provider
  getProvider() {
    return this.provider;
  }

  // Setup event listeners for account and chain changes
  setupEventListeners() {
    if (!window.ethereum) return;

    window.ethereum.on('accountsChanged', (accounts) => {
      console.log('👛 Account changed:', accounts[0]);
      if (accounts.length === 0) {
        // User disconnected wallet
        this.disconnect();
      } else {
        // Account changed, reload to update
        window.location.reload();
      }
    });

    window.ethereum.on('chainChanged', (chainId) => {
      console.log('🔗 Chain changed:', chainId);
      // Reload on chain change
      window.location.reload();
    });
  }

  // Disconnect wallet
  disconnect() {
    this.provider = null;
    this.signer = null;
    this.address = null;
    this.chainId = null;
    console.log('👋 Wallet disconnected');
  }

  // Sign message
  async signMessage(message) {
    if (!this.signer) {
      throw new Error('Wallet not connected');
    }
    return await this.signer.signMessage(message);
  }

  // Get balance
  async getBalance(address = null) {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }
    const addr = address || this.address;
    const balance = await this.provider.getBalance(addr);
    return ethers.formatEther(balance);
  }

  // Check if connected to Ganache
  async isGanacheNetwork() {
    if (!this.provider) return false;
    const network = await this.provider.getNetwork();
    return Number(network.chainId) === 1337;
  }
}

export default new WalletService();
