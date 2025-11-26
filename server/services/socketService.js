const socketIo = require('socket.io');
const { db } = require('../lib/supabase');

class SocketService {
    constructor(server, corsOptions, connectionManager, roomLifecycleManager) {
        this.io = socketIo(server, {
            cors: corsOptions,
            pingTimeout: 60000,
            pingInterval: 25000,
            maxHttpBufferSize: 1e6,
            transports: ['websocket', 'polling']
        });

        this.connectionManager = connectionManager;
        this.roomLifecycleManager = roomLifecycleManager;

        // Bind methods
        this.initialize = this.initialize.bind(this);
        this.handleConnection = this.handleConnection.bind(this);
    }

    initialize() {
        this.io.on('connection', this.handleConnection);
        console.log('🔌 [SOCKET] SocketService initialized');
    }

    async handleConnection(socket) {
        console.log(`🔌 User connected: ${socket.id}`);
        this.connectionManager.addConnection(socket.id);

        // Basic error handling
        socket.on('error', (error) => {
            console.error(`❌ Socket error for ${socket.id}:`, error);
        });

        socket.on('disconnect', async (reason) => {
            console.log(`🔌 User disconnected: ${socket.id} (Reason: ${reason})`);
            await this.handleDisconnect(socket, reason);
        });

        // TODO: Attach other event handlers here
        // this.attachChatHandlers(socket);
        // this.attachGameHandlers(socket);
    }

    async handleDisconnect(socket, reason) {
        const connection = this.connectionManager.getConnection(socket.id);

        if (connection?.roomId) {
            const { roomId, userId, username } = connection;
            console.log(`🚪 [SOCKET] User ${username} (${userId}) disconnecting from room ${roomId}`);

            // Handle room abandonment logic via RoomLifecycleManager
            // This preserves the existing logic from index.js
            if (this.roomLifecycleManager) {
                await this.roomLifecycleManager.handlePlayerDisconnect(
                    socket,
                    roomId,
                    userId,
                    username,
                    reason
                );
            }
        }

        this.connectionManager.removeConnection(socket.id);
    }

    // Helper to get IO instance
    getIO() {
        return this.io;
    }
}

module.exports = SocketService;
