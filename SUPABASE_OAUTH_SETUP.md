# Supabase OAuth Setup Guide - GameBuddies.io

Diese Anleitung zeigt dir **Schritt für Schritt**, wie du OAuth Authentication für GameBuddies.io einrichtest.

---

## 📋 ÜBERSICHT

Du hast jetzt:
- ✅ Login Page (`/login`)
- ✅ OAuth Callback Handler (`/auth/callback`)
- ✅ Auth Context für Session Management
- ✅ Server Endpoints für User Sync

**Was noch fehlt:**
1. Database Migration ausführen
2. OAuth Apps erstellen (Discord, Google, GitHub)
3. Supabase Dashboard konfigurieren
4. Testen!

---

## 🗄️ SCHRITT 1: DATABASE MIGRATION

### 1.1 Öffne Supabase Dashboard

1. Gehe zu: https://supabase.com/dashboard
2. Wähle dein **GameBuddies Projekt**
3. Klicke auf **SQL Editor** in der linken Sidebar

### 1.2 Führe Migration aus

Kopiere dieses SQL Script und führe es aus:

```sql
-- Add OAuth & Premium fields to users table
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS oauth_provider TEXT, -- 'google', 'discord', 'github'
  ADD COLUMN IF NOT EXISTS oauth_id TEXT, -- Provider's user ID
  ADD COLUMN IF NOT EXISTS oauth_metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS premium_tier TEXT DEFAULT 'free'
    CHECK (premium_tier IN ('free', 'monthly', 'lifetime')),
  ADD COLUMN IF NOT EXISTS premium_expires_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_oauth_provider_id ON public.users(oauth_provider, oauth_id);
CREATE INDEX IF NOT EXISTS idx_users_premium_tier ON public.users(premium_tier);

-- Unique constraint for OAuth provider + ID combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oauth_unique ON public.users(oauth_provider, oauth_id)
WHERE oauth_provider IS NOT NULL;

-- Optional: Database Trigger to auto-sync auth.users -> public.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, oauth_provider, oauth_id, username, is_guest, email_verified)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_app_meta_data->>'provider',
    NEW.raw_user_meta_data->>'provider_id',
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    false,
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    oauth_provider = EXCLUDED.oauth_provider,
    oauth_id = EXCLUDED.oauth_id,
    last_seen = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### 1.3 Verify Migration

Führe aus um zu testen:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'users'
ORDER BY ordinal_position;
```

Du solltest die neuen Felder sehen: `email`, `oauth_provider`, `oauth_id`, `premium_tier`, etc.

---

## 🔐 SCHRITT 2: DISCORD OAUTH SETUP

### 2.1 Erstelle Discord Application

1. Gehe zu: https://discord.com/developers/applications
2. Klicke **"New Application"**
3. Name: `GameBuddies` (oder was du willst)
4. Klicke **"Create"**

### 2.2 Konfiguriere OAuth2

1. In der linken Sidebar → **OAuth2**
2. Scrolle zu **"Redirects"**
3. Klicke **"Add Redirect"**
4. Füge ein:
   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```
   **Beispiel:** `https://abcdefghijk.supabase.co/auth/v1/callback`

5. Für **localhost testing** (optional):
   ```
   http://localhost:3000/auth/callback
   ```

6. Klicke **"Save Changes"**

### 2.3 Kopiere Credentials

1. Gehe zurück zu **"OAuth2"** → **"General"**
2. Kopiere **Client ID**
3. Klicke **"Reset Secret"** → Kopiere **Client Secret**
4. **WICHTIG:** Speichere beide sicher!

### 2.4 Supabase Dashboard Konfiguration

1. Öffne Supabase Dashboard
2. Gehe zu **Authentication** → **Providers**
3. Scrolle zu **Discord**
4. Schalte **"Enable Sign in with Discord"** ein
5. Paste:
   - **Client ID**: (von Discord)
   - **Client Secret**: (von Discord)
