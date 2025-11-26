/**
 * Authentication Middleware
 * Verifies Supabase JWT token and extracts user ID
 */

import { Request, Response, NextFunction } from 'express';
import { User } from '@supabase/supabase-js';
import { supabaseAdmin } from '../lib/supabase';

// Extend Express Request to include user
export interface AuthenticatedRequest extends Request {
  user?: User;
}

/**
 * Middleware to verify Supabase auth token
 * Attaches decoded user to req.user
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<Response | void> {
  try {
    console.log('🔐 [AUTH MIDDLEWARE] Processing request to:', req.method, req.path);

    // Get Authorization header
    const authHeader = req.headers.authorization;

    console.log('🔐 [AUTH MIDDLEWARE DEBUG] Auth header present:', !!authHeader);
    console.log('🔐 [AUTH MIDDLEWARE DEBUG] Headers:', {
      authorization: authHeader ? authHeader.substring(0, 30) + '...' : 'none',
      contentType: req.headers['content-type']
    });

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('❌ [AUTH MIDDLEWARE] No valid authorization header');
      return res.status(401).json({ error: 'Unauthorized - No token provided' });
    }

    // Extract token
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    console.log('🔐 [AUTH MIDDLEWARE DEBUG] Token extracted, length:', token.length);
    console.log('🔐 [AUTH MIDDLEWARE DEBUG] Token preview:', token.substring(0, 20) + '...');

    // Verify token with Supabase
    console.log('🔐 [AUTH MIDDLEWARE] Verifying token with Supabase...');
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      console.error('❌ [AUTH MIDDLEWARE] Invalid token:', error?.message);
      console.error('❌ [AUTH MIDDLEWARE] Error details:', error);
      return res.status(401).json({ error: 'Unauthorized - Invalid token' });
    }

    console.log('✅ [AUTH MIDDLEWARE] Token verified successfully for user:', user.id);
    console.log('✅ [AUTH MIDDLEWARE DEBUG] User details:', {
      id: user.id,
      email: user.email,
      role: user.role
    });

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    console.error('❌ [AUTH MIDDLEWARE] Error:', error);
    console.error('❌ [AUTH MIDDLEWARE] Error stack:', (error as Error).stack);
    return res.status(401).json({ error: 'Unauthorized - Authentication failed' });
  }
}

/**
 * Middleware to check if the authenticated user matches the requested userId
 * Use after requireAuth middleware
 */
export function requireOwnAccount(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Response | void {
  console.log('🔐 [AUTH MIDDLEWARE] Checking account ownership...');

  const requestedUserId = req.params.userId;
  const authenticatedUserId = req.user?.id;

  console.log('🔐 [AUTH MIDDLEWARE DEBUG] Account check:', {
    requestedUserId,
    authenticatedUserId,
    match: requestedUserId === authenticatedUserId
  });

  if (!authenticatedUserId) {
    console.error('❌ [AUTH MIDDLEWARE] No authenticated user in request');
    return res.status(401).json({ error: 'Unauthorized - Not authenticated' });
  }

  if (requestedUserId !== authenticatedUserId) {
    console.warn(`⚠️ [AUTH] User ${authenticatedUserId} tried to access user ${requestedUserId}`);
    return res.status(403).json({ error: 'Forbidden - Can only access your own account' });
  }

  console.log('✅ [AUTH MIDDLEWARE] Account ownership verified');
  next();
}

/**
 * Middleware to check if the authenticated user has 'admin' role
 * Use after requireAuth middleware
 */
export async function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<Response | void> {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized - Not authenticated' });
    }

    // Fetch user role from public.users table
    const { data: publicUser, error } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', req.user.id)
      .single();

    if (error || !publicUser) {
      console.error('❌ [AUTH MIDDLEWARE] Failed to fetch user role:', error);
      return res.status(403).json({ error: 'Forbidden - Failed to verify role' });
    }

    if ((publicUser as { role: string }).role !== 'admin') {
      console.warn(`⚠️ [AUTH] User ${req.user.id} attempted admin access (role: ${(publicUser as { role: string }).role})`);
      return res.status(403).json({ error: 'Forbidden - Admins only' });
    }

    console.log('✅ [AUTH MIDDLEWARE] Admin privileges verified');
    next();
  } catch (error) {
    console.error('❌ [AUTH MIDDLEWARE] Admin check error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
