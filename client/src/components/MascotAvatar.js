import React from 'react';
import { useAvatars } from '../hooks/useAvatars';
import './MascotAvatar.css';

const MascotAvatar = ({ 
  config = {}, 
  size = 100, 
  className = '' 
}) => {
  const { avatarId } = config;
  const { getAvatarSrc, loading } = useAvatars();

  const src = getAvatarSrc(avatarId);

  return (
    <div 
      className={`mascot-avatar-container ${className}`}
      style={{ width: size, height: size }}
    >
      {!src ? (
        // Placeholder / Loading state
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {loading ? (
            <span className="loading-dots">...</span>
          ) : (
            <span style={{ fontSize: size * 0.5, color: '#ccc' }}>?</span>
          )}
        </div>
      ) : (
        // Actual Avatar Image
        <img 
          src={src} 
          alt="Custom Mascot" 
          className="mascot-avatar-img"
        />
      )}
    </div>
  );
};

export default MascotAvatar;
