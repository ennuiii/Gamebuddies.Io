import React from 'react';
import MascotAvatar from './MascotAvatar';

/**
 * Generate DiceBear avatar URL (Legacy support)
 * @param {string} style - Avatar style (e.g., 'pixel-art', 'adventurer')
 * @param {string} seed - Seed for generating unique avatar (username, etc.)
 * @param {object} options - Additional options for the avatar
 * @param {number} size - Size of the avatar in pixels
 * @returns {string} DiceBear API URL
 */
export const getDiceBearUrl = (style = 'pixel-art', seed = 'default', options = {}, size = 80) => {
  const baseUrl = `https://api.dicebear.com/9.x/${style}/svg`;
  const params = new URLSearchParams({
    seed: seed,
    size: size,
    ...options
  });
  return `${baseUrl}?${params.toString()}`;
};

/**
 * Avatar component that displays DiceBear avatar or fallback initial
 */
const Avatar = ({
  name = '',
  avatarStyle,
  avatarSeed,
  avatarOptions = {},
  size = 40,
  isPremium = false,
  className = ''
}) => {
  // If user has custom avatar settings, use DiceBear or Mascot
  const showCustomAvatar = !!avatarStyle;

  if (showCustomAvatar) {
    if (avatarStyle === 'custom-mascot') {
      return (
        <MascotAvatar
          config={avatarOptions}
          size={size}
          className={className}
        />
      );
    }

    const seed = avatarSeed || name || 'default';
    const url = getDiceBearUrl(avatarStyle, seed, avatarOptions, size * 2); // 2x for retina

    return (
      <img
        src={url}
        alt={name}
        className={`avatar-image dicebear-avatar ${className}`}
        style={{ width: size, height: size }}
        loading="lazy"
      />
    );
  }

  // Fallback to first letter
  return (
    <span className={`avatar-initial ${className}`}>
      {name.charAt(0).toUpperCase() || '?'}
    </span>
  );
};

export default Avatar;
