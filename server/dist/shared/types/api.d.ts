import type { User, GameConfig } from './entities';
export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}
export interface GamesApiResponse {
    success: boolean;
    games: GameConfig[];
}
export interface AuthResponse {
    success: boolean;
    user?: User;
    session?: {
        access_token: string;
        refresh_token: string;
        expires_at: number;
    };
    error?: string;
}
export interface ValidationResult<T = unknown> {
    isValid: boolean;
    errors?: Array<{
        field: string;
        message: string;
    }>;
    message: string;
    value?: T;
}
//# sourceMappingURL=api.d.ts.map