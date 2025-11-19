# GameBuddies.io Authentication & User Management Analysis

**Generated:** 2025-11-19
**Codebase:** GameBuddies.io (Version 2.1.0)
**Status:** Guest-only system with infrastructure ready for user accounts

---

## Executive Summary

GameBuddies.io currently uses a **guest-only session system** with temporary user profiles created on-the-fly. The codebase has solid foundational infrastructure (Supabase integration, database schema, security headers), but **lacks user authentication, registration, and OAuth integration**. 

The SECURITY_AND_COOKIE_STRATEGY.md document explicitly identifies this as "Phase 1 Complete - Infrastructure Ready for User Accounts" with Phase 3 (User Accounts) planned but not implemented.

---

## 1. Current Supabase Integration

### 1.1 Configuration

**Files:**
- `/home/user/Gamebuddies.Io/server/lib/supabase.js` - Server-side Supabase client
- `/home/user/Gamebuddies.Io/client/src/utils/supabase.js` - Client-side Supabase client

**Server Configuration (supabase.js):**
```javascript
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
```

**Three Supabase clients are initialized:**
1. `supabase` - Anonymous client (for public data)
2. `supabaseAdmin` - Admin client using service role key (for privileged operations)
3. Exported as `db` - DatabaseService class wrapping both

**Client Configuration (browser):**
- Fetches config from `/api/supabase-config` endpoint at runtime
- Uses `SUPABASE_URL` and `SUPABASE_ANON_KEY` only
- Creates client via `createClient(url, anonKey)` with realtime params

### 1.2 Status

✅ **OPERATIONAL** - Supabase is fully integrated for database operations
- Service role key correctly stored server-side
- Anon key exposed only to client (acceptable for public operations)
- Realtime subscriptions enabled for rooms, room_members, player_sessions, game_states, room_events
- RLS (Row Level Security) policies enabled but minimal

⚠️ **MISSING** - No Supabase Auth integration
- No `supabase.auth.*` methods implemented
- No email/password authentication
- No OAuth provider configuration
- No session tokens via Supabase Auth

---

## 2. Existing Authentication Code

### 2.1 Server-Side User Creation (No Authentication)

**Location:** `server/index.js:1794-1799` (createRoom handler)

```javascript
const user = await db.getOrCreateUser(
  `${socket.id}_${playerName}`, // Unique per connection
  playerName,
  playerName
);
```

**How it works:**
1. Client sends `playerName` via WebSocket `createRoom` event
2. Server validates and sanitizes the name
3. Calls `db.getOrCreateUser()` which:
   - Checks if username exists in `users` table
   - If exists: updates `last_seen` timestamp
   - If not: creates new guest user with:
     - `username`: Player's chosen name
     - `display_name`: Player's chosen name
     - `is_guest`: `true` (hardcoded)
     - `metadata`: `{ external_id, created_via: 'api' }`

**Database Schema (users table):**
```sql
CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(50) NOT NULL UNIQUE,
  display_name VARCHAR(100),
  avatar_url TEXT,
  created_at TIMESTAMP,
  last_seen TIMESTAMP,
  is_guest BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}'
);
```

⚠️ **CRITICAL GAPS:**
- No password/email fields
- No authentication method tracking
- No OAuth provider fields
- No account verification
- `is_guest` hardcoded to true
- All users are completely anonymous with no identity verification

### 2.2 Client-Side User Management

**Location:** `client/src/pages/HomePage.js` and `client/src/components/CreateRoom.js`

**Current flow:**
1. User enters name in UI
2. Name is stored in `sessionStorage` (non-persistent)
3. Socket emits `createRoom` with name
4. Server creates temporary user
5. `playerId` (UUID) returned and stored in sessionStorage

**SessionStorage keys used:**
```javascript
gamebuddies_playerName      // Display name (2-20 chars)
gamebuddies_playerId        // UUID from users table
gamebuddies_roomCode        // 6-char room code
gamebuddies_isHost          // Boolean (true/false)
gamebuddies_sessionToken    // Game session token
gamebuddies_returnUrl       // Lobby return URL
gamebuddies:return-session  // Full session object (JSON)
```

