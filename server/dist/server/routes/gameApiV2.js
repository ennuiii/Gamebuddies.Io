"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = createGameApiV2Router;
const express_1 = __importDefault(require("express"));
const lobbyManager_1 = __importDefault(require("../lib/lobbyManager"));
const statusSyncManager_1 = __importDefault(require("../lib/statusSyncManager"));
const validation_1 = require("../lib/validation");
const apiKeyMiddleware = typeof validation_1.validateApiKey === 'function'
    ? validation_1.validateApiKey
    : (req, res, next) => next();
function createGameApiV2Router(io, db, connectionManager) {
    const router = express_1.default.Router();
    const noopRateLimit = (req, res, next) => next();
    const getRateLimiter = (name) => {
        const candidate = validation_1.rateLimits?.[name];
        return typeof candidate === 'function' ? candidate : noopRateLimit;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lobbyManager = new lobbyManager_1.default(io, db, connectionManager);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const statusSyncManager = new statusSyncManager_1.default(db, io, lobbyManager);
    // V2 Room validation with enhanced session support
    router.get('/rooms/:roomCode/validate', apiKeyMiddleware, getRateLimiter('apiCalls'), async (req, res) => {
        try {
            const apiReq = req;
            const { roomCode } = req.params;
            const { playerName, playerId, sessionToken } = req.query;
            console.log(`🔍 [API V2] Validating room ${roomCode} for service ${apiReq.apiKey.service_name}`);
            // Get room with enhanced participant data
            const { data: room, error } = await db.adminClient
                .from('rooms')
                .select(`
          *,
          participants:room_members(
            *,
            user:users(*),
            session:player_sessions(*)
          )
        `)
                .eq('room_code', roomCode)
                .single();
            if (error || !room) {
                res.status(404).json({
                    valid: false,
                    error: 'Room not found',
                    code: 'ROOM_NOT_FOUND'
                });
                return;
            }
            const typedRoom = room;
            // Enhanced room status validation
            const validStatuses = ['lobby', 'in_game', 'returning'];
            if (!validStatuses.includes(typedRoom.status)) {
                res.status(400).json({
                    valid: false,
                    error: `Room is ${typedRoom.status}`,
                    code: 'ROOM_NOT_AVAILABLE',
                    status: typedRoom.status,
                    allowedStatuses: validStatuses
                });
                return;
            }
            // Game type compatibility check
            if (typedRoom.current_game && typedRoom.current_game !== apiReq.apiKey.service_name) {
                res.status(400).json({
                    valid: false,
                    error: 'Room is for a different game',
                    code: 'WRONG_GAME_TYPE',
                    expectedGame: apiReq.apiKey.service_name,
                    actualGame: typedRoom.current_game
                });
                return;
            }
            // Find participant and validate session if provided
            let participant = null;
            let sessionValid = false;
            if (playerName || playerId) {
                participant = typedRoom.participants?.find(p => (playerName && p.user?.username === playerName) ||
                    (playerId && p.user_id === playerId)) || null;
                // Session validation
                if (sessionToken && participant?.session?.length > 0) {
                    const activeSession = participant.session.find(s => s.session_token === sessionToken &&
                        s.status === 'active' &&
                        new Date(s.expires_at) > new Date());
                    sessionValid = !!activeSession;
                }
            }
            // Get latest game state
            const { data: gameState } = await db.adminClient
                .from('game_states')
                .select('*')
                .eq('room_id', typedRoom.id)
                .eq('game_name', apiReq.apiKey.service_name)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
            console.log(`✅ [API V2] Room ${roomCode} validated successfully`);
            const typedGameState = gameState;
            res.json({
                valid: true,
                version: '2.0',
                room: {
                    id: typedRoom.id,
                    code: typedRoom.room_code,
                    gameType: typedRoom.current_game,
                    status: typedRoom.status,
                    currentPlayers: typedRoom.participants?.filter(p => p.is_connected === true).length || 0,
                    maxPlayers: typedRoom.max_players,
                    settings: typedRoom.game_settings,
                    metadata: typedRoom.metadata,
                    createdAt: typedRoom.created_at,
                    lastActivity: typedRoom.last_activity
                },
                participant: participant ? {
                    id: participant.user_id,
                    role: participant.role,
                    isHost: participant.role === 'host',
                    isConnected: participant.is_connected,
                    currentLocation: participant.current_location,
                    inGame: participant.in_game,
                    sessionValid,
                    gameData: participant.game_data
                } : null,
                participants: typedRoom.participants
                    ?.filter(p => p.is_connected === true)
                    .map(p => ({
                    id: p.user_id,
                    name: p.user?.display_name || 'Player',
                    role: p.role,
                    isHost: p.role === 'host',
                    currentLocation: p.current_location,
                    inGame: p.in_game,
                    lastPing: p.last_ping
                })),
                gameState: typedGameState ? {
                    id: typedGameState.id,
                    data: typedGameState.state_data,
                    version: typedGameState.state_version,
                    createdAt: typedGameState.created_at
                } : null,
                sessionInfo: sessionToken ? { valid: sessionValid } : null
            });
        }
        catch (error) {
            console.error('❌ [API V2] Room validation error:', error);
            res.status(500).json({
                valid: false,
                error: 'Server error',
                code: 'SERVER_ERROR'
            });
        }
    });
    // V2 Enhanced player status update
    router.post('/rooms/:roomCode/players/:playerId/status', apiKeyMiddleware, getRateLimiter('statusUpdates'), async (req, res) => {
        try {
            const apiReq = req;
            const { roomCode, playerId } = req.params;
            const { status, location, metadata = {}, syncSession = false } = req.body;
            console.log(`🔄 [API V2] Updating player ${playerId} status: ${status}/${location}`);
            // Validate status and location values
            const validStatuses = ['connected', 'disconnected', 'in_game', 'returning', 'lobby'];
            const validLocations = ['game', 'lobby', 'disconnected'];
            if (!validStatuses.includes(status)) {
                res.status(400).json({
                    error: 'Invalid status',
                    validStatuses
                });
                return;
            }
            if (location && !validLocations.includes(location)) {
                res.status(400).json({
                    error: 'Invalid location',
                    validLocations
                });
                return;
            }
            // Enhanced metadata
            const enhancedMetadata = {
                ...metadata,
                apiVersion: '2.0',
                service: apiReq.apiKey.service_name,
                timestamp: new Date().toISOString(),
                source: 'external_game_api_v2'
            };
            // Update status using StatusSyncManager
            const result = await statusSyncManager.updatePlayerLocation(playerId, roomCode, location || (status === 'disconnected' ? 'disconnected' : 'game'), enhancedMetadata);
            // Session sync if requested
            let sessionToken = null;
            if (syncSession) {
                try {
                    // Get room ID for session creation
                    const { data: room } = await db.adminClient
                        .from('rooms')
                        .select('id')
                        .eq('room_code', roomCode)
                        .single();
                    if (room) {
                        sessionToken = await lobbyManager.createPlayerSession(playerId, room.id, `api_${Date.now()}`);
                    }
                }
                catch (sessionError) {
                    console.warn('⚠️ [API V2] Session sync failed:', sessionError);
                }
            }
            console.log(`✅ [API V2] Player ${playerId} status updated successfully`);
            res.json({
                success: true,
                updated: {
                    status,
                    location,
                    timestamp: enhancedMetadata.timestamp
                },
                conflicts: result.conflicts || [],
                sessionToken,
                queued: result.queued || false
            });
        }
        catch (error) {
            console.error('❌ [API V2] Status update error:', error);
            res.status(500).json({
                error: 'Failed to update status',
                code: 'UPDATE_FAILED'
            });
        }
    });
    // V2 Bulk status update with enhanced features
    router.post('/rooms/:roomCode/bulk-status', apiKeyMiddleware, getRateLimiter('bulkUpdates'), async (req, res) => {
        try {
            const apiReq = req;
            const { roomCode } = req.params;
            const { reason, players, gameState, returnToLobby = false } = req.body;
            console.log(`📦 [API V2] Bulk updating ${players?.length || 0} players in room ${roomCode}`);
            if (!players || !Array.isArray(players) || players.length === 0) {
                res.status(400).json({
                    error: 'Players array is required and must not be empty'
                });
                return;
            }
            // Validate player data
            for (const player of players) {
                if (!player.playerId) {
                    res.status(400).json({
                        error: 'Each player must have a playerId'
                    });
                    return;
                }
            }
            // Process bulk update
            const result = await statusSyncManager.bulkUpdatePlayerStatus(roomCode, players.map(p => ({
                playerId: p.playerId,
                location: p.location || 'lobby',
                reason: p.reason || reason || 'Bulk update',
                gameData: p.gameData
            })), reason);
            // Handle game state if provided
            if (gameState) {
                const { data: room, error: roomLookupError } = await db.adminClient
                    .from('rooms')
                    .select('id')
                    .eq('room_code', roomCode)
                    .single();
                if (roomLookupError) {
                    console.warn('[API V2] Room lookup failed during game state save:', roomLookupError);
                }
                else if (room) {
                    try {
                        await db.saveGameState(room.id, apiReq.apiKey.service_name, gameState, null);
                    }
                    catch (stateError) {
                        console.warn('[API V2] Game state save failed:', stateError);
                    }
                }
            }
            console.log(`[API V2] Bulk update completed: ${result.summary.successful}/${result.summary.total} successful`);
            res.json({
                success: true,
                results: result.results,
                errors: result.errors,
                summary: result.summary,
                gameStateSaved: !!gameState,
                returnInitiated: returnToLobby
            });
        }
        catch (error) {
            console.error('❌ [API V2] Bulk update error:', error);
            res.status(500).json({
                error: 'Bulk update failed',
                code: 'BULK_UPDATE_FAILED'
            });
        }
    });
    // V2 Session recovery endpoint
    router.post('/sessions/recover', async (req, res) => {
        try {
            const { sessionToken, socketId } = req.body;
            if (!sessionToken) {
                res.status(400).json({
                    error: 'Session token is required'
                });
                return;
            }
            console.log(`🔄 [API V2] Attempting session recovery for token: ${sessionToken.substring(0, 8)}...`);
            const result = await lobbyManager.recoverSession(sessionToken, socketId || `api_${Date.now()}`);
            console.log(`✅ [API V2] Session recovered successfully`);
            res.json(result);
        }
        catch (error) {
            console.error('❌ [API V2] Session recovery error:', error);
            res.status(401).json({
                error: 'Session recovery failed',
                code: 'INVALID_SESSION'
            });
        }
    });
    // V2 Room status sync endpoint
    router.post('/rooms/:roomCode/sync', apiKeyMiddleware, getRateLimiter('apiCalls'), async (req, res) => {
        try {
            const { roomCode } = req.params;
            console.log(`🔄 [API V2] Manual room sync requested for ${roomCode}`);
            const result = await statusSyncManager.syncRoomStatus(roomCode);
            res.json({
                success: true,
                synced: result.success,
                playersCount: result.playersCount || 0,
                timestamp: new Date().toISOString()
            });
        }
        catch (error) {
            console.error('❌ [API V2] Room sync error:', error);
            res.status(500).json({
                error: 'Room sync failed',
                code: 'SYNC_FAILED'
            });
        }
    });
    // V2 Return all players to lobby (atomic)
    router.post('/rooms/:roomCode/return-all', apiKeyMiddleware, getRateLimiter('apiCalls'), async (req, res) => {
        try {
            const apiReq = req;
            const { roomCode } = req.params;
            const now = new Date().toISOString();
            console.log(`[API V2] return-all requested for ${roomCode} by ${apiReq.apiKey?.service_name}`);
            // Load room with participants
            const { data: room, error: roomErr } = await db.adminClient
                .from('rooms')
                .select(`
          *,
          participants:room_members(
            user_id,
            role,
            is_connected,
            in_game,
            current_location,
            last_ping,
            joined_at,
            user:users(username, display_name)
          )
        `)
                .eq('room_code', roomCode)
                .single();
            if (roomErr || !room) {
                res.status(404).json({ error: 'Room not found', code: 'ROOM_NOT_FOUND' });
                return;
            }
            const typedRoom = room;
            // Update room status to lobby and set short grace window for return-in-progress
            const graceUntil = new Date(Date.now() + 15000).toISOString();
            await db.adminClient
                .from('rooms')
                .update({
                status: 'lobby',
                last_activity: now,
                metadata: {
                    ...(typedRoom.metadata || {}),
                    return_in_progress_until: graceUntil
                }
            })
                .eq('id', typedRoom.id);
            // Update all participants to lobby
            const { error: updErr } = await db.adminClient
                .from('room_members')
                .update({
                in_game: false,
                current_location: 'lobby',
                is_connected: true,
                last_ping: now
            })
                .eq('room_id', typedRoom.id);
            if (updErr) {
                console.error('[API V2] return-all participant update error:', updErr);
            }
            // Ensure a host exists
            let hasHost = Array.isArray(typedRoom.participants) && typedRoom.participants.some(p => p.role === 'host');
            if (!hasHost) {
                // Prefer previous room.host_id if present
                let hostUserId = typedRoom.host_id;
                if (!hostUserId && typedRoom.participants && typedRoom.participants.length) {
                    // Fallback to oldest participant
                    const sorted = [...typedRoom.participants].sort((a, b) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime());
                    hostUserId = sorted[0]?.user_id;
                }
                if (hostUserId) {
                    await db.adminClient
                        .from('room_members')
                        .update({ role: 'host' })
                        .eq('room_id', typedRoom.id)
                        .eq('user_id', hostUserId);
                    await db.adminClient
                        .from('rooms')
                        .update({ host_id: hostUserId })
                        .eq('id', typedRoom.id);
                    console.log(`[API V2] return-all promoted host: ${hostUserId}`);
                }
            }
            // Fetch updated snapshot
            const updatedRoom = await db.getRoomByCode(roomCode);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const allPlayers = updatedRoom?.participants?.map((p) => ({
                id: p.user_id,
                name: p.user?.display_name || 'Player',
                isHost: p.role === 'host',
                isConnected: p.is_connected,
                inGame: p.in_game,
                currentLocation: p.current_location || (p.is_connected ? 'lobby' : 'disconnected'),
                lastPing: p.last_ping,
                socketId: null
            })) || [];
            // Broadcast a single authoritative snapshot
            if (io) {
                console.log(`[API V2] Broadcasting return-all snapshot to ${roomCode}`);
                io.to(roomCode).emit('playerStatusUpdated', {
                    reason: 'return_all',
                    players: allPlayers,
                    room: updatedRoom,
                    source: 'return_all',
                    roomVersion: Date.now(),
                    timestamp: now
                });
            }
            res.json({
                success: true,
                updated: allPlayers.length,
                roomCode,
                roomStatus: updatedRoom?.status
            });
        }
        catch (error) {
            console.error('[API V2] return-all error:', error);
            res.status(500).json({ error: 'RETURN_ALL_FAILED' });
        }
    });
    // V2 Heartbeat endpoint for external games
    router.post('/rooms/:roomCode/players/:playerId/heartbeat', apiKeyMiddleware, getRateLimiter('heartbeats'), async (req, res) => {
        try {
            const apiReq = req;
            const { roomCode, playerId } = req.params;
            const { metadata = {} } = req.body;
            const result = await statusSyncManager.handleHeartbeat(playerId, roomCode, `api_${Date.now()}`, {
                ...metadata,
                service: apiReq.apiKey.service_name,
                timestamp: new Date().toISOString()
            });
            res.json(result);
        }
        catch (error) {
            console.error('❌ [API V2] Heartbeat error:', error);
            res.status(500).json({
                error: 'Heartbeat failed',
                nextHeartbeat: 30000
            });
        }
    });
    // V2 Game end handler
    router.post('/rooms/:roomCode/game-end', apiKeyMiddleware, getRateLimiter('apiCalls'), async (req, res) => {
        try {
            const apiReq = req;
            const { roomCode } = req.params;
            const { gameResult = {}, returnPlayers = true } = req.body;
            console.log(`🎮 [API V2] Game end reported for room ${roomCode}`);
            let result = { success: true, playersReturned: 0 };
            if (returnPlayers) {
                result = await statusSyncManager.handleGameEnd(roomCode, gameResult);
            }
            // Log event
            const roomQuery = await db.adminClient.from('rooms').select('id').eq('room_code', roomCode).single();
            await db.logEvent(roomQuery.data?.id, null, 'game_ended_api_v2', {
                gameResult,
                returnPlayers,
                playersReturned: result.playersReturned,
                service: apiReq.apiKey.service_name
            });
            res.json(result);
        }
        catch (error) {
            console.error('❌ [API V2] Game end error:', error);
            res.status(500).json({
                error: 'Game end handling failed',
                code: 'GAME_END_FAILED'
            });
        }
    });
    // V2 Progress Event (XP Gain)
    router.post('/progress/event', apiKeyMiddleware, getRateLimiter('apiCalls'), async (req, res) => {
        try {
            const apiReq = req;
            const { userId, amount, source, gameId, metadata } = req.body;
            if (!userId || !amount) {
                res.status(400).json({ error: 'Missing userId or amount' });
                return;
            }
            console.log(`📈 [API V2] XP Event for ${userId}: +${amount} (${source})`);
            // Call the SQL function add_xp
            const { data: result, error } = await db.adminClient.rpc('add_xp', {
                p_user_id: userId,
                p_amount: amount,
                p_game_id: gameId || apiReq.apiKey.service_name,
                p_source: source || 'api_event'
            });
            if (error) {
                console.error('❌ [API V2] XP Add Error:', error);
                res.status(500).json({ error: 'Failed to add XP', details: error.message });
                return;
            }
            res.json({
                success: true,
                progress: result
            });
        }
        catch (error) {
            console.error('❌ [API V2] Progress event error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });
    // V2 Get Progress
    router.get('/progress/:userId', apiKeyMiddleware, getRateLimiter('apiCalls'), async (req, res) => {
        try {
            const { userId } = req.params;
            const { data: user, error } = await db.adminClient
                .from('users')
                .select('id, username, xp, level')
                .eq('id', userId)
                .single();
            if (error || !user) {
                res.status(404).json({ error: 'User not found' });
                return;
            }
            const typedUser = user;
            // Calculate progress to next level (matching SQL logic: Level * 1000)
            const nextLevelXp = typedUser.level * 1000;
            const progressPercent = nextLevelXp > 0 ? Math.min(100, Math.floor((typedUser.xp / nextLevelXp) * 100)) : 0;
            res.json({
                userId: typedUser.id,
                level: typedUser.level,
                xp: typedUser.xp,
                nextLevelXp,
                progressPercent
            });
        }
        catch (error) {
            console.error('❌ [API V2] Get progress error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });
    // V2 Get User Friends (Internal/Game Server Use)
    router.get('/users/:userId/friends', apiKeyMiddleware, getRateLimiter('apiCalls'), async (req, res) => {
        try {
            const { userId } = req.params;
            // Fetch accepted friendships
            const { data: friendships, error } = await db.adminClient
                .from('friendships')
                .select(`
          friend_id,
          user_id,
          friend:users!friend_id(id, username, display_name, avatar_url),
          user:users!user_id(id, username, display_name, avatar_url)
        `)
                .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
                .eq('status', 'accepted');
            if (error) {
                console.error('❌ [API V2] Fetch friends error:', error);
                res.status(500).json({ error: 'Failed to fetch friends' });
                return;
            }
            // Format response
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const friends = friendships.map(f => {
                // Determine which side is the "other" person
                const isSender = f.user_id === userId;
                const friendData = isSender ? f.friend : f.user;
                return {
                    id: friendData.id,
                    username: friendData.username,
                    displayName: friendData.display_name,
                    avatarUrl: friendData.avatar_url
                };
            });
            res.json({ success: true, friends });
        }
        catch (error) {
            console.error('❌ [API V2] Get friends error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });
    // V2 Connection health check
    router.get('/health', (req, res) => {
        res.json({
            status: 'healthy',
            version: '2.0',
            timestamp: new Date().toISOString(),
            features: [
                'enhanced_status_sync',
                'session_recovery',
                'conflict_resolution',
                'bulk_updates',
                'heartbeat_monitoring',
                'optimistic_updates'
            ]
        });
    });
    return router;
}
//# sourceMappingURL=gameApiV2.js.map