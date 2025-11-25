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
      { count: registeredUsers },
      { count: premiumUsers },
      { count: activeRooms },
      { count: totalSessions }
    ] = await Promise.all([
      supabaseAdmin.from('users').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('users').select('*', { count: 'exact', head: true }).eq('is_guest', false),
      supabaseAdmin.from('users').select('*', { count: 'exact', head: true }).neq('premium_tier', 'free'),
      supabaseAdmin.from('rooms').select('*', { count: 'exact', head: true }).in('status', ['lobby', 'in_game']),
      supabaseAdmin.from('game_sessions').select('*', { count: 'exact', head: true })
    ]);

    // 2. Recent Registered Users (Exclude guests and users without email)
    const { data: recentUsers } = await supabaseAdmin
      .from('users')
      .select('id, username, email, created_at, premium_tier')
      .eq('is_guest', false)
      .not('email', 'is', null)
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
      metrics: { 
        totalUsers, 
        registeredUsers,
        guestUsers: totalUsers - registeredUsers,
        premiumUsers, 
        activeRooms, 
        totalSessions 
      },
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

// GET /api/admin/live-rooms - Get all active rooms with players
router.get('/live-rooms', async (req, res) => {
  try {
    const { data: rooms, error } = await supabaseAdmin
      .from('rooms')
      .select(`
        id,
        room_code,
        status,
        current_game,
        max_players,
        streamer_mode,
        created_at,
        last_activity,
        room_members (
          user_id,
          custom_lobby_name,
          role,
          is_connected,
          current_location,
          user:users (
            username,
            display_name
          )
        )
      `)
      .in('status', ['lobby', 'in_game', 'returning'])
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Format the response
    const formattedRooms = rooms.map(room => {
      const connectedPlayers = room.room_members?.filter(m => m.is_connected) || [];
      const host = room.room_members?.find(m => m.role === 'host');

      return {
        roomCode: room.room_code,
        status: room.status,
        currentGame: room.current_game || 'lobby',
        playerCount: connectedPlayers.length,
        maxPlayers: room.max_players,
        hostName: host?.custom_lobby_name || host?.user?.display_name || host?.user?.username || 'Unknown',
        streamerMode: room.streamer_mode,
        createdAt: room.created_at,
        lastActivity: room.last_activity,
        players: connectedPlayers.map(m => ({
          name: m.custom_lobby_name || m.user?.display_name || m.user?.username || 'Guest',
          role: m.role,
          location: m.current_location
        }))
      };
    });

    res.json({ success: true, rooms: formattedRooms });
  } catch (err) {
    console.error('Live rooms error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/online-stats - Get connection manager stats
router.get('/online-stats', async (req, res) => {
  try {
    // Import connectionManager from the main server
    // Since this is a route, we need to access it differently
    // The connectionManager is attached to the app in index.js
    const connectionManager = req.app.get('connectionManager');

    if (connectionManager && typeof connectionManager.getStats === 'function') {
      const stats = connectionManager.getStats();
      res.json({ success: true, stats });
    } else {
      // Fallback: just return basic info from database
      const { count: activeConnections } = await supabaseAdmin
        .from('room_members')
        .select('*', { count: 'exact', head: true })
        .eq('is_connected', true);

      res.json({
        success: true,
        stats: {
          totalConnections: activeConnections || 0,
          activeRooms: 0,
          activeUsers: 0,
          note: 'ConnectionManager not available, showing DB count'
        }
      });
    }
  } catch (err) {
    console.error('Online stats error:', err);
    res.status(500).json({ error: err.message });
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
