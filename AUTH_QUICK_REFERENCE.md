# GameBuddies Authentication - Quick Reference

## Current State (November 2025)

```
✅ READY: Database, Supabase, Security Infrastructure
❌ MISSING: Authentication, OAuth, User Management UI
⚠️ PARTIAL: Session Management (Game Sessions Only)
```

---

## Key Files to Know

### Backend
| File | Purpose | Status |
|------|---------|--------|
| `server/lib/supabase.js` | Supabase client initialization | ✅ Complete |
| `server/lib/secureCookies.js` | Cookie utility functions | ✅ Ready (unused) |
| `server/index.js` (lines 1764-2100) | Socket.io room/join handlers | ✅ Has user creation |
| `SUPABASE_COMPLETE_SCHEMA_SETUP.sql` | Full database schema | ✅ Complete |
| `SECURITY_AND_COOKIE_STRATEGY.md` | Security roadmap | ✅ Defines phases |

### Frontend
| File | Purpose | Status |
|------|---------|--------|
| `client/src/utils/supabase.js` | Supabase client init | ✅ Complete |
| `client/src/pages/HomePage.js` | Main page, session logic | ✅ Has temp user |
| `client/src/components/CreateRoom.js` | Room creation UI | ✅ Creates guest user |
| `client/src/components/JoinRoom.js` | Room joining UI | ✅ Joins with temp user |
| `client/src/App.js` | App routing | ⚠️ No auth routes |

### Missing Files (Need to Create)
```
✗ server/routes/auth.js - Authentication endpoints
✗ server/middleware/auth.js - JWT validation middleware
✗ client/src/contexts/AuthContext.js - Auth state management
✗ client/src/components/Login.js - Login UI
✗ client/src/components/Register.js - Register UI
✗ client/src/components/Profile.js - User profile page
```

---

## Current User Flow (Guest System)

```
1. User enters name
   ↓
2. Client emits 'createRoom' with name
   ↓
3. Server calls db.getOrCreateUser(socketId_name, name, name)
   ↓
4. Database check: SELECT * FROM users WHERE username = name
   - If exists: UPDATE last_seen
   - If not: INSERT new guest user (is_guest: true)
   ↓
5. Server returns playerId (UUID) to client
   ↓
6. Client stores in sessionStorage (lost on refresh)
   ↓
7. Game room created with user as host
```

---

## Required OAuth Implementation

### Phase 1: Database (1-2 days)

```sql
-- Add to users table
ALTER TABLE users ADD COLUMN email VARCHAR(255);
ALTER TABLE users ADD COLUMN password_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMP;
ALTER TABLE users ADD COLUMN auth_provider VARCHAR(50);  -- 'email', 'google', 'github'
ALTER TABLE users ADD COLUMN oauth_id VARCHAR(255);
ALTER TABLE users ADD COLUMN oauth_metadata JSONB;

-- Create support tables
CREATE TABLE email_verifications (token, user_id, expires_at);
CREATE TABLE password_resets (token, user_id, expires_at);
CREATE TABLE oauth_accounts (user_id, provider, provider_id, provider_data);
CREATE TABLE user_sessions (user_id, access_token, refresh_token, expires_at);
```

### Phase 2: Backend (2-3 days)

```javascript
// New endpoints needed:
POST /api/auth/register          // Email/password signup
POST /api/auth/login             // Email/password login
POST /api/auth/oauth/google      // Google OAuth callback
POST /api/auth/oauth/github      // GitHub OAuth callback
POST /api/auth/logout            // Clear session
GET  /api/auth/me                // Current user
POST /api/auth/refresh           // Refresh token
```

### Phase 3: Frontend (2-3 days)

```javascript
// New components needed:
<AuthContext>                    // State management
<Login>                          // Login page
<Register>                       // Registration page
<Profile>                        // User profile
<ProtectedRoute>                 // Route guard
useAuth() hook                   // Auth hook
```

### Phase 4: OAuth Setup (1-2 days per provider)

```
Google OAuth:
  1. Create Google Cloud project
  2. Enable OAuth 2.0
  3. Add callback URL: https://gamebuddies.io/api/auth/oauth/google/callback
  4. Get Client ID and Secret
  5. Store in .env

GitHub OAuth:
  1. Create GitHub OAuth App
  2. Add callback URL: https://gamebuddies.io/api/auth/oauth/github/callback
  3. Get Client ID and Secret
  4. Store in .env
```

---

## Quick Implementation Checklist

### Backend Setup
- [ ] Add email/password fields to users table
- [ ] Create auth support tables (email_verifications, etc.)
- [ ] Install: `npm install @oauth2-proxy/oauth2-proxy` or use native implementation
- [ ] Create `server/routes/auth.js` with endpoints
- [ ] Create `server/middleware/auth.js` for JWT validation
- [ ] Add auth routes to Express app
- [ ] Test email/password signup
- [ ] Test email/password login

