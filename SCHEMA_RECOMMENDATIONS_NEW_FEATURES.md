# Recommended New Tables & Fields for GameBuddies

## 🚀 QUICK START

**To add all recommended features, run this in Supabase SQL Editor:**

```bash
# Copy and paste the contents of:
MIGRATION_ADD_HIGH_VALUE_FEATURES.sql
```

This single migration adds:
- ✅ Player Statistics & Match History
- ✅ Achievements System (11 starter achievements included!)
- ✅ Social Features (Friends & Invites)
- ✅ Notifications System
- ✅ Moderation Tools
- ✅ Subscription History
- ✅ User Customization Fields
- ✅ Helper Functions

**Total:** 10 new tables + 8 new user fields + 2 helper functions

---

## 🎯 High-Value Additions

Based on your platform's features and user needs, here are tables/fields that would add significant value:

---

## 1. 🎫 **PREMIUM/SUBSCRIPTION MANAGEMENT** (High Priority)

### Why You Need This:
You have `premium_tier` in users table but NO subscription tracking. How do you know:
- When subscriptions expire?
- If payment failed?
- When to send renewal reminders?
- Subscription history?

### Recommended Tables:

#### `subscriptions` Table
```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Subscription details
  tier VARCHAR(20) NOT NULL CHECK (tier IN ('monthly', 'lifetime')),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'cancelled', 'expired', 'payment_failed', 'refunded')
  ),

  -- Dates
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end TIMESTAMPTZ, -- NULL for lifetime
  cancelled_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,

  -- Payment
  stripe_subscription_id TEXT UNIQUE, -- If using Stripe
  stripe_customer_id TEXT,
  payment_method VARCHAR(50), -- 'stripe', 'paypal', etc.

  -- Pricing
  price_paid DECIMAL(10,2),
  currency VARCHAR(3) DEFAULT 'USD',

  -- Trial/Promo
  is_trial BOOLEAN DEFAULT false,
  trial_ends_at TIMESTAMPTZ,
  promo_code VARCHAR(50),
  discount_applied DECIMAL(10,2),

  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Indexes
  CONSTRAINT unique_active_subscription UNIQUE(user_id, status)
    WHERE status = 'active'
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_expires_at ON subscriptions(expires_at)
  WHERE expires_at IS NOT NULL;
CREATE INDEX idx_subscriptions_stripe_id ON subscriptions(stripe_subscription_id);
```

#### `subscription_events` Table (Audit Trail)
```sql
CREATE TABLE subscription_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  event_type VARCHAR(50) NOT NULL, -- 'created', 'renewed', 'cancelled', 'expired', 'payment_failed'
  old_status VARCHAR(20),
  new_status VARCHAR(20),

  -- Payment details
  amount DECIMAL(10,2),
  currency VARCHAR(3),
  payment_status VARCHAR(20),

  -- Context
  reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subscription_events_subscription ON subscription_events(subscription_id);
CREATE INDEX idx_subscription_events_user ON subscription_events(user_id);
CREATE INDEX idx_subscription_events_type ON subscription_events(event_type);
```

### New Fields for `users` Table:
```sql
ALTER TABLE users
  ADD COLUMN stripe_customer_id TEXT UNIQUE,
  ADD COLUMN premium_expires_at TIMESTAMPTZ,
  ADD COLUMN premium_status VARCHAR(20) DEFAULT 'active';

CREATE INDEX idx_users_premium_expires ON users(premium_expires_at)
  WHERE premium_tier != 'free';
```

**Use Case:**
- Automatic expiration checking
- Renewal reminders
- Failed payment handling
- Subscription analytics
- Refund tracking

---

## 2. 📊 **PLAYER STATISTICS** (High Priority)

### Why You Need This:
No way to track player performance, achievements, or engagement. This is crucial for:
- Leaderboards
- Matchmaking
- Player profiles
- Engagement metrics
- Gamification

### Recommended Table:

