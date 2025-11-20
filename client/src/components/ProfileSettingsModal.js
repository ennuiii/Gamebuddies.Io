import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/LazySocketContext';
import { useNotification } from '../contexts/NotificationContext';
import { getSupabaseClient } from '../utils/supabase';
import { useNavigate } from 'react-router-dom';
import AvatarCustomizer from './AvatarCustomizer';
import { getDiceBearUrl } from './Avatar';
import './ProfileSettingsModal.css';

const ProfileSettingsModal = ({ isOpen, onClose, roomCode }) => {
  const { user, session, refreshUser, isPremium } = useAuth();
  const { socket } = useSocket();
  const { addNotification } = useNotification();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState('');
  const [showAvatarCustomizer, setShowAvatarCustomizer] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasNameChange, setHasNameChange] = useState(false);

  // Initialize form with user data
  useEffect(() => {
    if (user && isOpen) {
      setDisplayName(user.display_name || user.username || '');
      setShowAvatarCustomizer(false);
    }
  }, [user, isOpen]);

  // Track name changes
  useEffect(() => {
    if (!user) return;
    const nameChanged = displayName !== (user.display_name || user.username || '');
    setHasNameChange(nameChanged);
  }, [displayName, user]);

  if (!isOpen) return null;

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Handle saving display name
  const handleSaveDisplayName = async () => {
    if (!hasNameChange || !user) return;

    setIsLoading(true);
    try {
      const supabase = await getSupabaseClient();
      const { data: { session: currentSession } } = await supabase.auth.getSession();

      if (!currentSession?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(`/api/users/${user.id}/profile`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${currentSession.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          display_name: displayName.trim()
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update profile');
      }

      // Refresh user data in auth context
      await refreshUser();

      // Notify lobby of profile change via socket
      if (socket && roomCode) {
        socket.emit('profile_updated', {
          roomCode,
          userId: user.id,
          displayName: displayName.trim(),
          avatarUrl: user.avatar_url
        });
      }

      addNotification('Display name updated!', 'success');
      setHasNameChange(false);
    } catch (error) {
      console.error('Failed to update display name:', error);
      addNotification(error.message || 'Failed to update display name', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle saving avatar (using same logic as Account page)
  const handleSaveAvatar = async (avatarData) => {
    console.log('🎨 [PROFILE MODAL] Saving avatar preferences:', avatarData);
    setAvatarLoading(true);

    try {
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const requestBody = {
        userId: user.id,
        ...avatarData
      };

      const response = await fetch('/api/users/avatar', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save avatar');
      }

      console.log('✅ [PROFILE MODAL] Avatar saved successfully');
      setShowAvatarCustomizer(false);

      // Refresh user data to get updated avatar
      if (refreshUser) {
        await refreshUser();
      }

      // Notify lobby of avatar change via socket
      if (socket && roomCode) {
        const newAvatarUrl = getDiceBearUrl(
          avatarData.avatar_style,
          avatarData.avatar_seed || user.username || user.display_name,
          avatarData.avatar_options || {},
          80
        );
        socket.emit('profile_updated', {
          roomCode,
          userId: user.id,
          displayName: user.display_name || user.username,
          avatarUrl: newAvatarUrl,
          avatarStyle: avatarData.avatar_style,
          avatarSeed: avatarData.avatar_seed,
          avatarOptions: avatarData.avatar_options
        });
      }

      addNotification('Avatar updated!', 'success');
    } catch (error) {
      console.error('❌ [PROFILE MODAL] Avatar save error:', error);
      addNotification(error.message || 'Failed to save avatar', 'error');
    } finally {
      setAvatarLoading(false);
    }
  };

  const getCurrentAvatarDisplay = () => {
    if (user?.avatar_style) {
      return (
        <img
          src={getDiceBearUrl(
            user.avatar_style,
            user.avatar_seed || user.username || user.display_name,
            user.avatar_options || {},
            80
          )}
          alt="Your avatar"
          className="avatar-preview-img"
        />
      );
    }
    // Default to first letter of display name
    return <span className="avatar-preview-initial">{(displayName || 'U')[0].toUpperCase()}</span>;
  };

  return (
    <AnimatePresence>
      <motion.div
        className="profile-settings-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleOverlayClick}
      >
        <motion.div
          className="profile-settings-modal"
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ duration: 0.3 }}
        >
          <div className="profile-settings-header">
            <h2 className="profile-settings-title">Profile Settings</h2>
            <button className="close-button" onClick={onClose}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>

          <div className="profile-settings-content">
            {/* Avatar Section */}
            {showAvatarCustomizer && isPremium ? (
              <div className="avatar-customizer-section">
                <AvatarCustomizer
                  currentStyle={user?.avatar_style}
                  currentSeed={user?.avatar_seed}
                  currentOptions={user?.avatar_options || {}}
                  username={user?.username || user?.display_name}
                  onSave={handleSaveAvatar}
                  onCancel={() => setShowAvatarCustomizer(false)}
                  loading={avatarLoading}
                />
              </div>
            ) : (
              <>
                {/* Current Avatar Preview */}
                <div className="avatar-preview-section">
                  <div className="avatar-preview-container">
                    {getCurrentAvatarDisplay()}
                  </div>
                  <div className="avatar-preview-info">
                    <span className="preview-label">Current Avatar</span>
                    {isPremium ? (
                      <button
                        className="change-avatar-btn"
                        onClick={() => setShowAvatarCustomizer(true)}
                      >
                        {user?.avatar_style ? 'Change Avatar' : 'Create Avatar'}
                      </button>
                    ) : (
                      <button
                        className="upgrade-avatar-btn"
                        onClick={() => {
                          onClose();
                          navigate('/premium');
                        }}
                      >
                        Upgrade for Custom Avatar
                      </button>
                    )}
                  </div>
                </div>

                {/* Display Name */}
                <div className="setting-section">
                  <label className="setting-label">Display Name</label>
                  <input
                    type="text"
                    className="profile-input"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Enter display name"
                    maxLength={30}
                  />
                  {hasNameChange && (
                    <button
                      className="save-name-btn"
                      onClick={handleSaveDisplayName}
                      disabled={isLoading}
                    >
                      {isLoading ? 'Saving...' : 'Save Name'}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="profile-settings-footer">
            <button
              className="full-account-button"
              onClick={() => {
                onClose();
                navigate('/account');
              }}
            >
              Full Account Settings
            </button>
            <button
              className="done-button"
              onClick={onClose}
            >
              Done
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ProfileSettingsModal;