6. **Scopes** (optional): `identify email`
7. Klicke **"Save"**

---

## 📧 SCHRITT 3: GOOGLE OAUTH SETUP

### 3.1 Erstelle Google Cloud Project

1. Gehe zu: https://console.cloud.google.com/
2. Klicke oben **"Select a project"** → **"NEW PROJECT"**
3. Project name: `GameBuddies`
4. Klicke **"CREATE"**

### 3.2 Konfiguriere OAuth Consent Screen

1. Im Menü → **APIs & Services** → **OAuth consent screen**
2. User Type: **External**
3. Klicke **"CREATE"**
4. Fülle aus:
   - **App name**: GameBuddies
   - **User support email**: (deine Email)
   - **Developer contact**: (deine Email)
5. Klicke **"SAVE AND CONTINUE"**
6. Scopes → **"SAVE AND CONTINUE"** (default ist ok)
7. Test users → **"SAVE AND CONTINUE"**
8. Summary → **"BACK TO DASHBOARD"**

### 3.3 Erstelle OAuth 2.0 Client ID

1. Im Menü → **APIs & Services** → **Credentials**
2. Klicke **"+ CREATE CREDENTIALS"** → **OAuth client ID**
3. Application type: **Web application**
4. Name: `GameBuddies Web Client`
5. **Authorized redirect URIs** → **"+ ADD URI"**:
   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```
6. Klicke **"CREATE"**
7. **Kopiere:**
   - Your Client ID
   - Your Client Secret

### 3.4 Supabase Dashboard Konfiguration

1. Öffne Supabase Dashboard
2. Gehe zu **Authentication** → **Providers**
3. Scrolle zu **Google**
4. Schalte **"Enable Sign in with Google"** ein
5. Paste:
   - **Client ID**: (von Google)
   - **Client Secret**: (von Google)
6. Klicke **"Save"**

---

## 🎮 SCHRITT 4: TWITCH OAUTH SETUP

### 4.1 Erstelle Twitch Application

1. Gehe zu: https://dev.twitch.tv/console/apps
2. Klicke **"Register Your Application"**
3. Fülle aus:
   - **Name**: GameBuddies
   - **OAuth Redirect URLs**:
     ```
     https://<your-project-ref>.supabase.co/auth/v1/callback
     http://localhost:3000/auth/callback
     ```
   - **Category**: Website Integration
4. Klicke **"Create"**

### 4.2 Kopiere Credentials

1. Nach Erstellung → Klicke **"Manage"**
2. Kopiere **Client ID**
3. Klicke **"New Secret"** → Kopiere **Client Secret**
4. **WICHTIG:** Speichere beide sicher!

### 4.3 Supabase Dashboard Konfiguration

1. Öffne Supabase Dashboard
2. Gehe zu **Authentication** → **Providers**
3. Scrolle zu **Twitch**
4. Schalte **"Enable Sign in with Twitch"** ein
5. Paste:
   - **Client ID**: (von Twitch)
   - **Client Secret**: (von Twitch)
6. Klicke **"Save"**

---

## 🔷 SCHRITT 5: MICROSOFT (AZURE) OAUTH SETUP

### 5.1 Erstelle Azure Application

1. Gehe zu: https://portal.azure.com/
2. Suche nach **"Azure Active Directory"** oder **"Microsoft Entra ID"**
3. Klicke **"App registrations"** → **"New registration"**
4. Fülle aus:
   - **Name**: GameBuddies
   - **Supported account types**: Accounts in any organizational directory and personal Microsoft accounts
   - **Redirect URI**: Web →
     ```
     https://<your-project-ref>.supabase.co/auth/v1/callback
     ```
5. Klicke **"Register"**

### 5.2 Erstelle Client Secret

1. Nach Erstellung → **"Certificates & secrets"** (linke Sidebar)
2. **"Client secrets"** → **"New client secret"**
3. Description: `GameBuddies Secret`
4. Expires: 24 months (oder länger)
5. Klicke **"Add"**
6. **Kopiere den Secret Value SOFORT** (wird nur einmal angezeigt!)

### 5.3 Kopiere Application ID

1. Gehe zu **"Overview"** (linke Sidebar)
2. Kopiere **Application (client) ID**
3. Kopiere **Directory (tenant) ID** (optional)

### 5.4 Supabase Dashboard Konfiguration

1. Öffne Supabase Dashboard
2. Gehe zu **Authentication** → **Providers**
3. Scrolle zu **Azure**
4. Schalte **"Enable Sign in with Azure"** ein
5. Paste:
   - **Client ID**: (Application ID von Azure)
   - **Client Secret**: (Secret Value von Azure)
   - **Tenant** (optional): `common` (für alle Microsoft Accounts) oder deine Tenant ID
6. Klicke **"Save"**

---

## 🐙 SCHRITT 6: GITHUB OAUTH SETUP (Optional)

### 6.1 Erstelle GitHub OAuth App

1. Gehe zu: https://github.com/settings/developers
2. Klicke **"New OAuth App"**
3. Fülle aus:
   - **Application name**: GameBuddies
   - **Homepage URL**: `https://gamebuddies.io`
   - **Authorization callback URL**:
     ```
     https://<your-project-ref>.supabase.co/auth/v1/callback
     ```
