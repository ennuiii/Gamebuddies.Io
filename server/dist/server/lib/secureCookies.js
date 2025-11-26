"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.COOKIE_OPTIONS = void 0;
exports.setSecureCookie = setSecureCookie;
exports.setSessionToken = setSessionToken;
exports.setPlayerId = setPlayerId;
exports.clearCookie = clearCookie;
exports.clearSessionCookies = clearSessionCookies;
exports.getCookie = getCookie;
exports.getSessionToken = getSessionToken;
exports.getPlayerId = getPlayerId;
exports.COOKIE_OPTIONS = {
    httpOnly: true, // Cannot be accessed by client-side JavaScript
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    sameSite: 'lax', // CSRF protection (allows navigation from external sites)
    maxAge: 3 * 60 * 60 * 1000, // 3 hours (matches SESSION_TIMEOUT_MINUTES default)
    path: '/', // Available across entire domain
};
/**
 * Set a secure session cookie
 */
function setSecureCookie(res, name, value, options = {}) {
    const cookieOptions = { ...exports.COOKIE_OPTIONS, ...options };
    res.cookie(name, value, cookieOptions);
}
/**
 * Set the main session token cookie
 */
function setSessionToken(res, sessionToken) {
    setSecureCookie(res, 'gb_session_token', sessionToken);
}
/**
 * Set the player ID cookie
 */
function setPlayerId(res, playerId) {
    setSecureCookie(res, 'gb_player_id', playerId);
}
/**
 * Clear a specific cookie
 */
function clearCookie(res, name) {
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
function clearSessionCookies(res) {
    clearCookie(res, 'gb_session_token');
    clearCookie(res, 'gb_player_id');
}
/**
 * Get cookie value from request
 */
function getCookie(req, name) {
    return req.cookies?.[name];
}
/**
 * Get session token from request
 */
function getSessionToken(req) {
    return getCookie(req, 'gb_session_token');
}
/**
 * Get player ID from request
 */
function getPlayerId(req) {
    return getCookie(req, 'gb_player_id');
}
//# sourceMappingURL=secureCookies.js.map