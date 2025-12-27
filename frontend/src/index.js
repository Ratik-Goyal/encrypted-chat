import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { getCurrentMode } from './config';
import AppUser from './App.user';
import AppDeveloper from './App.developer';

function AppWrapper() {
  const [mode, setMode] = useState(getCurrentMode());

  useEffect(() => {
    // Check for mode changes via URL parameter
    const handleModeChange = () => {
      setMode(getCurrentMode());
    };

    window.addEventListener('hashchange', handleModeChange);
    window.addEventListener('popstate', handleModeChange);

    return () => {
      window.removeEventListener('hashchange', handleModeChange);
      window.removeEventListener('popstate', handleModeChange);
    };
  }, []);

  // Set page title based on mode
  useEffect(() => {
    document.title = mode === 'developer' 
      ? '🔧 Encrypted Chat - Developer Dashboard' 
      : '👤 Encrypted Chat - Secure Messaging';
  }, [mode]);

  return mode === 'developer' ? <AppDeveloper /> : <AppUser />;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <AppWrapper />
  </React.StrictMode>
);
