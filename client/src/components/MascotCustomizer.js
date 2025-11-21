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
  isPremium = false,
  userRole = 'user'
}) => {
  const navigate = useNavigate();
  const [config, setConfig] = useState(currentConfig || getDefaultMascotConfig());
  const { avatars, loading: isLoadingAvatars } = useAvatars();

  useEffect(() => {
    console.log('🎨 [MASCOT DEBUG] MascotCustomizer mounted');
    console.log('🎨 [MASCOT DEBUG] isPremium prop:', isPremium, 'Role:', userRole);
    console.log('🎨 [MASCOT DEBUG] Avatars loaded:', avatars.length);
    
    if (!currentConfig || !currentConfig.avatarId) {
      setConfig(getDefaultMascotConfig());
    } else {
      setConfig(currentConfig);
    }
  }, [currentConfig, isPremium, userRole, avatars]);

  const handleSelect = (item) => {
    const isAdminItem = item.hidden;
    const isAdminUser = userRole === 'admin';
    
    console.log('🎨 [MASCOT DEBUG] Selecting item:', item.name);
    console.log('🎨 [MASCOT DEBUG] Checks:', { isAdminItem, isAdminUser, isPremiumItem: item.premium, isUserPremium: isPremium });

    if (isAdminItem && !isAdminUser) {
      console.warn('❌ [MASCOT DEBUG] Selection blocked: Admin only.');
      return;
    }

    if (item.premium && !isPremium && !isAdminItem) { // Admin items might be marked premium in backend, but we handle them separately
       console.warn('❌ [MASCOT DEBUG] Selection blocked: Premium only.');
       return;
    }
    
    const newConfig = { avatarId: item.id };
    setConfig(newConfig);
    
    // Auto-save immediately
    onSave({
      avatar_style: 'custom-mascot',
      avatar_seed: 'custom',
      avatar_options: newConfig
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
        {!isPremium && userRole !== 'admin' && (
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
              const isAdminItem = item.hidden;
              const isAdminUser = userRole === 'admin';
              
              // Logic:
              // - If hidden (admin item): Locked unless user is admin.
              // - If premium (and not hidden): Locked unless user is premium.
              // - Note: Backend marks hidden items as premium too, so we check hidden first.
              
              const isLocked = isAdminItem 
                ? !isAdminUser 
                : (item.premium && !isPremium);

              const isSelected = config.avatarId === item.id;
              
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`mascot-option-btn ${isSelected ? 'selected' : ''} ${isLocked ? 'locked' : ''}`}
                  onClick={() => handleSelect(item)}
                  title={isAdminItem ? (isLocked ? 'Admin Only 🔒' : 'Admin Avatar') : (isLocked ? `${item.name} (Premium)` : item.name)}
                  disabled={isLocked}
                >
                  <div className="img-wrapper">
                    <img src={item.src} alt={item.name} />
                    {item.premium && !item.hidden && (
                      <span className="premium-badge-icon" title="Premium">★</span>
                    )}
                    {item.hidden && (
                      <span className="premium-badge-icon admin" title="Admin Only">💻</span>
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
    </div>
  );
};

export default MascotCustomizer;
