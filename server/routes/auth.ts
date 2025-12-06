import express, { Request, Response, Router } from 'express';
import { User } from '@supabase/supabase-js';
import { supabaseAdmin } from '../lib/supabase';
import { requireAuth, requireOwnAccount, AuthenticatedRequest } from '../middlewares/auth';
import fs from 'fs';
import path from 'path';

const router: Router = express.Router();

// Type definitions
interface AvatarOptions {
  avatarId?: string;
  [key: string]: unknown;
}

interface UserProfile {
  id: string;
  username: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  premium_tier: string | null;
  premium_expires_at: string | null;
  subscription_canceled_at: string | null;
  avatar_style: string | null;
  avatar_seed: string | null;
  avatar_options: Record<string, unknown>;
  created_at: string;
  role: string;
  is_guest: boolean;
  xp: number;
  level: number;
}

interface SyncUserRequest extends Request {
  body: {
    supabase_user_id: string;
    email: string;
    email_confirmed_at?: string;
    oauth_provider?: string | null;
    oauth_id?: string;
    avatar_url?: string;
    display_name?: string;
  };
}

interface UpdateAvatarRequest extends AuthenticatedRequest {
  body: {
    userId: string;
    avatar_style?: string;
    avatar_seed?: string;
    avatar_options?: AvatarOptions;
  };
}

interface UpdateProfileRequest extends AuthenticatedRequest {
  body: {
    display_name?: string;
    avatar_url?: string;
  };
}

// Helper to resolve avatar URL
const resolveAvatarUrl = (
  style: string | undefined,
  seed: string | undefined,
  options: AvatarOptions | undefined
): string | null => {
  if (style === 'custom-mascot' && options?.avatarId) {
    const id = options.avatarId;
    const extensions = ['.png', '.jpg', '.jpeg', '.svg', '.gif'];
    const types = ['premium', 'free', 'hidden'];
    const baseDir = path.join(process.cwd(), 'server/public/avatars');

    for (const type of types) {
      for (const ext of extensions) {
        const filename = `${id}${ext}`;
        if (fs.existsSync(path.join(baseDir, type, filename))) {
          return `/avatars/${type}/${filename}`;
        }
      }
    }
    return null;
  }

  // Fallback to Default Mascot (Gabu)
  return '/avatars/free/Gabu.png';
};

/**
 * GET /api/auth/me
 * Get current authenticated user's data from token
 * Use this endpoint when you have a token but not the userId
 */
router.get('/me', requireAuth, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    console.log('👤 [AUTH ENDPOINT] GET /api/auth/me called');
    console.log('👤 [AUTH ENDPOINT DEBUG] Authenticated user:', req.user?.id);

    const userId = req.user!.id;

    // Fetch user from database
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id, username, email, display_name, avatar_url, premium_tier, premium_expires_at, subscription_canceled_at, avatar_style, avatar_seed, avatar_options, created_at, role, is_guest, xp, level')
      .eq('id', userId)
      .single();

    if (error || !user) {
      console.error('❌ [AUTH ENDPOINT] User not found:', error);
      res.status(404).json({
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
      return;
    }

    console.log('✅ [AUTH ENDPOINT] User data returned:', {
      id: (user as UserProfile).id,
      username: (user as UserProfile).username,
      premium_tier: (user as UserProfile).premium_tier
    });

    res.json({ user });
  } catch (error) {
    console.error('❌ [AUTH ENDPOINT] Error in /me:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: (error as Error).message
    });
  }
});

/**
 * POST /api/auth/sync-user
 * Sync Supabase auth.users to public.users table
 */
