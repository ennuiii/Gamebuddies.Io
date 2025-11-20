import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/LazySocketContext';
import { useNotification } from '../contexts/NotificationContext';
import { getSupabaseClient } from '../utils/supabase';
import { useNavigate } from 'react-router-dom';
import './ProfileSettingsModal.css';

// Preset avatars - gaming themed
const PRESET_AVATARS = [
  { id: 'gamer', emoji: '🎮', label: 'Gamer' },
  { id: 'ninja', emoji: '🥷', label: 'Ninja' },
  { id: 'wizard', emoji: '🧙', label: 'Wizard' },
  { id: 'robot', emoji: '🤖', label: 'Robot' },
  { id: 'alien', emoji: '👽', label: 'Alien' },
  { id: 'ghost', emoji: '👻', label: 'Ghost' },
  { id: 'dragon', emoji: '🐲', label: 'Dragon' },
  { id: 'unicorn', emoji: '🦄', label: 'Unicorn' },
  { id: 'cat', emoji: '🐱', label: 'Cat' },
  { id: 'dog', emoji: '🐶', label: 'Dog' },
  { id: 'fox', emoji: '🦊', label: 'Fox' },
  { id: 'panda', emoji: '🐼', label: 'Panda' },
];

const ProfileSettingsModal = ({ isOpen, onClose, roomCode }) => {
  const { user, session, refreshUser, isPremium } = useAuth();
  const { socket } = useSocket();
  const { addNotification } = useNotification();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(null);
  const [customAvatarUrl, setCustomAvatarUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize form with user data
  useEffect(() => {
    if (user && isOpen) {
      setDisplayName(user.display_name || user.username || '');
      setCustomAvatarUrl(user.avatar_url || '');

      // Check if current avatar is a preset emoji
      const isPreset = PRESET_AVATARS.find(p => p.emoji === user.avatar_url);
      if (isPreset) {
        setSelectedAvatar(isPreset.id);
      } else if (user.avatar_url) {
        setSelectedAvatar('custom');
      } else {
        setSelectedAvatar(null);
      }
    }
  }, [user, isOpen]);

  // Track changes
  useEffect(() => {
    if (!user) return;

    // Calculate current avatar URL inline to avoid reference error
    let currentAvatarUrl = '';
    if (selectedAvatar === 'custom') {
      currentAvatarUrl = customAvatarUrl;
    } else {
      const preset = PRESET_AVATARS.find(p => p.id === selectedAvatar);
      currentAvatarUrl = preset ? preset.emoji : '';
    }

    const hasNameChange = displayName !== (user.display_name || user.username || '');
    const hasAvatarChange = currentAvatarUrl !== (user.avatar_url || '');

    setHasChanges(hasNameChange || hasAvatarChange);
  }, [displayName, selectedAvatar, customAvatarUrl, user]);

  if (!isOpen) return null;

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const getAvatarUrl = () => {
    if (selectedAvatar === 'custom') {
      return customAvatarUrl;
    }
    const preset = PRESET_AVATARS.find(p => p.id === selectedAvatar);
    return preset ? preset.emoji : '';
  };

  const handleSave = async () => {
    if (!hasChanges || !user) return;

    setIsLoading(true);
    try {
      const supabase = await getSupabaseClient();
      const { data: { session: currentSession } } = await supabase.auth.getSession();

      if (!currentSession?.access_token) {
        throw new Error('Not authenticated');
      }

      const avatarUrl = getAvatarUrl();

      const response = await fetch(`/api/users/${user.id}/profile`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${currentSession.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          display_name: displayName.trim(),
          avatar_url: avatarUrl
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update profile');
      }

      // Refresh user data in auth context
      await refreshUser();

      // Notify lobby of avatar change via socket
      if (socket && roomCode) {
        socket.emit('profile_updated', {
          roomCode,
          userId: user.id,
          displayName: displayName.trim(),
          avatarUrl
        });
      }

      addNotification('Profile updated successfully!', 'success');
      setHasChanges(false);
      onClose();
    } catch (error) {
      console.error('Failed to update profile:', error);
      addNotification(error.message || 'Failed to update profile', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAvatarSelect = (avatarId) => {
    setSelectedAvatar(avatarId);
    if (avatarId !== 'custom') {
      setCustomAvatarUrl('');
    }
  };

  const getCurrentAvatarDisplay = () => {
    if (selectedAvatar === 'custom' && customAvatarUrl) {
      // Check if it's a URL or emoji
      if (customAvatarUrl.startsWith('http')) {
        return <img src={customAvatarUrl} alt="Avatar" className="avatar-preview-img" />;
      }
      return <span className="avatar-preview-emoji">{customAvatarUrl}</span>;
    }

    const preset = PRESET_AVATARS.find(p => p.id === selectedAvatar);
    if (preset) {
      return <span className="avatar-preview-emoji">{preset.emoji}</span>;
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
            {/* Current Avatar Preview */}
            <div className="avatar-preview-section">
              <div className="avatar-preview-container">
                {getCurrentAvatarDisplay()}
              </div>
              <div className="avatar-preview-info">
                <span className="preview-label">Current Avatar</span>
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
            </div>

            {/* Avatar Selection */}
            <div className="setting-section">
              <label className="setting-label">Choose Avatar</label>
              <div className="avatar-grid">
                {PRESET_AVATARS.map((avatar) => (
                  <button
                    key={avatar.id}
                    className={`avatar-option ${selectedAvatar === avatar.id ? 'selected' : ''}`}
                    onClick={() => handleAvatarSelect(avatar.id)}
                    title={avatar.label}
                  >
                    <span className="avatar-emoji">{avatar.emoji}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Avatar (Premium Feature) */}
            <div className="setting-section">
              <label className="setting-label">
                Custom Avatar URL
                {!isPremium && <span className="premium-badge">Premium</span>}
              </label>
              <div className="custom-avatar-input-container">
                <input
                  type="url"
                  className={`profile-input ${!isPremium ? 'disabled' : ''}`}
                  value={customAvatarUrl}
                  onChange={(e) => {
                    if (isPremium) {
                      setCustomAvatarUrl(e.target.value);
                      setSelectedAvatar('custom');
                    }
                  }}
                  placeholder={isPremium ? "https://example.com/avatar.png" : "Upgrade to Premium"}
                  disabled={!isPremium}
                />
                {!isPremium && (
                  <button
                    className="upgrade-button-inline"
                    onClick={() => {
                      onClose();
                      navigate('/premium');
                    }}
                  >
                    Upgrade
                  </button>
                )}
              </div>
            </div>
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
              className={`save-button ${!hasChanges ? 'disabled' : ''}`}
              onClick={handleSave}
              disabled={!hasChanges || isLoading}
            >
              {isLoading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ProfileSettingsModal;
