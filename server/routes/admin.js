const express = require('express');
const { supabaseAdmin } = require('../lib/supabase');
const { requireAuth, requireAdmin } = require('../middlewares/auth');
const router = express.Router();

// Middleware to ensure only admins can access these routes
router.use(requireAuth);
router.use(requireAdmin);

// GET /api/admin/dashboard-stats
router.get('/dashboard-stats', async (req, res) => {
  try {
    // 1. Key Metrics (Parallel fetch for speed)
    const [
      { count: totalUsers },
      { count: premiumUsers },
      { count: activeRooms },
      { count: totalSessions }
    ] = await Promise.all([
      supabaseAdmin.from('users').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('users').select('*', { count: 'exact', head: true }).neq('premium_tier', 'free'),
      supabaseAdmin.from('rooms').select('*', { count: 'exact', head: true }).in('status', ['lobby', 'in_game']),
      supabaseAdmin.from('game_sessions').select('*', { count: 'exact', head: true })
    ]);

    // 2. Recent Users
    const { data: recentUsers } = await supabaseAdmin
      .from('users')
      .select('id, username, email, created_at, premium_tier')
      .order('created_at', { ascending: false })
      .limit(5);

    // 3. Game Popularity (Sample last 500 sessions for trends)
    const { data: sessions } = await supabaseAdmin
      .from('game_sessions')
      .select('game_type')
      .order('created_at', { ascending: false })
      .limit(500);

    const gameStats = sessions?.reduce((acc, curr) => {
      const game = curr.game_type || 'Unknown';
      acc[game] = (acc[game] || 0) + 1;
      return acc;
    }, {}) || {};

    res.json({
      success: true,
      metrics: { totalUsers, premiumUsers, activeRooms, totalSessions },
      recentUsers,
      gameStats
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/affiliates
router.get('/affiliates', async (req, res) => {
  try {
    // Join with users to get usernames if needed
    const { data, error } = await supabaseAdmin
      .from('affiliates')
      .select(`
        *,
        user:users(username, email)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, affiliates: data });
  } catch (error) {
    console.error('Error fetching affiliates:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/affiliates (Create new affiliate)
router.post('/affiliates', async (req, res) => {
  try {
    const { code, userId, commissionRate, name, email, notes } = req.body;

    if (!code) return res.status(400).json({ error: 'Code is required' });

    // Check if code exists
    const { data: existing } = await supabaseAdmin
      .from('affiliates')
      .select('id')
      .eq('code', code.toUpperCase())
      .single();

    if (existing) return res.status(400).json({ error: 'Code already taken' });

    const { data, error } = await supabaseAdmin
      .from('affiliates')
      .insert({
        code: code.toUpperCase(),
        user_id: userId || null, // Optional linking to existing user
        commission_rate: commissionRate || 0.20,
        status: 'active',
        name: name || null,
        email: email || null,
        notes: notes || null
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, affiliate: data });
  } catch (error) {
    console.error('Error creating affiliate:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