⚠️ **CRITICAL GAPS:**
- No persistent user account
- No login/register UI
- No logout functionality
- No password/email collection
- SessionStorage is XSS-vulnerable (acknowledged in SECURITY_AND_COOKIE_STRATEGY.md)
- Session lost on browser close or tab refresh

---

## 3. User Session Management

### 3.1 Session Database Tables

**Three session-related tables exist:**

**1. `player_sessions` table:**
```sql
CREATE TABLE public.player_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  room_id UUID REFERENCES rooms(id),
  session_token VARCHAR(64) NOT NULL UNIQUE,
  socket_id VARCHAR(128),
  status VARCHAR(16) DEFAULT 'active' -- 'active', 'expired', 'revoked'
  last_heartbeat TIMESTAMP,
  metadata JSONB,
  created_at TIMESTAMP,
  expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '24 hours'
);
```

**2. `game_sessions` table:**
```sql
CREATE TABLE public.game_sessions (
  id UUID PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES rooms(id),
  game_id VARCHAR(50) NOT NULL REFERENCES games(id),
  status VARCHAR(20) DEFAULT 'active',
  participants JSONB NOT NULL DEFAULT '[]',
  game_state JSONB DEFAULT '{}',
  game_result JSONB,
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  metadata JSONB
);
```

**3. `player_status_history` table:**
```sql
CREATE TABLE public.player_status_history (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  room_id UUID NOT NULL,
  old_location VARCHAR(16),
  new_location VARCHAR(16),
  old_status VARCHAR(16),
  new_status VARCHAR(16),
  reason TEXT,
  metadata JSONB,
  created_at TIMESTAMP
);
```

### 3.2 Session Token Generation

**Location:** `server/lib/lobbyManager.js:388-404`

```javascript
async createPlayerSession(playerId, roomId, socketId) {
  const sessionToken = crypto.randomBytes(32).toString('hex');
  
  const { data: session } = await this.db.adminClient
    .from('player_sessions')
    .upsert({
      user_id: playerId,
      room_id: roomId,
      session_token: sessionToken,
      socket_id: socketId,
      status: 'active',
      last_heartbeat: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    }, {
      onConflict: 'user_id, room_id'
    })
    .select()
    .single();
    
  return sessionToken;
}
```

### 3.3 Session Recovery

**Location:** `client/src/pages/HomePage.js:189-230` and `server/index.js:3438-3501`

**Client-side session recovery:**
- Attempts to recover session if URL has `sessionToken` param
- Calls `/api/v2/game/sessions/recover` with token
- Server validates token and reconnects player to room

**Server-side recovery endpoint:**
```javascript
app.get('/api/game-sessions/:token', async (req, res) => {
  // Look up session token in database
  const { data: session } = await db.adminClient
    .from('game_sessions')
    .select('*')
    .eq('session_token', token)
    .single();
    
  if (session) {
    res.json({
      roomCode: session.room_code,
      gameType: session.game_type,
      playerId: session.player_id,
      expiresAt: session.expires_at
    });
  }
});
```

### 3.4 Session Expiration & Cleanup

**Cleanup function exists:** `server/migrations/001_add_v2_tables.sql:174-185`

```javascript
CREATE OR REPLACE FUNCTION public.cleanup_expired_sessions()
RETURNS INTEGER AS $$
BEGIN
    DELETE FROM public.player_sessions 
    WHERE expires_at < NOW() OR status IN ('expired', 'revoked');
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    INSERT INTO public.connection_metrics (...)
    VALUES ('sessions_cleaned', deleted_count, ...);
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
```

**Scheduled via pg_cron:**
```sql
SELECT cron.schedule('cleanup-expired-sessions', '0 * * * *', 
    'SELECT public.cleanup_expired_sessions();');
```

