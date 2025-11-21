import React, { useState, useEffect } from 'react';
import MascotAvatar from './MascotAvatar';
import { getDefaultMascotConfig } from '../utils/mascotAssets';
import { useAvatars } from '../hooks/useAvatars';
import { useNavigate } from 'react-router-dom';
import './MascotCustomizer.css';

const MascotCustomizer = ({ 
  currentConfig, 
  onSave, 
  onCancel, 
  loading = false,
  isPremium = false
}) => {
  const navigate = useNavigate();
  const [config, setConfig] = useState(currentConfig || getDefaultMascotConfig());
  const { avatars, loading: isLoadingAvatars } = useAvatars();

  useEffect(() => {
    if (!currentConfig || !currentConfig.avatarId) {
      setConfig(getDefaultMascotConfig());
    } else {
      setConfig(currentConfig);
    }
  }, [currentConfig]);

  const handleSelect = (item) => {
    if (item.premium && !isPremium) {
      return;
    }
    setConfig({ avatarId: item.id });
  };

  const handleSave = () => {
    onSave({
      avatar_style: 'custom-mascot',
      avatar_seed: 'custom',
      avatar_options: config
    });
  };

  const handleUpgrade = () => {
    navigate('/premium');
    if (onCancel) onCancel(); 
  };

  return (
    <div className="mascot-customizer">
      <div className="mascot-preview-area">
        <div className="mascot-preview-wrapper">
          <MascotAvatar config={config} size={200} />
        </div>
        <p className="mascot-helper-text">Select your avatar</p>
        {!isPremium && (
          <button type="button" className="btn-text-only" onClick={handleUpgrade} style={{fontSize: '0.8rem', marginTop: '0.5rem', textDecoration: 'underline', color: 'var(--primary)'}}>
            Unlock all avatars with Premium
          </button>
        )}
      </div>

      <div className="mascot-controls">
        {isLoadingAvatars ? (
          <div className="loading-spinner">Loading avatars...</div>
        ) : (
          <div className="options-grid single-category">
            {avatars.map(item => {
              const isLocked = item.premium && !isPremium;
              const isSelected = config.avatarId === item.id;
              
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`mascot-option-btn ${isSelected ? 'selected' : ''} ${isLocked ? 'locked' : ''}`}
                  onClick={() => handleSelect(item)}
                  title={isLocked ? `${item.name} (Premium)` : item.name}
                  disabled={isLocked}
                >
                  <div className="img-wrapper">
                    <img src={item.src} alt={item.name} />
                    {item.premium && (
                      <span className="premium-badge-icon" title="Premium">★</span>
                    )}
                    {isLocked && (
                      <div className="lock-overlay">
                        <span>🔒</span>
                      </div>
                    )}
                  </div>
                  <span className="option-label">{item.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="mascot-actions">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="btn btn-outline"
            disabled={loading}
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          className="btn btn-primary"
          disabled={loading}
        >
          {loading ? 'Saving...' : 'Save Avatar'}
        </button>
      </div>
    </div>
  );
};

export default MascotCustomizer;