4. Klicke **"Register application"**

### 6.2 Generate Client Secret

1. Nach Erstellung → Klicke **"Generate a new client secret"**
2. **Kopiere:**
   - Client ID
   - Client secrets

### 6.3 Supabase Dashboard Konfiguration

1. Öffne Supabase Dashboard
2. Gehe zu **Authentication** → **Providers**
3. Scrolle zu **GitHub**
4. Schalte **"Enable Sign in with GitHub"** ein
5. Paste:
   - **Client ID**: (von GitHub)
   - **Client Secret**: (von GitHub)
6. Klicke **"Save"**

---

## 🧪 SCHRITT 7: TESTEN

### 7.1 Lokales Testing

1. **Starte Server:**
   ```bash
   cd server
   npm run dev
   ```

2. **Starte Client:**
   ```bash
   cd client
   npm start
   ```

3. **Öffne Browser:**
   ```
   http://localhost:3000/login
   ```

4. **Teste OAuth Flow:**
   - Klicke "Login with Discord"
   - Du wirst zu Discord redirected
   - Nach Auth → Zurück zu `http://localhost:3000/auth/callback`
   - Dann zu `http://localhost:3000/`

### 7.2 Debug Checklist

**Falls Login nicht funktioniert:**

1. **Check Browser Console:**
   - F12 → Console Tab
   - Schaue nach Errors

2. **Check Server Logs:**
   - Terminal wo Server läuft
   - Schaue nach `[AUTH]` logs

3. **Check Redirect URLs:**
   - Provider Dashboard (Discord/Google)
   - Supabase Dashboard → Authentication → URL Configuration
   - Beide müssen **exakt** matchen!

4. **Check Database:**
   ```sql
   SELECT * FROM auth.users;
   SELECT * FROM public.users;
   ```

5. **Common Errors:**

   | Error | Lösung |
   |-------|--------|
   | `Invalid redirect URL` | Redirect URLs in Provider + Supabase matchen |
   | `No session found` | Browser Cookies blockiert? Check DevTools |
   | `Provider not enabled` | Supabase Dashboard → Provider aktivieren |
   | `User not created` | Database Trigger prüfen oder `/sync-user` endpoint |

---

## 🔒 SCHRITT 8: SECURITY (WICHTIG!)

### 6.1 Row Level Security (RLS)

Führe in Supabase SQL Editor aus:

