# GameBuddies.io - Authentication & OAuth Integration Analyse

**Erstellt:** 2025-11-19
**Status:** Produktionsreif für Implementation
**Platform:** React + Node.js + Supabase

---

## 🎯 Executive Summary

GameBuddies.io nutzt aktuell ein **Guest-Only System** - alle User sind temporär. Das gute: **Supabase ist bereits voll integriert** und bietet **built-in OAuth** für Discord, Google, Microsoft, GitHub und viele weitere Provider.

**Keine zusätzlichen NPM Libraries nötig!** Alles was du brauchst:
- ✅ `@supabase/supabase-js` (bereits installiert)
- ✅ Supabase Dashboard Configuration
- ✅ Database Migration (neue Felder in `users` Tabelle)

**Implementation Time:** 2-3 Wochen für vollständige OAuth Integration

---

## 📊 AKTUELLER STAND

### Deine Users Tabelle (IST-Zustand):

```sql
CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  username character varying NOT NULL UNIQUE CHECK (length(username::text) >= 3),
  display_name character varying,
  avatar_url text,
  created_at timestamp with time zone DEFAULT now(),
  last_seen timestamp with time zone DEFAULT now(),
  is_guest boolean DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT users_pkey PRIMARY KEY (id)
);
```

### Was FEHLT für Auth/OAuth:
- ❌ `email` - für Email/Password Login
- ❌ `email_verified` - Email Verification Status
- ❌ `oauth_provider` - Welcher Provider (google, discord, etc.)
- ❌ `oauth_id` - Provider User ID
- ❌ `premium_tier` - free/monthly/lifetime (für Stripe später)
- ❌ `premium_expires_at` - Subscription Ende
- ❌ `stripe_customer_id` - Stripe Integration

### Supabase Integration (IST-Zustand):

✅ **Server** (`server/lib/supabase.js`):
```javascript
const supabase = createClient(supabaseUrl, supabaseAnonKey);
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
```

✅ **Client** (`client/src/utils/supabase.js`):
```javascript
// Holt Config vom Server
const config = await getSupabaseConfig();
supabaseClient = createClient(config.url, config.anonKey);
```

---

## 🔐 SUPABASE BUILT-IN OAUTH

### Unterstützte Provider (2025):

| Provider | Empfohlen für GameBuddies | Setup Schwierigkeit |
|----------|---------------------------|---------------------|
| **Discord** ⭐⭐⭐ | Gaming Community | Einfach |
| **Google** ⭐⭐⭐ | Massentauglich | Sehr einfach |
| **Microsoft** ⭐⭐ | Office 365 Nutzer | Mittel |
| **GitHub** ⭐⭐ | Developer | Einfach |
| **Apple** ⭐ | iOS Users | Komplex |
| **Twitch** ⭐⭐ | Streamer | Einfach |
| **Twitter/X** ⭐ | Optional | Mittel |
| Facebook, Spotify, Slack, etc. | Optional | Variiert |

### Wie Supabase OAuth funktioniert:

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   User      │────1───>│  Supabase   │────2───>│   Discord   │
│   Browser   │<───6────│   Auth      │<───3────│   OAuth     │
└─────────────┘         └─────────────┘         └─────────────┘
                              │
                              │ 4. User in auth.users gespeichert
                              ▼
                        ┌─────────────┐
                        │   Deine     │
                        │ users Tabelle│  (via Trigger/Hook)
                        └─────────────┘
```

**Flow:**
1. User klickt "Login with Discord"
2. Supabase redirected zu Discord OAuth
3. Discord gibt Token zurück an Supabase
4. Supabase erstellt User in `auth.users` (Supabase interne Tabelle)
5. **Du** erstellst entsprechenden Eintrag in `public.users` (via Database Trigger oder Code)
6. User ist eingeloggt, Session Cookie gesetzt

---

## 💻 CODE IMPLEMENTATION

### 1. Database Migration

```sql
-- Migration: Add OAuth fields to users table
ALTER TABLE public.users
  ADD COLUMN email TEXT UNIQUE,
  ADD COLUMN email_verified BOOLEAN DEFAULT false,
  ADD COLUMN oauth_provider TEXT, -- 'google', 'discord', 'github', etc.
  ADD COLUMN oauth_id TEXT, -- Provider's user ID
  ADD COLUMN oauth_metadata JSONB DEFAULT '{}', -- Provider-specific data
  ADD COLUMN premium_tier TEXT DEFAULT 'free' CHECK (premium_tier IN ('free', 'monthly', 'lifetime')),
  ADD COLUMN premium_expires_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN stripe_customer_id TEXT;