router.post('/sync-user', async (req: SyncUserRequest, res: Response): Promise<void> => {
  try {
    const {
      supabase_user_id,
      email,
      email_confirmed_at,
      oauth_provider,
      oauth_id,
      avatar_url,
      display_name
    } = req.body;

    const isEmailAuth = oauth_provider === null;
    const isEmailVerified = !!email_confirmed_at; // true if email_confirmed_at exists

    console.log('🔄 [SERVER AUTH] Received sync request:', {
      user_id: supabase_user_id,
      email,
      email_confirmed_at,
      email_verified: isEmailVerified,
      provider: oauth_provider,
      oauth_id,
      avatar_url,
      display_name,
      isEmailAuth,
      authType: isEmailAuth ? 'EMAIL' : 'OAUTH'
    });

    // Validate required fields
    if (!supabase_user_id || !email) {
      console.error('❌ [SERVER AUTH] Missing required fields:', {
        hasUserId: !!supabase_user_id,
        hasEmail: !!email
      });
      res.status(400).json({
        error: 'Missing required fields: supabase_user_id, email'
      });
      return;
    }

    // Check if user already exists by ID
    console.log('🔍 [SERVER AUTH] Checking if user exists by ID...');
    const { data: existingUser, error: existingError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', supabase_user_id)
      .single();

    if (existingError && existingError.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('❌ [SERVER AUTH] Error checking existing user:', existingError);
    }

    if (existingUser) {
      console.log('✅ [SERVER AUTH] User exists, updating:', (existingUser as UserProfile).username);

      // Update existing user
      const { data: updatedUser, error: updateError } = await supabaseAdmin
        .from('users')
        .update({
          email,
          oauth_provider,
          oauth_id,
          // Preserve existing avatar/name if they exist; otherwise use new values
          avatar_url: (existingUser as UserProfile).avatar_url || avatar_url,
          display_name: (existingUser as UserProfile).display_name || display_name,
          last_seen: new Date().toISOString(),
          is_guest: false,
          email_verified: isEmailVerified
        })
        .eq('id', supabase_user_id)
        .select()
        .single();

      if (updateError) {
        console.error('❌ [SERVER AUTH] Update error:', updateError);
        throw updateError;
      }

      console.log('✅ [SERVER AUTH] User updated successfully');
      res.json({ user: updatedUser });
      return;
    }

    // Check if user exists by email (migration from guest)
    console.log('🔍 [SERVER AUTH] User not found by ID, checking by email for guest migration...');
    const { data: emailUser, error: emailError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (emailError && emailError.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('❌ [SERVER AUTH] Error checking user by email:', emailError);
    }

    if (emailUser) {
      console.log('📧 [SERVER AUTH] User exists with email, migrating guest to registered:', (emailUser as UserProfile).username);

      // Update existing guest user to registered
      const { data: migratedUser, error: migrateError } = await supabaseAdmin
        .from('users')
        .update({
          id: supabase_user_id, // Update ID to match auth.users
          oauth_provider,
          oauth_id,
          avatar_url,
          display_name: display_name || (emailUser as UserProfile).display_name,
          last_seen: new Date().toISOString(),
          is_guest: false,
          email_verified: isEmailVerified
        })
        .eq('email', email)
        .select()
        .single();

      if (migrateError) {
        console.error('❌ [SERVER AUTH] Migration error:', migrateError);
        // If migration fails, create new user instead
      } else {
        console.log('✅ [SERVER AUTH] User migrated successfully');
        res.json({ user: migratedUser });
        return;
      }
    }

    // Create new user
    console.log('➕ [SERVER AUTH] No existing user found, creating new user...');
    const username = generateUsername(email, oauth_provider || undefined);

    console.log('➕ [SERVER AUTH] Generated username:', username, 'for email:', email);

    const { data: newUser, error: createError } = await supabaseAdmin
      .from('users')
      .insert({
        id: supabase_user_id,
        username,
        email,
        oauth_provider,
        oauth_id,
        avatar_url,
        display_name: display_name || username,
        is_guest: false,
        email_verified: isEmailVerified,
        last_seen: new Date().toISOString()
      })
      .select()
      .single();

    if (createError) {
      console.error('❌ [SERVER AUTH] Create error:', createError);
      console.error('❌ [SERVER AUTH] Error details:', {
        code: createError.code,
        message: createError.message,
        details: createError.details,
        hint: createError.hint
      });

      // If username conflict, try with random suffix
      if (createError.code === '23505') {
        const uniqueUsername = `${username}_${Math.random().toString(36).substr(2, 5)}`;
        console.log('🔄 [SERVER AUTH] Username conflict detected, retrying with:', uniqueUsername);

        const { data: retryUser, error: retryError } = await supabaseAdmin
          .from('users')
          .insert({
            id: supabase_user_id,
            username: uniqueUsername,
            email,
            oauth_provider,
            oauth_id,
            avatar_url,
            display_name: display_name || uniqueUsername,
            is_guest: false,
            email_verified: isEmailVerified,
            last_seen: new Date().toISOString()
          })
          .select()
          .single();

        if (retryError) {
          console.error('❌ [SERVER AUTH] Retry failed:', retryError);
          throw retryError;
        }

        console.log('✅ [SERVER AUTH] User created with unique username:', uniqueUsername);
        res.json({ user: retryUser });
        return;
      }

      throw createError;
    }

    console.log('✅ [SERVER AUTH] User created successfully:', (newUser as UserProfile).username);
    res.json({ user: newUser });

  } catch (error) {
    console.error('❌ [SERVER AUTH] Sync user failed:', error);
    console.error('❌ [SERVER AUTH] Stack trace:', (error as Error).stack);
    res.status(500).json({
      error: 'Failed to sync user',
      details: (error as Error).message,
      code: (error as { code?: string }).code
    });
  }
});

/**
 * GET /api/users/:userId
 * Get user by ID from public.users
 * SECURITY: Requires authentication + user can only access their own data
 */
router.get('/users/:userId', requireAuth, requireOwnAccount, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;

    console.log('👤 [AUTH ENDPOINT] GET /api/users/:userId called');
    console.log('👤 [AUTH ENDPOINT DEBUG] Request params:', { userId });
    console.log('👤 [AUTH ENDPOINT DEBUG] Authenticated user:', req.user?.id);
    console.log('👤 [AUTH ENDPOINT DEBUG] User match:', userId === req.user?.id);

    console.log('👤 [AUTH ENDPOINT] Fetching user from database:', userId);

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('❌ [AUTH ENDPOINT] Database error:', error);
      console.error('❌ [AUTH ENDPOINT] Error details:', {
        message: error.message,
        code: error.code,
        details: error.details
      });
      throw error;
    }

    if (!user) {
      console.error('❌ [AUTH ENDPOINT] User not found in database:', userId);
      res.status(404).json({ error: 'User not found' });
      return;
    }

    console.log('✅ [AUTH ENDPOINT] User fetched successfully:', {
      id: (user as UserProfile).id,
      username: (user as UserProfile).username,
      email: (user as UserProfile).email,
      premium_tier: (user as UserProfile).premium_tier,
      premium_expires_at: (user as UserProfile).premium_expires_at,
      subscription_canceled_at: (user as UserProfile).subscription_canceled_at
    });

    res.json({ user });

  } catch (error) {
    console.error('❌ [AUTH ENDPOINT] Get user failed:', error);
    console.error('❌ [AUTH ENDPOINT] Error stack:', (error as Error).stack);
    res.status(500).json({
      error: 'Failed to fetch user',
      details: (error as Error).message
    });
  }
});

