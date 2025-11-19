# Email Authentication Setup Checklist

Follow these steps IN ORDER to set up email authentication for GameBuddies.io.

## ✅ Step 1: Add Database Columns (CRITICAL - Do this first!)

**File**: `ADD_EMAIL_FIELDS_QUICK.sql`

1. Open **Supabase Dashboard**: https://supabase.com/dashboard
2. Go to your GameBuddies project
3. Click **SQL Editor**
4. Copy the contents of `ADD_EMAIL_FIELDS_QUICK.sql`
5. Paste into SQL Editor
6. Click **Run**
7. Verify you see: ✅ "Email fields added successfully!"

**What this does**: Adds `email_verified`, `email`, `oauth_provider`, `oauth_id` columns to your users table.

**Time**: 1 minute

---

## ✅ Step 2: Set Up Database Trigger (Recommended)

**File**: `FIX_EMAIL_AUTH_ISSUE.sql`

1. In Supabase SQL Editor
2. Copy the contents of `FIX_EMAIL_AUTH_ISSUE.sql`
3. Paste into SQL Editor
4. Click **Run**
5. Verify you see: ✅ "Email authentication fix completed!"

**What this does**: Creates a trigger that automatically syncs `auth.users` → `public.users` when someone signs up.

**Time**: 1 minute

---

## ✅ Step 3: Enable Email Provider in Supabase

1. In Supabase Dashboard, go to **Authentication** → **Providers**
2. Find **Email** provider
3. Toggle it **ON** (if not already)
4. Under **Email Auth**:
   - ✅ Enable email confirmations
   - ✅ Secure email change
   - ✅ Secure password change
5. Click **Save**

**Time**: 30 seconds

---

## ✅ Step 4: Configure Redirect URLs

1. Go to **Authentication** → **URL Configuration**
2. Under **Redirect URLs**, add:
   ```
   https://gamebuddies.io/auth/callback
   http://localhost:3000/auth/callback
   ```
3. Click **Save**

**Time**: 30 seconds

---

## ✅ Step 5: Customize Email Templates (Optional but recommended)

**File**: `CUSTOMIZE_EMAIL_TEMPLATES.md` (full guide)

Quick version:
1. Go to **Authentication** → **Email Templates**
2. Click **"Confirm signup"**
3. Copy contents of `/email-templates/confirm-signup.html`
4. Paste into Supabase, replacing default template
5. Click **Save**
6. Repeat for other templates (reset-password, magic-link, etc.)

**Time**: 5 minutes for all templates

---

## ✅ Step 6: Configure SMTP (Production only)

For production, configure custom SMTP:

1. Go to **Authentication** → **Email Templates**
2. Click **Settings** (gear icon)
3. Enable **Custom SMTP**
4. Choose a provider:
   - **SendGrid** (free: 100 emails/day) - Good for starting
   - **Mailgun** (free: 1,000 emails/month) - Good for moderate volume
   - **Amazon SES** - Cheapest for high volume
5. Enter SMTP credentials
6. Test the connection

**For development**: Skip this step, use Supabase's built-in email service

**Time**: 5 minutes (if you have SMTP credentials ready)

---

## ✅ Step 7: Deploy Updated Code

Make sure your updated code is deployed to production:

```bash
git push origin main
# or deploy via your hosting platform
```

**What changed**:
- Email signup now uses correct redirect URL (gamebuddies.io in production)
- Server accepts null oauth_provider for email auth
- Comprehensive debugging added

**Time**: Depends on your deployment setup

---

## ✅ Step 8: Test Email Registration

1. Go to https://gamebuddies.io/login
2. Click **Email / Password** tab
3. Click **Sign Up**
4. Enter a test email and password
5. Click **Sign Up**
6. Check your email inbox
7. Click the confirmation link
8. Verify you're redirected to https://gamebuddies.io/auth/callback
9. Verify you're logged in

**Expected result**:
- ✅ Email sent successfully
- ✅ Email has dark gaming theme (if templates customized)
- ✅ Confirmation link redirects to gamebuddies.io
- ✅ User is created in both auth.users and public.users
- ✅ User is logged in after confirmation

**Time**: 2 minutes

---

## ✅ Step 9: Test Email Login

1. Log out
2. Go to /login
3. Click **Email / Password** tab
4. Enter your email and password
5. Click **Sign In**
6. Verify you're logged in

**Time**: 30 seconds

---

## 🐛 Troubleshooting

### Issue: "Database error saving new user"

**Cause**: Missing columns in users table

**Fix**: Run `ADD_EMAIL_FIELDS_QUICK.sql` (Step 1)

---

### Issue: Email redirect goes to localhost

**Cause**: Old code not deployed

**Fix**:
1. Pull latest code
2. Deploy to production
3. Or manually confirm existing users (see `QUICK_CONFIRM_EMAIL.sql`)

---

### Issue: Email not delivered

**Cause**: Rate limits or spam filters

**Fix**:
1. Check Supabase logs (Dashboard → Logs)
2. Check spam folder
3. Set up custom SMTP (Step 6)
4. Verify email provider allows verification emails

---

### Issue: User created in auth.users but not public.users

**Cause**: Database trigger not set up

**Fix**: Run `FIX_EMAIL_AUTH_ISSUE.sql` (Step 2)

---

### Issue: Email template looks plain/ugly

**Cause**: Default Supabase templates

**Fix**: Customize templates (Step 5) using files in `/email-templates/`

---

## 📊 Verification

After completing all steps, verify everything works:

```sql
-- Check if columns exist
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'users'
  AND column_name IN ('email', 'email_verified', 'oauth_provider');

-- Check if trigger exists
SELECT trigger_name
FROM information_schema.triggers
WHERE event_object_table = 'users'
  AND trigger_name = 'on_auth_user_created';

-- Check registered users
SELECT id, email, email_verified, oauth_provider, created_at
FROM public.users
WHERE email IS NOT NULL
ORDER BY created_at DESC
LIMIT 5;
```

---

## ✅ Complete Checklist

- [ ] Step 1: Add database columns (ADD_EMAIL_FIELDS_QUICK.sql)
- [ ] Step 2: Set up database trigger (FIX_EMAIL_AUTH_ISSUE.sql)
- [ ] Step 3: Enable email provider in Supabase
- [ ] Step 4: Configure redirect URLs
- [ ] Step 5: Customize email templates (optional)
- [ ] Step 6: Configure SMTP (production only)
- [ ] Step 7: Deploy updated code
- [ ] Step 8: Test email registration
- [ ] Step 9: Test email login

**Total Time**: ~15-20 minutes (including testing)

Once all steps are complete, email authentication will be fully functional! 🎉
