import React, { useState, useEffect } from 'react';
import walletService from '../services/walletService';

export const WalletConnect = ({ onConnect, onDisconnect }) => {
  const [walletAddress, setWalletAddress] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [balance, setBalance] = useState('0');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    if (walletService.isMetaMaskInstalled() && walletService.getAddress()) {
      const address = walletService.getAddress();
      setWalletAddress(address);
      
      try {
        const bal = await walletService.getBalance();
        setBalance(parseFloat(bal).toFixed(4));
        
        const provider = walletService.getProvider();
        if (provider) {
          const network = await provider.getNetwork();
          setChainId(Number(network.chainId));
        }
      } catch (err) {
        console.error('Error getting wallet info:', err);
      }
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    setError('');
    
    try {
      if (!walletService.isMetaMaskInstalled()) {
        setError('MetaMask not found. Please install MetaMask extension.');
        window.open('https://metamask.io/download/', '_blank');
        setConnecting(false);
        return;
      }

      const { address, chainId: connectedChainId } = await walletService.connectWallet();
      setWalletAddress(address);
      setChainId(connectedChainId);

      // Check if on Ganache network (chainId 1337)
      if (connectedChainId !== 1337) {
        const shouldSwitch = window.confirm(
          'You are not connected to Ganache network. Would you like to switch?'
        );
        if (shouldSwitch) {
          await walletService.switchToGanache();
          // Reload to update chainId
          window.location.reload();
          return;
        }
      }

      const bal = await walletService.getBalance(address);
      setBalance(parseFloat(bal).toFixed(4));

      if (onConnect) {
        onConnect(address, connectedChainId);
      }
    } catch (err) {
      console.error('Connection error:', err);
      setError(err.message || 'Failed to connect wallet');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = () => {
    walletService.disconnect();
    setWalletAddress(null);
    setChainId(null);
    setBalance('0');
    
    if (onDisconnect) {
      onDisconnect();
    }
  };

  const formatAddress = (addr) => {
    if (!addr) return '';
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
  };

  const getNetworkName = (id) => {
    switch (id) {
      case 1337: return 'Ganache Local';
      case 1: return 'Ethereum Mainnet';
      case 5: return 'Goerli Testnet';
      case 11155111: return 'Sepolia Testnet';
      default: return `Chain ${id}`;
    }
  };

  if (walletAddress) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, #00a884 0%, #06cf9c 100%)',
        padding: '12px 16px',
        borderRadius: '12px',
        color: 'white',
        fontSize: '13px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        boxShadow: '0 2px 8px rgba(0, 168, 132, 0.3)'
      }}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
          <div>
            <div style={{fontWeight: '600', fontSize: '14px'}}>🦊 {formatAddress(walletAddress)}</div>
            <div style={{opacity: 0.9, fontSize: '12px', marginTop: '2px'}}>
              {getNetworkName(chainId)} • {balance} ETH
            </div>
          </div>
          <button
            onClick={handleDisconnect}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '8px',
              color: 'white',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '600',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.3)'}
            onMouseLeave={(e) => e.target.style.background = 'rgba(255,255,255,0.2)'}
          >
            Disconnect
          </button>
        </div>
        {chainId !== 1337 && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.2)',
            padding: '8px',
            borderRadius: '6px',
            fontSize: '11px'
          }}>
            ⚠️ Not on Ganache network
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={handleConnect}
        disabled={connecting}
        style={{
          background: 'linear-gradient(135deg, #00a884 0%, #06cf9c 100%)',
          border: 'none',
          padding: '12px 24px',
          borderRadius: '12px',
          color: 'white',
          cursor: connecting ? 'not-allowed' : 'pointer',
          fontSize: '14px',
          fontWeight: '600',
          width: '100%',
          boxShadow: '0 2px 8px rgba(0, 168, 132, 0.3)',
          transition: 'all 0.2s',
          opacity: connecting ? 0.7 : 1
        }}
        onMouseEnter={(e) => !connecting && (e.target.style.transform = 'translateY(-2px)')}
        onMouseLeave={(e) => e.target.style.transform = 'translateY(0)'}
      >
        {connecting ? '🔄 Connecting...' : '🦊 Connect MetaMask'}
      </button>
      {error && (
        <div style={{
          marginTop: '8px',
          padding: '8px 12px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '8px',
          color: '#ef4444',
          fontSize: '12px'
        }}>
          {error}
        </div>
      )}
    </div>
  );
};