⚠️ **GAPS:**
- Session tokens are 64-char hex strings (not JWTs)
- No refresh token mechanism
- 24-hour fixed expiration (not configurable per-session)
- No device tracking
- No multi-session support per user
- Sessions not validated on every API call

---

## 4. Cookie & Token Handling

### 4.1 Cookie Management Utility

**Location:** `server/lib/secureCookies.js`

**Available functions:**
```javascript
setSecureCookie(res, name, value, options)
setSessionToken(res, sessionToken)     // Sets 'gb_session_token' cookie
setPlayerId(res, playerId)             // Sets 'gb_player_id' cookie
clearCookie(res, name)
clearSessionCookies(res)
getCookie(req, name)
getSessionToken(req)                   // Gets 'gb_session_token' cookie
getPlayerId(req)                       // Gets 'gb_player_id' cookie
```

**Cookie Configuration:**
```javascript
const COOKIE_OPTIONS = {
  httpOnly: true,                    // Cannot be accessed by JavaScript
  secure: NODE_ENV === 'production', // HTTPS only in production
  sameSite: 'lax',                   // CSRF protection
  maxAge: 3 * 60 * 60 * 1000,        // 3 hours
  path: '/'
};
```

### 4.2 Current Cookie Usage

**Status:** ✅ **Infrastructure ready, NOT actively used for auth**

- Cookie parsing enabled in Express: `app.use(cookieParser())`
- Utility functions exist but **not called anywhere in the codebase**
- No authentication middleware that validates cookies
- No cookie-based session validation

### 4.3 Token Handling

**Current token types:**
1. **Session tokens** (game_sessions): 64-char hex strings, non-standard
2. **No JWT implementation** despite `jsonwebtoken` package installed
3. **No Bearer tokens** in API requests
4. **No Authorization header** validation

**Validation method:** None implemented
- Tokens not validated on API calls
- No token refresh mechanism
- No token revocation list

---

## 5. Database Schema for Users

### 5.1 Users Table

**File:** `SUPABASE_COMPLETE_SCHEMA_SETUP.sql:16-29`

```sql
CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(50) NOT NULL UNIQUE,
  display_name VARCHAR(100),
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_guest BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  
  CONSTRAINT username_length CHECK (length(username) >= 3),
  CONSTRAINT username_format CHECK (username ~ '^[a-zA-Z0-9_-]+$')
);

CREATE INDEX idx_users_username ON public.users(username);
CREATE INDEX idx_users_last_seen ON public.users(last_seen DESC);
CREATE INDEX idx_users_is_guest ON public.users(is_guest);
```

### 5.2 Related Tables

**Room Members** - Track user participation:
```sql
CREATE TABLE public.room_members (
  id UUID PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES users(id),
  user_id UUID NOT NULL REFERENCES users(id),
  role VARCHAR(20) DEFAULT 'player',  -- 'host', 'player', 'spectator'
  is_connected BOOLEAN DEFAULT true,
  socket_id VARCHAR(128),
  is_ready BOOLEAN DEFAULT false,
  current_location VARCHAR(16) DEFAULT 'lobby',
  joined_at TIMESTAMP,
  left_at TIMESTAMP,
  
  CONSTRAINT unique_user_per_room UNIQUE(room_id, user_id)
);
```

**Rooms** - User-created game sessions:
```sql
CREATE TABLE public.rooms (
  id UUID PRIMARY KEY,
  room_code VARCHAR(6) NOT NULL UNIQUE,
  host_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'lobby',
  current_game VARCHAR(50) REFERENCES games(id),
  max_players INTEGER DEFAULT 10,
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  last_activity TIMESTAMP,
  metadata JSONB DEFAULT '{}'
);
```

### 5.3 Missing Fields for Real User Accounts

