import React, { useState } from 'react';

export const UserProfileModal = ({ user, profile, isOwnProfile, onClose, onUpdateProfile }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedProfile, setEditedProfile] = useState({
    username: profile?.username || '',
    status: profile?.status || 'Hey there! I am using SecureChat',
    bio: profile?.bio || '',
    profilePicture: profile?.profilePicture || ''
  });

  const handleSave = () => {
    onUpdateProfile(editedProfile);
    setIsEditing(false);
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditedProfile({ ...editedProfile, profilePicture: reader.result });
      };
      reader.readAsDataURL(file);
    }
  };

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getLastSeenText = () => {
    if (profile?.isOnline) return 'Online';
    if (!profile?.lastSeen) return 'Last seen recently';
    
    const lastSeen = new Date(profile.lastSeen);
    const now = new Date();
    const diffMs = now - lastSeen;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Last seen just now';
    if (diffMins < 60) return `Last seen ${diffMins}m ago`;
    if (diffHours < 24) return `Last seen ${diffHours}h ago`;
    if (diffDays < 7) return `Last seen ${diffDays}d ago`;
    return `Last seen on ${lastSeen.toLocaleDateString()}`;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{maxWidth: '500px'}}>
        <div className="modal-header">
          <h2>User Profile</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body" style={{padding: '24px'}}>
          {/* Profile Picture */}
          <div style={{textAlign: 'center', marginBottom: '24px'}}>
            {isEditing && isOwnProfile ? (
              <div>
                <label htmlFor="profile-pic-upload" style={{cursor: 'pointer'}}>
                  <div style={{
                    width: '120px',
                    height: '120px',
                    borderRadius: '50%',
                    margin: '0 auto',
                    background: editedProfile.profilePicture 
                      ? `url(${editedProfile.profilePicture}) center/cover` 
                      : 'linear-gradient(135deg, #00a884 0%, #06cf9c 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '48px',
                    color: 'white',
                    fontWeight: '600',
                    boxShadow: '0 8px 24px rgba(0, 168, 132, 0.3)',
                    border: '4px solid rgba(0, 168, 132, 0.2)',
                    transition: 'transform 0.3s ease'
                  }}>
                    {!editedProfile.profilePicture && getInitials(editedProfile.username)}
                  </div>
                  <div style={{marginTop: '12px', color: '#00a884', fontSize: '14px'}}>📷 Click to upload</div>
                </label>
                <input 
                  id="profile-pic-upload" 
                  type="file" 
                  accept="image/*" 
                  style={{display: 'none'}}
                  onChange={handleImageUpload}
                />
              </div>
            ) : (
              <div style={{
                width: '120px',
                height: '120px',
                borderRadius: '50%',
                margin: '0 auto',
                background: profile?.profilePicture 
                  ? `url(${profile.profilePicture}) center/cover` 
                  : 'linear-gradient(135deg, #00a884 0%, #06cf9c 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '48px',
                color: 'white',
                fontWeight: '600',
                boxShadow: '0 8px 24px rgba(0, 168, 132, 0.3)',
                border: '4px solid rgba(0, 168, 132, 0.2)'
              }}>
                {!profile?.profilePicture && getInitials(profile?.username)}
              </div>
            )}
          </div>

          {/* User Info */}
          <div style={{marginBottom: '20px'}}>
            <label style={{display: 'block', fontSize: '13px', color: '#8696a0', marginBottom: '8px', fontWeight: '600'}}>
              USERNAME
            </label>
            {isEditing && isOwnProfile ? (
              <input
                type="text"
                value={editedProfile.username}
                onChange={(e) => setEditedProfile({...editedProfile, username: e.target.value})}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: '#2a3942',
                  border: '2px solid #00a884',
                  borderRadius: '8px',
                  color: '#e9edef',
                  fontSize: '15px',
                  outline: 'none'
                }}
              />
            ) : (
              <div style={{fontSize: '18px', color: '#e9edef', fontWeight: '500'}}>{profile?.username}</div>
            )}
          </div>

          {/* Status */}
          <div style={{marginBottom: '20px'}}>
            <label style={{display: 'block', fontSize: '13px', color: '#8696a0', marginBottom: '8px', fontWeight: '600'}}>
              STATUS
            </label>
            {isEditing && isOwnProfile ? (
              <input
                type="text"
                value={editedProfile.status}
                onChange={(e) => setEditedProfile({...editedProfile, status: e.target.value})}
                placeholder="What's on your mind?"
                style={{
                  width: '100%',
                  padding: '12px',
                  background: '#2a3942',
                  border: '2px solid #00a884',
                  borderRadius: '8px',
                  color: '#e9edef',
                  fontSize: '15px',
                  outline: 'none'
                }}
              />
            ) : (
              <div style={{fontSize: '15px', color: '#e9edef', fontStyle: 'italic'}}>{profile?.status || 'No status'}</div>
            )}
          </div>

          {/* Bio */}
          <div style={{marginBottom: '20px'}}>
            <label style={{display: 'block', fontSize: '13px', color: '#8696a0', marginBottom: '8px', fontWeight: '600'}}>
              BIO
            </label>
            {isEditing && isOwnProfile ? (
              <textarea
                value={editedProfile.bio}
                onChange={(e) => setEditedProfile({...editedProfile, bio: e.target.value})}
                placeholder="Tell us about yourself..."
                rows="3"
                style={{
                  width: '100%',
                  padding: '12px',
                  background: '#2a3942',
                  border: '2px solid #00a884',
                  borderRadius: '8px',
                  color: '#e9edef',
                  fontSize: '15px',
                  outline: 'none',
                  resize: 'vertical',
                  fontFamily: 'inherit'
                }}
              />
            ) : (
              <div style={{fontSize: '15px', color: '#e9edef'}}>{profile?.bio || 'No bio available'}</div>
            )}
          </div>

          {/* Email */}
          <div style={{marginBottom: '20px'}}>
            <label style={{display: 'block', fontSize: '13px', color: '#8696a0', marginBottom: '8px', fontWeight: '600'}}>
              EMAIL
            </label>
            <div style={{fontSize: '15px', color: '#e9edef'}}>{profile?.email}</div>
          </div>

          {/* Last Seen */}
          {!isOwnProfile && (
            <div style={{marginBottom: '20px'}}>
              <label style={{display: 'block', fontSize: '13px', color: '#8696a0', marginBottom: '8px', fontWeight: '600'}}>
                LAST SEEN
              </label>
              <div style={{fontSize: '15px', color: profile?.isOnline ? '#00a884' : '#e9edef'}}>
                {profile?.isOnline && '🟢 '}{getLastSeenText()}
              </div>
            </div>
          )}

          {/* Wallet Address */}
          <div style={{marginBottom: '20px'}}>
            <label style={{display: 'block', fontSize: '13px', color: '#8696a0', marginBottom: '8px', fontWeight: '600'}}>
              WALLET ADDRESS
            </label>
            <div style={{
              fontSize: '12px', 
              color: '#667781', 
              fontFamily: 'monospace', 
              background: '#1a1f3a', 
              padding: '8px', 
              borderRadius: '6px',
              wordBreak: 'break-all'
            }}>
              {user}
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{display: 'flex', gap: '12px', marginTop: '24px'}}>
            {isOwnProfile && !isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                style={{
                  flex: 1,
                  background: 'linear-gradient(135deg, #00a884 0%, #06cf9c 100%)',
                  color: 'white',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '14px'
                }}
              >
                ✏️ Edit Profile
              </button>
            )}
            {isEditing && (
              <>
                <button
                  onClick={handleSave}
                  style={{
                    flex: 1,
                    background: 'linear-gradient(135deg, #00a884 0%, #06cf9c 100%)',
                    color: 'white',
                    border: 'none',
                    padding: '12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '14px'
                  }}
                >
                  💾 Save Changes
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditedProfile({
                      username: profile?.username || '',
                      status: profile?.status || 'Hey there! I am using SecureChat',
                      bio: profile?.bio || '',
                      profilePicture: profile?.profilePicture || ''
                    });
                  }}
                  style={{
                    flex: 1,
                    background: '#2a3942',
                    color: 'white',
                    border: 'none',
                    padding: '12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '14px'
                  }}
                >
                  ✖️ Cancel
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
