/**
 * Game Keep-Alive Service
 *
 * Automatically pings all external game servers every 5 minutes
 * to prevent Render.com free tier from spinning them down.
 *
 * Features:
 * - Queries database for active external games
 * - Pings each game's /health endpoint every 5 minutes
 * - Respects server rate limits (some games limit to 5+ min intervals)
 * - Logs failures for monitoring
 * - Automatically discovers new games (no manual config)
 * - 10-minute safety buffer (Render spins down after 15 min idle)
 */
interface Game {
    id: string;
    name: string;
    server_url: string | null;
}
interface PingResult {
    success: boolean;
    skipped?: boolean;
    responseTime?: number;
    status?: number;
    error?: string;
}
declare class GameKeepAliveService {
    private interval;
    private pingInterval;
    private requestTimeout;
    private isRunning;
    constructor();
    /**
     * Start the keep-alive service
     */
    start(): void;
    /**
     * Stop the keep-alive service
     */
    stop(): void;
    /**
     * Fetch all active external games from database
     */
    getActiveGames(): Promise<Game[]>;
    /**
     * Ping a single game's health endpoint
     */
    pingGame(game: Game): Promise<PingResult>;
    /**
     * Ping all active games
     */
    pingAllGames(): Promise<void>;
}
declare const _default: GameKeepAliveService;
export default _default;
//# sourceMappingURL=gameKeepAlive.d.ts.map