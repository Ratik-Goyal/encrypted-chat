import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { ModeIndicator } from './components/ModeIndicator';
import { modeConfig, getModeStyles } from './config';
import './App.css';

const MODE = 'user';

function App() {
  const [myId, setMyId] = useState(''); // Socket ID
  const [myWalletAddress, setMyWalletAddress] = useState(''); // Wallet address for messaging
  const [recipientId, setRecipientId] = useState('');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [registered, setRegistered] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [showLogin, setShowLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [userProfiles, setUserProfiles] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [typingUsers, setTypingUsers] = useState({});
  const [conversations, setConversations] = useState({});
  
  const config = modeConfig[MODE];
  const styles = getModeStyles(MODE);
  
  const keyPairRef = useRef(null);
  const publicKeyBase64Ref = useRef(null);
  const receiverPublicKeyRef = useRef(null);
  const socketRef = useRef(null);
  const keyFetchPromises = useRef({});
  const myWalletAddressRef = useRef('');

  useEffect(() => {
    const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3000';
    socketRef.current = io(apiUrl, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });
    
    const socket = socketRef.current;
    generateKeys();

    socket.on('your-id', (id) => setMyId(id));

    socket.on('receive-message', async (data) => {
      const decrypted = await decryptMessage(data.encrypted);
      const newMsg = { from: data.from, text: decrypted, timestamp: data.timestamp };
      setMessages(prev => [...prev, newMsg]);
      setConversations(prev => ({
        ...prev,
        [data.from]: [...(prev[data.from] || []), newMsg]
      }));
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
      // Filter out current user - users array contains wallet addresses
      // Use ref to get current wallet address value
      const currentWallet = myWalletAddressRef.current || socketRef.current?.id;
      const filtered = users.filter(u => u !== currentWallet);
      setOnlineUsers(filtered);
    });
    socket.on('all-users', (users) => {
      // Filter out current user - users array contains wallet addresses
      const currentWallet = myWalletAddressRef.current || socketRef.current?.id;
      const filtered = users.filter(u => u !== currentWallet);
      setAllUsers(filtered);
    });
    socket.on('user-profiles', (profiles) => {
      console.log('📋 User profiles received:', Object.keys(profiles).length, 'profiles');
      setUserProfiles(profiles);
      // Refresh online users list to ensure usernames are displayed
      socketRef.current.emit('get-online-users');
    });
    socket.on('typing', ({ userId }) => {
      setTypingUsers(prev => ({ ...prev, [userId]: true }));
      setTimeout(() => setTypingUsers(prev => ({ ...prev, [userId]: false })), 3000);
    });

    socket.on('conversation-history', async (msgs) => {
      try {
        const decrypted = await Promise.all(
          msgs.map(async (m) => {
            const isFromMe = m.from === myWalletAddress;
            let text;
            
            if (isFromMe) {
              // Messages sent by us - we can't decrypt them (they were encrypted with recipient's key)
              // Check if we have it in our local conversations cache
              const cachedMsg = conversations[m.to]?.find(msg => 
                msg.timestamp === m.timestamp || 
                (msg.from === 'You' && Math.abs(new Date(msg.timestamp) - new Date(m.timestamp)) < 1000)
              );
              text = cachedMsg?.text || '[Message you sent]';
            } else {
              // Messages sent to us - we can decrypt them with our private key
              text = await decryptMessage(m.encrypted);
            }
            
            return {
              from: isFromMe ? 'You' : m.from,
              text: text,
              timestamp: m.timestamp
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
    keyPairRef.current = await crypto.subtle.generateKey(
      { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true, ['encrypt', 'decrypt']
    );
    const exported = await crypto.subtle.exportKey('spki', keyPairRef.current.publicKey);
    publicKeyBase64Ref.current = btoa(String.fromCharCode(...new Uint8Array(exported)));
  };

  const registerUser = () => {
    if (!myId || !username || !email) return alert('Please fill all fields');
    // Use socket ID as wallet address (since we're not using actual wallet)
    const walletAddress = myId;
    setMyWalletAddress(walletAddress);
    myWalletAddressRef.current = walletAddress; // Update ref as well
    socketRef.current.emit('register-user', {
      walletAddress: walletAddress,
      publicKey: publicKeyBase64Ref.current,
      username,
      email
    });
    setRegistered(true);
    setShowLogin(false);
    // Request user profiles first, then online users (with small delay to ensure profiles are saved)
    socketRef.current.emit('get-user-profiles');
    setTimeout(() => {
      socketRef.current.emit('get-online-users');
      socketRef.current.emit('get-all-users');
    }, 200);
  };

  const fetchReceiverKey = (receiverId) => {
    return new Promise((resolve, reject) => {
      keyFetchPromises.current = { resolve, reject };
      socketRef.current.emit('get-public-key', receiverId);
      setTimeout(() => reject(new Error('Timeout')), 5000);
    });
  };

  const encryptMessage = async (text) => {
    const encrypted = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' }, receiverPublicKeyRef.current, new TextEncoder().encode(text)
    );
    return Array.from(new Uint8Array(encrypted));
  };

  const decryptMessage = async (encrypted) => {
    try {
      if (!keyPairRef.current?.privateKey) {
        throw new Error('Private key not available');
      }
      if (!encrypted || !Array.isArray(encrypted) || encrypted.length === 0) {
        throw new Error('Invalid encrypted data');
      }
      const decrypted = await crypto.subtle.decrypt(
        { name: 'RSA-OAEP' }, keyPairRef.current.privateKey, new Uint8Array(encrypted)
      );
      return new TextDecoder().decode(decrypted);
    } catch (error) {
      console.error('Decryption error:', error);
      return '[Unable to decrypt message]';
    }
  };

  const sendMessage = async () => {
    if (!message.trim() || !recipientId || !registered) return;
    try {
      if (!receiverPublicKeyRef.current) {
        try {
          await fetchReceiverKey(recipientId);
        } catch (err) {
          alert('Recipient has never registered. They must sign up at least once before you can send them a message.');
          return;
        }
      }
      const encrypted = await encryptMessage(message);
      const newMsg = { from: 'You', text: message, timestamp: Date.now() };
      socketRef.current.emit('send-message', { from: myWalletAddress, to: recipientId, encrypted });
      setMessages(prev => [...prev, newMsg]);
      setConversations(prev => ({
        ...prev,
        [recipientId]: [...(prev[recipientId] || []), newMsg]
      }));
      setMessage('');
    } catch (error) {
      alert('Failed to send message');
    }
  };

  const selectUser = async (userId) => {
    setRecipientId(userId);
    setMessages(conversations[userId] || []);
    socketRef.current.emit('get-conversation', { user1: myWalletAddress, user2: userId });
    try {
      await fetchReceiverKey(userId);
    } catch (error) {}
  };

  const getUserDisplay = (userId) => {
    if (!userId) return 'Unknown';
    // Check if userId is a wallet address and look it up in profiles
    const profile = userProfiles[userId];
    if (profile?.username) {
      return profile.username;
    }
    // Fallback: show first 8 chars of wallet address
    return userId.slice(0, 8) + '...';
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
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
            <div>
              <h1 style={{margin: 0}}>💬 SecureChat</h1>
              <p style={{margin: '5px 0', color: '#666'}}>End-to-end encrypted messaging</p>
            </div>
            <ModeIndicator mode={MODE} config={config} styles={styles} />
          </div>
          <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="signup-btn" onClick={registerUser}>Sign Up</button>
        </div>
      </div>
    );
  }

  return (
    <div className="App">
      <div className="sidebar">
        <div className="sidebar-header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
          <div>
            <h2 style={{margin: 0}}>💬 SecureChat</h2>
            <p style={{margin: '5px 0'}}>@{username}</p>
          </div>
          <ModeIndicator mode={MODE} config={config} styles={styles} />
        </div>
        <div style={{padding: '10px'}}>
          <input
            type="text"
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{width: '100%', padding: '8px', background: '#2a3942', border: 'none', borderRadius: '8px', color: 'white', fontSize: '14px'}}
          />
        </div>
        <div className="users-list">
          <label>Online ({filteredOnlineUsers.length})</label>
          {filteredOnlineUsers.map((user, i) => (
            <div key={i} className={`user-item ${recipientId === user ? 'active' : ''}`} onClick={() => selectUser(user)}>
              <div className="user-avatar">👤</div>
              <div className="user-info">
                <div className="user-name">{getUserDisplay(user)}</div>
                <div className="user-status online">online</div>
              </div>
            </div>
          ))}
          <label style={{marginTop: '10px'}}>Offline ({filteredAllUsers.length})</label>
          {filteredAllUsers.map((user, i) => (
            <div key={i} className={`user-item ${recipientId === user ? 'active' : ''}`} onClick={() => selectUser(user)}>
              <div className="user-avatar offline">👤</div>
              <div className="user-info">
                <div className="user-name">{getUserDisplay(user)}</div>
                <div className="user-status offline">offline</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="chat-area">
        {recipientId ? (
          <>
            <div className="chat-header">
              <div className="chat-header-avatar">👤</div>
              <div className="chat-header-info">
                <h3>{getUserDisplay(recipientId)}</h3>
                <p>{typingUsers[recipientId] ? 'typing...' : onlineUsers.includes(recipientId) ? 'online' : 'offline'}</p>
              </div>
            </div>
            <div className="messages">
              {messages.map((msg, i) => (
                <div key={i} className={msg.from === 'You' ? 'message sent' : 'message received'}>
                  <div className="message-bubble">
                    {msg.from !== 'You' && <div className="message-sender">{getUserDisplay(msg.from)}</div>}
                    <div className="message-text">{msg.text}</div>
                    <div className="message-time">{new Date(msg.timestamp).toLocaleTimeString()}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="input-area">
              <input
                type="text"
                placeholder="Type a message..."
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  if (recipientId) socketRef.current.emit('typing', { to: recipientId });
                }}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
              />
              <button onClick={sendMessage}>Send</button>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">💬</div>
            <p>Select a user to start chatting</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