/**
 * PUT /api/users/avatar
 * Update user's avatar preferences (premium feature)
 * SECURITY: Requires authentication
 */
router.put('/users/avatar', requireAuth, async (req: UpdateAvatarRequest, res: Response): Promise<void> => {
  try {
    const { userId, avatar_style, avatar_seed, avatar_options } = req.body;

    console.log('🎨 [AUTH ENDPOINT] PUT /api/users/avatar called');
    console.log('🎨 [AUTH ENDPOINT DEBUG] Request body:', {
      userId,
      avatar_style,
      avatar_seed,
      avatar_options
    });

    // Verify user is updating their own avatar
    if (userId !== req.user?.id) {
      console.error('❌ [AUTH ENDPOINT] User ID mismatch:', {
        requested: userId,
        authenticated: req.user?.id
      });
      res.status(403).json({ error: 'Cannot update another user\'s avatar' });
      return;
    }

    // Check if user is premium and get role
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('premium_tier, role')
      .eq('id', userId)
      .single();

    if (userError) {
      console.error('❌ [AUTH ENDPOINT] Error fetching user:', userError);
      throw userError;
    }

    const typedUser = user as { premium_tier: string; role: string };

    // Calculate new Avatar URL
    const newAvatarUrl = resolveAvatarUrl(avatar_style, avatar_seed, avatar_options);

    // Check if user is trying to use a hidden avatar without admin role
    if (newAvatarUrl && newAvatarUrl.includes('/avatars/hidden/') && typedUser.role !== 'admin') {
      console.warn(`⚠️ [AUTH] User ${userId} tried to use hidden avatar without admin role`);
      res.status(403).json({ error: 'This avatar is restricted to administrators' });
      return;
    }

    // SECURITY: Check if user is trying to use a premium avatar without premium subscription
    if (newAvatarUrl && newAvatarUrl.includes('/avatars/premium/') &&
        (!typedUser.premium_tier || typedUser.premium_tier === 'free')) {
      console.warn(`⚠️ [AUTH] User ${userId} tried to use premium avatar without premium subscription`);
      res.status(403).json({ error: 'This avatar requires a premium subscription' });
      return;
    }

    // Update avatar settings
    const { data: updatedUser, error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        avatar_style: avatar_style || 'pixel-art',
        avatar_seed: avatar_seed || null,
        avatar_options: avatar_options || {},
        avatar_url: newAvatarUrl || undefined // Update URL if resolved
      })
      .eq('id', userId)
      .select()
      .single();

    if (updateError) {
      console.error('❌ [AUTH ENDPOINT] Update error:', updateError);
      throw updateError;
    }

    console.log('✅ [AUTH ENDPOINT] Avatar updated successfully:', {
      userId,
      avatar_style: (updatedUser as UserProfile).avatar_style,
      avatar_seed: (updatedUser as UserProfile).avatar_seed
    });

    res.json({ user: updatedUser });

  } catch (error) {
    console.error('❌ [AUTH ENDPOINT] Update avatar failed:', error);
    console.error('❌ [AUTH ENDPOINT] Error stack:', (error as Error).stack);
    res.status(500).json({
      error: 'Failed to update avatar',
      details: (error as Error).message
    });
  }
});

