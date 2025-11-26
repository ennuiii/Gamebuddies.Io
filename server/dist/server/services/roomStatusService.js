"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.autoUpdateRoomStatusByHost = autoUpdateRoomStatusByHost;
exports.autoUpdateRoomStatusBasedOnPlayerStates = autoUpdateRoomStatusBasedOnPlayerStates;
/**
 * Automatically update room status based on host location
 */
async function autoUpdateRoomStatusByHost(io, db, roomId, hostUserId, hostLocation) {
    try {
        console.log(`🤖 Checking if room status needs auto-update for host location change:`, {
            roomId,
            hostUserId,
            hostLocation
        });
        // Get current room
        const room = await db.getRoomById(roomId);
        if (!room) {
            console.log(`❌ Room ${roomId} not found for auto status update`);
            return;
        }
        // Determine target status based on host location
        let targetStatus = room.status; // Default to current status
        if (hostLocation === 'game' || hostLocation === 'in_game') {
            targetStatus = 'in_game';
        }
        else if (hostLocation === 'lobby' || hostLocation === 'connected') {
            targetStatus = 'lobby';
        }
        else if (hostLocation === 'disconnected') {
            // Don't change status when host disconnects - they might return
            console.log(`🔄 Host disconnected but keeping room status as '${room.status}'`);
            return;
        }
        // Only update if status needs to change
        if (room.status === targetStatus) {
            console.log(`🔄 Room ${room.room_code} already has correct status '${targetStatus}' for host location '${hostLocation}'`);
            return;
        }
        console.log(`🤖 Auto-updating room ${room.room_code} status from '${room.status}' to '${targetStatus}' due to host location: ${hostLocation}`);
        // Update room status in database
        const updateData = { status: targetStatus };
        // If changing back to lobby, also reset current game
        if (targetStatus === 'lobby') {
            updateData.current_game = null;
        }
        await db.updateRoom(roomId, updateData);
        // Get updated room data
        const updatedRoom = await db.getRoomById(roomId);
        // Find host participant for display name
        const hostParticipant = updatedRoom?.participants?.find((p) => p.user_id === hostUserId);
        // Notify all players about the automatic status change
        io.to(room.room_code).emit('roomStatusChanged', {
            oldStatus: room.status,
            newStatus: targetStatus,
            room: updatedRoom,
            changedBy: `${hostParticipant?.user?.display_name || 'Host'} (auto)`,
            reason: 'host_location_change',
            isAutomatic: true,
            hostLocation: hostLocation,
            roomVersion: Date.now()
        });
        console.log(`🤖 Room ${room.room_code} status auto-updated to '${targetStatus}' due to host location change`);
    }
    catch (error) {
        console.error('❌ Error auto-updating room status by host location:', error);
    }
}
/**
 * Intelligently update room status based on overall player states
 * This provides more robust room status management than just checking the host
 */
async function autoUpdateRoomStatusBasedOnPlayerStates(io, db, room, allPlayers, reason) {
    try {
        console.log(`🧠 [Smart Room Update] Analyzing player states for room ${room.room_code}:`, {
            currentRoomStatus: room.status,
            totalPlayers: allPlayers.length,
            reason
        });
        // Analyze player states
        const playerStats = allPlayers.reduce((stats, player) => {
            const location = player.currentLocation || 'unknown';
            stats[location] = (stats[location] || 0) + 1;
            if (player.inGame)
                stats.inGameCount++;
            if (player.isConnected)
                stats.connectedCount++;
            return stats;
        }, { inGameCount: 0, connectedCount: 0 });
        console.log(`📊 [Smart Room Update] Player statistics:`, playerStats);
        let targetStatus = room.status; // Default to current status
        let shouldUpdate = false;
        let updateReason = '';
        // Determine target status based on player distribution
        if (reason === 'game_started' && room.status === 'lobby') {
            // Game explicitly started - if majority of players are in game, switch to in_game
            if (playerStats.inGameCount >= Math.ceil(allPlayers.length * 0.5)) {
                targetStatus = 'in_game';
                shouldUpdate = true;
                updateReason = 'Game started - majority of players in game';
            }
        }
        else if (reason === 'game_ended' && room.status === 'in_game') {
            // Game explicitly ended - if majority returned to lobby, switch to lobby
            const lobbyCount = playerStats.lobby || 0;
            if (lobbyCount >= Math.ceil(allPlayers.length * 0.5)) {
                targetStatus = 'lobby';
                shouldUpdate = true;
                updateReason = 'Game ended - majority of players returned to lobby';
            }
        }
        else if (room.status === 'lobby' && playerStats.game >= 2) {
            // Multiple players moved to game from lobby
            targetStatus = 'in_game';
            shouldUpdate = true;
            updateReason = 'Multiple players moved to active game';
        }
        else if (room.status === 'in_game' && (playerStats.lobby >= Math.ceil(allPlayers.length * 0.5))) {
            // Majority of players returned to lobby from game
            targetStatus = 'lobby';
            shouldUpdate = true;
            updateReason = 'Majority of players returned to lobby';
        }
        else if (reason === 'player_rejoined' && room.status === 'in_game') {
            // Player rejoined - check if we should transition to lobby
            const lobbyCount = playerStats.lobby || 0;
            const gameCount = playerStats.game || 0;
            // If no players are actively in game anymore, switch to lobby
            if (gameCount === 0 && lobbyCount > 0) {
                targetStatus = 'lobby';
                shouldUpdate = true;
                updateReason = 'All active players are in lobby after rejoin';
            }
        }
        if (shouldUpdate && targetStatus !== room.status) {
            console.log(`🔄 [Smart Room Update] Updating room ${room.room_code} status: ${room.status} → ${targetStatus}`);
            console.log(`📝 [Smart Room Update] Reason: ${updateReason}`);
            const updateData = { status: targetStatus };
            // If changing back to lobby, reset current game
            if (targetStatus === 'lobby') {
                updateData.current_game = null;
            }
            await db.updateRoom(room.id, updateData);
            // Get updated room data
            const updatedRoom = await db.getRoomById(room.id);
            // Notify all players about the automatic status change
            if (io) {
                io.to(room.room_code).emit('roomStatusChanged', {
                    oldStatus: room.status,
                    newStatus: targetStatus,
                    room: updatedRoom,
                    changedBy: 'System (Smart Update)',
                    reason: 'player_state_analysis',
                    isAutomatic: true,
                    playerStats,
                    updateReason,
                    roomVersion: Date.now()
                });
            }
            console.log(`✅ [Smart Room Update] Room ${room.room_code} status updated to '${targetStatus}'`);
        }
        else {
            console.log(`⏸️ [Smart Room Update] No room status change needed for ${room.room_code}`);
        }
    }
    catch (error) {
        console.error('❌ Error in smart room status update:', error);
    }
}
//# sourceMappingURL=roomStatusService.js.map