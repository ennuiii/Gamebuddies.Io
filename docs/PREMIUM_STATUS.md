# Premium Status / Pro Documentation

## Overview

GameBuddies offers premium tiers that provide additional features to users. This document covers how premium status is stored, retrieved, and used throughout the application.

## Premium Tiers

| Tier | Description |
|------|-------------|
| `free` | Default tier, basic features |
| `monthly` | Pro monthly subscription |
| `lifetime` | Lifetime premium access |

## Database Schema

Premium status is stored in the `public.users` table:

```sql
-- Key columns
premium_tier VARCHAR DEFAULT 'free'      -- 'free', 'monthly', 'lifetime'
premium_expires_at TIMESTAMP             -- When subscription expires (null for lifetime)
subscription_canceled_at TIMESTAMP       -- When user canceled (still active until expires)
```

## API Endpoints

### Get Current User (Recommended for External Games)

**Endpoint:** `GET /api/auth/me`

**Authentication:** Required (Bearer token)

**Use Case:** When you have a token but don't know the userId. Perfect for external games.

**Request:**
```
GET /api/auth/me
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "username": "string",
    "email": "string",
    "display_name": "string",
    "avatar_url": "string",
    "premium_tier": "free" | "monthly" | "lifetime",
    "premium_expires_at": "ISO timestamp" | null,
    "subscription_canceled_at": "ISO timestamp" | null,
    "avatar_style": "string",
    "avatar_seed": "string",
    "avatar_options": {},
    "created_at": "ISO timestamp"
  }
}
```

### Get User by ID

**Endpoint:** `GET /api/users/:userId`

**Authentication:** Required (Bearer token) + Must be own account

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "username": "string",
    "email": "string",
    "premium_tier": "free" | "monthly" | "lifetime",
    "premium_expires_at": "ISO timestamp" | null,
    "subscription_canceled_at": "ISO timestamp" | null,
    "avatar_style": "string",
    "avatar_seed": "string",
    "avatar_options": {}
  }
}
```

### Update Avatar (Premium Only)

**Endpoint:** `PUT /api/users/avatar`

**Authentication:** Required (Bearer token)

**Request Body:**
```json
{
  "userId": "uuid",
  "avatarStyle": "pixel-art",
  "avatarSeed": "custom-seed",
  "avatarOptions": {}
}
```

**Note:** Returns 403 if user is not premium (monthly or lifetime)

## Client-Side Usage

### AuthContext

The `AuthContext` provides premium status through the `useAuth` hook:

```javascript
import { useAuth } from '../contexts/AuthContext';

const MyComponent = () => {
  const { user, isPremium } = useAuth();

  // Check premium status
  if (isPremium) {
    // Show premium features
  }

  // Get specific tier
  const tier = user?.premium_tier; // 'free', 'monthly', 'lifetime'

  // Check expiration
  const expiresAt = user?.premium_expires_at;
  const isCanceled = user?.subscription_canceled_at !== null;
};
```

### Premium Feature Checks

```javascript
// Check if user has any premium tier
const isPremium = user?.premium_tier === 'monthly' || user?.premium_tier === 'lifetime';

// Check specific tier
const isLifetime = user?.premium_tier === 'lifetime';
const isMonthly = user?.premium_tier === 'monthly';

// Check if premium is still active (not expired)
const isActive = !user?.premium_expires_at ||
  new Date(user.premium_expires_at) > new Date();
```

## Premium Features

### Available to Premium Users (monthly/lifetime)

1. **Custom Avatars** - DiceBear avatar customization in Account settings
2. **Premium Badge** - Diamond (lifetime) or Star (monthly) icon next to name
3. **Premium Border Animation** - Animated gold border on player cards

### Feature Implementation Examples

**Avatar Display (RoomLobby.js):**
```javascript
{player.avatarStyle && (player.premiumTier === 'lifetime' || player.premiumTier === 'monthly') ? (
  <img
    src={getDiceBearUrl(player.avatarStyle, player.avatarSeed, player.avatarOptions, 80)}
    alt={player.name}
    className="avatar-image dicebear-avatar"
  />
) : (
  player.name.charAt(0).toUpperCase()
)}
```

**Premium Badge (BrowseRooms.js):**
```javascript
const getPremiumBadge = (premiumTier) => {
  if (premiumTier === 'lifetime') return ' 💎';
  if (premiumTier === 'monthly') return ' ⭐';
  return '';
};
```

## Stripe Integration

Premium subscriptions are managed through Stripe. Key files:
- `server/routes/stripe.js` - Webhook handlers for subscription events
- Updates `premium_tier`, `premium_expires_at`, and `subscription_canceled_at`

### Webhook Events Handled

- `checkout.session.completed` - New subscription
- `customer.subscription.updated` - Subscription changes
- `customer.subscription.deleted` - Subscription canceled
- `invoice.payment_succeeded` - Renewal payment

## Database Queries

### Get Premium Users
```sql
SELECT * FROM users WHERE premium_tier != 'free';
```

### Check Active Subscriptions
```sql
SELECT * FROM users
WHERE premium_tier = 'monthly'
AND (premium_expires_at IS NULL OR premium_expires_at > NOW());
```

### Get Users with Expiring Subscriptions
```sql
SELECT * FROM users
WHERE premium_tier = 'monthly'
AND premium_expires_at < NOW() + INTERVAL '7 days';
```

## Troubleshooting

### User shows as free but should be premium
1. Check Stripe dashboard for subscription status
2. Verify webhook events in Stripe logs
3. Query database: `SELECT premium_tier, premium_expires_at FROM users WHERE id = 'user-id'`

### Premium features not working
1. Ensure `useAuth()` hook is used correctly
2. Check `user.premium_tier` value in console
3. Verify user data is being fetched (check network tab for `/api/users/:id`)

### 401 Unauthorized on user fetch
- Token may be expired
- App will automatically clear session and redirect to login
- User can log in again to get fresh token
