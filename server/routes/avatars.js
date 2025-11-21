const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const AVATARS_DIR = path.join(__dirname, '../public/avatars');

/**
 * @route GET /api/avatars
 * @desc Get list of all available avatars (free and premium)
 * @access Public
 */
router.get('/', (req, res) => {
  try {
    const avatars = [];

    // Helper to scan directory
    const scanDir = (type, isPremium) => {
      const dirPath = path.join(AVATARS_DIR, type);
      if (fs.existsSync(dirPath)) {
        const files = fs.readdirSync(dirPath);
        files.forEach(file => {
          if (file.match(/\.(png|jpg|jpeg|svg|gif)$/i)) {
            const id = path.parse(file).name; // 'archer' from 'archer.png'
            // Create a human-readable name: 'archer' -> 'Archer'
            const name = id.charAt(0).toUpperCase() + id.slice(1).replace(/[-_]/g, ' ');
            
            avatars.push({
              id: id,
              name: name,
              src: `/avatars/${type}/${file}`,
              premium: isPremium
            });
          }
        });
      }
    };

    scanDir('free', false);
    scanDir('premium', true);

    res.json({ success: true, avatars });
  } catch (error) {
    console.error('Error scanning avatars:', error);
    res.status(500).json({ success: false, error: 'Failed to load avatars' });
  }
});

module.exports = router;
