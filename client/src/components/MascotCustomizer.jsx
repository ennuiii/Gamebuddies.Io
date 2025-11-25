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
  userRole = 'user',
  userLevel = 1
}) => {
  const navigate = useNavigate();
  const [config, setConfig] = useState(currentConfig || getDefaultMascotConfig());
  const { avatars, loading: isLoadingAvatars } = useAvatars();

  useEffect(() => {
    console.log('🎨 [MASCOT DEBUG] MascotCustomizer mounted');
    console.log('🎨 [MASCOT DEBUG] isPremium:', isPremium, 'Role:', userRole, 'Level:', userLevel);
    
    if (!currentConfig || !currentConfig.avatarId) {
      setConfig(getDefaultMascotConfig());
    } else {
      setConfig(currentConfig);
    }
  }, [currentConfig, isPremium, userRole, userLevel, avatars]);

  const handleSelect = (item) => {
    const isAdminItem = item.hidden;
    const isAdminUser = userRole === 'admin';
    const levelReq = item.unlockLevel || 0;
    
    if (isAdminItem && !isAdminUser) return;
    if (item.premium && !isPremium && !isAdminItem) return;
    if (userLevel < levelReq && !isAdminUser) return;
    
    const newConfig = { avatarId: item.id };
    setConfig(newConfig);
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
        <p className="mascot-helper-text">
          Level: {userLevel} • Select your avatar
        </p>
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
            {avatars
              .filter(item => !item.hidden || userRole === 'admin') // Hide admin avatars from non-admins
              .sort((a, b) => {
                const levelA = a.unlockLevel || 0;
                const levelB = b.unlockLevel || 0;
                
                // Check if unlocked for current user
                const isUnlockedA = (userLevel >= levelA) || (a.premium && isPremium) || (!a.premium && !a.unlockLevel) || userRole === 'admin';
                const isUnlockedB = (userLevel >= levelB) || (b.premium && isPremium) || (!b.premium && !b.unlockLevel) || userRole === 'admin';

                // Sort: Unlocked first
                if (isUnlockedA && !isUnlockedB) return -1;
                if (!isUnlockedA && isUnlockedB) return 1;

                // Sort by level requirement
                return levelA - levelB;
              })
              .map(item => {
              const isAdminItem = item.hidden;
              const isAdminUser = userRole === 'admin';
              const levelReq = item.unlockLevel || 0;
              
              // Debug specific avatar
              if (item.name.includes('King')) {
                 console.log('👑 [MASCOT DEBUG] King Avatar:', { 
                   id: item.id, 
                   levelReq, 
                   userLevel, 
                   locked: userLevel < levelReq 
                 });
              }

              const isLockedByPremium = item.premium && !isPremium && !isAdminItem;
              const isLockedByLevel = userLevel < levelReq && !isAdminUser;
              const isLockedByAdmin = isAdminItem && !isAdminUser;
              
              const isLocked = isLockedByAdmin || isLockedByPremium || isLockedByLevel;
              const isSelected = config.avatarId === item.id;
              
              let lockReason = '';
              if (isLockedByAdmin) lockReason = 'Admin Only';
              else if (isLockedByLevel) lockReason = `Lvl ${levelReq}`;
              else if (isLockedByPremium) lockReason = 'Premium';

              return (
                <button
                  key={item.id}
                  type="button"
                  className={`mascot-option-btn ${isSelected ? 'selected' : ''} ${isLocked ? 'locked' : ''}`}
                  onClick={() => handleSelect(item)}
                  title={isLocked ? `${item.name} (${lockReason})` : item.name}
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
                        <span style={{fontSize: '0.8rem', fontWeight: 'bold'}}>
                          {isLockedByLevel ? `Lvl ${levelReq}` : '🔒'}
                        </span>
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
