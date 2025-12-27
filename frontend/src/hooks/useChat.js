import { useState, useEffect, useRef, useCallback } from 'react';
import socketService from '../services/socketService';
import encryptionService from '../services/encryptionService';

export const useChat = () => {
  const [myId, setMyId] = useState('');
  const [messages, setMessages] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [userProfiles, setUserProfiles] = useState({});
  const [typingUsers, setTypingUsers] = useState({});
  const [conversations, setConversations] = useState({});
  const [blockchainMessages, setBlockchainMessages] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  
  const receiverPublicKeyRef = useRef(null);
  const keyFetchPromises = useRef({});

  useEffect(() => {
    const socket = socketService.connect();
    setIsConnected(true);

    encryptionService.generateKeys();

    socket.on('your-id', (id) => {
      setMyId(id);
    });

    socket.on('receive-message', async (data) => {
      try {
        const decrypted = await encryptionService.decrypt(data.encrypted);
        const newMsg = { from: data.from, text: decrypted, timestamp: data.timestamp };
        setMessages(prev => [...prev, newMsg]);
        setConversations(prev => ({
          ...prev,
          [data.from]: [...(prev[data.from] || []), newMsg]
        }));
      } catch (error) {
        console.error('Failed to decrypt message:', error);
      }
    });

    socket.on('public-key', async (keyBase64) => {
      if (!keyBase64) {
        keyFetchPromises.current.reject?.(new Error('No public key received'));
        return;
      }
      try {
        receiverPublicKeyRef.current = await encryptionService.importPublicKey(keyBase64);
        keyFetchPromises.current.resolve?.();
      } catch (error) {
        keyFetchPromises.current.reject?.(error);
      }
    });

    socket.on('online-users', (users) => {
      setOnlineUsers(users.filter(u => u !== myId));
    });

    socket.on('all-users', (users) => {
      setAllUsers(users.filter(u => u !== myId));
    });

    socket.on('user-profiles', (profiles) => {
      setUserProfiles(profiles);
    });

    socket.on('typing', ({ userId }) => {
      setTypingUsers(prev => ({ ...prev, [userId]: true }));
      setTimeout(() => {
        setTypingUsers(prev => ({ ...prev, [userId]: false }));
      }, 3000);
    });

    socket.on('conversation-history', async (msgs) => {
      try {
        const decrypted = await Promise.all(
          msgs.map(async (m) => ({
            from: m.from === myId ? 'You' : m.from,
            text: await encryptionService.decrypt(m.encrypted),
            timestamp: m.timestamp
          }))
        );
        setMessages(decrypted);
      } catch (error) {
        console.error('Failed to load conversation:', error);
      }
    });

    socket.on('blockchain-data', (data) => {
      setBlockchainMessages(prev => [...prev, data]);
    });

    return () => {
      socketService.disconnect();
      setIsConnected(false);
    };
  }, [myId]);

  const fetchReceiverKey = useCallback((receiverId) => {
    return new Promise((resolve, reject) => {
      keyFetchPromises.current = { resolve, reject };
      socketService.emit('get-public-key', receiverId);
      setTimeout(() => reject(new Error('Key fetch timeout')), 5000);
    });
  }, []);

  const sendMessage = useCallback(async (recipientId, messageText) => {
    try {
      if (!receiverPublicKeyRef.current) {
        await fetchReceiverKey(recipientId);
      }
      
      const encrypted = await encryptionService.encrypt(messageText, receiverPublicKeyRef.current);
      const newMsg = { from: 'You', text: messageText, timestamp: Date.now() };
      
      socketService.emit('send-message', { from: myId, to: recipientId, encrypted });
      
      setMessages(prev => [...prev, newMsg]);
      setConversations(prev => ({
        ...prev,
        [recipientId]: [...(prev[recipientId] || []), newMsg]
      }));
      
      setBlockchainMessages(prev => [...prev, {
        from: myId,
        to: recipientId,
        encrypted,
        timestamp: Date.now()
      }]);
      
      return true;
    } catch (error) {
      console.error('Send message failed:', error);
      throw error;
    }
  }, [myId, fetchReceiverKey]);

  const selectUser = useCallback(async (userId) => {
    setMessages(conversations[userId] || []);
    socketService.emit('get-conversation', { user1: myId, user2: userId });
    try {
      await fetchReceiverKey(userId);
    } catch (error) {
      console.error('Failed to fetch key:', error);
    }
  }, [myId, conversations, fetchReceiverKey]);

  const registerUser = useCallback((username, email) => {
    socketService.emit('register-user', {
      walletAddress: myId,
      publicKey: encryptionService.getPublicKey(),
      username,
      email
    });
    socketService.emit('get-online-users');
    socketService.emit('get-all-users');
    socketService.emit('get-user-profiles');
  }, [myId]);

  const sendTypingIndicator = useCallback((recipientId) => {
    socketService.emit('typing', { to: recipientId });
  }, []);

  return {
    myId,
    messages,
    onlineUsers,
    allUsers,
    userProfiles,
    typingUsers,
    blockchainMessages,
    isConnected,
    sendMessage,
    selectUser,
    registerUser,
    sendTypingIndicator
  };
};
