// Mode configuration
export const MODE = {
  USER: 'user',
  DEVELOPER: 'developer'
};

// Detect current mode from environment
export const getCurrentMode = () => {
  // Check environment variable first
  if (process.env.REACT_APP_ENTRY === 'developer') {
    return MODE.DEVELOPER;
  }
  
  // Check URL params (for runtime switching)
  const params = new URLSearchParams(window.location.search);
  if (params.get('mode') === 'dev') {
    return MODE.DEVELOPER;
  }
  
  // Default to user mode
  return MODE.USER;
};

// Mode-specific styling
export const getModeStyles = (mode) => {
  if (mode === MODE.DEVELOPER) {
    return {
      primary: '#00a884',      // Green
      secondary: '#4a9eff',    // Blue
      danger: '#ff6b6b',       // Red
      background: '#0a0e27',   // Dark blue
      surface: '#1a1f3a',      // Lighter blue
      text: '#ffffff',
      muted: '#8696a0',
      badge: '🔧 DEV MODE'
    };
  }
  
  return {
    primary: '#00a884',        // Green
    secondary: '#4a9eff',      // Blue
    danger: '#ff6b6b',         // Red
    background: '#ffffff',     // Light
    surface: '#f0f0f0',        // Lighter
    text: '#000000',
    muted: '#666666',
    badge: '👤 USER MODE'
  };
};

export const modeConfig = {
  [MODE.USER]: {
    name: 'User',
    description: 'Secure encrypted messaging',
    icon: '👤',
    features: ['messaging', 'encryption', 'conversations', 'profiles'],
    showBlockchain: false,
    showAnalytics: false,
    showDeveloperTools: false
  },
  [MODE.DEVELOPER]: {
    name: 'Developer',
    description: 'Blockchain explorer & analytics',
    icon: '🔧',
    features: ['blockchain', 'analytics', 'monitoring', 'debug'],
    showBlockchain: true,
    showAnalytics: true,
    showDeveloperTools: true
  }
};