/**
 * PATCH /api/users/:userId/profile
 * Update user profile (display_name, avatar_url)
 * SECURITY: Requires authentication + user can only update their own data
 */
router.patch('/users/:userId/profile', requireAuth, requireOwnAccount, async (req: UpdateProfileRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { display_name, avatar_url } = req.body;

    console.log('✏️ [AUTH ENDPOINT] PATCH /api/users/:userId/profile called');
    console.log('✏️ [AUTH ENDPOINT] Updating profile for:', userId);
    console.log('✏️ [AUTH ENDPOINT] New values:', { display_name, avatar_url });

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    };

    if (display_name !== undefined) {
      updateData.display_name = display_name.trim();
    }

    if (avatar_url !== undefined) {
      updateData.avatar_url = avatar_url;
    }

    const { data: updatedUser, error } = await supabaseAdmin
      .from('users')
      .update(updateData)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      console.error('❌ [AUTH ENDPOINT] Update profile error:', error);
      throw error;
    }

    console.log('✅ [AUTH ENDPOINT] Profile updated successfully:', {
      id: (updatedUser as UserProfile).id,
      display_name: (updatedUser as UserProfile).display_name,
      avatar_url: (updatedUser as UserProfile).avatar_url
    });

    res.json({ user: updatedUser });

  } catch (error) {
    console.error('❌ [AUTH ENDPOINT] Update profile failed:', error);
    res.status(500).json({
      error: 'Failed to update profile',
      details: (error as Error).message
    });
  }
});

/**
 * Helper: Generate username from email and provider
 */
function generateUsername(email: string, provider?: string): string {
  const emailPrefix = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
  const providerPrefix = provider ? provider.substring(0, 2).toLowerCase() : 'em'; // 'em' for email auth
  const randomSuffix = Math.random().toString(36).substr(2, 4);

  return `${emailPrefix}_${providerPrefix}${randomSuffix}`;
}

export default router;
