# Fix for Email Authentication "Database error saving new user"

## The Problem

When trying to register with email/password, you're getting:
```
❌ Database error saving new user
```

This happens because Supabase's `auth.users` table needs to sync with our `public.users` table, but the database trigger is either missing or broken.

## The Solution

Follow these steps to fix the issue:

### Step 1: Run Diagnostic (Optional)

1. Open **Supabase Dashboard**: https://supabase.com/dashboard
2. Go to your **GameBuddies** project
3. Click **SQL Editor** in the left sidebar
4. Open the file: `DIAGNOSE_EMAIL_AUTH_ISSUE.sql`
5. Copy the entire contents and paste into the SQL Editor
6. Click **Run**
7. Review the output to see what's missing

### Step 2: Apply the Fix

1. Open the file: `FIX_EMAIL_AUTH_ISSUE.sql`
2. Copy the **entire contents**
3. Paste into **Supabase SQL Editor**
4. Click **Run**
5. You should see: `✅ Email authentication fix completed!`

### Step 3: Enable Email Authentication

1. In Supabase Dashboard, go to **Authentication** → **Providers**
2. Find **Email** provider
3. Toggle it **ON** (if it's not already)
4. Under **Email Auth**, enable:
   - ✅ Enable email confirmations
   - ✅ Secure email change

### Step 4: Configure SMTP (for Production)

For testing, you can use Supabase's built-in email service, but for production you'll need SMTP:

1. Go to **Authentication** → **Email Templates**
2. Click **Settings** (gear icon)
3. Configure SMTP (recommended providers):
   - **SendGrid** (free tier: 100 emails/day)
   - **Mailgun** (free tier: 1,000 emails/month)
   - **Amazon SES** (cheapest for high volume)

### Step 5: Add Redirect URLs

1. Go to **Authentication** → **URL Configuration**
2. Add redirect URLs:
   ```
   https://gamebuddies.io/auth/callback
   http://localhost:3000/auth/callback (for local testing)
   ```

### Step 6: Test Email Registration

1. Go to https://gamebuddies.io/login
2. Click **Email / Password** tab
3. Click **Sign Up**
4. Enter your email and password
5. Click **Sign Up**
6. You should see: ✅ "Registration successful! Please check your email..."

## What the Fix Does

The `FIX_EMAIL_AUTH_ISSUE.sql` script:

1. **Drops** any broken trigger that might exist
2. **Adds** missing columns to `public.users`:
   - `email`, `email_verified`
   - `oauth_provider`, `oauth_id`, `oauth_metadata`
   - `premium_tier`, `premium_expires_at`, `stripe_customer_id`
3. **Creates** a new trigger function `handle_new_user()` that:
   - Automatically creates a user in `public.users` when signup happens
   - Generates unique usernames from email addresses
   - Handles username conflicts gracefully
   - Works for both email and OAuth authentication
4. **Creates** indexes for performance

## Debugging

After running the fix, if you still have issues:

1. **Check the browser console** (F12) for detailed logs:
   - Look for `📧 [CLIENT]` logs
   - Look for `🔄 [AUTH]` logs
   - Check for any red errors

2. **Check the server logs** for:
   - `🔄 [SERVER AUTH]` logs
   - Any database errors

3. **Check Supabase Logs**:
   - Go to Supabase Dashboard → **Logs**
   - Filter by **Postgres Logs**
   - Look for any trigger errors

## Need Help?

If you're still seeing errors after running the fix:

1. Share the output from `DIAGNOSE_EMAIL_AUTH_ISSUE.sql`
2. Share any error messages from browser console
3. Share Supabase logs (if available)
