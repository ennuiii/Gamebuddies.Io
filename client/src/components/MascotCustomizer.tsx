import React, { useState, useEffect } from 'react';
import MascotAvatar from './MascotAvatar';
import { getDefaultMascotConfig } from '../utils/mascotAssets';
import { useAvatars } from '../hooks/useAvatars';
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
  const [config, setConfig] = useState<MascotConfig>(currentConfig || getDefaultMascotConfig());
  const { avatars, loading: isLoadingAvatars } = useAvatars();

  useEffect(() => {
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

    setConfig({ avatarId: item.id });
  };

  const handleSave = (): void => {
    onSave({
      avatar_style: 'custom-mascot',
      avatar_seed: 'custom',
      avatar_options: config,
    });
  };

  return (
    <div className="mascot-customizer">
      <div className="mascot-preview-area">
        <div className="mascot-preview-wrapper">
          <div className="mascot-spotlight"></div>
          <div className="mascot-preview-ring" />
          <MascotAvatar config={config} size={230} />
          <div className="mascot-pedestal">
            <div className="pedestal-top" />
          </div>
        </div>
        <p className="mascot-helper-text">Select your avatar</p>
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
                          ⚙
                        </span>
                      )}
                      {isLocked && (
                        <div className="lock-overlay">
                          <span style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>
                            {isLockedByLevel ? `Lvl ${levelReq}` : 'LOCKED'}
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

      <div className="mascot-actions">
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSave}
          disabled={loading}
        >
          {loading ? 'Saving...' : 'Save Avatar'}
        </button>
      </div>
    </div>
  );
};

export default MascotCustomizer;
