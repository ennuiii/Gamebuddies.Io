/**
 * Authentication Middleware
 * Verifies Supabase JWT token and extracts user ID
 */

const { supabaseAdmin } = require('../lib/supabase');

/**
 * Middleware to verify Supabase auth token
 * Attaches decoded user to req.user
 */
async function requireAuth(req, res, next) {
  try {
    // Get Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized - No token provided' });
    }

    // Extract token
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token with Supabase
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      console.error('❌ [AUTH MIDDLEWARE] Invalid token:', error?.message);
      return res.status(401).json({ error: 'Unauthorized - Invalid token' });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    console.error('❌ [AUTH MIDDLEWARE] Error:', error);
    return res.status(401).json({ error: 'Unauthorized - Authentication failed' });
  }
}

/**
 * Middleware to check if the authenticated user matches the requested userId
 * Use after requireAuth middleware
 */
function requireOwnAccount(req, res, next) {
  const requestedUserId = req.params.userId;
  const authenticatedUserId = req.user?.id;

  if (!authenticatedUserId) {
    return res.status(401).json({ error: 'Unauthorized - Not authenticated' });
  }

  if (requestedUserId !== authenticatedUserId) {
    console.warn(`⚠️ [AUTH] User ${authenticatedUserId} tried to access user ${requestedUserId}`);
    return res.status(403).json({ error: 'Forbidden - Can only access your own account' });
  }

  next();
}

module.exports = {
  requireAuth,
  requireOwnAccount
};
