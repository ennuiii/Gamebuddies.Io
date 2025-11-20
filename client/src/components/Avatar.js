import React from 'react';

// DiceBear avatar styles suitable for gaming
export const AVATAR_STYLES = [
  { id: 'pixel-art', name: 'Pixel Art', description: '8-bit gaming aesthetic' },
  { id: 'adventurer', name: 'Adventurer', description: 'RPG character portraits' },
  { id: 'adventurer-neutral', name: 'Adventurer Neutral', description: 'Simplified adventurer' },
  { id: 'bottts', name: 'Robots', description: 'Friendly robot avatars' },
  { id: 'fun-emoji', name: 'Fun Emoji', description: 'Expressive emoji faces' },
  { id: 'thumbs', name: 'Thumbs', description: 'Simple thumbs characters' },
  { id: 'lorelei', name: 'Lorelei', description: 'Illustrated portraits' },
  { id: 'notionists', name: 'Notionists', description: 'Minimalist faces' },
  { id: 'big-smile', name: 'Big Smile', description: 'Happy cartoon faces' },
  { id: 'micah', name: 'Micah', description: 'Modern illustrated avatars' }
];

/**
 * Generate DiceBear avatar URL
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
  // If user has custom avatar settings and is premium, use DiceBear
  const showCustomAvatar = isPremium && avatarStyle;

  if (showCustomAvatar) {
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