#### `player_stats` Table
```sql
CREATE TABLE player_stats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id VARCHAR(50) REFERENCES games(id) ON DELETE CASCADE,

  -- Game statistics
  games_played INTEGER DEFAULT 0,
  games_won INTEGER DEFAULT 0,
  games_lost INTEGER DEFAULT 0,
  games_abandoned INTEGER DEFAULT 0,

  -- Time tracking
  total_time_played_minutes INTEGER DEFAULT 0,
  average_game_duration_minutes DECIMAL(10,2),

  -- Performance
  win_rate DECIMAL(5,2) GENERATED ALWAYS AS (
    CASE
      WHEN games_played > 0
      THEN (games_won::DECIMAL / games_played) * 100
      ELSE 0
    END
  ) STORED,

  -- Engagement
  favorite_game BOOLEAN DEFAULT false,
  last_played_at TIMESTAMPTZ,
  streak_days INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,

  -- Skill rating (for matchmaking)
  skill_rating INTEGER DEFAULT 1000,
  skill_confidence DECIMAL(5,2) DEFAULT 0.5,

  -- Timestamps
  first_played_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_user_game_stats UNIQUE(user_id, game_id)
);

CREATE INDEX idx_player_stats_user ON player_stats(user_id);
CREATE INDEX idx_player_stats_game ON player_stats(game_id);
CREATE INDEX idx_player_stats_win_rate ON player_stats(win_rate DESC);
CREATE INDEX idx_player_stats_skill ON player_stats(game_id, skill_rating DESC);
```

#### Global Player Stats (Aggregate):
```sql
ALTER TABLE users
  ADD COLUMN total_games_played INTEGER DEFAULT 0,
  ADD COLUMN total_rooms_hosted INTEGER DEFAULT 0,
  ADD COLUMN total_rooms_joined INTEGER DEFAULT 0,
  ADD COLUMN account_level INTEGER DEFAULT 1,
  ADD COLUMN total_xp INTEGER DEFAULT 0;

CREATE INDEX idx_users_level ON users(account_level DESC);
```

**Use Case:**
- Player profiles with statistics
- Leaderboards per game
- Skill-based matchmaking
- Achievement unlocks
- Engagement tracking

---

## 3. 🏆 **ACHIEVEMENTS/BADGES** (Medium Priority)

### Why You Need This:
Gamification increases engagement by 30-50%. Premium users especially value achievements.

### Recommended Tables:

#### `achievements` Table (Achievement Definitions)
```sql
CREATE TABLE achievements (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  icon_url TEXT,

  -- Requirements
  category VARCHAR(50), -- 'games_played', 'wins', 'social', 'premium'
  requirement_type VARCHAR(50), -- 'count', 'streak', 'special'
  requirement_value INTEGER,

  -- Rewards
  xp_reward INTEGER DEFAULT 0,
  premium_only BOOLEAN DEFAULT false,

  -- Display
  is_hidden BOOLEAN DEFAULT false, -- Secret achievements
  rarity VARCHAR(20) DEFAULT 'common', -- 'common', 'rare', 'epic', 'legendary'
  display_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### `user_achievements` Table (Earned Achievements)
```sql
CREATE TABLE user_achievements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id VARCHAR(50) NOT NULL REFERENCES achievements(id),

  earned_at TIMESTAMPTZ DEFAULT NOW(),
  progress INTEGER DEFAULT 0, -- For progressive achievements

  -- Context
  earned_in_room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  earned_in_game VARCHAR(50) REFERENCES games(id),

  metadata JSONB DEFAULT '{}',

  CONSTRAINT unique_user_achievement UNIQUE(user_id, achievement_id)
);

CREATE INDEX idx_user_achievements_user ON user_achievements(user_id);
CREATE INDEX idx_user_achievements_earned ON user_achievements(earned_at DESC);
```

**Example Achievements:**
- "First Steps" - Play your first game
- "Social Butterfly" - Play with 10 different players
- "Winning Streak" - Win 5 games in a row
- "Premium Player" - Subscribe to premium
- "Host Master" - Host 50 rooms
- "DDF Champion" - Win 10 DDF games

---

## 4. 👥 **FRIENDS/SOCIAL SYSTEM** (Medium Priority)

### Why You Need This:
Social features increase retention by 40%. Players want to play with friends.

### Recommended Tables:

#### `friendships` Table
```sql
CREATE TABLE friendships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'accepted', 'blocked')
  ),

  -- Who initiated
  requested_by UUID NOT NULL REFERENCES users(id),

  -- Timestamps
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,

  -- Prevent duplicates
  CONSTRAINT unique_friendship UNIQUE(user_id, friend_id),
  CONSTRAINT no_self_friendship CHECK (user_id != friend_id),
  -- Ensure both directions don't exist
  CONSTRAINT friendship_direction CHECK (user_id < friend_id)
);

CREATE INDEX idx_friendships_user ON friendships(user_id);
CREATE INDEX idx_friendships_friend ON friendships(friend_id);
CREATE INDEX idx_friendships_status ON friendships(status);
```

#### `room_invitations` Table
```sql
CREATE TABLE room_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_user UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'accepted', 'declined', 'expired')
  ),

  message TEXT,
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '1 hour',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ,

  CONSTRAINT unique_room_invitation UNIQUE(room_id, invited_user)
);

