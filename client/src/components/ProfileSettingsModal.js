import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/LazySocketContext';
import { useNotification } from '../contexts/NotificationContext';
import { useNavigate } from 'react-router-dom';
import AvatarCustomizer from './AvatarCustomizer';
import Avatar, { getDiceBearUrl } from './Avatar';
import './ProfileSettingsModal.css';

const ProfileSettingsModal = ({ isOpen, onClose, roomCode }) => {
  const { user, session, refreshUser, isPremium } = useAuth();
  const { socket } = useSocket();
  const { addNotification } = useNotification();
  const navigate = useNavigate();

  const [showAvatarCustomizer, setShowAvatarCustomizer] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setShowAvatarCustomizer(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
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
        socket.emit('profile_updated', {
          roomCode,
          userId: user.id,
          displayName: user.display_name || user.username,
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
    return (
      <Avatar
        avatarStyle={user?.avatar_style}
        avatarSeed={user?.avatar_seed}
        avatarOptions={user?.avatar_options}
        name={user?.display_name || user?.username || 'User'}
        size={80}
        isPremium={isPremium}
        className="avatar-preview-img"
      />
    );
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
            <h2 className="profile-settings-title">Avatar Settings</h2>
            <button className="close-button" onClick={onClose}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>

          <div className="profile-settings-content">
            {/* Avatar Section */}
            {showAvatarCustomizer ? (
              <div className="avatar-customizer-section">
                <AvatarCustomizer
                  currentStyle={user?.avatar_style}
                  currentSeed={user?.avatar_seed}
                  currentOptions={user?.avatar_options || {}}
                  username={user?.username || user?.display_name}
                  onSave={handleSaveAvatar}
                  onCancel={() => setShowAvatarCustomizer(false)}
                  loading={avatarLoading}
                  isPremium={isPremium}
                />
              </div>
            ) : (
              <div className="avatar-preview-section">
                <div className="avatar-preview-container">
                  {getCurrentAvatarDisplay()}
                </div>
                <div className="avatar-preview-info">
                  <span className="preview-label">Current Avatar</span>
                  <button
                    className="change-avatar-btn"
                    onClick={() => setShowAvatarCustomizer(true)}
                  >
                    {user?.avatar_style ? 'Change Avatar' : 'Create Avatar'}
                  </button>
                </div>
              </div>
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
