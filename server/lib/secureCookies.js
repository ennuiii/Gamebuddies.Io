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

const COOKIE_OPTIONS = {
  httpOnly: true, // Cannot be accessed by client-side JavaScript
  secure: process.env.NODE_ENV === 'production', // HTTPS only in production
  sameSite: 'lax', // CSRF protection (allows navigation from external sites)
  maxAge: 3 * 60 * 60 * 1000, // 3 hours (matches SESSION_TIMEOUT_MINUTES default)
  path: '/', // Available across entire domain
};

/**
 * Set a secure session cookie
 * @param {Response} res - Express response object
 * @param {string} name - Cookie name
 * @param {string} value - Cookie value
 * @param {object} options - Optional cookie options to override defaults
 */
function setSecureCookie(res, name, value, options = {}) {
  const cookieOptions = { ...COOKIE_OPTIONS, ...options };
  res.cookie(name, value, cookieOptions);
}

/**
 * Set the main session token cookie
 * @param {Response} res - Express response object
 * @param {string} sessionToken - Session token value
 */
function setSessionToken(res, sessionToken) {
  setSecureCookie(res, 'gb_session_token', sessionToken);
}

/**
 * Set the player ID cookie
 * @param {Response} res - Express response object
 * @param {string} playerId - Player ID value
 */
function setPlayerId(res, playerId) {
  setSecureCookie(res, 'gb_player_id', playerId);
}

/**
 * Clear a specific cookie
 * @param {Response} res - Express response object
 * @param {string} name - Cookie name to clear
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
 * @param {Response} res - Express response object
 */
function clearSessionCookies(res) {
  clearCookie(res, 'gb_session_token');
  clearCookie(res, 'gb_player_id');
}

/**
 * Get cookie value from request
 * @param {Request} req - Express request object
 * @param {string} name - Cookie name
 * @returns {string|undefined} Cookie value
 */
function getCookie(req, name) {
  return req.cookies?.[name];
}

/**
 * Get session token from request
 * @param {Request} req - Express request object
 * @returns {string|undefined} Session token
 */
function getSessionToken(req) {
  return getCookie(req, 'gb_session_token');
}

/**
 * Get player ID from request
 * @param {Request} req - Express request object
 * @returns {string|undefined} Player ID
 */
function getPlayerId(req) {
  return getCookie(req, 'gb_player_id');
}

module.exports = {
  setSecureCookie,
  setSessionToken,
  setPlayerId,
  clearCookie,
  clearSessionCookies,
  getCookie,
  getSessionToken,
  getPlayerId,
  COOKIE_OPTIONS,
};