❌ **Not in users table:**
- `email` - Email address for authentication
- `email_verified` - Email verification status
- `password_hash` - For password-based auth
- `phone` - For SMS-based auth
- `phone_verified` - Phone verification status
- `auth_provider` - Which OAuth provider (google, github, etc.)
- `oauth_id` - External OAuth provider ID
- `oauth_metadata` - OAuth profile data
- `two_factor_enabled` - MFA support
- `two_factor_secret` - TOTP secret
- `updated_at` - Track profile changes
- `deleted_at` - Soft delete support
- `settings` - User preferences (JSON)
- `roles` - User roles (admin, moderator, etc.)

---

## 6. Missing OAuth Implementation

### 6.1 OAuth Providers Not Configured

**Status:** ❌ **No OAuth provider configuration exists**

**Missing:**
1. **Google OAuth**
   - No client ID/secret
   - No `@react-oauth/google` or similar library
   - No Supabase Google provider setup
   - No redirect URI handling

2. **GitHub OAuth**
   - No client ID/secret
   - No GitHub OAuth app registration
   - No Supabase GitHub provider configuration
   - No callback endpoint

3. **Discord OAuth** (popular for gaming)
   - Not configured
   - No library installed

4. **Twitch OAuth** (for streamers)
   - Not configured
   - No library installed

### 6.2 Missing OAuth Endpoints

**Required but not implemented:**
```javascript
// OAuth initiation
POST /api/auth/oauth/:provider/authorize
  -> Redirect to provider, store state token

// OAuth callback
GET /callback/:provider
  -> Handle provider redirect, exchange code for token

// Session validation
GET /api/auth/me
  -> Return current user from auth token

// Logout
POST /api/auth/logout
  -> Clear auth cookies, revoke token

// Token refresh
POST /api/auth/refresh
  -> Exchange refresh token for new access token

// User profile
GET /api/auth/profile
  -> Return authenticated user profile
POST /api/auth/profile
  -> Update user profile
```

### 6.3 Missing Client-Side OAuth Code

**Required but not implemented:**

1. **Authentication Context Provider**
   ```javascript
   // No AuthContext or AuthProvider exists
   // Should provide: isAuthenticated, user, login(), logout(), register()
   ```

2. **Login/Register Components**
   ```javascript
   // No Login.js component
   // No Register.js component
   // No OAuth button components
   // No password reset flow
   ```

3. **Protected Routes**
   ```javascript
   // No PrivateRoute component
   // No route protection middleware
   ```

4. **OAuth Integration Libraries**
   - No `@react-oauth/google` installed
   - No `@supabase/gotrue-js` used (only basic supabase-js)
   - No OAuth popup/redirect handling

---

## 7. What's Currently Working Well

✅ **Strengths of current implementation:**

1. **Solid Database Foundation**
   - Comprehensive schema with 12+ tables
   - Proper foreign keys and constraints
   - Good index coverage
   - RLS policies exist (though minimal)

2. **Supabase Integration**
   - Both anon and service keys configured correctly
   - Two-tier client approach (anon + admin)
   - Real-time subscriptions enabled
   - Database functions for common operations

3. **Security Measures**
   - CORS properly configured
   - Helmet security headers enabled
   - Rate limiting implemented
   - Input validation with Joi schemas
   - Cookie infrastructure ready

4. **Session Infrastructure**
   - Session tokens generated (though not JWT)
   - Session storage tables in database
   - Expiration and cleanup mechanisms
   - Session recovery capability

5. **Room Management**
   - Robust room creation, joining, host transfer
   - Participant tracking
   - Connection status monitoring
   - Audit trail (room_events table)

---

## 8. Critical Missing Components

❌ **What must be implemented for OAuth:**

### 8.1 Authentication Layer
```
MISSING:
- Email/password auth
- OAuth provider integration
- JWT token generation and validation
- Refresh token mechanism
- CSRF token generation
- Email verification flow
- Password reset flow
- Account recovery
```

### 8.2 User Management
```
MISSING:
- User registration endpoint
- User profile management
- Email/password change
- Account deletion
- User preferences
- Admin user management
- User roles/permissions
```

### 8.3 Client Components
```
MISSING:
- AuthContext provider
- Login component
- Register component
- OAuth button component
- Profile page
- Account settings page
- Logout functionality
- Session persistence
```