CREATE INDEX idx_invitations_user ON room_invitations(invited_user);
CREATE INDEX idx_invitations_room ON room_invitations(room_id);
CREATE INDEX idx_invitations_status ON room_invitations(status);
```

**Use Case:**
- Friend requests
- Friends list
- Invite friends to rooms
- See what friends are playing
- Play together

---

## 5. 🔔 **NOTIFICATIONS SYSTEM** (Medium Priority)

### Why You Need This:
Users need to know about:
- Friend requests
- Room invitations
- Game starting
- Subscription expiring
- Achievements unlocked

### Recommended Table:

#### `notifications` Table
```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Notification details
  type VARCHAR(50) NOT NULL, -- 'friend_request', 'room_invite', 'achievement', 'subscription'
  title VARCHAR(200) NOT NULL,
  message TEXT,

  -- Status
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,

  -- Actions
  action_url TEXT, -- Link to click
  action_label VARCHAR(50), -- "View", "Accept", "Join"

  -- Related entities
  related_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  related_room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  related_achievement_id VARCHAR(50),

  -- Priority
  priority VARCHAR(20) DEFAULT 'normal' CHECK (
    priority IN ('low', 'normal', 'high', 'urgent')
  ),

  -- Expiration
  expires_at TIMESTAMPTZ,

  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read)
  WHERE is_read = false;
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);
```

**Use Case:**
- Real-time notifications
- Notification badge count
- Notification center UI
- Email/push notification triggers

---

## 6. 🎮 **GAME MATCH HISTORY** (Medium Priority)

### Why You Need This:
Currently no record of completed games. You need this for:
- "Games you played" history
- Rematch functionality
- Statistics calculation
- Dispute resolution

### Recommended Table:

#### `game_matches` Table
```sql
CREATE TABLE game_matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  game_id VARCHAR(50) NOT NULL REFERENCES games(id),

  -- Match details
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER GENERATED ALWAYS AS (
    EXTRACT(EPOCH FROM (ended_at - started_at)) / 60
  ) STORED,

  -- Players
  total_players INTEGER NOT NULL,
  players JSONB NOT NULL, -- Array of player IDs and their results

  -- Results
  winner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  final_scores JSONB, -- Player scores/results

  -- Metadata
  game_mode VARCHAR(50),
  game_settings JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_game_matches_game ON game_matches(game_id);
CREATE INDEX idx_game_matches_started ON game_matches(started_at DESC);
CREATE INDEX idx_game_matches_players ON game_matches USING gin(players);
```

**Use Case:**
- Match history page
- Player performance tracking
- Statistics calculation
- Rematch button
- Dispute resolution

---

## 7. 🛡️ **MODERATION SYSTEM** (Low-Medium Priority)

### Why You Need This:
As you grow, you'll need moderation for:
- User reports
- Toxic behavior
- Spam prevention
- Account bans

### Recommended Tables:

#### `user_reports` Table
```sql
CREATE TABLE user_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reported_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Report details
  reason VARCHAR(50) NOT NULL, -- 'harassment', 'cheating', 'spam', 'inappropriate_name'
  description TEXT NOT NULL,

  -- Context
  occurred_in_room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  evidence_urls TEXT[], -- Screenshots, etc.

  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (
    status IN ('pending', 'investigating', 'resolved', 'dismissed')
  ),

  -- Moderation
  assigned_to UUID REFERENCES users(id), -- Moderator
  resolution TEXT,
  resolved_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_reports_reported ON user_reports(reported_user_id);
CREATE INDEX idx_user_reports_status ON user_reports(status);
CREATE INDEX idx_user_reports_created ON user_reports(created_at DESC);
```

#### `user_bans` Table
```sql
CREATE TABLE user_bans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Ban details
  reason TEXT NOT NULL,
  ban_type VARCHAR(20) NOT NULL CHECK (
    ban_type IN ('temporary', 'permanent', 'warning')
  ),

  -- Duration
  banned_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ, -- NULL for permanent

  -- Moderation
  banned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  related_report_id UUID REFERENCES user_reports(id),

  -- Status
  is_active BOOLEAN DEFAULT true,
  lifted_at TIMESTAMPTZ,
  lifted_by UUID REFERENCES users(id),
  lift_reason TEXT
);

