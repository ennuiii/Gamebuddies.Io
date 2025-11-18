# Security & Cookie Strategy

**Last Updated:** 2025-11-18
**Status:** Phase 1 Complete - Infrastructure Ready for User Accounts

---

## Current Architecture (Guest Sessions)

### Why SessionStorage is Used

GameBuddies uses **sessionStorage** for cross-origin session data because:

1. **External Games in iFrames**: Games (DDF, SUSD, BingoBuddies, etc.) run on separate domains
2. **Cross-Origin Limitation**: httpOnly cookies from `gamebuddies.io` cannot be accessed by `ddf-game.onrender.com`
3. **Session Handoff**: When launching a game, GameBuddies sets sessionStorage before navigating to the iframe
4. **Game Detection**: Games check `sessionStorage.getItem('gamebuddies_roomCode')` to detect GameBuddies sessions

### SessionStorage Keys Used by Games

**All games depend on these keys:**
```javascript
// Required for session validation
gamebuddies_roomCode        // Room code (e.g., "ABC123")
gamebuddies_playerName       // Display name
gamebuddies_playerId         // UUID from Supabase users table
gamebuddies_isHost           // "true" or "false" string

// Navigation
gamebuddies_returnUrl        // Return URL (lobby)
gamebuddies_gameType         // Game identifier (e.g., "ddf")

// Session token (for External Game API)
gamebuddies_sessionToken     // JWT for game-to-server API calls
gamebuddies-session          // Full session object (JSON)
```

---

## Security Assessment

### Current Vulnerabilities ✅ FIXED

1. **CSP Disabled** → **FIXED:** Enabled with iframe whitelisting
2. **.env Committed** → **FIXED:** Removed from git, added to .gitignore
3. **Cookie Infrastructure Missing** → **FIXED:** cookie-parser installed, utility created

### Acceptable Trade-offs (For Now)

**SessionStorage for Session Data:**
- ❌ **Vulnerable to XSS** - JavaScript can read all session data
- ✅ **Required for iframe communication** - No alternative without backend refactor
- ✅ **Mitigated by CSP** - Strict script policies reduce XSS risk
- ✅ **Session tokens expire** - Limited damage window (3 hours default)

**Why This is OK for Guest Sessions:**
- No passwords to steal (guest-only)
- No financial data
- Session tokens have short TTL
- Worst case: Account takeover for 3 hours max
- CSP prevents inline script injection

---

## Future Migration Plan (User Accounts)

### When to Migrate to Cookies

**Trigger:** When implementing user accounts (Phase 3, Week 9)

**What to Migrate:**
- ❌ **Don't Migrate:** Game session data (roomCode, playerName, etc.) - games need this
- ✅ **Do Migrate:** User authentication tokens, refresh tokens, userId

### Proposed Hybrid Approach

**1. HttpOnly Cookies (GameBuddies.io only):**
```javascript
// Server-side only, JavaScript cannot access
gb_auth_token        // JWT for authenticated user
gb_refresh_token     // Refresh token for re-authentication
gb_user_id           // Authenticated user ID
```

**2. SessionStorage (Shared with Games):**
```javascript
// Still needed for iframe game integration
gamebuddies_roomCode
gamebuddies_playerName
gamebuddies_playerId
gamebuddies_isHost
gamebuddies_returnUrl
gamebuddies_sessionToken  // Short-lived game session token
```

**3. Backend Session Validation:**
- Games continue using sessionStorage
- Games call GameBuddies API with sessionToken
- Server validates sessionToken against httpOnly auth cookie
- If mismatch detected, force re-authentication

---

## Implementation Roadmap

### ✅ Phase 1: Security Hardening (Week 1-2) - COMPLETE

- [x] Remove .env from git
- [x] Add .env to .gitignore
- [x] Enable Content Security Policy
- [x] Install cookie-parser
- [x] Create `lib/secureCookies.js` utility

### ⏳ Phase 2: Not Needed Yet (Guest System Works)

- [ ] ~~Migrate sessionStorage to cookies~~ - DEFERRED until user accounts

### 📋 Phase 3: User Accounts (Week 9)

- [ ] Implement Supabase Auth (email/password, OAuth)
- [ ] Use httpOnly cookies for auth tokens
- [ ] Keep sessionStorage for game session data
- [ ] Add server-side session validation middleware
- [ ] Implement CSRF protection for authenticated requests

---

## Security Best Practices

### Current Implementation

1. ✅ **CSP Enabled** - Prevents XSS injection
2. ✅ **CORS Configured** - Only whitelisted origins
3. ✅ **Rate Limiting** - Prevents brute force/DoS
4. ✅ **Input Validation** - Joi schemas on all endpoints
5. ✅ **Helmet Security Headers** - XSS, clickjacking protection
6. ✅ **Short Session TTL** - 3-hour max session lifetime

### Future Additions (User Accounts)

7. ⏳ **CSRF Tokens** - For state-changing operations
8. ⏳ **Refresh Token Rotation** - Prevent token replay attacks
9. ⏳ **Account Lockout** - After N failed login attempts
10. ⏳ **2FA Support** - Optional two-factor authentication

---

## Using the Cookie Utility

### Server-Side Cookie Management

```javascript
const { setSessionToken, getSessionToken, clearSessionCookies } = require('./lib/secureCookies');

// Set a secure cookie (httpOnly, sameSite, HTTPS in prod)
app.post('/api/auth/login', (req, res) => {
  const token = generateJWT(user);
  setSessionToken(res, token);
  res.json({ success: true });
});

// Read cookie from request
app.get('/api/auth/me', (req, res) => {
  const token = getSessionToken(req);
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  // Verify token...
});

// Clear all session cookies
app.post('/api/auth/logout', (req, res) => {
  clearSessionCookies(res);
  res.json({ success: true });
});
```

### Cookie Options

```javascript
{
  httpOnly: true,              // Cannot be accessed by JavaScript
  secure: NODE_ENV === 'production',  // HTTPS only in production
  sameSite: 'lax',             // CSRF protection
  maxAge: 3 * 60 * 60 * 1000,  // 3 hours
  path: '/'                    // Available across entire domain
}
```

---

## FAQ

### Q: Why not use httpOnly cookies for everything?
**A:** Games are in iframes on different domains. They can't access cookies set by gamebuddies.io. SessionStorage is the only way to pass session data cross-origin without a backend proxy.

### Q: Isn't sessionStorage vulnerable to XSS?
**A:** Yes, but mitigated by:
1. Strict Content Security Policy (no inline scripts)
2. Input validation prevents injection
3. No sensitive data (passwords, payment info)
4. Session tokens expire in 3 hours

### Q: When should we migrate to cookies?
**A:** When adding user accounts with passwords. Auth tokens should be httpOnly, but game session data stays in sessionStorage.

### Q: How do games validate sessions then?
**A:** Games call GameBuddies External Game API (`/api/v2/game/...`) with the sessionToken. The server validates the token and returns room/player data.

---

## References

- **CSP Configuration:** `server/index.js:70-97`
- **Cookie Utility:** `server/lib/secureCookies.js`
- **Game Integration Guide:** `DDF/DDF_GAMEBUDDIES_COMPLETE_INTEGRATION_GUIDE.md`
- **External Game API:** `server/routes/gameApiV2.js`
