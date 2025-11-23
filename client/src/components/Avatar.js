import React from 'react';
import MascotAvatar from './MascotAvatar';

/**
 * Avatar component that displays Custom Mascot or fallback
 * DiceBear support has been removed.
 */
const Avatar = ({
  name = '',
  avatarStyle,
  avatarSeed,
  avatarOptions = {},
  size = 40,
  isPremium = false,
  className = '',
  url // Direct URL override
}) => {
  
  // 1. If direct URL is provided (e.g. from DB), use it
  if (url) {
    // Check if it's a full art or mascot style
    const isFullArt = url.toLowerCase().endsWith('.jpg') || url.toLowerCase().endsWith('.jpeg');
    
    return (
      <div 
        className={`mascot-avatar-container ${className}`}
        style={{ width: size, height: size, padding: isFullArt ? 0 : '12%' }}
      >
        <img
          src={url}
          alt={name}
          className="mascot-avatar-img"
          style={{ objectFit: isFullArt ? 'cover' : 'contain' }}
          loading="lazy"
        />
      </div>
    );
  }

  // 2. If using custom-mascot style logic
  if (avatarStyle === 'custom-mascot' && avatarOptions?.avatarId) {
    return (
      <MascotAvatar
        config={avatarOptions}
        size={size}
        className={className}
      />
    );
  }

  // 3. Fallback to Default Mascot (Gabu)
  return (
    <MascotAvatar
      config={{ avatarId: 'Gabu' }}
      size={size}
      className={className}
    />
  );
};

export default Avatar;