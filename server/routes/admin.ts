import express, { Request, Response, Router } from 'express';
import { supabaseAdmin } from '../lib/supabase';
import { requireAuth, requireAdmin, AuthenticatedRequest } from '../middlewares/auth';
import { ConnectionManager } from '../lib/connectionManager';

const router: Router = express.Router();

// Type definitions
interface DashboardMetrics {
  totalUsers: number | null;
  registeredUsers: number | null;
  guestUsers: number;
  premiumUsers: number | null;
  activeRooms: number | null;
  totalSessions: number | null;
}

interface RecentUser {
  id: string;
  username: string;
  email: string;
  created_at: string;
  premium_tier: string;
}

interface GameSession {
  game_type: string | null;
}

interface RoomMember {
  user_id: string;
  custom_lobby_name: string | null;
  role: string;
  is_connected: boolean;
  current_location: string | null;
  user: {
    username: string;
    display_name: string | null;
  } | null;
}

interface LiveRoom {
  id: string;
  room_code: string;
  status: string;
  current_game: string | null;
  max_players: number;
  streamer_mode: boolean;
  created_at: string;
  last_activity: string;
  room_members: RoomMember[];
}

interface AffiliateData {
  code: string;
  user_id: string | null;
  commission_rate: number;
  status: string;
  name: string | null;
  email: string | null;
  notes: string | null;
}

// ConnectionManager is stored using app.set() and retrieved with app.get()

// Middleware to ensure only admins can access these routes
router.use(requireAuth);
router.use(requireAdmin);

// GET /api/admin/dashboard-stats
router.get('/dashboard-stats', async (req: Request, res: Response): Promise<void> => {
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

    const gameStats = (sessions as GameSession[] | null)?.reduce((acc: Record<string, number>, curr) => {
      const game = curr.game_type || 'Unknown';
      acc[game] = (acc[game] || 0) + 1;
      return acc;
    }, {}) || {};

    const metrics: DashboardMetrics = {
      totalUsers,
      registeredUsers,
      guestUsers: (totalUsers || 0) - (registeredUsers || 0),
      premiumUsers,
      activeRooms,
      totalSessions
    };

    res.json({
      success: true,
      metrics,
      recentUsers,
      gameStats
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/admin/affiliates
router.get('/affiliates', async (req: Request, res: Response): Promise<void> => {
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
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /api/admin/live-rooms - Get all active rooms with players
router.get('/live-rooms', async (req: Request, res: Response): Promise<void> => {
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formattedRooms = (rooms as any[]).map(room => {
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
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/admin/online-stats - Get connection manager stats
router.get('/online-stats', async (req: Request, res: Response): Promise<void> => {
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
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/admin/affiliates (Create new affiliate)
router.post('/affiliates', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { code, userId, commissionRate, name, email, notes } = req.body;

    if (!code) {
      res.status(400).json({ error: 'Code is required' });
      return;
    }

    // Check if code exists
    const { data: existing } = await supabaseAdmin
      .from('affiliates')
      .select('id')
      .eq('code', (code as string).toUpperCase())
      .single();

    if (existing) {
      res.status(400).json({ error: 'Code already taken' });
      return;
    }

    const affiliateData: AffiliateData = {
      code: (code as string).toUpperCase(),
      user_id: userId || null,
      commission_rate: commissionRate || 0.20,
      status: 'active',
      name: name || null,
      email: email || null,
      notes: notes || null
    };

    const { data, error } = await supabaseAdmin
      .from('affiliates')
      .insert(affiliateData)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, affiliate: data });
  } catch (error) {
    console.error('Error creating affiliate:', error);
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
