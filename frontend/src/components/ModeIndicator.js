import React from 'react';

export const ModeIndicator = ({ mode, config, styles }) => {
  if (!config || !styles) return null;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '8px 16px',
      background: mode === 'developer' ? '#2a3f5f' : '#f0f0f0',
      borderRadius: '20px',
      border: `2px solid ${styles.primary}`,
      fontSize: '12px',
      fontWeight: 'bold',
      color: styles.text
    }}>
      <span style={{ fontSize: '16px' }}>{config.icon}</span>
      <span>{config.name.toUpperCase()}</span>
    </div>
  );
};

export const ModeBanner = ({ mode, config, styles }) => {
  if (mode !== 'developer') return null;

  return (
    <div style={{
      background: 'linear-gradient(90deg, #1a1f3a 0%, #2a3f5f 100%)',
      border: '2px solid #00a884',
      borderRadius: '8px',
      padding: '15px',
      margin: '20px',
      color: '#00a884',
      textAlign: 'center',
      fontSize: '14px',
      fontWeight: 'bold'
    }}>
      🔧 DEVELOPER DASHBOARD MODE - Restricted Data Visible 🔧
    </div>
  );
};
