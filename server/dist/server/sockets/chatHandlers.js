"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerChatHandlers = registerChatHandlers;
const crypto_1 = __importDefault(require("crypto"));
/**
 * Register chat and minigame handlers
 */
function registerChatHandlers(socket, ctx, gameState) {
    const { io, db, connectionManager } = ctx;
    const { roomActivityCache, tugOfWarState, tugOfWarTeams } = gameState;
    // Chat Handler (Lobby)
    socket.on('chat:message', async (data) => {
        console.log('💬 [CHAT] Received chat:message event:', {
            socketId: socket.id,
            dataKeys: Object.keys(data || {}),
            messagePreview: data?.message?.substring?.(0, 50),
            playerName: data?.playerName
        });
        // Validate message exists and is a string
        if (!data.message || typeof data.message !== 'string') {
            console.warn('⚠️ [CHAT] Invalid message format, ignoring. socketId:', socket.id);
            return;
        }
        // Enforce message length limit (500 chars) and trim whitespace
        const message = data.message.trim().substring(0, 500);
        if (message.length === 0) {
            console.warn('⚠️ [CHAT] Empty message after trim, ignoring. socketId:', socket.id);
            return;
        }
        // Get connection first - it has the correct roomCode
        const connection = connectionManager.getConnection(socket.id);
        // Use connectionManager.roomCode as primary source
        let roomCode = connection?.roomCode;
        if (!roomCode) {
            // Fallback: get from socket.rooms, filtering out socket.id AND user: presence rooms
            const allRooms = Array.from(socket.rooms);
            const lobbyRooms = allRooms.filter(r => r !== socket.id && !r.startsWith('user:'));
            console.log('💬 [CHAT] No roomCode in connectionManager, checking socket.rooms:', {
                socketId: socket.id,
                allRooms: allRooms,
                lobbyRooms: lobbyRooms
            });
            if (lobbyRooms.length === 0) {
                console.warn('⚠️ [CHAT] Socket not in any lobby room, message dropped. socketId:', socket.id);
                return;
            }
            roomCode = lobbyRooms[0];
        }
        console.log('💬 [CHAT] Connection lookup:', {
            socketId: socket.id,
            hasConnection: !!connection,
            userId: connection?.userId,
            roomId: connection?.roomId,
            roomCode: roomCode,
            connectionRoomCode: connection?.roomCode
        });
        let playerName = (data.playerName || 'Player').substring(0, 30);
        if (connection?.userId && connection?.roomId) {
            try {
                const { data: participant } = await db.adminClient
                    .from('room_members')
                    .select('custom_lobby_name, user:users(display_name, username)')
                    .eq('room_id', connection.roomId)
                    .eq('user_id', connection.userId)
                    .single();
                if (participant) {
                    playerName = participant.custom_lobby_name
                        || participant.user?.display_name
                        || 'Player';
                    console.log('💬 [CHAT] Resolved player name from DB:', playerName);
                }
            }
            catch (err) {
                console.error('❌ [CHAT] Error looking up player name:', err.message);
            }
        }
        // Update DB activity (throttled to once per minute) to prevent cleanup
        const lastUpdate = roomActivityCache.get(roomCode) || 0;
        if (Date.now() - lastUpdate > 60000) {
            roomActivityCache.set(roomCode, Date.now());
            db.adminClient
                .from('rooms')
                .update({ last_activity: new Date().toISOString() })
                .eq('room_code', roomCode)
                .then(({ error }) => {
                if (error)
                    console.error(`❌ Failed to update activity for room ${roomCode}:`, error);
            });
        }
        console.log('💬 [CHAT] Broadcasting to room:', {
            roomCode: roomCode,
            playerName: playerName,
            messageLength: message.length
        });
        io.to(roomCode).emit('chat:message', {
            id: crypto_1.default.randomUUID(),
            playerName: playerName,
            message: message,
            timestamp: Date.now(),
            type: 'user'
        });
        console.log('✅ [CHAT] Message broadcast complete to room:', roomCode);
    });
    // Minigame Handler (Lobby - Reflex)
    socket.on('minigame:click', (data) => {
        // Validate and bound score data to prevent fake scores
        const score = typeof data.score === 'number' ? Math.max(0, Math.min(data.score, 10000)) : 0;
        const time = typeof data.time === 'number' ? Math.max(0, Math.min(data.time, 60000)) : 0;
        const playerName = (data.playerName || 'Player').substring(0, 30);
        const rooms = Array.from(socket.rooms).filter(r => r !== socket.id);
        if (rooms.length > 0) {
            const roomCode = rooms[0];
            io.to(roomCode).emit('minigame:leaderboard-update', {
                playerId: data.playerId || socket.id,
                playerName: playerName,
                score: score,
                time: time
            });
        }
    });
    // Tug of War Handler (Lobby - Multiplayer)
    socket.on('tugOfWar:pull', (data) => {
        const playerConnection = connectionManager.getConnection(socket.id);
        let roomCode = playerConnection?.roomCode;
        if (!roomCode) {
            const rooms = Array.from(socket.rooms).filter(r => r !== socket.id && !r.startsWith('user:'));
            if (rooms.length === 0) {
                console.warn('⚠️ [TOW] Socket not in any lobby room, pull ignored. socketId:', socket.id);
                return;
            }
            roomCode = rooms[0];
        }
        let playerId = playerConnection?.userId;
        if (!playerId) {
            console.warn('⚠️ [TOW] Using socket.id as fallback playerId:', socket.id);
            playerId = socket.id;
        }
        let state = tugOfWarState.get(roomCode);
        if (!state) {
            state = { position: 50, redWins: 0, blueWins: 0 };
            tugOfWarState.set(roomCode, state);
        }
        let roomTeams = tugOfWarTeams.get(roomCode);
        if (!roomTeams) {
            roomTeams = new Map();
            tugOfWarTeams.set(roomCode, roomTeams);
        }
        let playerTeam = roomTeams.get(playerId);
        // Assign team if not assigned yet
        if (!playerTeam) {
            const redCount = Array.from(roomTeams.values()).filter(t => t === 'red').length;
            const blueCount = Array.from(roomTeams.values()).filter(t => t === 'blue').length;
            playerTeam = redCount <= blueCount ? 'red' : 'blue';
            roomTeams.set(playerId, playerTeam);
            console.log(`[TOW] Assigned ${playerId} to ${playerTeam} team in room ${roomCode}`);
        }
        // Move bar (Red < 50 < Blue)
        const moveAmount = 1.5;
        if (playerTeam === 'red')
            state.position = Math.max(0, state.position - moveAmount);
        if (playerTeam === 'blue')
            state.position = Math.min(100, state.position + moveAmount);
        let winner = null;
        if (state.position <= 0) {
            state.redWins++;
            winner = 'red';
            state.position = 50;
        }
        else if (state.position >= 100) {
            state.blueWins++;
            winner = 'blue';
            state.position = 50;
        }
        // Broadcast update to everyone
        io.to(roomCode).emit('tugOfWar:update', {
            position: state.position,
            redWins: state.redWins,
            blueWins: state.blueWins,
            winner,
            pullTeam: playerTeam,
            teams: Object.fromEntries(roomTeams)
        });
        // Tell the specific user their team
        socket.emit('tugOfWar:yourTeam', { team: playerTeam });
    });
}
//# sourceMappingURL=chatHandlers.js.map