import React, { CSSProperties } from 'react';
import { useAvatars } from '../hooks/useAvatars';
import './MascotAvatar.css';

interface MascotConfig {
  avatarId?: string;
  [key: string]: unknown;
}

interface MascotAvatarProps {
  config?: MascotConfig;
  size?: number;
  className?: string;
}

const MascotAvatar: React.FC<MascotAvatarProps> = ({ config = {}, size = 100, className = '' }) => {
  const { avatarId } = config;
  const { getAvatarSrc, loading } = useAvatars();

  const src = getAvatarSrc(avatarId || '');

  // Determine style based on file type
  const isFullArt = src && (src.toLowerCase().endsWith('.jpg') || src.toLowerCase().endsWith('.jpeg'));

  // Dynamic styles
  const containerStyle: CSSProperties = {
    width: size,
    height: size,
    padding: isFullArt ? 0 : '12%',
  };

  const imgStyle: CSSProperties = {
    objectFit: isFullArt ? 'cover' : 'contain',
  };

  return (
    <div className={`mascot-avatar-container ${className}`} style={containerStyle}>
      {!src ? (
        // Placeholder / Loading state
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {loading ? (
            <span className="loading-dots">...</span>
          ) : (
            <span style={{ fontSize: size * 0.5, color: '#ccc' }}>?</span>
          )}
        </div>
      ) : (
        // Actual Avatar Image
        <img src={src} alt="Custom Mascot" className="mascot-avatar-img" style={imgStyle} />
      )}
    </div>
  );
};

export default MascotAvatar;
