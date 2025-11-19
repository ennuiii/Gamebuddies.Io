# GameBuddies.io - Auth Implementation Quick Reference

**Für schnelle Referenz während der Entwicklung**

---

## 🚀 SCHNELLSTART

### 1-Minute Setup Checklist

```bash
# 1. Database Migration
psql -d gamebuddies -f migrations/add_auth_fields.sql

# 2. OAuth Apps erstellen
# Discord: https://discord.com/developers/applications
# Google: https://console.cloud.google.com/apis/credentials

# 3. Supabase Dashboard konfigurieren
# https://<your-project>.supabase.co/project/_/auth/providers

# 4. Code implementieren (siehe unten)
```

---

## 📋 DATABASE MIGRATION

### Kopiere & Füge ein (Supabase SQL Editor):

```sql
-- Add OAuth & Premium fields to users table
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS oauth_provider TEXT,
  ADD COLUMN IF NOT EXISTS oauth_id TEXT,
  ADD COLUMN IF NOT EXISTS oauth_metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS premium_tier TEXT DEFAULT 'free'
    CHECK (premium_tier IN ('free', 'monthly', 'lifetime')),
  ADD COLUMN IF NOT EXISTS premium_expires_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- Indizes für Performance
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_oauth_provider_id ON public.users(oauth_provider, oauth_id);
CREATE INDEX IF NOT EXISTS idx_users_premium_tier ON public.users(premium_tier);

-- Unique Constraint für OAuth Provider + ID
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_oauth_unique ON public.users(oauth_provider, oauth_id)
WHERE oauth_provider IS NOT NULL;

-- Database Trigger für auto-sync mit auth.users
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

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

---

## 🔐 OAUTH PROVIDER SETUP

### Discord

1. **Discord Developer Portal:** https://discord.com/developers/applications
2. **New Application** → Name: "GameBuddies"
3. **OAuth2** → Redirects → Add:
   ```
   https://<your-project>.supabase.co/auth/v1/callback
   http://localhost:3000/auth/callback (für local dev)
   ```
4. **Copy:** Client ID + Client Secret
5. **Supabase Dashboard:**
   - Authentication → Providers → Discord
   - Enable + Paste Credentials
   - Scopes: `identify email`

### Google

1. **Google Cloud Console:** https://console.cloud.google.com/apis/credentials
2. **Create Project** → "GameBuddies"
3. **OAuth consent screen** → External → Fill out
4. **Credentials** → Create OAuth 2.0 Client ID → Web application
5. **Authorized redirect URIs:**
   ```
   https://<your-project>.supabase.co/auth/v1/callback
   http://localhost:3000/auth/callback
   ```
6. **Copy:** Client ID + Client Secret
7. **Supabase Dashboard:**
   - Authentication → Providers → Google
   - Enable + Paste Credentials

### GitHub

1. **GitHub:** https://github.com/settings/developers
2. **New OAuth App**
3. **Authorization callback URL:**
   ```
   https://<your-project>.supabase.co/auth/v1/callback
   ```
4. **Copy:** Client ID + Client Secret
5. **Supabase Dashboard:**
   - Authentication → Providers → GitHub
   - Enable + Paste Credentials

---

## 💻 CODE SNIPPETS

### Login Button Component

```javascript
// client/src/components/Auth/OAuthButtons.jsx
import { getSupabaseClient } from '../../utils/supabase';

const OAuthButtons = () => {
  const handleOAuthLogin = async (provider) => {
    const supabase = await getSupabaseClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    });
    if (error) console.error(error);
  };

  return (
    <div className="oauth-buttons">
      <button onClick={() => handleOAuthLogin('discord')}>
        Login with Discord
      </button>
      <button onClick={() => handleOAuthLogin('google')}>
        Login with Google
      </button>
      <button onClick={() => handleOAuthLogin('github')}>
        Login with GitHub
      </button>
    </div>
  );
};

export default OAuthButtons;
```

### Auth Callback Page

```javascript
// client/src/pages/AuthCallback.jsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSupabaseClient } from '../utils/supabase';

const AuthCallback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    handleCallback();
  }, []);

  const handleCallback = async () => {
    const supabase = await getSupabaseClient();
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error || !session) {
      navigate('/login?error=auth_failed');
      return;
    }

    // Sync user to public.users (optional if using trigger)
    await fetch('/api/auth/sync-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supabase_user_id: session.user.id,
        email: session.user.email,
        oauth_provider: session.user.app_metadata.provider,
        oauth_id: session.user.user_metadata.provider_id || session.user.id,
        avatar_url: session.user.user_metadata.avatar_url,
        display_name: session.user.user_metadata.full_name || session.user.user_metadata.name
      })
    });

    navigate('/');
  };

  return <div>Logging in...</div>;
};

