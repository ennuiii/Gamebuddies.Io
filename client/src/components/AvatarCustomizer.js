import React, { useState, useEffect } from 'react';
import { AVATAR_STYLES, getDiceBearUrl } from './Avatar';
import './AvatarCustomizer.css';

const AvatarCustomizer = ({
  currentStyle,
  currentSeed,
  currentOptions = {},
  username,
  onSave,
  onCancel,
  loading = false
}) => {
  const [style, setStyle] = useState(currentStyle || 'pixel-art');
  const [seed, setSeed] = useState(currentSeed || username || '');
  const [options, setOptions] = useState(currentOptions);

  // Update seed when username changes (for preview)
  useEffect(() => {
    if (!currentSeed && username) {
      setSeed(username);
    }
  }, [username, currentSeed]);

  const handleSave = () => {
    onSave({
      avatar_style: style,
      avatar_seed: seed || username,
      avatar_options: options
    });
  };

  const handleRandomize = () => {
    // Generate random seed for variety
    const randomSeed = `${username || 'user'}_${Date.now()}`;
    setSeed(randomSeed);
  };

  const previewUrl = getDiceBearUrl(style, seed || username || 'preview', options, 160);

  return (
    <div className="avatar-customizer">
      <div className="avatar-preview-section">
        <div className="avatar-preview-container">
          <img
            src={previewUrl}
            alt="Avatar preview"
            className="avatar-preview"
          />
        </div>
        <button
          type="button"
          onClick={handleRandomize}
          className="btn btn-small btn-outline"
        >
          Randomize
        </button>
      </div>

      <div className="avatar-options">
        <div className="option-group">
          <label htmlFor="avatar-style">Style</label>
          <select
            id="avatar-style"
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            className="avatar-select"
          >
            {AVATAR_STYLES.map(s => (
              <option key={s.id} value={s.id}>
                {s.name} - {s.description}
              </option>
            ))}
          </select>
        </div>

        <div className="option-group">
          <label htmlFor="avatar-seed">Seed (for uniqueness)</label>
          <input
            id="avatar-seed"
            type="text"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder={username || 'Enter custom seed'}
            className="avatar-input"
          />
          <small className="input-hint">
            Different seeds create different avatars in the same style
          </small>
        </div>

        {/* Style previews */}
        <div className="style-previews">
          <label>Quick Style Select</label>
          <div className="style-grid">
            {AVATAR_STYLES.slice(0, 6).map(s => (
              <button
                key={s.id}
                type="button"
                className={`style-preview-btn ${style === s.id ? 'selected' : ''}`}
                onClick={() => setStyle(s.id)}
                title={s.name}
              >
                <img
                  src={getDiceBearUrl(s.id, seed || username || 'preview', {}, 48)}
                  alt={s.name}
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="avatar-actions">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="btn btn-outline"
            disabled={loading}
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          className="btn btn-primary"
          disabled={loading}
        >
          {loading ? 'Saving...' : 'Save Avatar'}
        </button>
      </div>
    </div>
  );
};

export default AvatarCustomizer;