CREATE INDEX idx_user_bans_user ON user_bans(user_id);
CREATE INDEX idx_user_bans_active ON user_bans(is_active) WHERE is_active = true;
CREATE INDEX idx_user_bans_expires ON user_bans(expires_at);
```

---

## 8. 🎨 **USER CUSTOMIZATION** (Low Priority)

### New Fields for `users` Table:
```sql
ALTER TABLE users
  ADD COLUMN bio TEXT,
  ADD COLUMN favorite_game VARCHAR(50) REFERENCES games(id),
  ADD COLUMN profile_banner_url TEXT,
  ADD COLUMN profile_theme VARCHAR(50) DEFAULT 'default',
  ADD COLUMN privacy_settings JSONB DEFAULT '{"profile_public": true, "stats_public": true}',
  ADD COLUMN display_preferences JSONB DEFAULT '{}';
```

---

## 9. 💾 **BACKUP & AUDIT** (Low Priority but Important)

### `audit_log` Table (For Important Actions)
```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  action VARCHAR(100) NOT NULL, -- 'subscription_created', 'user_banned', etc.
  entity_type VARCHAR(50), -- 'subscription', 'user', 'room'
  entity_id TEXT,

  old_value JSONB,
  new_value JSONB,

  ip_address INET,
  user_agent TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_created ON audit_log(created_at DESC);
```

---

## 📊 PRIORITY RANKING

| Priority | Feature | Tables | Why |
|----------|---------|--------|-----|
| **🔴 CRITICAL** | Subscription Management | subscriptions, subscription_events | You're charging money but not tracking it! |
| **🟠 HIGH** | Player Statistics | player_stats, game_matches | Analytics, engagement, matchmaking |
| **🟡 MEDIUM** | Achievements | achievements, user_achievements | Gamification → retention |
| **🟡 MEDIUM** | Social/Friends | friendships, room_invitations | Social → viral growth |
| **🟡 MEDIUM** | Notifications | notifications | User engagement |
| **🟢 LOW** | Moderation | user_reports, user_bans | Growth will need this |
| **🟢 LOW** | Customization | User fields | Nice to have |

---

## 🚀 IMPLEMENTATION ROADMAP

### Phase 1: MUST HAVE (Now)
```sql
-- 1. Subscription tracking (you're losing money data!)
CREATE TABLE subscriptions (...);
CREATE TABLE subscription_events (...);
ALTER TABLE users ADD COLUMN stripe_customer_id, premium_expires_at;

-- 2. Basic stats
CREATE TABLE player_stats (...);
ALTER TABLE users ADD COLUMN total_games_played, account_level;
```

### Phase 2: HIGH VALUE (Next Month)
```sql
-- 3. Match history
CREATE TABLE game_matches (...);

-- 4. Achievements
CREATE TABLE achievements (...);
CREATE TABLE user_achievements (...);
```

### Phase 3: GROWTH (3 Months)
```sql
-- 5. Social features
CREATE TABLE friendships (...);
CREATE TABLE room_invitations (...);

-- 6. Notifications
CREATE TABLE notifications (...);
```

### Phase 4: SCALE (6 Months)
```sql
-- 7. Moderation
CREATE TABLE user_reports (...);
CREATE TABLE user_bans (...);

-- 8. Audit
CREATE TABLE audit_log (...);
```

---

## 💡 BONUS: Quick Wins

### Add to Existing Tables NOW:

```sql
-- users table
ALTER TABLE users
  ADD COLUMN last_login_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN login_count INTEGER DEFAULT 0,
  ADD COLUMN email VARCHAR(255) UNIQUE, -- For password reset, notifications
  ADD COLUMN email_verified BOOLEAN DEFAULT false,
  ADD COLUMN timezone VARCHAR(50) DEFAULT 'UTC';

-- rooms table
ALTER TABLE rooms
  ADD COLUMN password_hash TEXT, -- Private rooms with password
  ADD COLUMN is_featured BOOLEAN DEFAULT false, -- Featured rooms
  ADD COLUMN tags TEXT[], -- Room tags for filtering
  ADD COLUMN streamer_mode BOOLEAN DEFAULT false; -- Already used in code!

-- room_members table
ADD COLUMN vote_kick_received INTEGER DEFAULT 0, -- Vote kick system
ADD COLUMN muted BOOLEAN DEFAULT false; -- Mute troublesome players
```

---

## 🎯 IMMEDIATE ACTION ITEMS

1. **TODAY:** Add subscription tracking tables (you're losing revenue data!)
2. **THIS WEEK:** Add player_stats table (needed for profiles)
3. **THIS MONTH:** Add game_matches table (match history)
4. **NEXT QUARTER:** Add social features

**This will transform GameBuddies from a basic lobby system into a full gaming platform!** 🚀