### OAuth Setup
- [ ] Register Google OAuth app, get credentials
- [ ] Register GitHub OAuth app, get credentials
- [ ] Implement OAuth callback handlers
- [ ] Test Google OAuth flow
- [ ] Test GitHub OAuth flow
- [ ] Store OAuth credentials in .env

### Frontend Setup
- [ ] Create AuthContext provider
- [ ] Create useAuth hook
- [ ] Create Login component
- [ ] Create Register component
- [ ] Create ProtectedRoute component
- [ ] Add OAuth buttons to Login
- [ ] Update Header to show auth state
- [ ] Test login/register flow
- [ ] Test OAuth flow

### Integration
- [ ] Migrate game session flow to use authenticated user
- [ ] Add logout button
- [ ] Test end-to-end flow
- [ ] Security audit
- [ ] Load testing

---

## Code Templates Ready to Use

### Cookie Management (Already Implemented)
```javascript
// server/lib/secureCookies.js - READY TO USE
const { setSessionToken, getSessionToken, clearSessionCookies } = require('./lib/secureCookies');

// Set auth cookie after login
setSessionToken(res, jwtToken);

// Check auth in middleware
const token = getSessionToken(req);
if (!token) return res.status(401).json({ error: 'Not authenticated' });

// Clear on logout
clearSessionCookies(res);
```

### Supabase Clients (Already Initialized)
```javascript
// server/lib/supabase.js - READY TO USE
const { db, supabase, supabaseAdmin } = require('./lib/supabase');

// Use admin client for privileged operations
const user = await db.adminClient
  .from('users')
  .insert({ /* user data */ })
  .select()
  .single();

// Use anon client for public data
const rooms = await db.client
  .from('rooms')
  .select('*')
  .eq('is_public', true);
```

### Database Validation (Already Implemented)
```javascript
// server/lib/validation.js - READY TO USE
const { validators, sanitize } = require('./lib/validation');

// Validate input
const validation = await validators.joinRoom(data);
if (!validation.isValid) {
  return res.status(400).json({ error: validation.message });
}

// Sanitize user input
const name = sanitize.playerName(userInput);
```

### Rate Limiting (Already Implemented)
```javascript
// server/lib/validation.js - READY TO USE
const rateLimits = require('./lib/validation');

// Check rate limit
if (connectionManager.isRateLimited(socket.id, 'login', 5)) {
  return res.status(429).json({ error: 'Too many attempts' });
}
```

---

## Dependencies Already Installed

✅ **Available:**
- `@supabase/supabase-js` - Database client
- `bcryptjs` - Password hashing (for new passwords)
- `jsonwebtoken` - JWT generation (for auth tokens)
- `cookie-parser` - Cookie parsing
- `express-rate-limit` - Rate limiting
- `joi` - Input validation
- `helmet` - Security headers
- `cors` - CORS handling

❌ **Need to Install:**
- `@react-oauth/google` - Google OAuth frontend
- `github-oauth` or equivalent - GitHub OAuth handling
- `@sendgrid/mail` or similar - Email sending (for verification)

---

## Environment Variables Needed

### Current (Supabase)
```
SUPABASE_URL=https://xyz.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### Add for Auth
```
JWT_SECRET=your_super_secret_key_here_min_32_chars
JWT_EXPIRATION=7d

# Google OAuth
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx

# GitHub OAuth
GITHUB_CLIENT_ID=xxx
GITHUB_CLIENT_SECRET=xxx

# Email (if using email verification)
SENDGRID_API_KEY=xxx
SENDGRID_FROM_EMAIL=noreply@gamebuddies.io
```

---

## Key Architecture Decisions

### ✅ Good Existing Decisions
- Supabase for database (scalable, RLS support)
- Socket.io for real-time (fast, WebSocket support)
- HttpOnly cookies for auth tokens (XSS protection)
- Service role key server-side only (security)
- Anon key exposed to client (acceptable for public data)

### ⚠️ Decisions for OAuth
1. **Where to store refresh tokens?**
   - Answer: Database (user_sessions table) - safer than httpOnly cookies

2. **JWT vs Session tokens?**
   - Answer: JWTs for stateless auth, session tokens for games

3. **Guest vs registered users?**
   - Answer: Continue supporting both. Check `is_guest` flag.

4. **OAuth token storage?**
   - Answer: Never store OAuth tokens. Store provider ID + metadata only.

5. **Cross-origin games access?**
   - Answer: Keep sessionStorage for game room data. JWTs in cookies for auth.

---

## Testing OAuth Locally

### 1. Google OAuth (Easiest to Test)
```javascript
// Create test app at https://console.cloud.google.com
// Redirect URI: http://localhost:3033/api/auth/oauth/google/callback
// Test with: curl http://localhost:3033/api/auth/oauth/google -X POST -d '{"idToken":"test"}'
```

### 2. GitHub OAuth
```javascript
// Create test app at https://github.com/settings/developers
// Redirect URI: http://localhost:3033/api/auth/oauth/github/callback
// Test: http://localhost:3033/api/auth/oauth/github?code=test
```

### 3. Email/Password
```javascript
// Test signup: POST /api/auth/register
// Body: { email: "test@example.com", username: "testuser", password: "pass123456", password_confirm: "pass123456" }

