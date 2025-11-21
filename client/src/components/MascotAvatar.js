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

  if (!src) {
    // If loading or not found, show placeholder
    return (
      <div 
        className={`mascot-avatar-container ${className}`}
        style={{ width: size, height: size, backgroundColor: '#eee', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {loading ? (
          <span className="loading-dots">...</span>
        ) : (
          <span style={{ fontSize: size * 0.5 }}>?</span>
        )}
      </div>
    );
  }

  return (
    <img 
      src={src} 
      alt="Custom Mascot" 
      className={`mascot-avatar-img ${className}`}
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }}
    />
  );
};

export default MascotAvatar;