export default AuthCallback;
```

### Server Auth Sync Endpoint

```javascript
// server/routes/auth.js
const express = require('express');
const { supabaseAdmin } = require('../lib/supabase');
const router = express.Router();

router.post('/sync-user', async (req, res) => {
  try {
    const { supabase_user_id, email, oauth_provider, oauth_id, avatar_url, display_name } = req.body;

    // Upsert user
    const { data, error } = await supabaseAdmin
      .from('users')
      .upsert({
        id: supabase_user_id,
        username: email.split('@')[0] + '_' + Math.random().toString(36).substr(2, 5),
        email,
        oauth_provider,
        oauth_id,
        avatar_url,
        display_name,
        is_guest: false,
        email_verified: true,
        last_seen: new Date().toISOString()
      }, {
        onConflict: 'id'
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ user: data });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

// In server/index.js:
// app.use('/api/auth', require('./routes/auth'));
```

### Auth Context

```javascript
// client/src/contexts/AuthContext.jsx
import { createContext, useContext, useEffect, useState } from 'react';
import { getSupabaseClient } from '../utils/supabase';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    initAuth();
  }, []);

  const initAuth = async () => {
    const supabase = await getSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();
    setSession(session);
    if (session) await fetchUser(session.user.id);
    setLoading(false);

    supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      if (session) await fetchUser(session.user.id);
      else setUser(null);
    });
  };

  const fetchUser = async (userId) => {
    const res = await fetch(`/api/users/${userId}`);
    const data = await res.json();
    setUser(data.user);
  };

  const signOut = async () => {
    const supabase = await getSupabaseClient();
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      loading,
      signOut,
      isAuthenticated: !!session,
      isPremium: user?.premium_tier !== 'free'
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
```

### Protected Route

```javascript
// client/src/components/ProtectedRoute.jsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div>Loading...</div>;
  return isAuthenticated ? children : <Navigate to="/login" />;
};
```

---

## 🧪 TESTING

### Local OAuth Testing

1. **Redirect URLs:**
   ```
   http://localhost:3000/auth/callback
   ```

2. **Start Dev Server:**
   ```bash
   cd client && npm start  # Port 3000
   cd server && npm run dev  # Port 5000
   ```

3. **Test Flow:**
   - Navigate to `http://localhost:3000/login`
   - Click "Login with Discord"
   - Should redirect to Discord
   - After auth, redirect to `http://localhost:3000/auth/callback`
   - Then to `http://localhost:3000/`

### Debug Checklist

```javascript
// Check if Supabase client is initialized
const supabase = await getSupabaseClient();
console.log('Supabase client:', supabase);

// Check session
const { data: { session } } = await supabase.auth.getSession();
console.log('Current session:', session);

// Check user
const { data: { user } } = await supabase.auth.getUser();
console.log('Current user:', user);

// Check if provider is enabled
// Go to Supabase Dashboard → Authentication → Providers
```

### Common Errors

| Error | Lösung |
|-------|--------|
| `Invalid redirect URL` | Redirect URL in Provider Dashboard + Supabase Dashboard matchen |
| `No session found` | Session Cookie blockiert? Check Browser DevTools → Application → Cookies |
| `Provider not enabled` | Supabase Dashboard → Authentication → Providers → Enable |
| `User not created in public.users` | Database Trigger läuft? Oder `/sync-user` endpoint fehlt? |

---

## 🔧 ENVIRONMENT VARIABLES

### Server (.env)

```bash
# Supabase (bereits vorhanden)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...

# Session Secret (für eigene Sessions, optional)
SESSION_SECRET=your-random-secret-here

# Production URLs
FRONTEND_URL=https://gamebuddies.io
BACKEND_URL=https://api.gamebuddies.io
```

### Client (.env)

```bash
# Wird vom Server geholt via /api/supabase-config
# Keine zusätzlichen Variablen nötig!
```

---

## 📱 FRONTEND INTEGRATION

### App.js Setup

```javascript
// client/src/App.js
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import AuthCallback from './pages/AuthCallback';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/profile" element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          } />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
```

### User Info anzeigen