### 8.4 Security
```
MISSING:
- CSRF tokens
- Account lockout after failed attempts
- Email verification
- Password strength requirements
- Session invalidation on logout
- Rate limiting on auth endpoints
- IP-based anomaly detection
- 2FA support
```

---

## 9. Implementation Roadmap

### Phase 1: Backend Infrastructure ✅ (DONE)
- [x] Supabase setup
- [x] Database schema
- [x] Room management
- [x] Session tables
- [x] Cookie utilities
- [x] Security headers

### Phase 2: User Account System (TODO)

**2.1 Database Updates (1-2 days)**
- [ ] Add auth fields to users table:
  - email, password_hash, email_verified
  - auth_provider, oauth_id, oauth_metadata
  - updated_at, deleted_at, settings
  
- [ ] Create auth-related tables:
  - email_verifications
  - password_resets
  - oauth_accounts
  - user_sessions (for multiple device sessions)
  - audit_log (for security events)

**2.2 Authentication Endpoint** (2-3 days)
- [ ] Email/password signup
- [ ] Email/password login  
- [ ] Email verification
- [ ] Password reset flow
- [ ] OAuth provider configuration
- [ ] OAuth callback handler
- [ ] JWT generation/validation

**2.3 User Management** (1-2 days)
- [ ] Profile retrieval
- [ ] Profile update
- [ ] Password change
- [ ] Account deletion
- [ ] Session listing
- [ ] Session revocation

### Phase 3: Frontend Components (TODO)

**3.1 Auth Pages** (2-3 days)
- [ ] Login page with OAuth buttons
- [ ] Register page
- [ ] Email verification page
- [ ] Password reset page
- [ ] Profile/settings page

**3.2 Auth Context & Hooks** (1-2 days)
- [ ] AuthProvider context
- [ ] useAuth hook
- [ ] ProtectedRoute component
- [ ] Session persistence

**3.3 Integration** (1-2 days)
- [ ] Update header to show auth state
- [ ] Conditional rendering based on auth
- [ ] Logout functionality
- [ ] Remember me / device trust

### Phase 4: OAuth Providers (TODO)

**4.1 Google OAuth**
- [ ] Register OAuth app
- [ ] Frontend Google button
- [ ] Backend callback handler
- [ ] User linking

**4.2 GitHub OAuth**
- [ ] Register OAuth app
- [ ] Frontend GitHub button
- [ ] Backend callback handler
- [ ] User linking

**4.3 Discord OAuth** (for gaming community)
- [ ] Register OAuth app
- [ ] Frontend Discord button
- [ ] Backend callback handler
- [ ] User linking

### Phase 5: Advanced Features (TODO)

**5.1 Account Security**
- [ ] 2FA (TOTP, SMS)
- [ ] Account recovery
- [ ] Device management
- [ ] Login history

**5.2 User Profiles**
- [ ] Avatar upload
- [ ] Bio/description
- [ ] Achievement tracking
- [ ] Social features

---

## 10. Detailed Implementation Guide

### 10.1 Database Schema Update

**Add to users table:**

```sql
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(50);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS oauth_id VARCHAR(255);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS oauth_metadata JSONB DEFAULT '{}';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';

-- Unique constraint on email (nullable for guests)
ALTER TABLE public.users ADD CONSTRAINT unique_email_if_not_null 
  UNIQUE (email) WHERE email IS NOT NULL;

-- Indexes for auth
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_oauth_id ON public.users(oauth_id) WHERE oauth_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_auth_provider ON public.users(auth_provider);
```

**Create new tables:**