-- Index for faster lookups
CREATE INDEX idx_users_email ON public.users(email);
CREATE INDEX idx_users_oauth_provider_id ON public.users(oauth_provider, oauth_id);
CREATE INDEX idx_users_premium_tier ON public.users(premium_tier);

-- Composite unique constraint für OAuth
CREATE UNIQUE INDEX idx_users_oauth_unique ON public.users(oauth_provider, oauth_id)
WHERE oauth_provider IS NOT NULL;
```

### 2. Supabase Dashboard Setup

**Für jeden Provider (z.B. Discord):**

1. Gehe zu [Discord Developer Portal](https://discord.com/developers/applications)
2. Erstelle neue Application
3. OAuth2 → Add Redirect URL: `https://<your-project>.supabase.co/auth/v1/callback`
4. Kopiere Client ID + Client Secret
5. Supabase Dashboard → Authentication → Providers → Discord
6. Enable + Paste Client ID + Secret
7. Fertig!

### 3. Client-Side Login (React)

```javascript
// client/src/components/Auth/LoginButton.jsx
import { getSupabaseClient } from '../../utils/supabase';

export function LoginWithDiscord() {
  const handleLogin = async () => {
    const supabase = await getSupabaseClient();

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: 'identify email' // Discord scopes
      }
    });

    if (error) {
      console.error('Login failed:', error);
      return;
    }

    // User wird zu Discord redirected
    // Nach Success kommt er zurück zu /auth/callback
  };

  return (
    <button onClick={handleLogin} className="discord-login-btn">
      <DiscordIcon /> Login with Discord
    </button>
  );
}

export function LoginWithGoogle() {
  const handleLogin = async () => {
    const supabase = await getSupabaseClient();

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        }
      }
    });

    if (error) {
      console.error('Login failed:', error);
    }
  };

  return (
    <button onClick={handleLogin} className="google-login-btn">
      <GoogleIcon /> Login with Google
    </button>
  );
}
```

### 4. Auth Callback Handler

```javascript
// client/src/pages/AuthCallback.jsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSupabaseClient } from '../utils/supabase';

export function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    handleAuthCallback();
  }, []);

  const handleAuthCallback = async () => {
    const supabase = await getSupabaseClient();

    // Supabase holt Session aus URL hash
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
      console.error('Auth callback error:', error);
      navigate('/login?error=auth_failed');
      return;
    }

    if (session) {
      // User erfolgreich eingeloggt!
      const user = session.user;

      // Erstelle/Update User in deiner public.users Tabelle
      await fetch('/api/auth/sync-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supabase_user_id: user.id,
          email: user.email,
          oauth_provider: user.app_metadata.provider,
          oauth_id: user.user_metadata.provider_id || user.id,
          avatar_url: user.user_metadata.avatar_url,
          display_name: user.user_metadata.full_name || user.user_metadata.name
        })
      });

      navigate('/');
    }
  };

  return <div>Logging in...</div>;
}
```

### 5. Server-Side User Sync

```javascript
// server/routes/auth.js
const express = require('express');
const { supabaseAdmin } = require('../lib/supabase');
const router = express.Router();

// Sync Supabase auth.users -> public.users
router.post('/sync-user', async (req, res) => {
  try {
    const { supabase_user_id, email, oauth_provider, oauth_id, avatar_url, display_name } = req.body;

    // Check if user exists
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (existingUser) {
      // Update existing user
      const { data: updatedUser, error } = await supabaseAdmin
        .from('users')
        .update({
          oauth_provider,
          oauth_id,
          avatar_url,
          display_name: display_name || existingUser.display_name,
          last_seen: new Date().toISOString(),
          is_guest: false,
          email_verified: true
        })
        .eq('id', existingUser.id)
        .select()
        .single();

      if (error) throw error;
      return res.json({ user: updatedUser });
    }

    // Create new user
    const username = email.split('@')[0] + '_' + Math.random().toString(36).substr(2, 5);

    const { data: newUser, error } = await supabaseAdmin
      .from('users')
      .insert({
        id: supabase_user_id, // Use same ID as auth.users
        username,
        email,
        oauth_provider,
        oauth_id,
        avatar_url,
        display_name: display_name || username,
        is_guest: false,
        email_verified: true
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ user: newUser });

  } catch (error) {
    console.error('User sync error:', error);
    res.status(500).json({ error: 'Failed to sync user' });
  }
});

module.exports = router;
```

### 6. Auth Context (React)