// Test login: POST /api/auth/login
// Body: { email: "test@example.com", password: "pass123456" }
```

---

## Performance Considerations

### Indexes Already Created
- `idx_users_username` - Fast username lookup
- `idx_users_email` - Fast email lookup (needs to be added)
- `idx_users_oauth_id` - Fast OAuth lookup (needs to be added)
- `idx_player_sessions_token` - Fast session validation
- 50+ other indexes for optimal queries

### Optimization Tips
1. Cache user profile after login (5 min TTL)
2. Use Redis for session validation (optional)
3. Batch load game rooms (paginate)
4. Lazy load user avatars
5. Implement user profile caching

---

## Security Checklist

- [ ] All passwords hashed with bcryptjs (min 10 rounds)
- [ ] JWTs signed with strong secret (32+ chars)
- [ ] CORS limited to gamebuddies.io domain
- [ ] CSRF tokens for state-changing operations
- [ ] Rate limiting on auth endpoints (3-5 attempts per minute)
- [ ] Account lockout after failed attempts
- [ ] Email verification before full account access
- [ ] HTTPS enforced in production (CSP enforces)
- [ ] HttpOnly cookies for auth tokens
- [ ] SameSite=lax for CSRF protection
- [ ] Input validation on all endpoints
- [ ] No sensitive data in JWT payload
- [ ] OAuth tokens never stored server-side
- [ ] Refresh tokens rotated on each use
- [ ] Sessions invalidated on logout
- [ ] IP-based anomaly detection (future)
- [ ] 2FA support (future)

---

## Migration Guide (From Guest to Registered)

When moving from guest users to OAuth/accounts:

```javascript
// Existing guest user
{
  id: "uuid-1",
  username: "Player123",
  display_name: "Player123",
  is_guest: true,
  metadata: { external_id: "socket_Player123", ... }
}

// Becomes authenticated user
{
  id: "uuid-1",  // KEEP the same ID!
  username: "Player123",
  display_name: "Player123",
  email: "player@example.com",
  auth_provider: "google",
  oauth_id: "google-id-123",
  is_guest: false,  // Convert to registered
  metadata: { ... }
}

// This way, all existing room memberships stay valid!
```

---

## What NOT to Do

❌ **Common Mistakes to Avoid:**

1. ❌ Store OAuth tokens in database
   - ✅ DO: Store provider ID + metadata only

2. ❌ Use localStorage for auth tokens
   - ✅ DO: Use httpOnly cookies

3. ❌ Expose JWT secret to client
   - ✅ DO: Keep secret server-side only

4. ❌ Store passwords in plaintext
   - ✅ DO: Hash with bcryptjs (10 rounds minimum)

5. ❌ Skip email verification
   - ✅ DO: Verify email before granting access

6. ❌ Allow reuse of refresh tokens
   - ✅ DO: Rotate refresh tokens on each use

7. ❌ Store full user in JWT
   - ✅ DO: Store only user_id + email

8. ❌ Trust OAuth email without verification
   - ✅ DO: Verify email from OAuth provider

9. ❌ Allow multiple accounts per email
   - ✅ DO: Link OAuth accounts to existing email

10. ❌ Forget to invalidate sessions on logout
    - ✅ DO: Revoke tokens in database

---

## Resources & References

- **JWT Best Practices:** https://tools.ietf.org/html/rfc8949
- **OAuth 2.0 Spec:** https://oauth.net/2/
- **Supabase Auth:** https://supabase.com/docs/guides/auth
- **OWASP Auth Guidelines:** https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- **Node.js Security:** https://nodejs.org/en/docs/guides/nodejs-security/

---

## Support & Questions

Key contacts in codebase:
- Database issues: `SUPABASE_COMPLETE_SCHEMA_SETUP.sql`
- Session logic: `server/lib/lobbyManager.js`
- Socket handlers: `server/index.js` (lines 1764+)
- Security strategy: `SECURITY_AND_COOKIE_STRATEGY.md`
- Full analysis: `AUTH_AND_OAUTH_ANALYSIS.md`

Generated: November 19, 2025
