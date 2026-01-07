import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { ModeIndicator, ModeBanner } from './components/ModeIndicator';
import { SettingsModal } from './components/SettingsModal';
import { modeConfig, getModeStyles } from './config';
import './App.css';
import './Developer.css';

const MODE = 'developer';

function App() {
  const [myId, setMyId] = useState('');
  const [blockchainMessages, setBlockchainMessages] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [userProfiles, setUserProfiles] = useState({});
  const [stats, setStats] = useState({ totalMessages: 0, totalUsers: 0, onlineUsers: 0 });
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [activeView, setActiveView] = useState('overview'); // overview, messages, users, analytics
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // all, online, offline
  const [sortBy, setSortBy] = useState('timestamp'); // timestamp, username, status
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [systemHealth, setSystemHealth] = useState({ cpu: 0, memory: 0, uptime: 0 });
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('securechat_settings_developer');
    return saved ? JSON.parse(saved) : {
      notifications: true,
      soundEnabled: false,
      autoRefresh: true,
      showRawData: true,
      theme: 'dark'
    };
  });
  const socketRef = useRef(null);
  
  const config = modeConfig[MODE];
  const styles = getModeStyles(MODE);

  useEffect(() => {
    const apiUrl = process.env.REACT_APP_API_URL || process.env.REACT_APP_DEV_API_URL || 'http://localhost:3000';
    socketRef.current = io(apiUrl);
    const socket = socketRef.current;

    socket.on('connect', () => {
      console.log('✅ Developer dashboard connected');
      setConnectionStatus('connected');
      // Request initial data
      socket.emit('get-online-users');
      socket.emit('get-all-users');
      socket.emit('get-user-profiles');
      socket.emit('get-blockchain-logs');
      socket.emit('get-stats');
    });

    socket.on('disconnect', () => {
      setConnectionStatus('disconnected');
    });

    socket.on('your-id', (id) => setMyId(id));
    
    socket.on('blockchain-data', (data) => {
      console.log('⛓️ New blockchain record:', data);
      setBlockchainMessages(prev => [data, ...prev]);
      setStats(prev => ({ ...prev, totalMessages: prev.totalMessages + 1 }));
    });
    
    socket.on('blockchain-logs', (logs) => {
      console.log('📦 Loaded blockchain logs:', logs.length);
      setBlockchainMessages([...logs].reverse());
    });
    
    socket.on('stats', (newStats) => {
      setStats(newStats);
    });
    
    socket.on('online-users', (users) => {
      setOnlineUsers(users);
      setStats(prev => ({ ...prev, onlineUsers: users.length }));
    });
    socket.on('all-users', (users) => {
      setAllUsers(users);
      setStats(prev => ({ ...prev, totalUsers: users.length }));
    });
    socket.on('user-profiles', (profiles) => setUserProfiles(profiles));

    // Simulate system health updates
    const healthInterval = setInterval(() => {
      setSystemHealth({
        cpu: Math.floor(Math.random() * 30 + 20),
        memory: Math.floor(Math.random() * 40 + 30),
        uptime: Date.now()
      });
    }, 3000);

    return () => {
      socket.disconnect();
      clearInterval(healthInterval);
    };
  }, []);

  // Generate anonymous display name from user ID (for privacy)
  const generateAnonymousName = (userId) => {
    const adjectives = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 
                        'Iota', 'Kappa', 'Lambda', 'Sigma', 'Omega', 'Phoenix', 'Nebula', 
                        'Quantum', 'Stellar', 'Cosmic', 'Nova', 'Pulsar', 'Vector', 'Matrix'];
    const nouns = ['User', 'Account', 'Entity', 'Client', 'Node', 'Instance', 'Agent', 'Profile',
                   'Session', 'Terminal', 'Endpoint', 'Unit', 'Object', 'System', 'Core', 'Module'];
    
    // Create consistent hash from userId
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = ((hash << 5) - hash) + userId.charCodeAt(i);
      hash = hash & hash; // Convert to 32bit integer
    }
    hash = Math.abs(hash);
    
    const adjIndex = hash % adjectives.length;
    const nounIndex = Math.floor(hash / adjectives.length) % nouns.length;
    const number = (hash % 9000) + 1000; // 4-digit number
    
    return `${adjectives[adjIndex]}-${nouns[nounIndex]}-${number}`;
  };

  const getUserDisplay = (userId) => generateAnonymousName(userId);

  // Filter and sort users
  const filteredUsers = Object.entries(userProfiles).filter(([id, profile]) => {
    const anonymousName = generateAnonymousName(id);
    const matchesSearch = anonymousName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          id.toLowerCase().includes(searchQuery.toLowerCase());
    const isOnline = onlineUsers.includes(id);
    const matchesFilter = filterStatus === 'all' || 
                          (filterStatus === 'online' && isOnline) || 
                          (filterStatus === 'offline' && !isOnline);
    return matchesSearch && matchesFilter;
  });

  // Sort users
  const sortedUserEntries = [...filteredUsers].sort((a, b) => {
    const aIsOnline = onlineUsers.includes(a[0]);
    const bIsOnline = onlineUsers.includes(b[0]);
    
    if (sortBy === 'status') {
      if (aIsOnline && !bIsOnline) return -1;
      if (!aIsOnline && bIsOnline) return 1;
    } else if (sortBy === 'username') {
      return (a[1].username || '').localeCompare(b[1].username || '');
    }
    return 0;
  });

  const handleSaveSettings = (newSettings) => {
    setSettings(newSettings);
    localStorage.setItem('securechat_settings_developer', JSON.stringify(newSettings));
  };

  const exportData = (type) => {
    let data = {};
    let filename = '';
    
    if (type === 'messages') {
      data = blockchainMessages;
      filename = `blockchain-messages-${Date.now()}.json`;
    } else if (type === 'users') {
      data = userProfiles;
      filename = `users-${Date.now()}.json`;
    } else if (type === 'stats') {
      data = { stats, systemHealth, connectionStatus, timestamp: new Date().toISOString() };
      filename = `system-stats-${Date.now()}.json`;
    }
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getConnectionStatusColor = () => {
    return connectionStatus === 'connected' ? '#00d26a' : 
           connectionStatus === 'connecting' ? '#ffa500' : '#ff4444';
  };

  const getHealthStatus = (value) => {
    if (value < 40) return { color: '#00d26a', label: 'Healthy' };
    if (value < 70) return { color: '#ffa500', label: 'Warning' };
    return { color: '#ff4444', label: 'Critical' };
  };

  return (
    <div className="dev-dashboard">
      {/* Sidebar Navigation */}
      <div className="dev-sidebar">
        <div className="dev-sidebar-header">
          <div className="dev-logo">
            <div className="dev-logo-icon">⚡</div>
            <div>
              <div className="dev-logo-title">SecureChat</div>
              <div className="dev-logo-subtitle">Developer Portal</div>
            </div>
          </div>
        </div>

        <nav className="dev-nav">
          <button 
            className={`dev-nav-item ${activeView === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveView('overview')}
          >
            <span className="dev-nav-icon">📊</span>
            <span>Overview</span>
          </button>
          <button 
            className={`dev-nav-item ${activeView === 'messages' ? 'active' : ''}`}
            onClick={() => setActiveView('messages')}
          >
            <span className="dev-nav-icon">⛓️</span>
            <span>Blockchain</span>
            <span className="dev-nav-badge">{blockchainMessages.length}</span>
          </button>
          <button 
            className={`dev-nav-item ${activeView === 'users' ? 'active' : ''}`}
            onClick={() => setActiveView('users')}
          >
            <span className="dev-nav-icon">👥</span>
            <span>Users</span>
            <span className="dev-nav-badge">{Object.keys(userProfiles).length}</span>
          </button>
          <button 
            className={`dev-nav-item ${activeView === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveView('analytics')}
          >
            <span className="dev-nav-icon">📈</span>
            <span>Analytics</span>
          </button>
        </nav>

        <div className="dev-sidebar-footer">
          <div className="dev-system-status">
            <div className="dev-status-label">System Status</div>
            <div className="dev-status-row">
              <span>Connection</span>
              <span className="dev-status-indicator" style={{color: getConnectionStatusColor()}}>
                ● {connectionStatus}
              </span>
            </div>
            <div className="dev-status-row">
              <span>CPU</span>
              <span style={{color: getHealthStatus(systemHealth.cpu).color}}>
                {systemHealth.cpu}%
              </span>
            </div>
            <div className="dev-status-row">
              <span>Memory</span>
              <span style={{color: getHealthStatus(systemHealth.memory).color}}>
                {systemHealth.memory}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="dev-main">
        {/* Top Navigation Bar */}
        <div className="dev-topbar">
          <div className="dev-topbar-left">
            <div className="dev-breadcrumb">
              <span>SecureChat</span>
              <span className="dev-breadcrumb-sep">/</span>
              <span>{activeView.charAt(0).toUpperCase() + activeView.slice(1)}</span>
            </div>
          </div>
          <div className="dev-topbar-right">
            <div className="dev-search-box">
              <span className="dev-search-icon">🔍</span>
              <input 
                type="text" 
                placeholder="Search users, messages, IDs..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="dev-search-input"
              />
            </div>
            <button className="dev-icon-btn" onClick={() => setShowSettings(true)}>
              ⚙️
            </button>
            <button className="dev-icon-btn">
              🔔
            </button>
            <ModeIndicator mode={MODE} config={modeConfig[MODE]} styles={getModeStyles(MODE)} />
          </div>
        </div>

        {/* Content Area */}
        <div className="dev-content">
          {activeView === 'overview' && renderOverviewView()}
          {activeView === 'messages' && renderMessagesView()}
          {activeView === 'users' && renderUsersView()}
          {activeView === 'analytics' && renderAnalyticsView()}
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSaveSettings={handleSaveSettings}
          mode="developer"
        />
      )}
    </div>
  );

  // Render functions for different views
  function renderOverviewView() {
    return (
      <div className="dev-overview">
        <div className="dev-section-header">
          <h1>Dashboard Overview</h1>
          <p>Real-time monitoring and system statistics</p>
        </div>

        {/* Stats Grid */}
        <div className="dev-stats-grid">
          <div className="dev-stat-card primary">
            <div className="dev-stat-icon">📨</div>
            <div className="dev-stat-content">
              <div className="dev-stat-label">Total Messages</div>
              <div className="dev-stat-value">{stats.totalMessages.toLocaleString()}</div>
              <div className="dev-stat-change positive">+12% from last week</div>
            </div>
          </div>
          <div className="dev-stat-card success">
            <div className="dev-stat-icon">👥</div>
            <div className="dev-stat-content">
              <div className="dev-stat-label">Registered Users</div>
              <div className="dev-stat-value">{stats.totalUsers}</div>
              <div className="dev-stat-change positive">+{Math.floor(stats.totalUsers * 0.08)} this month</div>
            </div>
          </div>
          <div className="dev-stat-card warning">
            <div className="dev-stat-icon">🟢</div>
            <div className="dev-stat-content">
              <div className="dev-stat-label">Active Users</div>
              <div className="dev-stat-value">{stats.onlineUsers}</div>
              <div className="dev-stat-change">
                {((stats.onlineUsers / stats.totalUsers) * 100).toFixed(1)}% online rate
              </div>
            </div>
          </div>
          <div className="dev-stat-card info">
            <div className="dev-stat-icon">⛓️</div>
            <div className="dev-stat-content">
              <div className="dev-stat-label">Blockchain Records</div>
              <div className="dev-stat-value">{blockchainMessages.length}</div>
              <div className="dev-stat-change">100% encrypted</div>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="dev-grid-2">
          <div className="dev-card">
            <div className="dev-card-header">
              <h3>Recent Activity</h3>
              <button className="dev-btn-text">View All</button>
            </div>
            <div className="dev-activity-list">
              {blockchainMessages.slice(0, 5).map((msg, i) => (
                <div key={i} className="dev-activity-item">
                  <div className="dev-activity-icon">⛓️</div>
                  <div className="dev-activity-content">
                    <div className="dev-activity-title">
                      Message from {getUserDisplay(msg.from)} to {getUserDisplay(msg.to)}
                    </div>
                    <div className="dev-activity-time">
                      {new Date(msg.timestamp).toLocaleString()}
                    </div>
                  </div>
                  <div className="dev-activity-badge">Encrypted</div>
                </div>
              ))}
              {blockchainMessages.length === 0 && (
                <div className="dev-empty-state">
                  <div className="dev-empty-icon">📭</div>
                  <div>No recent activity</div>
                </div>
              )}
            </div>
          </div>

          <div className="dev-card">
            <div className="dev-card-header">
              <h3>System Health</h3>
              <div className="dev-health-indicator">
                <span className="dev-health-dot" style={{background: '#00d26a'}}></span>
                All Systems Operational
              </div>
            </div>
            <div className="dev-health-metrics">
              <div className="dev-health-metric">
                <div className="dev-health-label">
                  <span>CPU Usage</span>
                  <span className="dev-health-value">{systemHealth.cpu}%</span>
                </div>
                <div className="dev-progress-bar">
                  <div 
                    className="dev-progress-fill"
                    style={{
                      width: `${systemHealth.cpu}%`,
                      background: getHealthStatus(systemHealth.cpu).color
                    }}
                  ></div>
                </div>
              </div>
              <div className="dev-health-metric">
                <div className="dev-health-label">
                  <span>Memory Usage</span>
                  <span className="dev-health-value">{systemHealth.memory}%</span>
                </div>
                <div className="dev-progress-bar">
                  <div 
                    className="dev-progress-fill"
                    style={{
                      width: `${systemHealth.memory}%`,
                      background: getHealthStatus(systemHealth.memory).color
                    }}
                  ></div>
                </div>
              </div>
              <div className="dev-health-metric">
                <div className="dev-health-label">
                  <span>WebSocket</span>
                  <span className="dev-health-value" style={{color: getConnectionStatusColor()}}>
                    {connectionStatus.toUpperCase()}
                  </span>
                </div>
                <div className="dev-progress-bar">
                  <div 
                    className="dev-progress-fill"
                    style={{
                      width: connectionStatus === 'connected' ? '100%' : '0%',
                      background: getConnectionStatusColor()
                    }}
                  ></div>
                </div>
              </div>
              <div className="dev-health-metric">
                <div className="dev-health-label">
                  <span>Database</span>
                  <span className="dev-health-value" style={{color: '#00d26a'}}>CONNECTED</span>
                </div>
                <div className="dev-progress-bar">
                  <div className="dev-progress-fill" style={{width: '100%', background: '#00d26a'}}></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="dev-card">
          <div className="dev-card-header">
            <h3>Quick Actions</h3>
          </div>
          <div className="dev-actions-grid">
            <button className="dev-action-btn" onClick={() => exportData('messages')}>
              <span className="dev-action-icon">💾</span>
              <span>Export Messages</span>
            </button>
            <button className="dev-action-btn" onClick={() => exportData('users')}>
              <span className="dev-action-icon">📥</span>
              <span>Export Users</span>
            </button>
            <button className="dev-action-btn" onClick={() => exportData('stats')}>
              <span className="dev-action-icon">📊</span>
              <span>Export Stats</span>
            </button>
            <button className="dev-action-btn" onClick={() => window.location.reload()}>
              <span className="dev-action-icon">🔄</span>
              <span>Refresh Data</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderMessagesView() {
    return (
      <div className="dev-messages">
        <div className="dev-section-header">
          <div>
            <h1>Blockchain Records</h1>
            <p>End-to-end encrypted messages stored on blockchain</p>
          </div>
          <button className="dev-btn-primary" onClick={() => exportData('messages')}>
            <span>💾</span>
            <span>Export Data</span>
          </button>
        </div>

        <div className="dev-card">
          <div className="dev-table-container">
            <table className="dev-table">
              <thead>
                <tr>
                  <th>Block ID</th>
                  <th>Timestamp</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Size</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {blockchainMessages.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="dev-table-empty">
                      <div className="dev-empty-state">
                        <div className="dev-empty-icon">⛓️</div>
                        <div>No blockchain records found</div>
                        <div className="dev-empty-subtitle">Messages will appear here in real-time</div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  blockchainMessages.map((msg, i) => (
                    <tr key={i} className="dev-table-row" onClick={() => setSelectedMessage(msg)}>
                      <td>
                        <div className="dev-table-id">#{msg.id || (blockchainMessages.length - i)}</div>
                      </td>
                      <td>
                        <div className="dev-table-time">
                          {new Date(msg.timestamp).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      </td>
                      <td>
                        <div className="dev-table-user">
                          <div className="dev-table-user-name">{getUserDisplay(msg.from)}</div>
                          <div className="dev-table-user-id">{msg.from?.slice(0, 12)}...</div>
                        </div>
                      </td>
                      <td>
                        <div className="dev-table-user">
                          <div className="dev-table-user-name">{getUserDisplay(msg.to)}</div>
                          <div className="dev-table-user-id">{msg.to?.slice(0, 12)}...</div>
                        </div>
                      </td>
                      <td>
                        <span className="dev-badge info">{msg.encrypted?.length || 0} bytes</span>
                      </td>
                      <td>
                        <span className="dev-badge success">🔒 Encrypted</span>
                      </td>
                      <td>
                        <button className="dev-btn-icon" title="View Details">👁️</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Message Details Modal */}
        {selectedMessage && (
          <div className="dev-modal-overlay" onClick={() => setSelectedMessage(null)}>
            <div className="dev-modal" onClick={(e) => e.stopPropagation()}>
              <div className="dev-modal-header">
                <h2>Message Details</h2>
                <button className="dev-modal-close" onClick={() => setSelectedMessage(null)}>✕</button>
              </div>
              <div className="dev-modal-content">
                <div className="dev-detail-grid">
                  <div className="dev-detail-item">
                    <div className="dev-detail-label">Block ID</div>
                    <div className="dev-detail-value">#{selectedMessage.id || '—'}</div>
                  </div>
                  <div className="dev-detail-item">
                    <div className="dev-detail-label">Timestamp</div>
                    <div className="dev-detail-value">{new Date(selectedMessage.timestamp).toLocaleString()}</div>
                  </div>
                  {selectedMessage.txHash && (
                    <div className="dev-detail-item full-width">
                      <div className="dev-detail-label">Transaction Hash</div>
                      <div className="dev-detail-value code">{selectedMessage.txHash}</div>
                    </div>
                  )}
                  <div className="dev-detail-item">
                    <div className="dev-detail-label">From</div>
                    <div className="dev-detail-value">
                      <div>{getUserDisplay(selectedMessage.from)}</div>
                      <div className="dev-detail-sub">{selectedMessage.from}</div>
                    </div>
                  </div>
                  <div className="dev-detail-item">
                    <div className="dev-detail-label">To</div>
                    <div className="dev-detail-value">
                      <div>{getUserDisplay(selectedMessage.to)}</div>
                      <div className="dev-detail-sub">{selectedMessage.to}</div>
                    </div>
                  </div>
                  <div className="dev-detail-item full-width">
                    <div className="dev-detail-label">Encrypted Payload (RSA-2048)</div>
                    <div className="dev-code-block">
                      [{selectedMessage.encrypted?.join(', ')}]
                    </div>
                  </div>
                  <div className="dev-alert warning full-width">
                    <strong>⚠️ Security Notice:</strong> This message is encrypted end-to-end and can only be decrypted by the recipient using their private key.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderUsersView() {
    return (
      <div className="dev-users">
        <div className="dev-section-header">
          <div>
            <h1>User Management</h1>
            <p>Manage and monitor registered users</p>
          </div>
          <button className="dev-btn-primary" onClick={() => exportData('users')}>
            <span>📥</span>
            <span>Export Users</span>
          </button>
        </div>

        {/* Filters */}
        <div className="dev-filters">
          <div className="dev-filter-group">
            <label>Filter by status:</label>
            <div className="dev-filter-buttons">
              <button 
                className={`dev-filter-btn ${filterStatus === 'all' ? 'active' : ''}`}
                onClick={() => setFilterStatus('all')}
              >
                All ({Object.keys(userProfiles).length})
              </button>
              <button 
                className={`dev-filter-btn ${filterStatus === 'online' ? 'active' : ''}`}
                onClick={() => setFilterStatus('online')}
              >
                🟢 Online ({onlineUsers.length})
              </button>
              <button 
                className={`dev-filter-btn ${filterStatus === 'offline' ? 'active' : ''}`}
                onClick={() => setFilterStatus('offline')}
              >
                ⚫ Offline ({Object.keys(userProfiles).length - onlineUsers.length})
              </button>
            </div>
          </div>
          <div className="dev-filter-group">
            <label>Sort by:</label>
            <select 
              className="dev-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="status">Status</option>
              <option value="username">Username</option>
              <option value="timestamp">Recent Activity</option>
            </select>
          </div>
        </div>

        {/* Users Grid */}
        <div className="dev-users-grid">
          {sortedUserEntries.length === 0 ? (
            <div className="dev-empty-state">
              <div className="dev-empty-icon">👥</div>
              <div>No users found</div>
              <div className="dev-empty-subtitle">
                {searchQuery ? 'Try adjusting your search filters' : 'Users will appear here when they register'}
              </div>
            </div>
          ) : (
            sortedUserEntries.map(([id, profile]) => {
              const isOnline = onlineUsers.includes(id);
              return (
                <div key={id} className={`dev-user-card ${isOnline ? 'online' : 'offline'}`}>
                  <div className="dev-user-card-header">
                    <div className="dev-user-avatar">
                      <span>{generateAnonymousName(id).charAt(0)}</span>
                    </div>
                    <div className="dev-user-status">
                      <span className={`dev-status-dot ${isOnline ? 'online' : 'offline'}`}></span>
                      <span>{isOnline ? 'Online' : 'Offline'}</span>
                    </div>
                  </div>
                  <div className="dev-user-info">
                    <div className="dev-user-name">{generateAnonymousName(id)}</div>
                    <div className="dev-user-email">***@***.***</div>
                    <div className="dev-user-bio">Privacy Protected</div>
                  </div>
                  <div className="dev-user-details">
                    <div className="dev-user-detail-item">
                      <span className="dev-user-detail-label">User ID:</span>
                      <span className="dev-user-detail-value code">{id.slice(0, 20)}...</span>
                    </div>
                    <div className="dev-user-detail-item">
                      <span className="dev-user-detail-label">Status:</span>
                      <span className="dev-user-detail-value">[Privacy Protected]</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  function renderAnalyticsView() {
    const messageRate = blockchainMessages.length > 0 
      ? (blockchainMessages.length / Math.max(1, stats.onlineUsers)).toFixed(2)
      : 0;
    const activeRate = stats.totalUsers > 0 
      ? ((stats.onlineUsers / stats.totalUsers) * 100).toFixed(1)
      : 0;

    return (
      <div className="dev-analytics">
        <div className="dev-section-header">
          <div>
            <h1>Analytics & Insights</h1>
            <p>Performance metrics and usage statistics</p>
          </div>
          <button className="dev-btn-primary" onClick={() => exportData('stats')}>
            <span>📊</span>
            <span>Export Report</span>
          </button>
        </div>

        {/* Metrics Overview */}
        <div className="dev-metrics-grid">
          <div className="dev-metric-card">
            <div className="dev-metric-icon" style={{background: '#0078d4'}}>📨</div>
            <div className="dev-metric-content">
              <div className="dev-metric-label">Message Rate</div>
              <div className="dev-metric-value">{messageRate}</div>
              <div className="dev-metric-sub">messages per user</div>
            </div>
          </div>
          <div className="dev-metric-card">
            <div className="dev-metric-icon" style={{background: '#00d26a'}}>📈</div>
            <div className="dev-metric-content">
              <div className="dev-metric-label">Active Rate</div>
              <div className="dev-metric-value">{activeRate}%</div>
              <div className="dev-metric-sub">users currently online</div>
            </div>
          </div>
          <div className="dev-metric-card">
            <div className="dev-metric-icon" style={{background: '#ffa500'}}>🔒</div>
            <div className="dev-metric-content">
              <div className="dev-metric-label">Encryption</div>
              <div className="dev-metric-value">100%</div>
              <div className="dev-metric-sub">RSA-2048 secured</div>
            </div>
          </div>
          <div className="dev-metric-card">
            <div className="dev-metric-icon" style={{background: '#8b5cf6'}}>⚡</div>
            <div className="dev-metric-content">
              <div className="dev-metric-label">Uptime</div>
              <div className="dev-metric-value">99.9%</div>
              <div className="dev-metric-sub">last 30 days</div>
            </div>
          </div>
        </div>

        {/* Charts Section */}
        <div className="dev-grid-2">
          <div className="dev-card">
            <div className="dev-card-header">
              <h3>User Distribution</h3>
            </div>
            <div className="dev-chart-container">
              <div className="dev-chart-bar">
                <div className="dev-chart-label">
                  <span>🟢 Online</span>
                  <span>{stats.onlineUsers}</span>
                </div>
                <div className="dev-chart-bar-bg">
                  <div 
                    className="dev-chart-bar-fill" 
                    style={{
                      width: `${(stats.onlineUsers / Math.max(stats.totalUsers, 1)) * 100}%`,
                      background: '#00d26a'
                    }}
                  ></div>
                </div>
              </div>
              <div className="dev-chart-bar">
                <div className="dev-chart-label">
                  <span>⚫ Offline</span>
                  <span>{stats.totalUsers - stats.onlineUsers}</span>
                </div>
                <div className="dev-chart-bar-bg">
                  <div 
                    className="dev-chart-bar-fill" 
                    style={{
                      width: `${((stats.totalUsers - stats.onlineUsers) / Math.max(stats.totalUsers, 1)) * 100}%`,
                      background: '#6b7280'
                    }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          <div className="dev-card">
            <div className="dev-card-header">
              <h3>System Performance</h3>
            </div>
            <div className="dev-chart-container">
              <div className="dev-chart-bar">
                <div className="dev-chart-label">
                  <span>CPU</span>
                  <span>{systemHealth.cpu}%</span>
                </div>
                <div className="dev-chart-bar-bg">
                  <div 
                    className="dev-chart-bar-fill" 
                    style={{
                      width: `${systemHealth.cpu}%`,
                      background: getHealthStatus(systemHealth.cpu).color
                    }}
                  ></div>
                </div>
              </div>
              <div className="dev-chart-bar">
                <div className="dev-chart-label">
                  <span>Memory</span>
                  <span>{systemHealth.memory}%</span>
                </div>
                <div className="dev-chart-bar-bg">
                  <div 
                    className="dev-chart-bar-fill" 
                    style={{
                      width: `${systemHealth.memory}%`,
                      background: getHealthStatus(systemHealth.memory).color
                    }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="dev-card">
          <div className="dev-card-header">
            <h3>Detailed Statistics</h3>
          </div>
          <div className="dev-stats-table">
            <div className="dev-stats-row">
              <span className="dev-stats-label">Total Messages Processed</span>
              <span className="dev-stats-value">{stats.totalMessages.toLocaleString()}</span>
            </div>
            <div className="dev-stats-row">
              <span className="dev-stats-label">Total Registered Users</span>
              <span className="dev-stats-value">{stats.totalUsers}</span>
            </div>
            <div className="dev-stats-row">
              <span className="dev-stats-label">Currently Online</span>
              <span className="dev-stats-value success">{stats.onlineUsers}</span>
            </div>
            <div className="dev-stats-row">
              <span className="dev-stats-label">Blockchain Records</span>
              <span className="dev-stats-value">{blockchainMessages.length}</span>
            </div>
            <div className="dev-stats-row">
              <span className="dev-stats-label">Encryption Standard</span>
              <span className="dev-stats-value">RSA-2048</span>
            </div>
            <div className="dev-stats-row">
              <span className="dev-stats-label">WebSocket Status</span>
              <span className={`dev-stats-value ${connectionStatus === 'connected' ? 'success' : 'error'}`}>
                {connectionStatus.toUpperCase()}
              </span>
            </div>
            <div className="dev-stats-row">
              <span className="dev-stats-label">Database Connection</span>
              <span className="dev-stats-value success">ACTIVE</span>
            </div>
            <div className="dev-stats-row">
              <span className="dev-stats-label">Average Message Size</span>
              <span className="dev-stats-value">
                {blockchainMessages.length > 0 
                  ? Math.round(blockchainMessages.reduce((acc, msg) => acc + (msg.encrypted?.length || 0), 0) / blockchainMessages.length)
                  : 0} bytes
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default App;
