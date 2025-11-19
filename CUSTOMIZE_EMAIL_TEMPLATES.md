# How to Customize Email Templates in Supabase

Your email templates are created but not yet uploaded to Supabase. Here's how to customize them:

## 📧 Email Templates Location

All email templates are in the `/email-templates/` folder:
- `confirm-signup.html` - Email verification after registration
- `reset-password.html` - Password reset emails
- `magic-link.html` - Passwordless login
- `invite-user.html` - User invitations
- `change-email.html` - Email change verification
- `reauthentication.html` - Identity verification

## 🎨 Step-by-Step: Customize in Supabase Dashboard

### Step 1: Open Supabase Dashboard

1. Go to: https://supabase.com/dashboard
2. Select your **GameBuddies** project
3. Click **Authentication** in the left sidebar
4. Click **Email Templates**

### Step 2: Customize Confirm Signup Template

1. Click on **"Confirm signup"** template
2. You'll see the default template - we're going to replace it
3. Open `/email-templates/confirm-signup.html` from your repo
4. **Copy the entire HTML**
5. Go back to Supabase Dashboard
6. **Paste** into the template editor, replacing everything
7. Click **Save**

### Step 3: Customize Reset Password Template

1. Click on **"Reset Password"** template
2. Open `/email-templates/reset-password.html`
3. **Copy the entire HTML**
4. **Paste** into Supabase, replacing the default
5. Click **Save**

### Step 4: Customize Magic Link Template

1. Click on **"Magic Link"** template
2. Open `/email-templates/magic-link.html`
3. **Copy & paste** the HTML
4. Click **Save**

### Step 5: Customize Invite User Template

1. Click on **"Invite user"** template
2. Open `/email-templates/invite-user.html`
3. **Copy & paste** the HTML
4. Click **Save**

### Step 6: Customize Change Email Template

1. Click on **"Change Email Address"** template
2. Open `/email-templates/change-email.html`
3. **Copy & paste** the HTML
4. Click **Save**

### Step 7: Customize Reauthentication Template (Optional)

1. This template is for sensitive operations
2. Click on **"Reauthentication"** if available
3. Open `/email-templates/reauthentication.html`
4. **Copy & paste** the HTML
5. Click **Save**

## ⚙️ Template Variables

Supabase will automatically replace these variables in your templates:

- `{{ .ConfirmationURL }}` - The action link (confirm email, reset password, etc.)
- `{{ .Token }}` - Verification token
- `{{ .TokenHash }}` - Hashed token
- `{{ .SiteURL }}` - Your site URL (gamebuddies.io)
- `{{ .Email }}` - User's email address
- `{{ .Data }}` - Custom metadata

**You don't need to change these!** They're already in the templates.

## 🧪 Test Your Templates

After customizing:

1. Register a new test account
2. Check your email inbox
3. The email should now have:
   - 🎮 GameBuddies.io branding
   - Dark gaming theme (navy background)
   - Neon accent colors (cyan & pink)
   - Professional styling
   - Clear call-to-action buttons

## 📱 Email Client Compatibility

The templates are designed to work in:
- ✅ Gmail
- ✅ Outlook / Outlook.com
- ✅ Apple Mail (macOS, iOS)
- ✅ Yahoo Mail
- ✅ Thunderbird
- ✅ Mobile email clients

They use:
- Table-based layouts (email-safe)
- Inline CSS (no external stylesheets)
- No JavaScript
- Web-safe fonts with fallbacks

## 🚨 Important Notes

1. **Always test before production**: Send yourself a test email first
2. **Keep the template variables**: Don't remove `{{ .ConfirmationURL }}` etc.
3. **Preview on mobile**: Check how emails look on phones
4. **Check spam folder**: Sometimes custom emails go to spam initially

## 🎨 Customization Tips

If you want to modify the templates further:

### Change Colors
```html
<!-- Background gradient -->
background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);

<!-- Button colors -->
background: linear-gradient(135deg, #e94560 0%, #00d9ff 100%);

<!-- Text colors -->
color: #ffffff; /* Main text */
color: rgba(255, 255, 255, 0.9); /* Secondary text */
```

### Change Fonts
```html
font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
```

### Change Logo Emoji
```html
<h1>🎮 GameBuddies.io</h1>
<!-- Change 🎮 to any emoji you prefer -->
```

## 🔄 Reverting to Default

If you want to go back to Supabase's default templates:

1. Go to **Authentication** → **Email Templates**
2. Click the template
3. Click **"Reset to default"**
4. Click **Save**

## 📧 SMTP Configuration (Optional but Recommended)

For production, configure SMTP to avoid email delivery issues:

1. Go to **Authentication** → **Email Templates**
2. Click **Settings** (gear icon at top)
3. Enable **"Custom SMTP"**
4. Choose a provider:
   - **SendGrid** (free: 100/day) - Recommended for starting out
   - **Mailgun** (free: 1,000/month) - Good for moderate volume
   - **Amazon SES** - Best for high volume, lowest cost
5. Enter SMTP credentials from your provider
6. Test the connection

Without SMTP, Supabase uses their built-in service which has rate limits and may not work in production.

## ✅ Checklist

After setting up templates:

- [ ] All 6 email templates customized
- [ ] Test email sent and looks correct
- [ ] Emails not going to spam
- [ ] Links redirect to https://gamebuddies.io (not localhost)
- [ ] Mobile display looks good
- [ ] SMTP configured (production only)

## Need Help?

If emails still look weird:
1. Make sure you **saved** the template in Supabase
2. Clear your email cache
3. Try a different email address
4. Check the **subject line** - it should say "GameBuddies.io"
5. Look for any error messages in Supabase Logs
