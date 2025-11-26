/**
 * Secure Cookie Management Utilities
 *
 * Provides functions for setting and clearing secure, httpOnly cookies.
 * Use these instead of client-side sessionStorage for sensitive data.
 *
 * Security features:
 * - httpOnly: Prevents XSS attacks (JavaScript cannot access)
 * - secure: HTTPS-only in production
 * - sameSite: Prevents CSRF attacks
 * - signed: Tamper detection
 */
import { Request, Response, CookieOptions } from 'express';
export declare const COOKIE_OPTIONS: CookieOptions;
/**
 * Set a secure session cookie
 */
export declare function setSecureCookie(res: Response, name: string, value: string, options?: Partial<CookieOptions>): void;
/**
 * Set the main session token cookie
 */
export declare function setSessionToken(res: Response, sessionToken: string): void;
/**
 * Set the player ID cookie
 */
export declare function setPlayerId(res: Response, playerId: string): void;
/**
 * Clear a specific cookie
 */
export declare function clearCookie(res: Response, name: string): void;
/**
 * Clear all session cookies
 */
export declare function clearSessionCookies(res: Response): void;
/**
 * Get cookie value from request
 */
export declare function getCookie(req: Request, name: string): string | undefined;
/**
 * Get session token from request
 */
export declare function getSessionToken(req: Request): string | undefined;
/**
 * Get player ID from request
 */
export declare function getPlayerId(req: Request): string | undefined;
//# sourceMappingURL=secureCookies.d.ts.map