```sql
-- Email verification tokens
CREATE TABLE IF NOT EXISTS email_verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '24 hours',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Password reset tokens
CREATE TABLE IF NOT EXISTS password_resets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '1 hour',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- OAuth account linkage
CREATE TABLE IF NOT EXISTS oauth_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  provider_id VARCHAR(255) NOT NULL,
  provider_email VARCHAR(255),
  provider_data JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(provider, provider_id)
);

-- User sessions (for tracking multiple logins)
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_name VARCHAR(255),
  device_os VARCHAR(50),
  ip_address INET,
  user_agent TEXT,
  access_token VARCHAR(512),
  refresh_token VARCHAR(512) UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '7 days',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  revoked_at TIMESTAMP WITH TIME ZONE
);

-- Security audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL,
  resource_type VARCHAR(50),
  resource_id VARCHAR(255),
  details JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_email_verifications_user ON email_verifications(user_id);
CREATE INDEX idx_email_verifications_token ON email_verifications(token);
CREATE INDEX idx_password_resets_user ON password_resets(user_id);
CREATE INDEX idx_password_resets_token ON password_resets(token);
CREATE INDEX idx_oauth_accounts_user ON oauth_accounts(user_id);
CREATE INDEX idx_oauth_accounts_provider ON oauth_accounts(provider, provider_id);
CREATE INDEX idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_refresh_token ON user_sessions(refresh_token);
CREATE INDEX idx_user_sessions_expires ON user_sessions(expires_at);
CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_created ON audit_log(created_at DESC);
```

### 10.2 Auth Endpoint Example

**File: `server/routes/auth.js`** (New)

```javascript
const express = require('express');
const jwt = require('jsonwebtoken');
const bcryptjs = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const { db } = require('../lib/supabase');
const { setSessionToken, clearSessionCookies } = require('../lib/secureCookies');

// Register with email/password
router.post('/register', async (req, res) => {
  try {
    const { email, username, password, password_confirm } = req.body;

    // Validate
    if (!email || !username || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (password !== password_confirm) {
      return res.status(400).json({ error: 'Passwords do not match' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Check if email exists
    const { data: existing } = await db.adminClient
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Hash password
    const passwordHash = await bcryptjs.hash(password, 10);

    // Create user
    const { data: user, error } = await db.adminClient
      .from('users')
      .insert({
        username,
        display_name: username,
        email,
        password_hash: passwordHash,
        auth_provider: 'email',
        is_guest: false
      })
      .select()
      .single();

    if (error) throw error;

    // Generate JWT
    const token = jwt.sign(
      { user_id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    setSessionToken(res, token);

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login with email/password
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Find user
    const { data: user } = await db.adminClient
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const valid = await bcryptjs.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT
    const token = jwt.sign(
      { user_id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    setSessionToken(res, token);

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// OAuth callback (Google example)
router.post('/oauth/google', async (req, res) => {
  try {
    const { idToken } = req.body;

    // Verify ID token with Google
    const ticket = await google.auth.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const { sub: googleId, email, name, picture } = ticket.getPayload();

    // Find or create user
    let { data: user } = await db.adminClient
      .from('users')
      .select('*')
      .eq('oauth_id', googleId)
      .single();

    if (!user) {
      // Create new user
      const { data: newUser } = await db.adminClient
        .from('users')
        .insert({
          email,
          username: name,
          display_name: name,
          avatar_url: picture,
          auth_provider: 'google',
          oauth_id: googleId,
          oauth_metadata: { email, name, picture },
          is_guest: false
        })
        .select()
        .single();

      user = newUser;
    }

    // Generate JWT
    const token = jwt.sign(
      { user_id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    setSessionToken(res, token);

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username
      }
    });
  } catch (error) {
    console.error('Google OAuth error:', error);
    res.status(500).json({ error: 'OAuth failed' });
  }
});

// Logout
router.post('/logout', (req, res) => {
  clearSessionCookies(res);
  res.json({ success: true });
});

module.exports = router;
```

### 10.3 Authentication Middleware

**File: `server/middleware/auth.js`** (New)

```javascript
const jwt = require('jsonwebtoken');
const { getSessionToken } = require('../lib/secureCookies');

function authMiddleware(req, res, next) {
  try {
    // Get token from cookie
    const token = getSessionToken(req);

    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Verify JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = authMiddleware;
```

