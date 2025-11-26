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

export const COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true, // Cannot be accessed by client-side JavaScript
  secure: process.env.NODE_ENV === 'production', // HTTPS only in production
  sameSite: 'lax', // CSRF protection (allows navigation from external sites)
  maxAge: 3 * 60 * 60 * 1000, // 3 hours (matches SESSION_TIMEOUT_MINUTES default)
  path: '/', // Available across entire domain
};

/**
 * Set a secure session cookie
 */
export function setSecureCookie(
  res: Response,
  name: string,
  value: string,
  options: Partial<CookieOptions> = {}
): void {
  const cookieOptions: CookieOptions = { ...COOKIE_OPTIONS, ...options };
  res.cookie(name, value, cookieOptions);
}

/**
 * Set the main session token cookie
 */
export function setSessionToken(res: Response, sessionToken: string): void {
  setSecureCookie(res, 'gb_session_token', sessionToken);
}

/**
 * Set the player ID cookie
 */
export function setPlayerId(res: Response, playerId: string): void {
  setSecureCookie(res, 'gb_player_id', playerId);
}

/**
 * Clear a specific cookie
 */
export function clearCookie(res: Response, name: string): void {
  res.clearCookie(name, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
}

/**
 * Clear all session cookies
 */
export function clearSessionCookies(res: Response): void {
  clearCookie(res, 'gb_session_token');
  clearCookie(res, 'gb_player_id');
}

/**
 * Get cookie value from request
 */
export function getCookie(req: Request, name: string): string | undefined {
  return req.cookies?.[name];
}

/**
 * Get session token from request
 */
export function getSessionToken(req: Request): string | undefined {
  return getCookie(req, 'gb_session_token');
}

/**
 * Get player ID from request
 */
export function getPlayerId(req: Request): string | undefined {
  return getCookie(req, 'gb_player_id');
}