```javascript
// client/src/contexts/AuthContext.jsx
import React, { createContext, useContext, useEffect, useState } from 'react';
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

    // Get initial session
    const { data: { session } } = await supabase.auth.getSession();
    setSession(session);

    if (session) {
      await fetchUser(session.user.id);
    }

    setLoading(false);

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event);
        setSession(session);

        if (session) {
          await fetchUser(session.user.id);
        } else {
          setUser(null);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  };

  const fetchUser = async (userId) => {
    try {
      const response = await fetch(`/api/users/${userId}`);
      const data = await response.json();
      setUser(data.user);
    } catch (error) {
      console.error('Failed to fetch user:', error);
    }
  };

  const signOut = async () => {
    const supabase = await getSupabaseClient();
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  const value = {
    user,
    session,
    loading,
    signOut,
    isAuthenticated: !!session,
    isPremium: user?.premium_tier !== 'free'
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
```

### 7. Protected Routes

```javascript
// client/src/components/ProtectedRoute.jsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

// Premium-only route
export function PremiumRoute({ children }) {
  const { isPremium, loading } = useAuth();

  if (loading) return <div>Loading...</div>;
  if (!isPremium) return <Navigate to="/premium" replace />;

  return children;
}
```

---

## 🗺️ IMPLEMENTATION ROADMAP

### Phase 1: Database & Basic Auth (Woche 1)

**Tag 1-2: Database Migration**
- [ ] Backup der Production DB erstellen
- [ ] Migration ausführen (neue Felder in users)
- [ ] Indizes erstellen
- [ ] Testen mit Staging-Daten

**Tag 3-5: Supabase Dashboard Setup**
- [ ] Discord OAuth App erstellen → Credentials holen
- [ ] Google OAuth App erstellen → Credentials holen
- [ ] Supabase Dashboard: Provider aktivieren
- [ ] Redirect URLs konfigurieren
- [ ] Test mit Supabase Auth UI testen

**Tag 6-7: Server-Side Endpoints**
- [ ] `/api/auth/sync-user` Route erstellen
- [ ] `/api/users/:id` GET endpoint
- [ ] Error Handling + Logging
- [ ] Tests schreiben

### Phase 2: Frontend Integration (Woche 2)

**Tag 1-3: Auth Components**
- [ ] LoginButton Component (Discord, Google)
- [ ] AuthCallback Page
- [ ] AuthContext mit useAuth Hook
- [ ] ProtectedRoute Component

**Tag 4-5: UI/UX**
- [ ] Login Page Design
- [ ] User Profile Component
- [ ] Avatar Upload (optional)
- [ ] Settings Page

**Tag 6-7: Integration in bestehende Flows**
- [ ] Guest → Registered User Migration Flow
- [ ] "Sign in to save progress" CTAs
- [ ] Room creation mit Auth
- [ ] Testing auf Staging

### Phase 3: Polish & Production (Woche 3)

**Tag 1-3: Testing**
- [ ] OAuth Flow testen (alle Provider)
- [ ] Session Persistence testen
- [ ] Mobile Testing
- [ ] Error Scenarios (network loss, etc.)

**Tag 4-5: Security Audit**
- [ ] RLS Policies für users Tabelle
- [ ] Rate Limiting auf Auth Endpoints
- [ ] CORS Configuration prüfen
- [ ] Security Headers validieren

**Tag 6-7: Production Deploy**
- [ ] Staging → Production Migration
- [ ] Monitoring Setup (Sentry, etc.)
- [ ] Documentation für Team
- [ ] User Communication (Release Notes)

---

## ⚠️ WICHTIGE PUNKTE

### 1. Supabase Auth vs. Public Users Tabelle

**Supabase hat 2 User-Tabellen:**

| Tabelle | Zweck | Zugriff |
|---------|-------|---------|
| `auth.users` | Supabase interne Auth | Nur via Supabase Auth API |
| `public.users` | Deine App-Daten | Direkter DB Zugriff |

**Du MUSST beide synchron halten!**

