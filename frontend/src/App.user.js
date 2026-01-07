import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import io from 'socket.io-client';
import { ModeIndicator } from './components/ModeIndicator';
import { UserProfileModal } from './components/UserProfileModal';
import { SettingsModal } from './components/SettingsModal';
import { WalletConnect } from './components/WalletConnect';
import { modeConfig, getModeStyles } from './config';
import walletService from './services/walletService';
import './App.css';

const MODE = 'user';

// Utility: Debounce function for performance
const debounce = (func, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

// Utility: Throttle function for scroll events
const throttle = (func, limit) => {
  let inThrottle;
  return (...args) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

// ============================================
// DEV MODE - For testing with multiple tabs
// ============================================
// Set to true to use unique session IDs instead of wallet addresses
// This allows testing with multiple browser tabs without needing different wallets
const DEV_MODE = true; // Set to false for production with real wallets

// Generate unique session ID for dev mode
const getDevSessionId = () => {
  let sessionId = sessionStorage.getItem('dev_session_id');
  if (!sessionId) {
    sessionId = 'dev_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    sessionStorage.setItem('dev_session_id', sessionId);
  }
  return sessionId;
};

// ============================================
// BLOCKCHAIN INTEGRATION
// ============================================
// Users now connect with MetaMask wallet to Ganache
// Wallet addresses are used as user IDs
// Messages are encrypted end-to-end AND stored on blockchain
// ============================================

// Privacy-focused: Generate friendly display names from wallet addresses
const FIRST_NAMES = [
  'Alex', 'Sam', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Avery',
  'Quinn', 'Cameron', 'Jamie', 'Blake', 'Peyton', 'Skyler', 'Dakota', 'River',
  'Phoenix', 'Sage', 'Rowan', 'Charlie', 'Emerson', 'Finley', 'Hayden', 'Parker'
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas',
  'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Thompson', 'White', 'Harris'
];

// Generate consistent friendly name from wallet address
const generateFriendlyName = (walletAddress) => {
  if (!walletAddress) return 'Anonymous User';
  
  // Create a simple hash from the wallet address
  let hash = 0;
  for (let i = 0; i < walletAddress.length; i++) {
    hash = ((hash << 5) - hash) + walletAddress.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Use hash to consistently select names
  const firstIndex = Math.abs(hash) % FIRST_NAMES.length;
  const lastIndex = Math.abs(hash >> 8) % LAST_NAMES.length;
  
  return `${FIRST_NAMES[firstIndex]} ${LAST_NAMES[lastIndex]}`;
};

// Alias for consistency with optimized code
const getDisplayName = generateFriendlyName;

function App() {
  const [myId, setMyId] = useState(''); // Socket ID
  const [myWalletAddress, setMyWalletAddress] = useState(''); // Actual MetaMask wallet address or dev session ID
  const [walletConnected, setWalletConnected] = useState(DEV_MODE); // Auto-connected in dev mode
  const [recipientId, setRecipientId] = useState('');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [registered, setRegistered] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [showLogin, setShowLogin] = useState(true);
  const [username, setUsername] = useState(() => localStorage.getItem('securechat_username') || '');
  const [email, setEmail] = useState(() => localStorage.getItem('securechat_email') || '');
  const [userId, setUserId] = useState(() => localStorage.getItem('securechat_unique_id') || '');
  const [userProfiles, setUserProfiles] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  
  // Debounced search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);
  
  const [typingUsers, setTypingUsers] = useState({});
  const [conversations, setConversations] = useState({});
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [selectedProfileUser, setSelectedProfileUser] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(0); // Force re-render counter
  const [blockchainEnabled, setBlockchainEnabled] = useState(false);
  const [isSending, setIsSending] = useState(false); // Message sending state
  const [isLoading, setIsLoading] = useState(false); // Loading state for async operations
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [selfDestructTimer, setSelfDestructTimer] = useState(null); // null, 10, 30, 60 (seconds)
  const [showBlockchainVerification, setShowBlockchainVerification] = useState(true);
  const [messageCountdowns, setMessageCountdowns] = useState({}); // Track countdown for each message
  
  // Enhanced blockchain features
  const [blockchainTxHistory, setBlockchainTxHistory] = useState([]);
  const [showBlockchainExplorer, setShowBlockchainExplorer] = useState(false);
  const [verifyingMessage, setVerifyingMessage] = useState(null);
  const [blockchainStats, setBlockchainStats] = useState({
    totalTx: 0,
    totalGasUsed: 0,
    messagesOnChain: 0,
    lastBlockNumber: 0
  });
  const [blockchainSyncStatus, setBlockchainSyncStatus] = useState('synced'); // synced, syncing, error
  const [messageIntegrityStatus, setMessageIntegrityStatus] = useState({}); // messageId -> verified/failed
  
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('securechat_settings_user');
    return saved ? JSON.parse(saved) : {
      notifications: true,
      soundEnabled: true,
      enterToSend: true,
      showTypingIndicator: true,
      showReadReceipts: true,
      showOnlineStatus: true,
      theme: 'dark',
      fontSize: 'medium',
      messagePreview: true,
      autoDownloadMedia: true,
      dataUsage: 'auto',
      useBlockchain: true // New setting for blockchain storage
    };
  });
  
  const config = modeConfig[MODE];
  const styles = getModeStyles(MODE);
  
  const keyPairRef = useRef(null);
  const publicKeyBase64Ref = useRef(null);
  const receiverPublicKeyRef = useRef(null);
  const socketRef = useRef(null);
  const keyFetchPromises = useRef({});
  const myWalletAddressRef = useRef('');
  const messageListRef = useRef(null);
  const autoScrollEnabled = useRef(true);
  const publicKeyCache = useRef(new Map());

  // Optimized auto-scroll to bottom
  useEffect(() => {
    if (messageListRef.current && autoScrollEnabled.current) {
      const scrollToBottom = () => {
        messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
      };
      requestAnimationFrame(scrollToBottom);
    }
  }, [messages]);
  
  // Detect manual scroll to disable auto-scroll
  const handleScroll = useCallback(
    throttle(() => {
      if (messageListRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = messageListRef.current;
        autoScrollEnabled.current = scrollHeight - scrollTop - clientHeight < 100;
      }
    }, 150),
    []
  );
  
  useEffect(() => {
    const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3000';
    socketRef.current = io(apiUrl, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });
    
    const socket = socketRef.current;
    
    // Generate keys first, then set up socket listeners
    const initializeApp = async () => {
      await generateKeys();
      console.log('🔐 Encryption keys generated');
      
      // Auto-connect wallet silently (skip in dev mode)
      if (!DEV_MODE) {
        autoConnectWallet();
      }
    };
    
    initializeApp();

    socket.on('your-id', (id) => {
      setMyId(id);
      
      // In DEV_MODE, don't auto-login from localStorage (use fresh session each tab)
      if (DEV_MODE) {
        console.log('🔧 DEV MODE: New session, please register');
        return;
      }
      
      // Auto-login if user was previously registered
      const persistentUserId = localStorage.getItem('securechat_user_id');
      const savedUsername = localStorage.getItem('securechat_username');
      const savedEmail = localStorage.getItem('securechat_email');
      const savedUniqueId = localStorage.getItem('securechat_unique_id');
      
      if (persistentUserId && savedUsername && savedEmail) {
        // Clear all previous user data to prevent decryption errors
        setMessages([]);
        setConversations({});
        setRecipientId('');
        setOnlineUsers([]);
        setAllUsers([]);
        setUserProfiles({});
        
        // Set wallet address immediately before any socket calls
        setMyWalletAddress(persistentUserId);
        myWalletAddressRef.current = persistentUserId;
        setUsername(savedUsername);
        setEmail(savedEmail);
        setUserId(savedUniqueId || '@' + savedUsername);
        setRegistered(true);
        setShowLogin(false);
        
        // Re-register with server using persistent ID - wait for keys to be ready
        const waitForKeys = async () => {
          // Wait up to 5 seconds for keys
          let attempts = 0;
          while (!publicKeyBase64Ref.current && attempts < 50) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
          }
          
          if (publicKeyBase64Ref.current) {
            socket.emit('register-user', {
              walletAddress: persistentUserId,
              publicKey: publicKeyBase64Ref.current,
              username: savedUsername,
              email: savedEmail,
              userId: savedUniqueId || '@' + savedUsername
            });
            console.log('✅ Auto-registered with public key');
          } else {
            console.error('❌ Could not auto-register: keys not ready');
          }
          socket.emit('get-user-profiles');
          socket.emit('get-online-users');
          socket.emit('get-all-users');
        };
        waitForKeys();
      }
    });

    socket.on('receive-message', async (data) => {
      const decrypted = await decryptMessage(data.encrypted);
      const newMsg = { 
        from: data.from, 
        text: decrypted, 
        timestamp: data.timestamp,
        onBlockchain: data.onBlockchain,
        selfDestruct: data.selfDestruct,
        id: data.id || Date.now() + Math.random()
      };
      setMessages(prev => [...prev, newMsg]);
      setConversations(prev => ({
        ...prev,
        [data.from]: [...(prev[data.from] || []), newMsg]
      }));
      
      // Handle self-destruct for received messages
      if (data.selfDestruct) {
        setMessageCountdowns(prev => ({
          ...prev,
          [newMsg.id]: data.selfDestruct
        }));
        
        // Update countdown every second
        const countdownInterval = setInterval(() => {
          setMessageCountdowns(prev => {
            const newCountdowns = {...prev};
            if (newCountdowns[newMsg.id] > 1) {
              newCountdowns[newMsg.id] -= 1;
            } else {
              clearInterval(countdownInterval);
              delete newCountdowns[newMsg.id];
            }
            return newCountdowns;
          });
        }, 1000);
        
        // Delete message after timer
        setTimeout(() => {
          setMessages(prev => prev.filter(m => m.id !== newMsg.id));
          setConversations(prev => ({
            ...prev,
            [data.from]: (prev[data.from] || []).filter(m => m.id !== newMsg.id)
          }));
          setMessageCountdowns(prev => {
            const newCountdowns = {...prev};
            delete newCountdowns[newMsg.id];
            return newCountdowns;
          });
        }, data.selfDestruct * 1000);
      }
    });

    socket.on('public-key', async (keyBase64) => {
      if (!keyBase64) return;
      try {
        const binary = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0));
        receiverPublicKeyRef.current = await crypto.subtle.importKey(
          'spki', binary, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['encrypt']
        );
        keyFetchPromises.current.resolve?.();
      } catch (error) {
        keyFetchPromises.current.reject?.(error);
      }
    });

    socket.on('online-users', (users) => {
      console.log('🟢 Online users received:', users);
      // Filter out current user - users array contains wallet addresses
      const currentWallet = myWalletAddressRef.current || localStorage.getItem('securechat_user_id');
      console.log('Current wallet:', currentWallet);
      const filtered = users.filter(u => u !== currentWallet);
      console.log('Filtered online users:', filtered);
      setOnlineUsers(filtered);
    });
    socket.on('all-users', (users) => {
      console.log('⚫ All users received:', users);
      // Filter out current user - users array contains wallet addresses
      const currentWallet = myWalletAddressRef.current || localStorage.getItem('securechat_user_id');
      const filtered = users.filter(u => u !== currentWallet);
      console.log('Filtered all users:', filtered);
      setAllUsers(filtered);
    });
    socket.on('blockchain-data', (txData) => {
      console.log('⛓️ Blockchain transaction received:', txData);
      setBlockchainTxHistory(prev => [txData, ...prev].slice(0, 50)); // Keep last 50 transactions
      setBlockchainStats(prev => ({
        totalTx: prev.totalTx + 1,
        totalGasUsed: prev.totalGasUsed + (txData.gasUsed || 0),
        messagesOnChain: prev.messagesOnChain + 1,
        lastBlockNumber: txData.blockNumber || prev.lastBlockNumber
      }));
    });
    
    socket.on('message-verified', ({ messageId, verified, txHash, blockNumber }) => {
      console.log('✅ Message verification result:', messageId, verified);
      setMessageIntegrityStatus(prev => ({
        ...prev,
        [messageId]: { verified, txHash, blockNumber, timestamp: Date.now() }
      }));
      setVerifyingMessage(null);
    });
    
    socket.on('user-profiles', (profiles) => {
      console.log('📋 User profiles received:', Object.keys(profiles).length, 'profiles');
      console.log('Profiles data:', profiles);
      // Set profiles directly (server sends complete list, not delta)
      setUserProfiles(profiles);
      setForceUpdate(prev => prev + 1);
      // Force refresh of online and all users to trigger re-render with new profiles
      setTimeout(() => {
        if (socketRef.current) {
          socketRef.current.emit('get-online-users');
          socketRef.current.emit('get-all-users');
        }
      }, 100);
    });
    socket.on('typing', ({ userId }) => {
      setTypingUsers(prev => ({ ...prev, [userId]: true }));
      setTimeout(() => setTypingUsers(prev => ({ ...prev, [userId]: false })), 3000);
    });

    socket.on('conversation-history', async (msgs) => {
      try {
        const decrypted = await Promise.all(
          msgs.map(async (m) => {
            const isFromMe = m.from === myWalletAddressRef.current;
            const isToMe = m.to === myWalletAddressRef.current;
            let text;
            
            if (isFromMe) {
              // Messages I sent - encrypted with recipient's public key, I can't decrypt
              // Check if we have it in our local conversations cache
              const cachedMsg = conversations[m.to]?.find(msg => 
                msg.timestamp === m.timestamp || 
                (msg.from === 'You' && Math.abs(new Date(msg.timestamp) - new Date(m.timestamp)) < 1000)
              );
              text = cachedMsg?.text || '[Message you sent]';
            } else if (isToMe) {
              // Messages sent TO me - encrypted with MY public key, I CAN decrypt
              try {
                text = await decryptMessage(m.encrypted);
              } catch (err) {
                console.error('Failed to decrypt message sent to me:', err);
                text = '[Cannot decrypt message]';
              }
            } else {
              // Messages neither from me nor to me - shouldn't happen, but handle gracefully
              console.warn('Received message not involving current user:', m);
              text = '[Not your message]';
            }
            
            return {
              from: isFromMe ? 'You' : m.from,
              text: text,
              timestamp: m.timestamp,
              onBlockchain: m.onBlockchain,
              selfDestruct: m.selfDestruct,
              id: m.id || m.timestamp
            };
          })
        );
        setMessages(decrypted);
      } catch (error) {
        console.error('Error loading conversation history:', error);
        // Set empty messages on error
        setMessages([]);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const generateKeys = async () => {
    try {
      // Try to load existing keys from sessionStorage first (persists across page reloads in same tab)
      const savedKeys = sessionStorage.getItem('securechat_keypair');
      if (savedKeys) {
        try {
          const { publicKey, privateKey } = JSON.parse(savedKeys);
          
          // Import the saved keys
          const importedPublicKey = await crypto.subtle.importKey(
            'spki',
            new Uint8Array(publicKey),
            { name: 'RSA-OAEP', hash: 'SHA-256' },
            true,
            ['encrypt']
          );
          
          const importedPrivateKey = await crypto.subtle.importKey(
            'pkcs8',
            new Uint8Array(privateKey),
            { name: 'RSA-OAEP', hash: 'SHA-256' },
            true,
            ['decrypt']
          );
          
          keyPairRef.current = {
            publicKey: importedPublicKey,
            privateKey: importedPrivateKey
          };
          
          const exported = await crypto.subtle.exportKey('spki', importedPublicKey);
          publicKeyBase64Ref.current = btoa(String.fromCharCode(...new Uint8Array(exported)));
          
          console.log('🔐 Loaded existing encryption keys from session');
          return true;
        } catch (e) {
          console.log('⚠️ Could not restore saved keys, generating new ones');
          sessionStorage.removeItem('securechat_keypair');
        }
      }
      
      // Generate new keys
      keyPairRef.current = await crypto.subtle.generateKey(
        { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
        true, ['encrypt', 'decrypt']
      );
      const exported = await crypto.subtle.exportKey('spki', keyPairRef.current.publicKey);
      publicKeyBase64Ref.current = btoa(String.fromCharCode(...new Uint8Array(exported)));
      
      // Save keys to sessionStorage for persistence
      try {
        const exportedPrivate = await crypto.subtle.exportKey('pkcs8', keyPairRef.current.privateKey);
        sessionStorage.setItem('securechat_keypair', JSON.stringify({
          publicKey: Array.from(new Uint8Array(exported)),
          privateKey: Array.from(new Uint8Array(exportedPrivate))
        }));
        console.log('🔐 Generated and saved new encryption keys');
      } catch (e) {
        console.log('⚠️ Could not save keys to session storage');
      }
      
      return true;
    } catch (error) {
      console.error('❌ Key generation failed:', error);
      return false;
    }
  };

  const registerUser = async () => {
    if (!username || !email) {
      alert('Please fill in username and email');
      return;
    }
    
    try {
      // Clear all previous user data to prevent decryption errors
      setMessages([]);
      setConversations({});
      setRecipientId('');
      setOnlineUsers([]);
      setAllUsers([]);
      setUserProfiles({});
      
      // Generate unique user ID from username (like @username)
      const uniqueUserId = '@' + username.toLowerCase().replace(/\s+/g, '') + '_' + Math.random().toString(36).substring(2, 6);
      setUserId(uniqueUserId);
      
      let userAddress;
      
      if (DEV_MODE) {
        // In dev mode, use unique session ID
        userAddress = getDevSessionId();
        setMyWalletAddress(userAddress);
        myWalletAddressRef.current = userAddress;
        setWalletConnected(true);
        console.log('🔧 DEV MODE: Using session ID:', userAddress);
      } else {
        // Production mode: Auto-connect wallet if not connected
        if (!walletConnected || !myWalletAddress) {
          const connected = await autoConnectWallet();
          if (!connected) {
            alert('Unable to connect to wallet. Please ensure MetaMask is installed and unlocked.');
            return;
          }
        }
        
        // Check if on correct network (silently switch if needed)
        const isGanache = await walletService.isGanacheNetwork();
        if (!isGanache) {
          try {
            await walletService.switchToGanache();
            // Wait a moment for network switch
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (error) {
            console.error('Failed to switch network:', error);
            alert('Please manually switch to Ganache network (Chain ID: 1337) in MetaMask');
            return;
          }
        }
        userAddress = myWalletAddress;
      }
      
      // Store wallet address and credentials
      localStorage.setItem('securechat_user_id', userAddress);
      localStorage.setItem('securechat_username', username);
      localStorage.setItem('securechat_email', email);
      localStorage.setItem('securechat_unique_id', uniqueUserId);
      
      // Register with server
      socketRef.current.emit('register-user', {
        walletAddress: userAddress,
        publicKey: publicKeyBase64Ref.current,
        username,
        email,
        userId: uniqueUserId
      });
      
      setRegistered(true);
      setShowLogin(false);
      setBlockchainEnabled(true);
      
      // Request user profiles
      socketRef.current.emit('get-user-profiles');
      setTimeout(() => {
        socketRef.current.emit('get-online-users');
        socketRef.current.emit('get-all-users');
      }, 200);
      
      console.log('✅ Registered with ID:', userAddress);
    } catch (error) {
      console.error('Registration error:', error);
      alert('Failed to register: ' + error.message);
    }
  };

  const handleWalletConnect = (address, chainId) => {
    console.log('🦊 Wallet connected:', address, 'Chain ID:', chainId);
    setMyWalletAddress(address);
    myWalletAddressRef.current = address;
    setWalletConnected(true);
    
    // Check if user was previously registered with this wallet
    const savedUserId = localStorage.getItem('securechat_user_id');
    const savedUsername = localStorage.getItem('securechat_username');
    const savedEmail = localStorage.getItem('securechat_email');
    const savedUniqueId = localStorage.getItem('securechat_unique_id');
    
    if (savedUserId === address && savedUsername && savedEmail) {
      // Clear previous session data before auto-login
      setMessages([]);
      setConversations({});
      setRecipientId('');
      setOnlineUsers([]);
      setAllUsers([]);
      setUserProfiles({});
      
      setUsername(savedUsername);
      setEmail(savedEmail);
      setUserId(savedUniqueId || '@' + savedUsername);
      // Auto-register
      setTimeout(() => {
        if (publicKeyBase64Ref.current) {
          socketRef.current.emit('register-user', {
            walletAddress: address,
            publicKey: publicKeyBase64Ref.current,
            username: savedUsername,
            email: savedEmail,
            userId: savedUniqueId || '@' + savedUsername
          });
          setRegistered(true);
          setShowLogin(false);
          setBlockchainEnabled(true);
          socketRef.current.emit('get-user-profiles');
          socketRef.current.emit('get-online-users');
          socketRef.current.emit('get-all-users');
        }
      }, 500);
    }
  };

  const handleWalletDisconnect = () => {
    setWalletConnected(false);
    setMyWalletAddress('');
    myWalletAddressRef.current = '';
    setBlockchainEnabled(false);
  };

  const autoConnectWallet = async () => {
    try {
      if (!walletService.isMetaMaskInstalled()) {
        console.log('MetaMask not installed - using fallback mode');
        // Generate a fallback wallet address for users without MetaMask
        const fallbackId = localStorage.getItem('securechat_user_id') || 
          'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        setMyWalletAddress(fallbackId);
        myWalletAddressRef.current = fallbackId;
        setWalletConnected(false);
        setBlockchainEnabled(false);
        return false;
      }

      // Silently connect to MetaMask
      const { address, chainId } = await walletService.connectWallet();
      console.log('Auto-connected to wallet:', address);
      setMyWalletAddress(address);
      myWalletAddressRef.current = address;
      setWalletConnected(true);
      setBlockchainEnabled(true);

      // Check if previously registered
      const savedUserId = localStorage.getItem('securechat_user_id');
      const savedUsername = localStorage.getItem('securechat_username');
      const savedEmail = localStorage.getItem('securechat_email');

      if (savedUserId === address && savedUsername && savedEmail) {
        setUsername(savedUsername);
        setEmail(savedEmail);
        // Auto-register
        setTimeout(() => {
          if (publicKeyBase64Ref.current && socketRef.current) {
            socketRef.current.emit('register-user', {
              walletAddress: address,
              publicKey: publicKeyBase64Ref.current,
              username: savedUsername,
              email: savedEmail
            });
            setRegistered(true);
            setShowLogin(false);
            socketRef.current.emit('get-user-profiles');
            socketRef.current.emit('get-online-users');
            socketRef.current.emit('get-all-users');
          }
        }, 500);
      }
      
      return true;
    } catch (error) {
      console.error('Auto-connect failed:', error);
      // Fallback to non-blockchain mode
      const fallbackId = localStorage.getItem('securechat_user_id') || 
        'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      setMyWalletAddress(fallbackId);
      myWalletAddressRef.current = fallbackId;
      setWalletConnected(false);
      setBlockchainEnabled(false);
      return false;
    }
  };

  const fetchReceiverKey = (receiverId) => {
    return new Promise((resolve, reject) => {
      keyFetchPromises.current = { resolve, reject };
      socketRef.current.emit('get-public-key', receiverId);
      setTimeout(() => reject(new Error('Timeout')), 5000);
    });
  };

  const getPublicKey = useCallback(async (receiverId) => {
    // Check cache first
    if (publicKeyCache.current.has(receiverId)) {
      receiverPublicKeyRef.current = publicKeyCache.current.get(receiverId);
      return;
    }
    
    return new Promise((resolve, reject) => {
      keyFetchPromises.current = { resolve, reject };
      socketRef.current.emit('get-public-key', receiverId);
      setTimeout(() => reject(new Error('Timeout')), 5000);
    });
  }, []);
  
  // Update socket listener to cache public keys
  useEffect(() => {
    if (!socketRef.current) return;
    
    const handlePublicKey = async (keyBase64) => {
      if (!keyBase64) return;
      try {
        const binary = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0));
        const publicKey = await crypto.subtle.importKey(
          'spki', binary, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['encrypt']
        );
        receiverPublicKeyRef.current = publicKey;
        
        // Cache the public key
        if (recipientId) {
          publicKeyCache.current.set(recipientId, publicKey);
        }
        
        keyFetchPromises.current.resolve?.();
      } catch (error) {
        keyFetchPromises.current.reject?.(error);
      }
    };
    
    socketRef.current.on('public-key', handlePublicKey);
    
    return () => {
      socketRef.current?.off('public-key', handlePublicKey);
    };
  }, [recipientId]);
  
  const encryptMessage = async (text) => {
    const encrypted = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' }, receiverPublicKeyRef.current, new TextEncoder().encode(text)
    );
    return Array.from(new Uint8Array(encrypted));
  };

  const verifyMessageOnBlockchain = useCallback(async (messageId, messageData) => {
    setVerifyingMessage(messageId);
    socketRef.current.emit('verify-message', {
      messageId,
      from: messageData.from === 'You' ? myWalletAddress : messageData.from,
      to: messageData.from === 'You' ? recipientId : myWalletAddress,
      timestamp: messageData.timestamp
    });
  }, [myWalletAddress, recipientId]);
  
  const requestBlockchainSync = useCallback(() => {
    setBlockchainSyncStatus('syncing');
    socketRef.current.emit('sync-blockchain', {
      userAddress: myWalletAddress
    });
    setTimeout(() => setBlockchainSyncStatus('synced'), 2000);
  }, [myWalletAddress]);
  
  const getUserDisplay = useCallback((address) => {
    if (!address) return 'Unknown';
    // userProfiles is an object with walletAddress as keys
    const profile = userProfiles[address];
    return profile?.username || getDisplayName(address);
  }, [userProfiles]);
  
  // Memoized filtered users
  const filteredUsers = useMemo(() => {
    if (!debouncedSearchQuery) return allUsers;
    return allUsers.filter(userId => {
      const display = getUserDisplay(userId);
      return display.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
             userId.toLowerCase().includes(debouncedSearchQuery.toLowerCase());
    });
  }, [allUsers, debouncedSearchQuery, getUserDisplay]);
  
  const decryptMessage = async (encrypted) => {
    try {
      // Wait for keys if not ready (max 3 seconds)
      let attempts = 0;
      while (!keyPairRef.current?.privateKey && attempts < 30) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      if (!keyPairRef.current?.privateKey) {
        console.error('❌ Decryption failed: Private key not available after waiting');
        return '[Encryption keys not ready - please refresh]';
      }
      if (!encrypted || !Array.isArray(encrypted) || encrypted.length === 0) {
        console.error('❌ Decryption failed: Invalid encrypted data', encrypted);
        return '[Invalid message format]';
      }
      
      const decrypted = await crypto.subtle.decrypt(
        { name: 'RSA-OAEP' }, keyPairRef.current.privateKey, new Uint8Array(encrypted)
      );
      return new TextDecoder().decode(decrypted);
    } catch (error) {
      console.error('❌ Decryption error:', error.message);
      // This error usually means the message was encrypted with a different key
      return '[Cannot decrypt - message may be from a different session]';
    }
  };

  const sendMessage = useCallback(async () => {
    if (!message.trim() || !recipientId) return;
    
    setIsLoading(true);
    try {
      const messageText = message.trim();
      setMessage('');

      // Get public key (from cache if available)
      if (!publicKeyCache.current.has(recipientId)) {
        await getPublicKey(recipientId);
      } else {
        receiverPublicKeyRef.current = publicKeyCache.current.get(recipientId);
      }

      const encrypted = await encryptMessage(messageText);
      
      const newMsg = { 
        from: 'You', 
        text: messageText, 
        timestamp: Date.now(), 
        status: 'sent',
        onBlockchain: blockchainEnabled,
        selfDestruct: selfDestructTimer,
        id: Date.now() + Math.random()
      };
      
      socketRef.current.emit('send-message', { 
        from: myWalletAddress, 
        to: recipientId, 
        encrypted,
        selfDestruct: selfDestructTimer,
        onBlockchain: blockchainEnabled,
        id: newMsg.id
      });
      
      setMessages(prev => [...prev, newMsg]);
      setConversations(prev => ({
        ...prev,
        [recipientId]: [...(prev[recipientId] || []), newMsg]
      }));
      
      // Handle self-destruct with countdown
      if (selfDestructTimer) {
        setMessageCountdowns(prev => ({
          ...prev,
          [newMsg.id]: selfDestructTimer
        }));
        
        const countdownInterval = setInterval(() => {
          setMessageCountdowns(prev => {
            const newCountdowns = {...prev};
            if (newCountdowns[newMsg.id] > 1) {
              newCountdowns[newMsg.id] -= 1;
            } else {
              clearInterval(countdownInterval);
              delete newCountdowns[newMsg.id];
            }
            return newCountdowns;
          });
        }, 1000);
        
        setTimeout(() => {
          setMessages(prev => prev.filter(m => m.id !== newMsg.id));
          setMessageCountdowns(prev => {
            const newCountdowns = {...prev};
            delete newCountdowns[newMsg.id];
            return newCountdowns;
          });
          socketRef.current.emit('delete-message', { messageId: newMsg.id });
        }, selfDestructTimer * 1000);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      alert('Failed to send message. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [message, recipientId, blockchainEnabled, selfDestructTimer, myWalletAddress, getPublicKey]);

  const selectUser = async (userId) => {
    setRecipientId(userId);
    setMessages(conversations[userId] || []);
    socketRef.current.emit('get-conversation', { user1: myWalletAddress, user2: userId });
    try {
      await fetchReceiverKey(userId);
    } catch (error) {}
  };

  const getUserId = (walletAddress) => {
    const profile = userProfiles[walletAddress];
    return profile?.userId || null;
  };

  const getUserAvatar = (userId) => {
    const profile = userProfiles[userId];
    if (profile?.profilePicture) {
      return profile.profilePicture;
    }
    return null;
  };

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const handleUpdateProfile = (profileData) => {
    socketRef.current.emit('update-profile', {
      walletAddress: myWalletAddress,
      ...profileData
    });
    setShowProfileModal(false);
  };

  const handleLogout = () => {
    if (window.confirm('Logout and register as a new user?')) {
      // Clear all localStorage data
      localStorage.removeItem('securechat_user_id');
      localStorage.removeItem('securechat_username');
      localStorage.removeItem('securechat_email');
      localStorage.removeItem('securechat_unique_id');
      // Reload page to reset state
      window.location.reload();
    }
  };

  const openProfileModal = (userId) => {
    setSelectedProfileUser(userId);
    setShowProfileModal(true);
  };

  const handleSaveSettings = (newSettings) => {
    setSettings(newSettings);
    localStorage.setItem('securechat_settings_user', JSON.stringify(newSettings));
  };

  const filteredOnlineUsers = onlineUsers.filter(u => {
    const display = getUserDisplay(u);
    return display && display.toLowerCase().includes(searchQuery.toLowerCase());
  });
  
  const filteredAllUsers = allUsers.filter(u => {
    const display = getUserDisplay(u);
    return display && display.toLowerCase().includes(searchQuery.toLowerCase());
  });

  if (showLogin) {
    return (
      <div className="login-container">
        <div className="login-box">
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px'}}>
            <div>
              <h1 style={{margin: 0}}>⚡ CRYP</h1>
              <p style={{margin: '8px 0', fontSize: '13px', fontWeight: '500'}}>
                Neural-Encrypted Communication
              </p>
            </div>
            <ModeIndicator mode={MODE} config={config} styles={styles} />
          </div>
          
          <input 
                type="text" 
                placeholder="👤 Enter your display name" 
                value={username} 
                onChange={(e) => setUsername(e.target.value)} 
              />
              <input 
                type="email" 
                placeholder="✉️ Enter your email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
              />
              {username && (
                <div style={{padding: '8px 12px', background: 'rgba(0, 168, 132, 0.1)', borderRadius: '8px', marginTop: '8px'}}>
                  <p style={{margin: 0, fontSize: '12px', color: '#00a884'}}>
                    Your ID: <strong>@{username.toLowerCase().replace(/\s+/g, '')}_####</strong>
                  </p>
                </div>
              )}
              <button className="signup-btn" onClick={registerUser}>
                🚀 Get Started
              </button>
          
          {walletConnected && (
            <div style={{marginTop: '20px', padding: '12px', background: 'rgba(0, 168, 132, 0.1)', borderRadius: '8px', border: '1px solid rgba(0, 168, 132, 0.3)'}}>
              <p style={{margin: 0, fontSize: '12px', color: '#00a884'}}>
                ⛓️ Connected to blockchain • {myWalletAddress.substring(0, 6)}...{myWalletAddress.substring(myWalletAddress.length - 4)}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="App">
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-header-top">
            <div className="sidebar-header-left">
              <div className="sidebar-header-info" onClick={() => openProfileModal(myWalletAddress)}>
                <h2 style={{margin: 0, fontSize: '18px', fontWeight: '800', letterSpacing: '0.5px'}}>
                  ⚡ CRYP
                </h2>
                <p style={{margin: '4px 0 0 0', fontSize: '11px', color: '#9a8fb8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px'}}>
                  {userId || '@' + username}
                </p>
              </div>
            </div>
            <div className="header-actions">
              <button 
                className="header-btn"
                onClick={() => openProfileModal(myWalletAddress)}
                title="My Profile"
              >
                👤
              </button>
              <button 
                className="header-btn"
                onClick={() => setShowSettings(true)}
                title="Settings"
              >
                ⚙️
              </button>
              <button 
                className="header-btn blockchain-explorer-btn"
                onClick={() => setShowBlockchainExplorer(true)}
                title="Blockchain Explorer"
              >
                ⛓️
              </button>
              <button 
                className="header-btn danger-btn"
                onClick={handleLogout}
                title="Logout"
              >
                🚪
              </button>
              <ModeIndicator mode={MODE} config={config} styles={styles} />
            </div>
          </div>
        </div>
        <div style={{padding: '16px 20px', background: '#202c33', borderBottom: '1px solid rgba(42, 57, 66, 0.5)'}}>
          <input
            type="text"
            placeholder="🔍 Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%', 
              padding: '10px 16px', 
              background: 'rgba(42, 57, 66, 0.6)', 
              border: '2px solid transparent', 
              borderRadius: '20px', 
              color: '#e9edef', 
              fontSize: '14px',
              outline: 'none',
              transition: 'all 0.3s ease'
            }}
            onFocus={(e) => e.target.style.borderColor = '#00a884'}
            onBlur={(e) => e.target.style.borderColor = 'transparent'}
          />
        </div>
        <div className="users-list">
          <label style={{fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '600', background: 'rgba(32, 44, 51, 0.8)', padding: '12px 20px'}}>🟢 Online ({filteredOnlineUsers.length})</label>
          {filteredOnlineUsers.map((user) => (
            <div key={`online-${user}-${forceUpdate}`} className={`user-item ${recipientId === user ? 'active' : ''}`} onClick={() => selectUser(user)}>
              <div className="user-info">
                <div className="user-name">
                  {getUserDisplay(user)}
                  {getUserId(user) && (
                    <span style={{fontSize: '11px', color: '#8696a0', fontWeight: '400', marginLeft: '4px'}}>
                      {getUserId(user)}
                    </span>
                  )}
                </div>
                <div className="user-status online">● online</div>
              </div>
            </div>
          ))}
          <label style={{marginTop: '10px', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '600', background: 'rgba(32, 44, 51, 0.8)', padding: '12px 20px'}}>⚫ Offline ({filteredAllUsers.length})</label>
          {filteredAllUsers.map((user) => (
            <div key={`offline-${user}-${forceUpdate}`} className={`user-item ${recipientId === user ? 'active' : ''}`} onClick={() => selectUser(user)}>
              <div className="user-info">
                <div className="user-name">
                  {getUserDisplay(user)}
                  {getUserId(user) && (
                    <span style={{fontSize: '11px', color: '#8696a0', fontWeight: '400', marginLeft: '4px'}}>
                      {getUserId(user)}
                    </span>
                  )}
                </div>
                <div className="user-status offline">○ offline</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="chat-area">
        {recipientId ? (
          <>
            <div className="chat-header">
              <div className="chat-header-info" style={{flex: 1, cursor: 'pointer'}} onClick={() => openProfileModal(recipientId)}>
                <h3 style={{fontSize: '17px', fontWeight: '600', marginBottom: '2px'}}>{getUserDisplay(recipientId)}</h3>
                <p style={{fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px'}}>
                  {typingUsers[recipientId] ? '✍️ typing...' : (userProfiles[recipientId]?.status || (onlineUsers.includes(recipientId) ? '🟢 online' : '⚫ offline'))}
                </p>
              </div>
              <div className="chat-header-actions">
                <button className="header-btn" title="Voice call">📞</button>
                <button className="header-btn" title="Video call">📹</button>
                <button className="header-btn" title="Search in chat">🔍</button>
                <button className="header-btn" title="More options">⋮</button>
              </div>
            </div>
            <div className="messages">
              {messages.map((msg, i) => {
                const renderMessageText = (text) => {
                  // Simple code block detection
                  if (text.includes('```')) {
                    const parts = text.split('```');
                    return parts.map((part, idx) => 
                      idx % 2 === 0 ? part : <pre key={idx}><code>{part}</code></pre>
                    );
                  }
                  // Inline code detection
                  if (text.includes('`')) {
                    const parts = text.split('`');
                    return parts.map((part, idx) => 
                      idx % 2 === 0 ? part : <code key={idx}>{part}</code>
                    );
                  }
                  return text;
                };

                const countdown = messageCountdowns[msg.id];
                const isDestructing = countdown && countdown <= 3;
                const isWarning = countdown && countdown <= 10;
                const progress = msg.selfDestruct && countdown ? (countdown / msg.selfDestruct) * 100 : 0;

                return (
                  <div key={i} className={msg.from === 'You' ? 'message sent' : 'message received'} 
                    onContextMenu={(e) => {
                      e.preventDefault();
                      navigator.clipboard.writeText(msg.text);
                    }}
                    title="Right-click to copy"
                  >
                    <div className={`message-bubble ${isDestructing ? 'destructing' : ''} ${isWarning ? 'warning' : ''}`}>
                      {msg.selfDestruct && countdown && (
                        <div 
                          className="self-destruct-progress" 
                          style={{ width: `${progress}%` }}
                        ></div>
                      )}
                      <div className="message-actions">
                        <button className="message-action-btn" onClick={() => navigator.clipboard.writeText(msg.text)} title="Copy">📋</button>
                        {msg.from === 'You' && <button className="message-action-btn" onClick={() => setEditingMessageId(i)} title="Edit">✏️</button>}
                        {msg.onBlockchain && (
                          <button 
                            className="message-action-btn" 
                            onClick={() => verifyMessageOnBlockchain(msg.id || msg.timestamp, msg)} 
                            title="Verify on Blockchain"
                            disabled={verifyingMessage === (msg.id || msg.timestamp)}
                          >
                            {verifyingMessage === (msg.id || msg.timestamp) ? '🔄' : '✔️'}
                          </button>
                        )}
                        <button className="message-action-btn" onClick={() => {
                          if (window.confirm('Delete this message?')) {
                            setMessages(prev => prev.filter((_, idx) => idx !== i));
                          }
                        }} title="Delete">🗑️</button>
                      </div>
                      {msg.from !== 'You' && <div className="message-sender">{getUserDisplay(msg.from)}</div>}
                      <div className="message-text">
                        {renderMessageText(msg.text)}
                        {msg.edited && <span className="edit-indicator">(edited)</span>}
                      </div>
                      <div className="message-time">
                        {new Date(msg.timestamp).toLocaleTimeString()}
                        {msg.from === 'You' && <span style={{marginLeft: '4px'}}>✓✓</span>}
                        {msg.onBlockchain && showBlockchainVerification && (
                          <span className="blockchain-badge" title="Verified on blockchain">
                            ⛓️ Blockchain
                          </span>
                        )}
                        {messageIntegrityStatus[msg.id || msg.timestamp]?.verified && (
                          <span className="integrity-badge" title={`Verified at block #${messageIntegrityStatus[msg.id || msg.timestamp].blockNumber}`}>
                            ✅ Verified
                          </span>
                        )}
                        <span className="encryption-indicator" title="RSA-2048 End-to-End Encrypted">
                          🔐 E2E
                        </span>
                      </div>
                      {countdown && (
                        <div className="self-destruct-timer">
                          🔥 <span className="countdown-number">{countdown}</span>s
                          {countdown <= 3 && ' 💥'}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="input-area">
              <div className="timer-controls">
                <button 
                  className={`timer-btn ${selfDestructTimer === null ? 'active' : ''}`}
                  onClick={() => setSelfDestructTimer(null)}
                >
                  ⏱️ Normal
                </button>
                <button 
                  className={`timer-btn ${selfDestructTimer === 10 ? 'active' : ''}`}
                  onClick={() => setSelfDestructTimer(10)}
                >
                  🔥 10s
                </button>
                <button 
                  className={`timer-btn ${selfDestructTimer === 30 ? 'active' : ''}`}
                  onClick={() => setSelfDestructTimer(30)}
                >
                  🔥 30s
                </button>
                <button 
                  className={`timer-btn ${selfDestructTimer === 60 ? 'active' : ''}`}
                  onClick={() => setSelfDestructTimer(60)}
                >
                  🔥 60s
                </button>
              </div>
              <div className="input-actions-left">
                <button 
                  className="icon-btn" 
                  title="Code Block (Wrap with ```)"
                  onClick={() => setMessage(prev => prev + '```\n\n```')}
                >
                  💻
                </button>
                <button 
                  className="icon-btn" 
                  title="Emoji"
                  onClick={() => {
                    const emojis = ['😊', '👍', '❤️', '😂', '🎉', '🔥', '💯', '✨'];
                    setMessage(prev => prev + emojis[Math.floor(Math.random() * emojis.length)]);
                  }}
                >
                  😊
                </button>
                <button 
                  className="icon-btn" 
                  title="Toggle Blockchain Badges"
                  onClick={() => setShowBlockchainVerification(!showBlockchainVerification)}
                  style={{opacity: showBlockchainVerification ? 1 : 0.4}}
                >
                  ⛓️
                </button>
              </div>
              <div className="input-wrapper">
                <input
                  type="text"
                  placeholder={selfDestructTimer ? `Type message (self-destructs in ${selfDestructTimer}s)...` : "Type a message..."}
                  value={message}
                  onChange={(e) => {
                    setMessage(e.target.value);
                    if (recipientId) socketRef.current.emit('typing', { to: recipientId });
                  }}
                  onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                />
              </div>
              <div className="input-actions-right">
                {message.trim() ? (
                  <button 
                    className={`send-btn ${isSending ? 'sending' : ''}`} 
                    onClick={sendMessage} 
                    title="Send message"
                    disabled={isSending}
                  >
                    <span className="send-icon">{isSending ? '⏳' : '➤'}</span>
                  </button>
                ) : (
                  <button className="icon-btn voice-btn" title="Voice message">
                    🎤
                  </button>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">💬</div>
            <h3 style={{fontSize: '20px', color: '#e9edef', marginBottom: '8px', fontWeight: '600'}}>Welcome to SecureChat</h3>
            <p style={{fontSize: '14px', color: '#8696a0'}}>Select a user from the sidebar to start a secure conversation</p>
            <p style={{fontSize: '12px', color: '#667781', marginTop: '16px'}}>🔐 All messages are end-to-end encrypted</p>
          </div>
        )}
      </div>

      {/* Profile Modal */}
      {showProfileModal && (
        <UserProfileModal
          user={selectedProfileUser}
          profile={userProfiles[selectedProfileUser]}
          isOwnProfile={selectedProfileUser === myWalletAddress}
          onClose={() => setShowProfileModal(false)}
          onUpdateProfile={handleUpdateProfile}
        />
      )}

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSaveSettings={handleSaveSettings}
          mode="user"
        />
      )}
    </div>
  );
}

export default App;
