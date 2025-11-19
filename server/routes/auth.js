const express = require('express');
const { supabaseAdmin } = require('../lib/supabase');
const router = express.Router();

/**
 * POST /api/auth/sync-user
 * Sync Supabase auth.users to public.users table
 */
router.post('/sync-user', async (req, res) => {
  try {
    const {
      supabase_user_id,
      email,
      oauth_provider,
      oauth_id,
      avatar_url,
      display_name
    } = req.body;

    console.log('🔄 [AUTH] Syncing user:', {
      user_id: supabase_user_id,
      email,
      provider: oauth_provider
    });

    // Validate required fields
    if (!supabase_user_id || !email || !oauth_provider) {
      return res.status(400).json({
        error: 'Missing required fields: supabase_user_id, email, oauth_provider'
      });
    }

    // Check if user already exists by ID
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', supabase_user_id)
      .single();

    if (existingUser) {
      console.log('✅ [AUTH] User exists, updating:', existingUser.username);

      // Update existing user
      const { data: updatedUser, error: updateError } = await supabaseAdmin
        .from('users')
        .update({
          email,
          oauth_provider,
          oauth_id,
          avatar_url,
          display_name: display_name || existingUser.display_name,
          last_seen: new Date().toISOString(),
          is_guest: false,
          email_verified: true
        })
        .eq('id', supabase_user_id)
        .select()
        .single();

      if (updateError) {
        console.error('❌ [AUTH] Update error:', updateError);
        throw updateError;
      }

      return res.json({ user: updatedUser });
    }

    // Check if user exists by email (migration from guest)
    const { data: emailUser } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (emailUser) {
      console.log('📧 [AUTH] User exists with email, migrating guest to registered');

      // Update existing guest user to registered
      const { data: migratedUser, error: migrateError } = await supabaseAdmin
        .from('users')
        .update({
          id: supabase_user_id, // Update ID to match auth.users
          oauth_provider,
          oauth_id,
          avatar_url,
          display_name: display_name || emailUser.display_name,
          last_seen: new Date().toISOString(),
          is_guest: false,
          email_verified: true
        })
        .eq('email', email)
        .select()
        .single();

      if (migrateError) {
        console.error('❌ [AUTH] Migration error:', migrateError);
        // If migration fails, create new user instead
      } else {
        return res.json({ user: migratedUser });
      }
    }

    // Create new user
    const username = generateUsername(email, oauth_provider);

    console.log('➕ [AUTH] Creating new user:', username);

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
        email_verified: true,
        last_seen: new Date().toISOString()
      })
      .select()
      .single();

    if (createError) {
      console.error('❌ [AUTH] Create error:', createError);

      // If username conflict, try with random suffix
      if (createError.code === '23505') {
        const uniqueUsername = `${username}_${Math.random().toString(36).substr(2, 5)}`;

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
            email_verified: true,
            last_seen: new Date().toISOString()
          })
          .select()
          .single();

        if (retryError) throw retryError;

        console.log('✅ [AUTH] User created with unique username:', uniqueUsername);
        return res.json({ user: retryUser });
      }

      throw createError;
    }

    console.log('✅ [AUTH] User created successfully:', newUser.username);
    res.json({ user: newUser });

  } catch (error) {
    console.error('❌ [AUTH] Sync user failed:', error);
    res.status(500).json({
      error: 'Failed to sync user',
      details: error.message
    });
  }
});

/**
 * GET /api/users/:userId
 * Get user by ID from public.users
 */
router.get('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    console.log('👤 [AUTH] Fetching user:', userId);

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('❌ [AUTH] Fetch user error:', error);
      throw error;
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('✅ [AUTH] User fetched:', user.username);
    res.json({ user });

  } catch (error) {
    console.error('❌ [AUTH] Get user failed:', error);
    res.status(500).json({
      error: 'Failed to fetch user',
      details: error.message
    });
  }
});

/**
 * Helper: Generate username from email and provider
 */
function generateUsername(email, provider) {
  const emailPrefix = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
  const providerPrefix = provider.substring(0, 2).toLowerCase();
  const randomSuffix = Math.random().toString(36).substr(2, 4);

  return `${emailPrefix}_${providerPrefix}${randomSuffix}`;
}

module.exports = router;
