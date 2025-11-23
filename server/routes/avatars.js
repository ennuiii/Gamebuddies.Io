const express = require('express');
const fs = require('fs');
const path = require('path');
const { supabaseAdmin } = require('../lib/supabase');

const router = express.Router();

const AVATARS_DIR = path.join(__dirname, '../public/avatars');

// Level requirements for specific avatars
const AVATAR_REQUIREMENTS = {
  'wizard': 5,
  'dragon': 10,
  'king': 20,
  'cyber_punk': 15,
  'gold_robot': 50
};

/**
 * @route GET /api/avatars
 * @desc Get list of all available avatars (free and premium)
 * @access Public (Hidden avatars require Admin role)
 */
router.get('/', async (req, res) => {
  try {
    const avatars = [];
    let isAdmin = false;

    // Check for authentication to see if user is admin
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
        
        if (user && !error) {
          // Check role in public.users
          const { data: publicUser, error: publicError } = await supabaseAdmin
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single();
          
          if (publicUser && publicUser.role === 'admin') {
            isAdmin = true;
          }
        }
      } catch (authError) {
        console.warn('Error checking admin status:', authError.message);
        // Continue as non-admin
      }
    }

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
              premium: isPremium,
              hidden: type === 'hidden',
              unlockLevel: AVATAR_REQUIREMENTS[id] || 0
            });
          }
        });
      }
    };

    scanDir('free', false);
    scanDir('premium', true);
    scanDir('hidden', true); // Always scan hidden, mark as premium/locked

    res.json({ success: true, avatars });
  } catch (error) {
    console.error('Error scanning avatars:', error);
    res.status(500).json({ success: false, error: 'Failed to load avatars' });
  }
});

module.exports = router;
