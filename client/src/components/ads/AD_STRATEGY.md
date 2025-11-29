# GameBuddies Ad Display Strategy

## Overview

This document outlines the ad display strategy implemented in GameBuddies.io, designed to balance revenue generation with user experience.

## Research-Based Approach

Our strategy is based on industry research:
- **69% of gamers** prefer ads that don't disrupt gameplay
- **70%+ of players** prefer rewarded ads over other formats
- **Optimal frequency**: 3-5 impressions per session reduces ad fatigue
- **Grace periods** increase user goodwill and retention

## Ad Types

### 1. Banner Ads (Homepage)
- **Size**: 728x90 (desktop) / 320x50 (mobile)
- **Location**: Between hero section and games grid
- **Frequency**: Max 3 impressions per session
- **Grace Period**: 2 minutes after session start

### 2. Sidebar Ads
- **Size**: 160x600 (Wide Skyscraper)
- **Location**: Left and right sides (desktop only, 1400px+)
- **Frequency**: No cap (uses `shouldShowAds` only)
- **Note**: Not affected by banner frequency cap

### 3. Rewarded Ads
- **Type**: Opt-in video ads
- **Reward**: +50 XP per watch
- **Cooldown**: 5 minutes between watches
- **Note**: Best UX - users choose to watch

## Frequency Capping Settings

Located in `AdContext.tsx`:

```typescript
const BANNER_GRACE_PERIOD_MS = 2 * 60 * 1000; // 2 minutes
const MAX_BANNER_IMPRESSIONS_PER_SESSION = 3; // Max 3 per session
const VIDEO_AD_COOLDOWN = 10 * 60 * 1000; // 10 minutes
const REWARDED_AD_COOLDOWN = 5 * 60 * 1000; // 5 minutes
```

## How It Works

### Session Flow
1. **0-2 minutes**: Grace period - no banner ads shown
2. **After 2 min**: First banner can appear
3. **Per session**: Maximum 3 banner impressions
4. **Session reset**: Page refresh starts new session

### User Types
| User Type | Banner Ads | Sidebar Ads | Rewarded Ads |
|-----------|-----------|-------------|--------------|
| Premium   | Hidden    | Hidden      | Hidden       |
| Free User | Shown*    | Shown       | Shown        |
| Guest     | Shown*    | Shown       | Shown        |

*Subject to grace period and frequency cap

## Adjusting Settings

### To change grace period:
```typescript
const BANNER_GRACE_PERIOD_MS = 3 * 60 * 1000; // 3 minutes
```

### To change max impressions:
```typescript
const MAX_BANNER_IMPRESSIONS_PER_SESSION = 5; // 5 per session
```

### To disable frequency capping:
```typescript
const canShowBannerAd = shouldShowAds; // Remove grace/frequency checks
```

## Files

- `AdContext.tsx` - Core ad state and frequency logic
- `AdWrapper.tsx` - Conditional rendering based on ad type
- `AdBanner.tsx` - Banner ad component
- `AdSidebar.tsx` - Sidebar ad component
- `AdPlaceholder.tsx` - Fake ad content for development
- `RewardedAdButton.tsx` - Opt-in rewarded ad button

## Future Improvements

1. **Persist frequency across tabs** using localStorage
2. **A/B test** different frequency caps
3. **Analytics** to track impression counts and user engagement
4. **Smart timing** - show ads at natural breakpoints (after games)
