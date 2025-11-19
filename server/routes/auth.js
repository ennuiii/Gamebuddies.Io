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

    const isEmailAuth = oauth_provider === null;

    console.log('🔄 [SERVER AUTH] Received sync request:', {
      user_id: supabase_user_id,
      email,
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
      return res.status(400).json({
        error: 'Missing required fields: supabase_user_id, email'
      });
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
      console.log('✅ [SERVER AUTH] User exists, updating:', existingUser.username);

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
        console.error('❌ [SERVER AUTH] Update error:', updateError);
        throw updateError;
      }

      console.log('✅ [SERVER AUTH] User updated successfully');
      return res.json({ user: updatedUser });
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
      console.log('📧 [SERVER AUTH] User exists with email, migrating guest to registered:', emailUser.username);

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
        console.error('❌ [SERVER AUTH] Migration error:', migrateError);
        // If migration fails, create new user instead
      } else {
        console.log('✅ [SERVER AUTH] User migrated successfully');
        return res.json({ user: migratedUser });
      }
    }

    // Create new user
    console.log('➕ [SERVER AUTH] No existing user found, creating new user...');
    const username = generateUsername(email, oauth_provider);

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
        email_verified: true,
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
            email_verified: true,
            last_seen: new Date().toISOString()
          })
          .select()
          .single();

        if (retryError) {
          console.error('❌ [SERVER AUTH] Retry failed:', retryError);
          throw retryError;
        }

        console.log('✅ [SERVER AUTH] User created with unique username:', uniqueUsername);
        return res.json({ user: retryUser });
      }

      throw createError;
    }

    console.log('✅ [SERVER AUTH] User created successfully:', newUser.username);
    res.json({ user: newUser });

  } catch (error) {
    console.error('❌ [SERVER AUTH] Sync user failed:', error);
    console.error('❌ [SERVER AUTH] Stack trace:', error.stack);
    res.status(500).json({
      error: 'Failed to sync user',
      details: error.message,
      code: error.code
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
  const providerPrefix = provider ? provider.substring(0, 2).toLowerCase() : 'em'; // 'em' for email auth
  const randomSuffix = Math.random().toString(36).substr(2, 4);

  return `${emailPrefix}_${providerPrefix}${randomSuffix}`;
}

module.exports = router;