---

## 11. Security Considerations

### 11.1 Password Storage
- ✅ Use bcryptjs for hashing (already installed)
- ✅ Minimum 8 characters recommended
- ✅ Store hash, never plaintext
- ⚠️ Implement strength requirements (uppercase, numbers, symbols)

### 11.2 Token Management
- ✅ Use JWTs for stateless auth
- ✅ Short expiration (7 days recommended)
- ⚠️ Implement refresh token rotation
- ⚠️ Store refresh tokens server-side (database)
- ⚠️ Revoke tokens on logout

### 11.3 OAuth Security
- ⚠️ Validate state parameter to prevent CSRF
- ⚠️ Verify ID tokens with provider
- ⚠️ Store OAuth metadata, not OAuth tokens
- ⚠️ Don't expose OAuth tokens to client

### 11.4 Session Management
- ✅ HttpOnly cookies for auth tokens
- ✅ SameSite=lax for CSRF protection
- ⚠️ Track multiple sessions per user
- ⚠️ Allow logout from all devices
- ⚠️ Suspicious login detection

---

## 12. Summary Table

| Component | Status | Completeness | Priority |
|-----------|--------|--------------|----------|
| **Database Schema** | ✅ Exists | 70% | Medium |
| **Supabase Integration** | ✅ Configured | 100% | - |
| **Session Management** | ⚠️ Partial | 50% | High |
| **User Creation** | ✅ Guest only | 30% | Critical |
| **Authentication** | ❌ Missing | 0% | Critical |
| **OAuth Providers** | ❌ Missing | 0% | High |
| **Cookie Management** | ✅ Ready | 100% | - |
| **Security Headers** | ✅ Configured | 100% | - |
| **Rate Limiting** | ✅ Configured | 100% | - |
| **Input Validation** | ✅ Configured | 100% | - |
| **Client Auth UI** | ❌ Missing | 0% | Critical |
| **Auth Context** | ❌ Missing | 0% | High |
| **Protected Routes** | ❌ Missing | 0% | High |

---

## 13. Next Steps Recommendation

**Week 1-2: Database & Backend**
1. Run migration to add auth fields
2. Implement JWT-based auth endpoints
3. Add auth middleware to protected routes
4. Implement email/password signup & login
5. Add session token validation

**Week 3: OAuth Integration**
6. Register Google OAuth app
7. Implement Google OAuth callback
8. Add GitHub/Discord OAuth (optional)
9. Test OAuth flow end-to-end

**Week 4: Frontend**
10. Create AuthContext provider
11. Build Login/Register components
12. Add OAuth buttons
13. Implement protected routes
14. Update UI to show auth state

**Week 5: Polish & Security**
15. Add email verification
16. Implement password reset
17. Add account settings page
18. Security audit & testing
19. Deploy to staging

---

## Files Referenced

**Server:**
- `/home/user/Gamebuddies.Io/server/lib/supabase.js`
- `/home/user/Gamebuddies.Io/server/lib/secureCookies.js`
- `/home/user/Gamebuddies.Io/server/index.js`
- `/home/user/Gamebuddies.Io/server/lib/lobbyManager.js`
- `/home/user/Gamebuddies.Io/server/package.json`

**Client:**
- `/home/user/Gamebuddies.Io/client/src/utils/supabase.js`
- `/home/user/Gamebuddies.Io/client/src/pages/HomePage.js`
- `/home/user/Gamebuddies.Io/client/src/components/CreateRoom.js`
- `/home/user/Gamebuddies.Io/client/src/components/JoinRoom.js`
- `/home/user/Gamebuddies.Io/client/src/App.js`

**Database:**
- `/home/user/Gamebuddies.Io/SUPABASE_COMPLETE_SCHEMA_SETUP.sql`
- `/home/user/Gamebuddies.Io/SECURITY_AND_COOKIE_STRATEGY.md`

**Environment:**
- `/home/user/Gamebuddies.Io/client/.env.example`

