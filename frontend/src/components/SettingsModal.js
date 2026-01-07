import React, { useState } from 'react';

export const SettingsModal = ({ onClose, settings, onSaveSettings, mode = 'user' }) => {
  const [activeTab, setActiveTab] = useState('general');
  const [localSettings, setLocalSettings] = useState({
    // User settings
    notifications: settings?.notifications ?? true,
    soundEnabled: settings?.soundEnabled ?? true,
    enterToSend: settings?.enterToSend ?? true,
    showTypingIndicator: settings?.showTypingIndicator ?? true,
    showReadReceipts: settings?.showReadReceipts ?? true,
    showOnlineStatus: settings?.showOnlineStatus ?? true,
    theme: settings?.theme ?? 'dark',
    fontSize: settings?.fontSize ?? 'medium',
    messagePreview: settings?.messagePreview ?? true,
    autoDownloadMedia: settings?.autoDownloadMedia ?? true,
    dataUsage: settings?.dataUsage ?? 'auto',
    // Developer settings
    autoRefresh: settings?.autoRefresh ?? true,
    refreshInterval: settings?.refreshInterval ?? 5,
    showRawData: settings?.showRawData ?? true,
    debugMode: settings?.debugMode ?? false,
    consoleLogging: settings?.consoleLogging ?? true,
    showTimestamps: settings?.showTimestamps ?? true,
    showEncryptedData: settings?.showEncryptedData ?? true,
    monitorPerformance: settings?.monitorPerformance ?? false,
    logLevel: settings?.logLevel ?? 'info',
    maxLogsDisplay: settings?.maxLogsDisplay ?? 100,
    highlightErrors: settings?.highlightErrors ?? true,
    compactView: settings?.compactView ?? false,
    ...settings
  });

  const handleSave = () => {
    onSaveSettings(localSettings);
    localStorage.setItem(`securechat_settings_${mode}`, JSON.stringify(localSettings));
    onClose();
  };

  const handleReset = () => {
    const defaultSettings = mode === 'developer' ? {
      notifications: true,
      soundEnabled: false,
      autoRefresh: true,
      refreshInterval: 5,
      showRawData: true,
      debugMode: false,
      consoleLogging: true,
      showTimestamps: true,
      showEncryptedData: true,
      monitorPerformance: false,
      logLevel: 'info',
      maxLogsDisplay: 100,
      highlightErrors: true,
      compactView: false,
      theme: 'dark',
      fontSize: 'medium'
    } : {
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
      dataUsage: 'auto'
    };
    setLocalSettings(defaultSettings);
  };

  const tabs = mode === 'developer' ? [
    { id: 'general', icon: '⚙️', label: 'General' },
    { id: 'dashboard', icon: '📊', label: 'Dashboard' },
    { id: 'debugging', icon: '🐛', label: 'Debugging' },
    { id: 'monitoring', icon: '📈', label: 'Monitoring' },
    { id: 'advanced', icon: '🔧', label: 'Advanced' }
  ] : [
    { id: 'general', icon: '⚙️', label: 'General' },
    { id: 'privacy', icon: '🔒', label: 'Privacy' },
    { id: 'notifications', icon: '🔔', label: 'Notifications' },
    { id: 'appearance', icon: '🎨', label: 'Appearance' },
    { id: 'data', icon: '💾', label: 'Data & Storage' }
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{maxWidth: '700px', maxHeight: '80vh'}}>
        <div className="modal-header">
          <h2>⚙️ Settings</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        
        <div style={{display: 'flex', height: '500px'}}>
          {/* Sidebar Tabs */}
          <div style={{
            width: '200px',
            background: '#1a1f3a',
            borderRight: '1px solid #2a3942',
            padding: '20px 0'
          }}>
            {tabs.map(tab => (
              <div
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '15px 20px',
                  cursor: 'pointer',
                  background: activeTab === tab.id ? '#00a884' : 'transparent',
                  color: activeTab === tab.id ? 'white' : '#8696a0',
                  borderLeft: activeTab === tab.id ? '4px solid #06cf9c' : '4px solid transparent',
                  transition: 'all 0.2s ease',
                  fontSize: '14px',
                  fontWeight: activeTab === tab.id ? '600' : '400'
                }}
              >
                {tab.icon} {tab.label}
              </div>
            ))}
          </div>

          {/* Content Area */}
          <div style={{flex: 1, padding: '24px', overflowY: 'auto', background: '#202c33'}}>
            {/* General Tab - Developer Mode */}
            {mode === 'developer' && activeTab === 'general' && (
              <div>
                <h3 style={{color: '#e9edef', marginTop: 0, marginBottom: '20px'}}>General Settings</h3>
                
                <div style={{marginBottom: '24px'}}>
                  <label style={{display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer'}}>
                    <input
                      type="checkbox"
                      checked={localSettings.autoRefresh}
                      onChange={(e) => setLocalSettings({...localSettings, autoRefresh: e.target.checked})}
                      style={{width: '18px', height: '18px', cursor: 'pointer'}}
                    />
                    <div>
                      <div style={{color: '#e9edef', fontSize: '15px', fontWeight: '500'}}>Auto-Refresh Dashboard</div>
                      <div style={{color: '#8696a0', fontSize: '13px'}}>Automatically refresh blockchain logs and stats</div>
                    </div>
                  </label>
                </div>

                <div style={{marginBottom: '24px'}}>
                  <label style={{color: '#8696a0', fontSize: '13px', marginBottom: '8px', display: 'block'}}>
                    Refresh Interval (seconds)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={localSettings.refreshInterval}
                    onChange={(e) => setLocalSettings({...localSettings, refreshInterval: parseInt(e.target.value) || 5})}
                    disabled={!localSettings.autoRefresh}
                    style={{
                      width: '100%',
                      padding: '10px',
                      background: '#2a3942',
                      border: '1px solid #4a9eff',
                      borderRadius: '8px',
                      color: '#e9edef',
                      fontSize: '14px'
                    }}
                  />
                </div>

                <div style={{marginBottom: '24px'}}>
                  <label style={{display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer'}}>
                    <input
                      type="checkbox"
                      checked={localSettings.consoleLogging}
                      onChange={(e) => setLocalSettings({...localSettings, consoleLogging: e.target.checked})}
                      style={{width: '18px', height: '18px', cursor: 'pointer'}}
                    />
                    <div>
                      <div style={{color: '#e9edef', fontSize: '15px', fontWeight: '500'}}>Console Logging</div>
                      <div style={{color: '#8696a0', fontSize: '13px'}}>Log events to browser console</div>
                    </div>
                  </label>
                </div>

                <div style={{marginBottom: '24px'}}>
                  <label style={{display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer'}}>
                    <input
                      type="checkbox"
                      checked={localSettings.notifications}
                      onChange={(e) => setLocalSettings({...localSettings, notifications: e.target.checked})}
                      style={{width: '18px', height: '18px', cursor: 'pointer'}}
                    />
                    <div>
                      <div style={{color: '#e9edef', fontSize: '15px', fontWeight: '500'}}>Desktop Notifications</div>
                      <div style={{color: '#8696a0', fontSize: '13px'}}>Get notified of new blockchain transactions</div>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* Dashboard Tab - Developer Mode */}
            {mode === 'developer' && activeTab === 'dashboard' && (
              <div>
                <h3 style={{color: '#e9edef', marginTop: 0, marginBottom: '20px'}}>Dashboard Display</h3>
                
                <div style={{marginBottom: '24px'}}>
                  <label style={{display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer'}}>
                    <input
                      type="checkbox"
                      checked={localSettings.showRawData}
                      onChange={(e) => setLocalSettings({...localSettings, showRawData: e.target.checked})}
                      style={{width: '18px', height: '18px', cursor: 'pointer'}}
                    />
                    <div>
                      <div style={{color: '#e9edef', fontSize: '15px', fontWeight: '500'}}>Show Raw Data</div>
                      <div style={{color: '#8696a0', fontSize: '13px'}}>Display raw blockchain data and transaction details</div>
                    </div>
                  </label>
                </div>

                <div style={{marginBottom: '24px'}}>
                  <label style={{display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer'}}>
                    <input
                      type="checkbox"
                      checked={localSettings.showEncryptedData}
                      onChange={(e) => setLocalSettings({...localSettings, showEncryptedData: e.target.checked})}
                      style={{width: '18px', height: '18px', cursor: 'pointer'}}
                    />
                    <div>
                      <div style={{color: '#e9edef', fontSize: '15px', fontWeight: '500'}}>Show Encrypted Messages</div>
                      <div style={{color: '#8696a0', fontSize: '13px'}}>Display encrypted message arrays</div>
                    </div>
                  </label>
                </div>

                <div style={{marginBottom: '24px'}}>
                  <label style={{display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer'}}>
                    <input
                      type="checkbox"
                      checked={localSettings.showTimestamps}
                      onChange={(e) => setLocalSettings({...localSettings, showTimestamps: e.target.checked})}
                      style={{width: '18px', height: '18px', cursor: 'pointer'}}
                    />
                    <div>
                      <div style={{color: '#e9edef', fontSize: '15px', fontWeight: '500'}}>Show Timestamps</div>
                      <div style={{color: '#8696a0', fontSize: '13px'}}>Display precise timestamps for all events</div>
                    </div>
                  </label>
                </div>

                <div style={{marginBottom: '24px'}}>
                  <label style={{display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer'}}>
                    <input
                      type="checkbox"
                      checked={localSettings.compactView}
                      onChange={(e) => setLocalSettings({...localSettings, compactView: e.target.checked})}
                      style={{width: '18px', height: '18px', cursor: 'pointer'}}
                    />
                    <div>
                      <div style={{color: '#e9edef', fontSize: '15px', fontWeight: '500'}}>Compact View</div>
                      <div style={{color: '#8696a0', fontSize: '13px'}}>Show more data in less space</div>
                    </div>
                  </label>
                </div>

                <div style={{marginBottom: '24px'}}>
                  <label style={{color: '#8696a0', fontSize: '13px', marginBottom: '8px', display: 'block'}}>
                    Maximum Logs to Display
                  </label>
                  <select
                    value={localSettings.maxLogsDisplay}
                    onChange={(e) => setLocalSettings({...localSettings, maxLogsDisplay: parseInt(e.target.value)})}
                    style={{
                      width: '100%',
                      padding: '10px',
                      background: '#2a3942',
                      border: '1px solid #4a9eff',
                      borderRadius: '8px',
                      color: '#e9edef',
                      fontSize: '14px',
                      cursor: 'pointer'
                    }}
                  >
                    <option value={50}>50 logs</option>
                    <option value={100}>100 logs</option>
                    <option value={200}>200 logs</option>
                    <option value={500}>500 logs</option>
                    <option value={-1}>Unlimited</option>
                  </select>
                </div>
              </div>
            )}

            {/* Debugging Tab - Developer Mode */}
            {mode === 'developer' && activeTab === 'debugging' && (
              <div>
                <h3 style={{color: '#e9edef', marginTop: 0, marginBottom: '20px'}}>Debugging Tools</h3>
                
                <div style={{marginBottom: '24px'}}>
                  <label style={{display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer'}}>
                    <input
                      type="checkbox"
                      checked={localSettings.debugMode}
                      onChange={(e) => setLocalSettings({...localSettings, debugMode: e.target.checked})}
                      style={{width: '18px', height: '18px', cursor: 'pointer'}}
                    />
                    <div>
                      <div style={{color: '#e9edef', fontSize: '15px', fontWeight: '500'}}>Debug Mode</div>
                      <div style={{color: '#8696a0', fontSize: '13px'}}>Enable verbose debugging output</div>
                    </div>
                  </label>
                </div>

                <div style={{marginBottom: '24px'}}>
                  <label style={{display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer'}}>
                    <input
                      type="checkbox"
                      checked={localSettings.highlightErrors}
                      onChange={(e) => setLocalSettings({...localSettings, highlightErrors: e.target.checked})}
                      style={{width: '18px', height: '18px', cursor: 'pointer'}}
                    />
                    <div>
                      <div style={{color: '#e9edef', fontSize: '15px', fontWeight: '500'}}>Highlight Errors</div>
                      <div style={{color: '#8696a0', fontSize: '13px'}}>Visually highlight errors and warnings</div>
                    </div>
                  </label>
                </div>

                <div style={{marginBottom: '24px'}}>
                  <label style={{color: '#8696a0', fontSize: '13px', marginBottom: '8px', display: 'block'}}>
                    Log Level
                  </label>
                  <select
                    value={localSettings.logLevel}
                    onChange={(e) => setLocalSettings({...localSettings, logLevel: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '10px',
                      background: '#2a3942',
                      border: '1px solid #4a9eff',
                      borderRadius: '8px',
                      color: '#e9edef',
                      fontSize: '14px',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="error">Error Only</option>
                    <option value="warn">Warnings & Errors</option>
                    <option value="info">Info, Warnings & Errors</option>
                    <option value="debug">Debug (All Logs)</option>
                  </select>
                </div>

                <div style={{
                  background: '#1a1f3a',
                  padding: '16px',
                  borderRadius: '8px',
                  marginTop: '24px',
                  border: '1px solid #4a9eff'
                }}>
                  <div style={{color: '#4a9eff', fontSize: '14px', fontWeight: '600', marginBottom: '8px'}}>
                    🐛 Developer Tools
                  </div>
                  <div style={{color: '#8696a0', fontSize: '13px', lineHeight: '1.5'}}>
                    Use browser DevTools (F12) for advanced debugging. Check Network tab for API calls.
                  </div>
                </div>
              </div>
            )}

            {/* Monitoring Tab - Developer Mode */}
            {mode === 'developer' && activeTab === 'monitoring' && (
              <div>
                <h3 style={{color: '#e9edef', marginTop: 0, marginBottom: '20px'}}>Performance Monitoring</h3>
                
                <div style={{marginBottom: '24px'}}>
                  <label style={{display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer'}}>
                    <input
                      type="checkbox"
                      checked={localSettings.monitorPerformance}
                      onChange={(e) => setLocalSettings({...localSettings, monitorPerformance: e.target.checked})}
                      style={{width: '18px', height: '18px', cursor: 'pointer'}}
                    />
                    <div>
                      <div style={{color: '#e9edef', fontSize: '15px', fontWeight: '500'}}>Enable Performance Monitoring</div>
                      <div style={{color: '#8696a0', fontSize: '13px'}}>Track response times and resource usage</div>
                    </div>
                  </label>
                </div>

                <div style={{
                  background: '#1a1f3a',
                  padding: '16px',
                  borderRadius: '8px',
                  marginTop: '24px'
                }}>
                  <div style={{color: '#e9edef', fontSize: '14px', fontWeight: '600', marginBottom: '12px'}}>
                    📊 System Information
                  </div>
                  <div style={{display: 'grid', gap: '8px'}}>
                    <div style={{display: 'flex', justifyContent: 'space-between'}}>
                      <span style={{color: '#8696a0', fontSize: '13px'}}>WebSocket Status:</span>
                      <span style={{color: '#00a884', fontSize: '13px', fontWeight: '600'}}>Connected</span>
                    </div>
                    <div style={{display: 'flex', justifyContent: 'space-between'}}>
                      <span style={{color: '#8696a0', fontSize: '13px'}}>API Endpoint:</span>
                      <span style={{color: '#4a9eff', fontSize: '13px'}}>localhost:3000</span>
                    </div>
                    <div style={{display: 'flex', justifyContent: 'space-between'}}>
                      <span style={{color: '#8696a0', fontSize: '13px'}}>Database:</span>
                      <span style={{color: '#00a884', fontSize: '13px'}}>MongoDB Connected</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Advanced Tab - Developer Mode */}
            {mode === 'developer' && activeTab === 'advanced' && (
              <div>
                <h3 style={{color: '#e9edef', marginTop: 0, marginBottom: '20px'}}>Advanced Settings</h3>
                
                <div style={{marginBottom: '24px'}}>
                  <label style={{color: '#8696a0', fontSize: '13px', marginBottom: '8px', display: 'block'}}>
                    Theme
                  </label>
                  <select
                    value={localSettings.theme}
                    onChange={(e) => setLocalSettings({...localSettings, theme: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '10px',
                      background: '#2a3942',
                      border: '1px solid #4a9eff',
                      borderRadius: '8px',
                      color: '#e9edef',
                      fontSize: '14px',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="dark">Dark (Developer)</option>
                    <option value="light">Light (Coming Soon)</option>
                  </select>
                </div>

                <div style={{marginBottom: '24px'}}>
                  <label style={{color: '#8696a0', fontSize: '13px', marginBottom: '8px', display: 'block'}}>
                    Font Size
                  </label>
                  <select
                    value={localSettings.fontSize}
                    onChange={(e) => setLocalSettings({...localSettings, fontSize: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '10px',
                      background: '#2a3942',
                      border: '1px solid #4a9eff',
                      borderRadius: '8px',
                      color: '#e9edef',
                      fontSize: '14px',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="small">Small (10px)</option>
                    <option value="medium">Medium (12px)</option>
                    <option value="large">Large (14px)</option>
                  </select>
                </div>

                <div style={{
                  background: '#1a1f3a',
                  padding: '16px',
                  borderRadius: '8px',
                  marginTop: '24px',
                  border: '1px solid #ff6b6b'
                }}>
                  <div style={{color: '#ff6b6b', fontSize: '14px', fontWeight: '600', marginBottom: '12px'}}>
                    ⚠️ Danger Zone
                  </div>
                  <div style={{color: '#8696a0', fontSize: '13px', marginBottom: '12px'}}>
                    Clear all developer dashboard data and reset settings.
                  </div>
                  <button
                    style={{
                      background: '#ff6b6b',
                      color: 'white',
                      border: 'none',
                      padding: '10px 16px',
                      borderRadius: '6px',
                      fontSize: '13px',
                      cursor: 'pointer',
                      fontWeight: '600'
                    }}
                    onClick={() => {
                      if (window.confirm('Reset all developer settings? This will reload the page.')) {
                        localStorage.removeItem('securechat_settings_developer');
                        window.location.reload();
                      }
                    }}
                  >
                    🔄 Reset All Developer Settings
                  </button>
                </div>
              </div>
            )}

            {/* General Tab - User Mode */}
            {mode === 'user' && activeTab === 'general' && (
              <div>
                <h3 style={{color: '#e9edef', marginTop: 0, marginBottom: '20px'}}>General Settings</h3>
                
                <div style={{marginBottom: '24px'}}>
                  <label style={{display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer'}}>
                    <input
                      type="checkbox"
                      checked={localSettings.enterToSend}
                      onChange={(e) => setLocalSettings({...localSettings, enterToSend: e.target.checked})}
                      style={{width: '18px', height: '18px', cursor: 'pointer'}}
                    />
                    <div>
                      <div style={{color: '#e9edef', fontSize: '15px', fontWeight: '500'}}>Press Enter to Send</div>
                      <div style={{color: '#8696a0', fontSize: '13px'}}>Use Shift+Enter for new line</div>
                    </div>
                  </label>
                </div>

                <div style={{marginBottom: '24px'}}>
                  <label style={{display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer'}}>
                    <input
                      type="checkbox"
                      checked={localSettings.soundEnabled}
                      onChange={(e) => setLocalSettings({...localSettings, soundEnabled: e.target.checked})}
                      style={{width: '18px', height: '18px', cursor: 'pointer'}}
                    />
                    <div>
                      <div style={{color: '#e9edef', fontSize: '15px', fontWeight: '500'}}>Enable Sounds</div>
                      <div style={{color: '#8696a0', fontSize: '13px'}}>Play sound for new messages</div>
                    </div>
                  </label>
                </div>

                <div style={{marginBottom: '24px'}}>
                  <label style={{display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer'}}>
                    <input
                      type="checkbox"
                      checked={localSettings.showTypingIndicator}
                      onChange={(e) => setLocalSettings({...localSettings, showTypingIndicator: e.target.checked})}
                      style={{width: '18px', height: '18px', cursor: 'pointer'}}
                    />
                    <div>
                      <div style={{color: '#e9edef', fontSize: '15px', fontWeight: '500'}}>Typing Indicators</div>
                      <div style={{color: '#8696a0', fontSize: '13px'}}>Let others know when you're typing</div>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* Privacy Tab */}
            {mode === 'user' && activeTab === 'privacy' && (
              <div>
                <h3 style={{color: '#e9edef', marginTop: 0, marginBottom: '20px'}}>Privacy & Security</h3>
                
                <div style={{marginBottom: '24px'}}>
                  <label style={{display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer'}}>
                    <input
                      type="checkbox"
                      checked={localSettings.showReadReceipts}
                      onChange={(e) => setLocalSettings({...localSettings, showReadReceipts: e.target.checked})}
                      style={{width: '18px', height: '18px', cursor: 'pointer'}}
                    />
                    <div>
                      <div style={{color: '#e9edef', fontSize: '15px', fontWeight: '500'}}>Read Receipts</div>
                      <div style={{color: '#8696a0', fontSize: '13px'}}>Let others see when you've read their messages</div>
                    </div>
                  </label>
                </div>

                <div style={{marginBottom: '24px'}}>
                  <label style={{display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer'}}>
                    <input
                      type="checkbox"
                      checked={localSettings.showOnlineStatus}
                      onChange={(e) => setLocalSettings({...localSettings, showOnlineStatus: e.target.checked})}
                      style={{width: '18px', height: '18px', cursor: 'pointer'}}
                    />
                    <div>
                      <div style={{color: '#e9edef', fontSize: '15px', fontWeight: '500'}}>Show Online Status</div>
                      <div style={{color: '#8696a0', fontSize: '13px'}}>Let others see when you're online</div>
                    </div>
                  </label>
                </div>

                <div style={{
                  background: '#1a1f3a',
                  padding: '16px',
                  borderRadius: '8px',
                  marginTop: '24px',
                  border: '1px solid #00a884'
                }}>
                  <div style={{color: '#00a884', fontSize: '14px', fontWeight: '600', marginBottom: '8px'}}>
                    🔐 End-to-End Encryption
                  </div>
                  <div style={{color: '#8696a0', fontSize: '13px', lineHeight: '1.5'}}>
                    All your messages are protected with RSA-2048 encryption. Only you and the recipient can read them.
                  </div>
                </div>
              </div>
            )}

            {/* Notifications Tab */}
            {mode === 'user' && activeTab === 'notifications' && (
              <div>
                <h3 style={{color: '#e9edef', marginTop: 0, marginBottom: '20px'}}>Notification Settings</h3>
                
                <div style={{marginBottom: '24px'}}>
                  <label style={{display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer'}}>
                    <input
                      type="checkbox"
                      checked={localSettings.notifications}
                      onChange={(e) => setLocalSettings({...localSettings, notifications: e.target.checked})}
                      style={{width: '18px', height: '18px', cursor: 'pointer'}}
                    />
                    <div>
                      <div style={{color: '#e9edef', fontSize: '15px', fontWeight: '500'}}>Desktop Notifications</div>
                      <div style={{color: '#8696a0', fontSize: '13px'}}>Show notifications for new messages</div>
                    </div>
                  </label>
                </div>

                <div style={{marginBottom: '24px'}}>
                  <label style={{display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer'}}>
                    <input
                      type="checkbox"
                      checked={localSettings.messagePreview}
                      onChange={(e) => setLocalSettings({...localSettings, messagePreview: e.target.checked})}
                      style={{width: '18px', height: '18px', cursor: 'pointer'}}
                      disabled={!localSettings.notifications}
                    />
                    <div>
                      <div style={{color: '#e9edef', fontSize: '15px', fontWeight: '500'}}>Message Preview</div>
                      <div style={{color: '#8696a0', fontSize: '13px'}}>Show message content in notifications</div>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* Appearance Tab */}
            {mode === 'user' && activeTab === 'appearance' && (
              <div>
                <h3 style={{color: '#e9edef', marginTop: 0, marginBottom: '20px'}}>Appearance</h3>
                
                <div style={{marginBottom: '24px'}}>
                  <label style={{color: '#8696a0', fontSize: '13px', marginBottom: '8px', display: 'block'}}>
                    Font Size
                  </label>
                  <select
                    value={localSettings.fontSize}
                    onChange={(e) => setLocalSettings({...localSettings, fontSize: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '10px',
                      background: '#2a3942',
                      border: '1px solid #00a884',
                      borderRadius: '8px',
                      color: '#e9edef',
                      fontSize: '14px',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="small">Small</option>
                    <option value="medium">Medium</option>
                    <option value="large">Large</option>
                  </select>
                </div>

                <div style={{marginBottom: '24px'}}>
                  <label style={{color: '#8696a0', fontSize: '13px', marginBottom: '8px', display: 'block'}}>
                    Theme
                  </label>
                  <select
                    value={localSettings.theme}
                    onChange={(e) => setLocalSettings({...localSettings, theme: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '10px',
                      background: '#2a3942',
                      border: '1px solid #00a884',
                      borderRadius: '8px',
                      color: '#e9edef',
                      fontSize: '14px',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="dark">Dark</option>
                    <option value="light">Light (Coming Soon)</option>
                  </select>
                </div>
              </div>
            )}

            {/* Data & Storage Tab */}
            {mode === 'user' && activeTab === 'data' && (
              <div>
                <h3 style={{color: '#e9edef', marginTop: 0, marginBottom: '20px'}}>Data & Storage</h3>
                
                <div style={{marginBottom: '24px'}}>
                  <label style={{display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer'}}>
                    <input
                      type="checkbox"
                      checked={localSettings.autoDownloadMedia}
                      onChange={(e) => setLocalSettings({...localSettings, autoDownloadMedia: e.target.checked})}
                      style={{width: '18px', height: '18px', cursor: 'pointer'}}
                    />
                    <div>
                      <div style={{color: '#e9edef', fontSize: '15px', fontWeight: '500'}}>Auto-download Media</div>
                      <div style={{color: '#8696a0', fontSize: '13px'}}>Automatically download images and files</div>
                    </div>
                  </label>
                </div>

                <div style={{marginBottom: '24px'}}>
                  <label style={{color: '#8696a0', fontSize: '13px', marginBottom: '8px', display: 'block'}}>
                    Data Usage
                  </label>
                  <select
                    value={localSettings.dataUsage}
                    onChange={(e) => setLocalSettings({...localSettings, dataUsage: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '10px',
                      background: '#2a3942',
                      border: '1px solid #00a884',
                      borderRadius: '8px',
                      color: '#e9edef',
                      fontSize: '14px',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="low">Low - Save Data</option>
                    <option value="auto">Auto - Balanced</option>
                    <option value="high">High - Best Quality</option>
                  </select>
                </div>

                <div style={{
                  background: '#1a1f3a',
                  padding: '16px',
                  borderRadius: '8px',
                  marginTop: '24px'
                }}>
                  <div style={{color: '#e9edef', fontSize: '14px', fontWeight: '600', marginBottom: '12px'}}>
                    Storage Information
                  </div>
                  <div style={{color: '#8696a0', fontSize: '13px', marginBottom: '8px'}}>
                    Messages are stored locally and on the blockchain for security.
                  </div>
                  <button
                    style={{
                      background: '#ff6b6b',
                      color: 'white',
                      border: 'none',
                      padding: '10px 16px',
                      borderRadius: '6px',
                      fontSize: '13px',
                      cursor: 'pointer',
                      marginTop: '12px'
                    }}
                    onClick={() => {
                      if (window.confirm('Clear all local chat data? This cannot be undone.')) {
                        localStorage.clear();
                        alert('Local data cleared. Please refresh the page.');
                      }
                    }}
                  >
                    🗑️ Clear Local Data
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid #2a3942',
          display: 'flex',
          gap: '12px',
          justifyContent: 'flex-end',
          background: '#202c33'
        }}>
          <button
            onClick={handleReset}
            style={{
              background: '#2a3942',
              color: '#e9edef',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            Reset to Default
          </button>
          <button
            onClick={onClose}
            style={{
              background: '#2a3942',
              color: '#e9edef',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              background: 'linear-gradient(135deg, #00a884 0%, #06cf9c 100%)',
              color: 'white',
              border: 'none',
              padding: '10px 24px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600'
            }}
          >
            💾 Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};