**Option A: Database Trigger (Empfohlen)**
```sql
-- Automatisch public.users erstellen wenn auth.users erstellt wird
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, oauth_provider, oauth_id, username, is_guest)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_app_meta_data->>'provider',
    NEW.raw_user_meta_data->>'provider_id',
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    false
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

**Option B: Application Code** (wie oben im /sync-user Endpoint)

### 2. Guest → Registered User Migration

```javascript
// User war Guest, meldet sich jetzt an
async function migrateGuestToRegistered(guestUserId, authUserId) {
  // 1. Update existing guest user
  await supabaseAdmin
    .from('users')
    .update({
      id: authUserId, // Update to match auth.users
      is_guest: false,
      email_verified: true
    })
    .eq('id', guestUserId);

  // 2. Update all references (rooms, room_members, etc.)
  await supabaseAdmin
    .from('rooms')
    .update({ host_id: authUserId })
    .eq('host_id', guestUserId);

  // ... weitere Tabellen
}
```

### 3. Session Management

**Supabase Session Cookie:**
- Automatisch gesetzt bei Login
- 7 Tage Gültigkeit (default)
- Refresh Token für Auto-Renewal
- HttpOnly + Secure Flags

**Eigene Session:**
```javascript
// server/index.js - Middleware
app.use(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return next();

  const token = authHeader.replace('Bearer ', '');

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error) return next();

  req.user = user;
  next();
});
```

### 4. Email/Password Alternative (Optional)

```javascript
// Zusätzlich zu OAuth
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'secure-password',
  options: {
    emailRedirectTo: `${window.location.origin}/auth/callback`,
  }
});
```

### 5. Security Best Practices

```javascript
// ❌ FALSCH
const { data } = await supabase.from('users').select('*'); // Alle User!

// ✅ RICHTIG - Row Level Security
CREATE POLICY "Users can only see their own data"
ON public.users
FOR SELECT
USING (auth.uid() = id);

// Users können eigenes Profil updaten
CREATE POLICY "Users can update own profile"
ON public.users
FOR UPDATE
USING (auth.uid() = id);
```

---

## 🎨 UI/UX EMPFEHLUNGEN

### Login Page Design

```
┌─────────────────────────────────────┐
│                                     │
│        🎮 GameBuddies.io           │
│                                     │
│     Play Games with Friends         │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  🎮 Continue as Guest       │   │
│  └─────────────────────────────┘   │
│                                     │
│         ─── or ───                  │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  🎮 Login with Discord      │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  📧 Login with Google       │   │
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │  🔗 Login with GitHub       │   │
│  └─────────────────────────────┘   │
│                                     │
└─────────────────────────────────────┘
```

**Wichtig:**
- **Guest-Option BEIBEHALTEN** - Keine Forced Registration!
- OAuth Buttons prominent
- Clear Value Proposition: "Save your progress", "Unlock achievements", etc.

### Conversion Triggers

```javascript
// Zeige "Sign up" CTA nach X Spielen als Guest
if (guestGamesPlayed >= 3 && !isAuthenticated) {
  showSignUpBanner({
    title: "Love GameBuddies?",
    message: "Sign up to save your progress and unlock premium features!",
    cta: "Sign Up with Discord"
  });
}
```

---

## 📚 NÜTZLICHE RESOURCES

- [Supabase Auth Docs](https://supabase.com/docs/guides/auth)
- [Social Login Setup](https://supabase.com/docs/guides/auth/social-login)
- [Discord OAuth Guide](https://supabase.com/docs/guides/auth/social-login/auth-discord)
- [Google OAuth Guide](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)

---

## ❓ FAQ

**Q: Brauche ich @supabase/auth-ui-react?**
A: Nein! Seit Feb 2024 nicht mehr maintained. Besser: Eigene Components mit `signInWithOAuth()`.

**Q: Kann ich Email/Password zusätzlich zu OAuth anbieten?**
A: Ja! Supabase unterstützt beides parallel. Einfach `signUp()` / `signInWithPassword()` verwenden.

**Q: Wie handle ich User die sich mit verschiedenen Providern anmelden?**
A: Email als Unique Key verwenden. Wenn `user@example.com` sich erst mit Google anmeldet, dann mit Discord → Merge zu einem User.

**Q: Was passiert mit bestehenden Guest-Sessions bei Migration?**
A: Guest-Daten bleiben erhalten. Bei Anmeldung: Guest → Registered User migrieren (siehe Code oben).

**Q: Wie teste ich OAuth lokal?**
A: Redirect URL auf `http://localhost:3000/auth/callback` setzen im Provider Dashboard. Supabase Dashboard ebenfalls.

**Q: Brauche ich HTTPS für OAuth?**
A: Ja, für Production! Für localhost ist HTTP ok.

---

## ✅ READY TO START?

**Nächste Schritte:**

1. **Database Backup erstellen**
2. **Migration ausführen** (neue Felder)
3. **Discord OAuth App erstellen**
4. **Supabase Provider aktivieren**
5. **LoginButton Component bauen**
6. **Testen!**

Soll ich mit der Implementation beginnen? 🚀
