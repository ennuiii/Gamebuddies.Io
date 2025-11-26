/**
 * Authentication Middleware
 * Verifies Supabase JWT token and extracts user ID
 */
import { Request, Response, NextFunction } from 'express';
import { User } from '@supabase/supabase-js';
export interface AuthenticatedRequest extends Request {
    user?: User;
}
/**
 * Middleware to verify Supabase auth token
 * Attaches decoded user to req.user
 */
export declare function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<Response | void>;
/**
 * Middleware to check if the authenticated user matches the requested userId
 * Use after requireAuth middleware
 */
export declare function requireOwnAccount(req: AuthenticatedRequest, res: Response, next: NextFunction): Response | void;
/**
 * Middleware to check if the authenticated user has 'admin' role
 * Use after requireAuth middleware
 */
export declare function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<Response | void>;
//# sourceMappingURL=auth.d.ts.map