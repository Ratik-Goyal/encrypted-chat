import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { ModeIndicator, ModeBanner } from './components/ModeIndicator';
import { modeConfig, getModeStyles } from './config';
import './App.css';

const MODE = 'developer';

function App() {
  const [myId, setMyId] = useState('');
  const [blockchainMessages, setBlockchainMessages] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [userProfiles, setUserProfiles] = useState({});
  const [stats, setStats] = useState({ totalMessages: 0, totalUsers: 0, onlineUsers: 0 });
  const [selectedMessage, setSelectedMessage] = useState(null);
  const socketRef = useRef(null);
  
  const config = modeConfig[MODE];
  const styles = getModeStyles(MODE);

  useEffect(() => {
    socketRef.current = io('http://localhost:3000');
    const socket = socketRef.current;

    socket.on('connect', () => {
      console.log('✅ Developer connected to backend');
    });

    socket.on('disconnect', () => {
      console.log('❌ Developer disconnected from backend');
    });

    socket.on('your-id', (id) => {
      console.log('🆔 Developer ID:', id);
      setMyId(id);
    });

    socket.on('blockchain-data', (data) => {
      console.log('📦 Blockchain data received:', data);
      setBlockchainMessages(prev => [...prev, data]);
      setStats(prev => ({ ...prev, totalMessages: prev.totalMessages + 1 }));
    });

    socket.on('online-users', (users) => {
      console.log('👥 Online users:', users);
      setStats(prev => ({ ...prev, onlineUsers: users.length }));
    });

    socket.on('all-users', (users) => {
      console.log('📋 All users:', users);
      setAllUsers(users);
      setStats(prev => ({ ...prev, totalUsers: users.length }));
    });

    socket.on('user-profiles', (profiles) => {
      console.log('👤 User profiles:', profiles);
      setUserProfiles(profiles);
    });

    socket.on('error', (error) => {
      console.error('❌ Socket error:', error);
    });

    // Request initial data
    setTimeout(() => {
      console.log('📡 Requesting initial data...');
      socket.emit('get-online-users');
      socket.emit('get-all-users');
      socket.emit('get-user-profiles');
    }, 500);

    return () => socket.disconnect();
  }, []);

  const getUserDisplay = (userId) => userProfiles[userId]?.username || userId?.slice(0, 8) + '...';

  return (
    <div style={{background: styles.background, minHeight: '100vh', color: styles.text, fontFamily: 'monospace'}}>
      {/* Header with mode indicator */}
      <div style={{background: styles.surface, padding: '20px', borderBottom: `3px solid ${styles.primary}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <div>
          <h1 style={{margin: 0, color: styles.primary}}>🔧 Developer Dashboard</h1>
          <p style={{margin: '5px 0', color: styles.muted, fontSize: '14px'}}>{config.description}</p>
        </div>
        <ModeIndicator mode={MODE} config={config} styles={styles} />
      </div>

      {/* Developer warning banner */}
      <ModeBanner mode={MODE} config={config} styles={styles} />

      <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', padding: '20px'}}>
        <div style={{background: styles.surface, padding: '20px', borderRadius: '10px', border: `2px solid ${styles.primary}`, boxShadow: `0 0 10px ${styles.primary}40`}}>
          <div style={{fontSize: '14px', color: styles.muted}}>Total Messages</div>
          <div style={{fontSize: '32px', color: styles.primary, fontWeight: 'bold'}}>{stats.totalMessages}</div>
        </div>
        <div style={{background: styles.surface, padding: '20px', borderRadius: '10px', border: `2px solid ${styles.secondary}`, boxShadow: `0 0 10px ${styles.secondary}40`}}>
          <div style={{fontSize: '14px', color: styles.muted}}>Total Users</div>
          <div style={{fontSize: '32px', color: styles.secondary, fontWeight: 'bold'}}>{stats.totalUsers}</div>
        </div>
        <div style={{background: styles.surface, padding: '20px', borderRadius: '10px', border: `2px solid ${styles.danger}`, boxShadow: `0 0 10px ${styles.danger}40`}}>
          <div style={{fontSize: '14px', color: styles.muted}}>Online Now</div>
          <div style={{fontSize: '32px', color: styles.danger, fontWeight: 'bold'}}>{stats.onlineUsers}</div>
        </div>
      </div>

      <div style={{padding: '0 20px 20px'}}>
        <div style={{background: styles.surface, padding: '20px', borderRadius: '10px', border: `2px solid ${styles.primary}`}}>
          <h2 style={{color: styles.primary, marginTop: 0}}>⛓️ Blockchain Records (Encrypted Messages)</h2>
          <p style={{color: styles.muted, fontSize: '13px', marginBottom: '20px'}}>
            All messages are encrypted end-to-end. Only sender and receiver can decrypt.
          </p>

          {blockchainMessages.length === 0 ? (
            <div style={{textAlign: 'center', padding: '60px', color: styles.muted}}>
              <div style={{fontSize: '48px'}}>📦</div>
              <p>No blockchain records yet</p>
              <p style={{fontSize: '12px'}}>Messages will appear here in real-time</p>
            </div>
          ) : (
            <div style={{maxHeight: '600px', overflowY: 'auto'}}>
              {blockchainMessages.map((msg, i) => (
                <div 
                  key={i} 
                  onClick={() => setSelectedMessage(msg)}
                  style={{
                    background: selectedMessage === msg ? '#2a3f5f' : '#0f1729',
                    padding: '15px',
                    borderRadius: '8px',
                    marginBottom: '10px',
                    border: '1px solid #2a3f5f',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '10px'}}>
                    <div style={{color: '#00a884', fontSize: '14px', fontWeight: 'bold'}}>
                      Block #{blockchainMessages.length - i}
                    </div>
                    <div style={{color: '#8696a0', fontSize: '12px'}}>
                      {new Date(msg.timestamp).toLocaleString()}
                    </div>
                  </div>
                  
                  <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px'}}>
                    <div>
                      <div style={{color: '#8696a0', fontSize: '11px'}}>FROM</div>
                      <div style={{color: '#4a9eff', fontSize: '12px'}}>{getUserDisplay(msg.from)}</div>
                      <div style={{color: '#666', fontSize: '10px'}}>{msg.from?.slice(0, 16)}...</div>
                    </div>
                    <div>
                      <div style={{color: '#8696a0', fontSize: '11px'}}>TO</div>
                      <div style={{color: '#4a9eff', fontSize: '12px'}}>{getUserDisplay(msg.to)}</div>
                      <div style={{color: '#666', fontSize: '10px'}}>{msg.to?.slice(0, 16)}...</div>
                    </div>
                  </div>

                  <div style={{marginTop: '10px'}}>
                    <div style={{color: '#ff6b6b', fontSize: '11px', marginBottom: '5px'}}>
                      🔒 ENCRYPTED DATA (RSA-2048) - {msg.encrypted?.length} bytes
                    </div>
                    <div style={{
                      background: '#000',
                      padding: '10px',
                      borderRadius: '5px',
                      color: '#4a9eff',
                      fontSize: '10px',
                      wordBreak: 'break-all',
                      maxHeight: selectedMessage === msg ? 'none' : '60px',
                      overflow: 'hidden',
                      fontFamily: 'Courier New'
                    }}>
                      [{msg.encrypted?.slice(0, selectedMessage === msg ? msg.encrypted.length : 200).join(', ')}
                      {selectedMessage !== msg && msg.encrypted?.length > 200 && '...'}]
                    </div>
                    {selectedMessage !== msg && (
                      <div style={{color: '#00a884', fontSize: '11px', marginTop: '5px', textAlign: 'center'}}>
                        Click to expand
                      </div>
                    )}
                  </div>

                  <div style={{
                    marginTop: '10px',
                    padding: '8px',
                    background: '#1a1f3a',
                    borderRadius: '5px',
                    color: '#ff6b6b',
                    fontSize: '10px',
                    textAlign: 'center'
                  }}>
                    ⚠️ CANNOT BE DECRYPTED - Recipient's private key required
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{padding: '0 20px 20px'}}>
        <div style={{background: '#1a1f3a', padding: '20px', borderRadius: '10px', border: '1px solid #2a3f5f'}}>
          <h2 style={{color: '#00a884', marginTop: 0}}>👥 Registered Users</h2>
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '10px'}}>
            {Object.entries(userProfiles).map(([id, profile]) => (
              <div key={id} style={{background: '#0f1729', padding: '15px', borderRadius: '8px', border: '1px solid #2a3f5f'}}>
                <div style={{color: '#4a9eff', fontSize: '14px', fontWeight: 'bold'}}>{profile.username}</div>
                <div style={{color: '#8696a0', fontSize: '12px'}}>{profile.email}</div>
                <div style={{color: '#666', fontSize: '10px', marginTop: '5px'}}>{id.slice(0, 20)}...</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
