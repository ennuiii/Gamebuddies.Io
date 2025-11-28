import React, { useState, useEffect } from 'react';
import MascotAvatar from './MascotAvatar';
import { getDefaultMascotConfig } from '../utils/mascotAssets';
import { useAvatars } from '../hooks/useAvatars';
import { useNavigate } from 'react-router-dom';
import './MascotCustomizer.css';

interface MascotConfig {
  avatarId?: string;
  [key: string]: unknown;
}

interface AvatarItem {
  id: string;
  name: string;
  src: string;
  premium?: boolean;
  hidden?: boolean;
  unlockLevel?: number;
}

interface AvatarData {
  avatar_style: string;
  avatar_seed: string;
  avatar_options: MascotConfig;
}

interface MascotCustomizerProps {
  currentConfig?: MascotConfig;
  onSave: (data: AvatarData) => void;
  onCancel?: () => void;
  loading?: boolean;
  isPremium?: boolean;
  userRole?: string;
  userLevel?: number;
}

const MascotCustomizer: React.FC<MascotCustomizerProps> = ({
  currentConfig,
  onSave,
  onCancel,
  loading = false,
  isPremium = false,
  userRole = 'user',
  userLevel = 1,
}) => {
  const navigate = useNavigate();
  const [config, setConfig] = useState<MascotConfig>(currentConfig || getDefaultMascotConfig());
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

  const handleSelect = (item: AvatarItem): void => {
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
      avatar_options: newConfig,
    });
  };

  const handleUpgrade = (): void => {
    navigate('/premium');
    if (onCancel) onCancel();
  };

  return (
    <div className="mascot-customizer">
      <div className="mascot-preview-area">
        <div className="mascot-preview-wrapper">
          <div className="mascot-spotlight"></div>
          <MascotAvatar config={config} size={220} />
          <div className="mascot-pedestal">
            <div className="pedestal-top" />
            <div className="pedestal-base" />
          </div>
        </div>
        <p className="mascot-helper-text">Level: {userLevel} • Select your avatar</p>
        {!isPremium && userRole !== 'admin' && (
          <button
            type="button"
            className="btn-text-only"
            onClick={handleUpgrade}
            style={{
              fontSize: '0.8rem',
              marginTop: '0.5rem',
              textDecoration: 'underline',
              color: 'var(--primary)',
            }}
          >
            Unlock all avatars with Premium
          </button>
        )}
      </div>

      <div className="mascot-controls">
        {isLoadingAvatars ? (
          <div className="loading-spinner">Loading avatars...</div>
        ) : (
          <div className="options-grid single-category">
            {(avatars as AvatarItem[])
              .filter((item) => !item.hidden || userRole === 'admin')
              .sort((a, b) => {
                const levelA = a.unlockLevel || 0;
                const levelB = b.unlockLevel || 0;

                const isUnlockedA =
                  userLevel >= levelA ||
                  (a.premium && isPremium) ||
                  (!a.premium && !a.unlockLevel) ||
                  userRole === 'admin';
                const isUnlockedB =
                  userLevel >= levelB ||
                  (b.premium && isPremium) ||
                  (!b.premium && !b.unlockLevel) ||
                  userRole === 'admin';

                if (isUnlockedA && !isUnlockedB) return -1;
                if (!isUnlockedA && isUnlockedB) return 1;

                return levelA - levelB;
              })
              .map((item) => {
                const isAdminItem = item.hidden;
                const isAdminUser = userRole === 'admin';
                const levelReq = item.unlockLevel || 0;

                if (item.name.includes('King')) {
                  console.log('👑 [MASCOT DEBUG] King Avatar:', {
                    id: item.id,
                    levelReq,
                    userLevel,
                    locked: userLevel < levelReq,
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
                        <span className="premium-badge-icon" title="Premium">
                          ★
                        </span>
                      )}
                      {item.hidden && (
                        <span className="premium-badge-icon admin" title="Admin Only">
                          💻
                        </span>
                      )}
                      {isLocked && (
                        <div className="lock-overlay">
                          <span style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>
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