```javascript
// Irgendwo in deiner App
import { useAuth } from '../contexts/AuthContext';

function UserProfile() {
  const { user, isAuthenticated, signOut } = useAuth();

  if (!isAuthenticated) {
    return <a href="/login">Login</a>;
  }

  return (
    <div>
      <img src={user.avatar_url} alt="Avatar" />
      <p>{user.display_name}</p>
      <p>{user.email}</p>
      {user.premium_tier !== 'free' && <span>⭐ Premium</span>}
      <button onClick={signOut}>Logout</button>
    </div>
  );
}
```

---

## 🎯 PRODUCTION DEPLOYMENT

### Pre-Deploy Checklist

- [ ] Database Migration ausgeführt
- [ ] OAuth Apps haben Production URLs
- [ ] Supabase Providers konfiguriert mit Production Credentials
- [ ] Environment Variables gesetzt
- [ ] RLS Policies aktiviert
- [ ] Rate Limiting auf Auth Endpoints
- [ ] Error Monitoring (Sentry)
- [ ] HTTPS aktiviert
- [ ] CORS richtig konfiguriert
- [ ] Session Cookies: `secure: true, sameSite: 'lax'`

### Rollback Plan

```sql
-- Falls etwas schief geht, neue Felder entfernen:
ALTER TABLE public.users
  DROP COLUMN IF EXISTS email,
  DROP COLUMN IF EXISTS email_verified,
  DROP COLUMN IF EXISTS oauth_provider,
  DROP COLUMN IF EXISTS oauth_id,
  DROP COLUMN IF EXISTS oauth_metadata,
  DROP COLUMN IF EXISTS premium_tier,
  DROP COLUMN IF EXISTS premium_expires_at,
  DROP COLUMN IF EXISTS stripe_customer_id;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
```

---

## 🔒 SECURITY CHECKLIST

### Row Level Security (RLS)

```sql
-- Enable RLS on users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Users can only read their own data
CREATE POLICY "Users can view own profile"
ON public.users
FOR SELECT
USING (auth.uid() = id);

-- Users can only update their own data
CREATE POLICY "Users can update own profile"
ON public.users
FOR UPDATE
USING (auth.uid() = id);

-- Admins can see everything (optional)
CREATE POLICY "Admins can view all users"
ON public.users
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
    AND metadata->>'role' = 'admin'
  )
);
```

### Rate Limiting

```javascript
// server/index.js
const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: 'Too many login attempts, please try again later.'
});

app.use('/api/auth', authLimiter);
```

---

## 🆘 TROUBLESHOOTING

### "OAuth redirect mismatch"

**Problem:** Redirect URL stimmt nicht überein
**Lösung:**
1. Check Provider Dashboard (Discord/Google)
2. Check Supabase Dashboard → Authentication → URL Configuration
3. Beide müssen exakt matchen (inkl. http/https)

### "Session not persisting"

**Problem:** User wird ausgeloggt bei Reload
**Lösung:**
1. Check Browser Cookies (DevTools → Application → Cookies)
2. Supabase Session Cookie muss da sein
3. Falls blockiert: Cookie Settings im Browser
4. `sameSite: 'lax'` in Cookie Config

### "User not created in public.users"

**Problem:** Login klappt, aber kein User in DB
**Lösung:**
1. Check Database Trigger: `SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';`
2. Falls Trigger fehlt: Siehe "Database Migration" oben
3. Alternativ: `/api/auth/sync-user` Endpoint nutzen

### "Provider token expired"

**Problem:** OAuth Token abgelaufen
**Lösung:**
```javascript
const { data: { session }, error } = await supabase.auth.refreshSession();
```

---

## 📊 MONITORING

### Logs to Watch

```javascript
// Client
console.log('Auth state changed:', event); // In AuthContext
console.log('Current session:', session);

// Server
console.log('User synced:', user.id);
console.log('OAuth provider:', oauth_provider);
```

### Metrics to Track

- Login Success Rate
- OAuth Provider Distribution (Discord vs Google vs GitHub)
- Session Duration
- Guest → Registered Conversion Rate
- Auth Errors (per provider)

---

## 🚀 NEXT STEPS

Nach erfolgreichem Auth Setup:

1. **Stripe Integration** (Premium Features)
2. **User Profile Page** (Avatar Upload, Settings)
3. **Email Notifications** (Supabase Edge Functions)
4. **Social Features** (Friends, Leaderboards)
5. **Admin Dashboard** (User Management)

---

**Good luck! 🎮**