```sql
-- Enable RLS on users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Users can only view their own profile
CREATE POLICY "Users can view own profile"
ON public.users
FOR SELECT
USING (auth.uid() = id);

-- Users can only update their own profile
CREATE POLICY "Users can update own profile"
ON public.users
FOR UPDATE
USING (auth.uid() = id);

-- Service role can do everything (for your backend)
CREATE POLICY "Service role full access"
ON public.users
FOR ALL
TO service_role
USING (true);
```

### 6.2 Environment Variables

**Server (.env):**

```bash
# Supabase (bereits vorhanden)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...

# Production URLs
FRONTEND_URL=https://gamebuddies.io
BACKEND_URL=https://api.gamebuddies.io
```

**NIEMALS** den Service Role Key im Client verwenden!

---

## 🚀 SCHRITT 9: PRODUCTION DEPLOYMENT

### 7.1 Update Redirect URLs

**Für Production musst du neue Redirect URLs hinzufügen:**

**Discord:**
```
https://gamebuddies.io/auth/callback
```

**Google:**
```
https://gamebuddies.io/auth/callback
```

**GitHub:**
```
https://gamebuddies.io/auth/callback
```

### 7.2 Supabase URL Configuration

1. Supabase Dashboard → **Authentication** → **URL Configuration**
2. **Site URL**: `https://gamebuddies.io`
3. **Redirect URLs** → Add:
   ```
   https://gamebuddies.io/auth/callback
   ```

### 7.3 CORS Configuration

In `server/index.js` (bereits konfiguriert):

```javascript
const allowedOrigins = [
  'https://gamebuddies.io',
  // ... andere
];
```

---

## ✅ CHECKLISTE

Gehe diese Liste durch bevor du live gehst:

- [ ] Database Migration ausgeführt
- [ ] Discord OAuth App erstellt
- [ ] Google OAuth App erstellt (optional GitHub)
- [ ] Supabase Providers konfiguriert (Discord, Google, GitHub)
- [ ] Redirect URLs in allen Providern gesetzt
- [ ] Localhost Testing erfolgreich
- [ ] RLS Policies aktiviert
- [ ] Production Redirect URLs gesetzt
- [ ] Environment Variables gesetzt
- [ ] HTTPS aktiviert
- [ ] CORS richtig konfiguriert

---

## 📚 NÜTZLICHE LINKS

- **Supabase Auth Docs**: https://supabase.com/docs/guides/auth
- **Discord OAuth**: https://discord.com/developers/docs/topics/oauth2
- **Google OAuth**: https://developers.google.com/identity/protocols/oauth2
- **GitHub OAuth**: https://docs.github.com/en/apps/oauth-apps

---

## 🆘 TROUBLESHOOTING

### Problem: "OAuth redirect mismatch"

**Lösung:**
1. Check Discord Developer Portal → OAuth2 → Redirects
2. Check Supabase Dashboard → Authentication → URL Configuration
3. Beide müssen exakt matchen (inkl. http/https)

### Problem: "Session not persisting"

**Lösung:**
1. Browser DevTools → Application → Cookies
2. Check ob Supabase Session Cookie da ist
3. Falls blockiert → Cookie Settings im Browser

### Problem: "User not created in public.users"

**Lösung:**
```sql
-- Check if trigger exists
SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';

-- Check if function exists
SELECT * FROM pg_proc WHERE proname = 'handle_new_user';
```

Falls nicht vorhanden → Migration nochmal ausführen

### Problem: "CORS error"

**Lösung:**
1. Check `server/index.js` → `allowedOrigins`
2. Füge deine Frontend URL hinzu
3. Server neu starten

---

## 🎉 FERTIG!

Du hast jetzt:
- ✅ OAuth Login mit Discord, Google, GitHub
- ✅ User Authentication & Session Management
- ✅ Database synced mit Supabase Auth
- ✅ Ready für Premium Features (Stripe später)

**Nächste Schritte:**
1. User Profile Page bauen
2. "Sign in" CTA in Games einbauen
3. Premium Features implementieren
4. Stripe Integration

Viel Erfolg! 🚀
