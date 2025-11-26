import { Schema } from 'joi';
import { RateLimitRequestHandler } from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
interface ValidationResult {
    isValid: boolean;
    value?: unknown;
    errors?: {
        field: string;
        message: string;
    }[];
    message?: string;
}
interface ApiKeyRecord {
    id: string;
    key_hash: string;
    is_active: boolean;
    last_used?: string;
    [key: string]: unknown;
}
interface RequestWithApiKey extends Request {
    apiKey?: ApiKeyRecord;
}
interface RateLimitConfig {
    max: number;
    window?: number;
    windowMs?: number;
}
declare function getValidGameTypes(): Promise<string[]>;
declare const schemas: Record<string, Schema>;
declare function createValidator(schemaName: string): (data: unknown) => Promise<ValidationResult>;
declare const sanitize: {
    playerName: (name: string | null | undefined) => string;
    roomCode: (code: string | null | undefined) => string;
    message: (message: string | null | undefined) => string;
    gameSettings: (settings: unknown) => Record<string, unknown>;
};
declare const rateLimits: Record<string, RateLimitConfig | RateLimitRequestHandler>;
declare function validateApiKey(req: RequestWithApiKey, res: Response, next: NextFunction): Promise<Response | void>;
declare function clearGameTypesCache(): void;
export { schemas, createValidator, sanitize, validateApiKey, rateLimits, getValidGameTypes, clearGameTypesCache };
export declare const validators: {
    createRoom: (data: unknown) => Promise<ValidationResult>;
    joinRoom: (data: unknown) => Promise<ValidationResult>;
    selectGame: (data: unknown) => Promise<ValidationResult>;
    startGame: (data: unknown) => Promise<ValidationResult>;
    transferHost: (data: unknown) => Promise<ValidationResult>;
    kickPlayer: (data: unknown) => Promise<ValidationResult>;
    changeRoomStatus: (data: unknown) => Promise<ValidationResult>;
    leaveRoom: (data: unknown) => Promise<ValidationResult>;
    playerReady: (data: unknown) => Promise<ValidationResult>;
    sendMessage: (data: unknown) => Promise<ValidationResult>;
    autoUpdateRoomStatus: (data: unknown) => Promise<ValidationResult>;
};
//# sourceMappingURL=validation.d.ts.map