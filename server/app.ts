import express, { Application, Router } from 'express';
import { Server } from 'socket.io';
import { db, DatabaseService } from './lib/supabase';
import ConnectionManager from './lib/connectionManager';

// Route imports
import gameApiV2Router from './routes/gameApiV2';
import gameApiV2DDFRouter from './routes/gameApiV2_DDFCompatibility';
import gamesRouter from './routes/games';
import authRouter from './routes/auth';
import friendsRouter from './routes/friends';
import adminRouter from './routes/admin';
import stripeRouter from './routes/stripe';
import avatarsRouter from './routes/avatars';
import achievementsRouter from './routes/achievements';
import matchResultsRouter from './routes/matchResults';
import notificationsRouter from './routes/notifications';
import xpRouter from './routes/xp';

// Config imports
import { setupMiddleware, setupStripeWebhook } from './config/middleware';
import { setupCoreStaticRoutes, setupGameStaticRoutes, setupCatchAllRoute } from './config/staticRoutes';
import { setupErrorMiddleware } from './middleware/errorHandler';

/**
 * Create and configure the Express application
 */
export function createApp(
  io: Server,
  dbService: DatabaseService,
  connectionManager: ConnectionManager
): Application {
  const app = express();

  // Setup Stripe webhook BEFORE other middleware (needs raw body)
  setupStripeWebhook(app, stripeRouter as Router);

  // Setup core middleware (helmet, compression, cors, etc.)
  setupMiddleware(app);

  // Setup core static routes (client build, avatars, screenshots)
  setupCoreStaticRoutes(app);

  // Mount API routes
  console.log('🔌 [SERVER] Mounting API routes...');

  // Game API V2 routes (external game integration)
  app.use('/api/v2/game', gameApiV2Router(io, dbService, connectionManager));

  // DDF compatibility routes (separate from main V2 for legacy support)
  // Note: This is commented out - DDF uses the main V2 routes
  // app.use('/api/v2/ddf', gameApiV2DDFRouter(io, dbService, connectionManager));

  // Standard API routes
  app.use('/api/games', gamesRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/friends', friendsRouter(io, connectionManager));
  app.use('/api/admin', adminRouter);
  app.use('/api', authRouter); // Mount /users endpoint at /api/users
  app.use('/api/avatars', avatarsRouter);
  app.use('/api/stripe', stripeRouter);
  app.use('/api/achievements', achievementsRouter(io, connectionManager));
  app.use('/api/game', matchResultsRouter(dbService, io, connectionManager));
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/xp', xpRouter);

  // Supabase config endpoint for frontend
  app.get('/api/supabase-config', (req, res) => {
    try {
      const config = {
        url: process.env.SUPABASE_URL,
        anonKey: process.env.SUPABASE_ANON_KEY
      };

      console.log('📡 [API] Providing Supabase config to frontend:', {
        url: config.url ? `${config.url.substring(0, 20)}...` : 'MISSING',
        anonKey: config.anonKey ? `${config.anonKey.substring(0, 20)}...` : 'MISSING'
      });

      res.json(config);
    } catch (error) {
      console.error('❌ Error providing Supabase config:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get Supabase configuration'
      });
    }
  });

  // Game session lookup endpoint (for external games)
  // SECURITY: Validates premium status server-side instead of trusting client metadata
  app.get('/api/game-sessions/:token', async (req, res) => {
    try {
      const { token } = req.params;
      const now = new Date().toISOString();

      console.log('🔍 [SESSION LOOKUP] Incoming request:', {
        token: token ? token.substring(0, 8) + '...' : 'null',
        timestamp: now
      });

      if (!token) {
        return res.status(400).json({ error: 'Session token is required' });
      }

      // Look up session token
      const { data: session, error: sessionError } = await dbService.adminClient
        .from('game_sessions')
        .select('*')
        .eq('session_token', token)
        .gt('expires_at', now)
        .single();

      if (sessionError || !session) {
        console.log('❌ [SESSION LOOKUP] Session not found or expired');
        return res.status(404).json({ error: 'Invalid or expired session' });
      }

      console.log('✅ [SESSION LOOKUP] Session found:', {
        playerId: session.player_id,
        roomCode: session.room_code,
        gameType: session.game_type
      });

      // SECURITY FIX: Validate premium status from database instead of trusting metadata
      let validatedPremiumTier = 'free';

      if (session.user_id) {
        // Look up user's CURRENT premium status from database
        const { data: user, error: userError } = await dbService.adminClient
          .from('users')
          .select('premium_tier, premium_expires_at')
          .eq('id', session.user_id)
          .single();

        if (!userError && user) {
          const userPremiumTier = user.premium_tier || 'free';
          const premiumExpiresAt = user.premium_expires_at;

          // Check if subscription has expired
          if (userPremiumTier !== 'free' && userPremiumTier !== 'lifetime') {
            // Monthly/yearly subscriptions have expiration dates
            if (premiumExpiresAt) {
              const expiryDate = new Date(premiumExpiresAt);
              const currentDate = new Date();

              if (expiryDate > currentDate) {
                validatedPremiumTier = userPremiumTier;
                console.log(`💎 [PREMIUM] User ${session.user_id} has valid ${userPremiumTier} (expires ${premiumExpiresAt})`);
              } else {
                console.log(`⚠️ [PREMIUM] User ${session.user_id}'s ${userPremiumTier} subscription expired on ${premiumExpiresAt}`);
                validatedPremiumTier = 'free';
              }
            } else {
              // No expiry date set - treat as expired for safety
              console.log(`⚠️ [PREMIUM] User ${session.user_id} has ${userPremiumTier} but no expiry date`);
              validatedPremiumTier = 'free';
            }
          } else if (userPremiumTier === 'lifetime') {
            // Lifetime never expires
            validatedPremiumTier = 'lifetime';
            console.log(`💎 [PREMIUM] User ${session.user_id} has lifetime premium`);
          }
        } else {
          console.log(`⚠️ [PREMIUM] Could not look up user ${session.user_id}, defaulting to free`);
        }
      } else {
        // Guest user - use metadata but log warning
        console.log(`⚠️ [PREMIUM] Guest session (no user_id), using metadata premium: ${session.metadata?.premium_tier || 'free'}`);
        validatedPremiumTier = session.metadata?.premium_tier || 'free';
      }

      res.json({
        success: true,
        session: {
          playerId: session.player_id,
          roomCode: session.room_code,
          gameType: session.game_type,
          isHost: session.metadata?.is_host || false,
          playerName: session.metadata?.player_name || 'Player',
          premiumTier: validatedPremiumTier, // SECURITY: Server-validated premium tier
          avatarUrl: session.metadata?.avatar_url,
          avatarStyle: session.metadata?.avatar_style,
          avatarSeed: session.metadata?.avatar_seed,
          avatarOptions: session.metadata?.avatar_options,
          streamerMode: session.streamer_mode || false
        }
      });

    } catch (error) {
      console.error('❌ Session lookup error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Generate invite token for streamer mode room
  app.post('/api/rooms/:roomCode/generate-invite', async (req, res) => {
    try {
      const { roomCode } = req.params;
      const crypto = await import('crypto');

      const { data: room, error: roomError } = await dbService.adminClient
        .from('rooms')
        .select('id, streamer_mode, host_id')
        .eq('room_code', roomCode)
        .single();

      if (roomError || !room) {
        return res.status(404).json({ error: 'Room not found' });
      }

      if (!room.streamer_mode) {
        return res.status(400).json({ error: 'Room is not in streamer mode' });
      }

      const inviteToken = crypto.randomBytes(16).toString('hex');

      const { error: inviteError } = await dbService.adminClient
        .from('room_invites')
        .insert({
          room_id: room.id,
          token: inviteToken,
          created_by: room.host_id,
          uses_remaining: null
        });

      if (inviteError) {
        console.error('Error creating invite:', inviteError);
        return res.status(500).json({ error: 'Failed to generate invite' });
      }

      const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
      const host = req.get('host');
      const baseUrl = process.env.BASE_URL || `${protocol}://${host}`;
      const inviteUrl = `${baseUrl}/?invite=${inviteToken}`;

      res.json({
        success: true,
        inviteUrl,
        token: inviteToken
      });

    } catch (error) {
      console.error('❌ Generate invite error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Resolve invite token to room code
  app.post('/api/invites/resolve', async (req, res) => {
    try {
      const { inviteToken } = req.body;

      if (!inviteToken) {
        return res.status(400).json({ error: 'Invite token is required' });
      }

      const { data: invite, error: inviteError } = await dbService.adminClient
        .from('room_invites')
        .select(`*, room:rooms(*)`)
        .eq('token', inviteToken)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (inviteError || !invite) {
        return res.status(404).json({ error: 'Invalid or expired invite' });
      }

      if (invite.uses_remaining !== null && invite.uses_remaining <= 0) {
        return res.status(403).json({ error: 'Invite link has been fully used' });
      }

      if (invite.uses_remaining !== null) {
        await dbService.adminClient
          .from('room_invites')
          .update({ uses_remaining: invite.uses_remaining - 1 })
          .eq('id', invite.id);
      }

      res.json({
        success: true,
        roomCode: (invite as any).room.room_code,
        roomData: (invite as any).room
      });

    } catch (error) {
      console.error('❌ Resolve invite error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  console.log('✅ API routes mounted');

  return app;
}

/**
 * Setup final routes that must come after proxies
 * (game static routes and catch-all)
 */
export function setupFinalRoutes(app: Application): void {
  setupGameStaticRoutes(app);
  setupCatchAllRoute(app);
  setupErrorMiddleware(app);
}

export { db };
