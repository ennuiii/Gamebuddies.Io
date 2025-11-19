# How to Resend Confirmation Email

If you received a confirmation email with the wrong URL (localhost), here are your options:

## Option 1: Manual Confirmation (Fastest)

1. Open **Supabase Dashboard**: https://supabase.com/dashboard
2. Go to your GameBuddies project
3. Click **Authentication** → **Users**
4. Find your user
5. Click the **three dots (•••)** menu
6. Click **"Confirm email"**
7. ✅ Done! User is now confirmed

## Option 2: Resend Confirmation Email via Dashboard

1. Open **Supabase Dashboard**: https://supabase.com/dashboard
2. Go to **Authentication** → **Users**
3. Find your user
4. Click the **three dots (•••)** menu
5. Click **"Send password recovery"** (this will send a new email)
6. Check your inbox - you'll get a password reset email
7. Click the link (it will have the correct URL now)
8. Set a new password (or use the same one)

## Option 3: Delete and Re-register

1. **Delete the user in Supabase**:
   - Go to **Authentication** → **Users**
   - Click the three dots on your user
   - Click **"Delete user"**
   - Confirm deletion

2. **Delete from public.users table**:
   - Go to **SQL Editor**
   - Run: `DELETE FROM public.users WHERE email = 'your@email.com';`

3. **Register again**:
   - Go to https://gamebuddies.io/login
   - Click **Email / Password**
   - Register with the same email
   - This time the confirmation email will have the correct URL! ✅

## Option 4: Run SQL to Confirm

1. Go to **SQL Editor** in Supabase
2. Run this query (replace with your email):

```sql
-- Confirm user email manually
UPDATE auth.users
SET email_confirmed_at = NOW(),
    confirmation_token = NULL,
    confirmation_sent_at = NULL
WHERE email = 'ennui.gw2@gmail.com';

-- Verify it worked
SELECT id, email, email_confirmed_at, created_at
FROM auth.users
WHERE email = 'ennui.gw2@gmail.com';
```

3. Done! User is confirmed ✅

## Option 5: Use the Localhost Link (Development Only)

If you have a local development environment running:

1. Start your local dev server: `npm run dev`
2. Click the localhost link from the email
3. It should redirect to: `http://localhost:3000/auth/callback`
4. The callback will process and confirm your email
5. Then manually go to: https://gamebuddies.io

**Note**: This only works if you have localhost:3000 running!

## Recommended: Option 1 (Manual Confirmation)

For quickest fix right now, just manually confirm in Supabase Dashboard.

## For Future Users

After deploying the updated code, all new registrations will receive emails with the correct production URL (https://gamebuddies.io/auth/callback).

## Verification

After confirming, verify the user is properly synced:

```sql
-- Check auth.users
SELECT id, email, email_confirmed_at, created_at
FROM auth.users
WHERE email = 'ennui.gw2@gmail.com';

-- Check public.users
SELECT id, username, email, email_verified, created_at
FROM public.users
WHERE email = 'ennui.gw2@gmail.com';
```

Both should show the user exists and is confirmed.
