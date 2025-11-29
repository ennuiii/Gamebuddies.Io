# GameBuddies.io Ad System Implementation Guide

This document describes the ad infrastructure built for GameBuddies.io and how to integrate real ad networks like Google AdSense.

---

## Table of Contents

1. [Current Infrastructure Overview](#current-infrastructure-overview)
2. [Ad Placement Locations](#ad-placement-locations)
3. [Google AdSense Integration](#google-adsense-integration)
4. [Alternative Ad Networks](#alternative-ad-networks)
5. [Rewarded Ads for XP](#rewarded-ads-for-xp)
6. [Best Practices](#best-practices)
7. [GDPR & Privacy Compliance](#gdpr--privacy-compliance)

---

## Current Infrastructure Overview

The ad system is built with placeholder components that can be swapped for real ad networks.

### Component Structure

```
client/src/components/ads/
├── AdContext.tsx         # Global ad state management
├── AdWrapper.tsx         # Premium user check wrapper
├── AdPlaceholder.tsx     # Development placeholder
├── AdBanner.tsx          # Horizontal banner (728x90 / 320x50)
├── AdRectangle.tsx       # Rectangle ad (300x250)
├── SupportUsModal.tsx    # Optional "Support Us" video modal
├── RewardedAdButton.tsx  # "Watch Ad for XP" button
├── ads.css               # Ad-specific styles
└── index.ts              # Exports all components
```

### How It Works

1. **AdContext** provides global state:
   - `shouldShowAds` - Based on premium status (premium users never see ads)
   - `adsEnabled` - Global toggle
   - Frequency limiting for video ads (10 min cooldown)
   - Rewarded ad cooldown (5 min)

2. **AdWrapper** checks if the current user should see ads:
   - Premium users (monthly/lifetime) see NO ads
   - Admin users see NO ads
   - Everyone else sees ads (free users AND guests)

3. **Placeholder Components** display a styled placeholder where real ads will go

---

## Ad Placement Locations

### HomePage - Banner Ad

Located between the hero section and games grid.

**File:** `client/src/pages/HomePage.tsx`

```tsx
import { AdBanner } from '../components/ads';

// In the JSX:
<div className="home-ad-section">
  <AdBanner />
</div>
```

**Ad Size:** 728x90 (desktop) / 320x50 (mobile)

### RoomLobby - Rectangle Ad

Located in the sidebar below the chat window.

**File:** `client/src/components/RoomLobby.tsx`

```tsx
import { AdRectangle, SupportUsModal, RewardedAdButton } from './ads';

// In sidebar:
<div className="sidebar-section ad-section">
  <AdRectangle />
</div>
<div className="sidebar-section rewarded-section">
  <RewardedAdButton xpReward={50} />
</div>

// At end of component:
<SupportUsModal />
```

**Ad Size:** 300x250 (rectangle)

### After Game Rounds - Support Us Modal

The `SupportUsModal` shows optionally after game rounds with a friendly message asking users to watch an ad to support the platform.

**Triggers:**
- Call `showSupportModal()` from `useAds()` hook when a game round ends
- Only shows once every 10 minutes
- User can skip immediately

---

## Google AdSense Integration

### Step 1: Sign Up for AdSense

1. Go to [Google AdSense](https://www.google.com/adsense)
2. Sign up with your Google account
3. Add your website `gamebuddies.io`
4. Wait for approval (can take several days)

### Step 2: Add AdSense Script to index.html

**File:** `client/index.html`

```html
<head>
  <!-- ... other head elements ... -->

  <!-- Google AdSense -->
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-XXXXXXXXXXXXXXXX"
    crossorigin="anonymous"></script>
</head>
```

Replace `ca-pub-XXXXXXXXXXXXXXXX` with your AdSense Publisher ID.

### Step 3: Create Ad Units in AdSense Dashboard

1. Go to AdSense Dashboard > Ads > By ad unit
2. Create ad units for each placement:
   - **Banner:** Display ads, 728x90 (Leaderboard)
   - **Rectangle:** Display ads, 300x250 (Medium Rectangle)

### Step 4: Update AdBanner.tsx

Replace the placeholder with real ad code:

```tsx
// client/src/components/ads/AdBanner.tsx
import React, { useEffect, useRef } from 'react';
import { useAds } from './AdContext';
import './ads.css';

declare global {
  interface Window {
    adsbygoogle: any[];
  }
}

const AdBanner: React.FC = () => {
  const { shouldShowAds, onAdWatched } = useAds();
  const adRef = useRef<HTMLDivElement>(null);
  const adLoaded = useRef(false);

  useEffect(() => {
    if (!shouldShowAds || adLoaded.current) return;

    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      adLoaded.current = true;
      onAdWatched('banner');
    } catch (e) {
      console.error('AdSense error:', e);
    }
  }, [shouldShowAds, onAdWatched]);

  if (!shouldShowAds) return null;

  return (
    <div className="ad-container ad-banner" ref={adRef}>
      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
        data-ad-slot="YYYYYYYYYY"
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
};

export default AdBanner;
```

Replace:
- `ca-pub-XXXXXXXXXXXXXXXX` with your Publisher ID
- `YYYYYYYYYY` with your ad unit ID

### Step 5: Update AdRectangle.tsx

Similar to banner, but with rectangle ad unit:

```tsx
<ins
  className="adsbygoogle"
  style={{ display: 'block', width: '300px', height: '250px' }}
  data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
  data-ad-slot="ZZZZZZZZZZ"
/>
```

---

## Alternative Ad Networks

If AdSense isn't approved or you want higher CPMs:

### For Display Ads

| Network | Best For | Minimum Traffic |
|---------|----------|-----------------|
| **Ezoic** | Optimization, decent CPMs | 10K visits/month |
| **Mediavine** | High CPMs | 50K sessions/month |
| **AdThrive** | Premium publishers | 100K pageviews/month |
| **Monumetric** | Mid-tier sites | 10K pageviews/month |

### For Gaming Sites

| Network | Best For | Features |
|---------|----------|----------|
| **Unity Ads** | Games | Rewarded video, interstitials |
| **ironSource** | Game monetization | High fill rates |
| **AppLovin** | Mobile games | Rewarded ads |
| **AdColony** | Video ads | High-quality video |

### Implementation Notes

Each network has its own SDK. General pattern:

1. Sign up and get approved
2. Add their script to `index.html`
3. Initialize in App.tsx or dedicated component
4. Replace placeholder components with their ad units

---

## Rewarded Ads for XP

The `RewardedAdButton` component offers users XP in exchange for watching a video ad.

### Current Implementation

```tsx
// client/src/components/ads/RewardedAdButton.tsx
const RewardedAdButton: React.FC<{ xpReward?: number }> = ({ xpReward = 50 }) => {
  // Shows button to watch ad for XP
  // Has 5-minute cooldown between watches
  // Awards XP via backend API after completion
};
```

### Adding Real Rewarded Video Ads

**Option 1: Google Ad Manager (Recommended)**

1. Set up Google Ad Manager account
2. Create rewarded video ad unit
3. Integrate Ad Manager SDK:

```tsx
useEffect(() => {
  // Load Ad Manager script
  const script = document.createElement('script');
  script.src = 'https://securepubads.g.doubleclick.net/tag/js/gpt.js';
  document.head.appendChild(script);

  // Initialize
  window.googletag = window.googletag || { cmd: [] };
  window.googletag.cmd.push(() => {
    // Configure rewarded ad
  });
}, []);
```

**Option 2: Unity Ads (Gaming-Focused)**

```tsx
// In public/index.html
<script src="https://unityads.unity3d.com/unity-ads.js"></script>

// In component
const showRewardedAd = () => {
  window.unityAds.show('rewardedVideo', (state) => {
    if (state === 'completed') {
      onRewardedAdComplete();
    }
  });
};
```

### XP Reward Backend

The XP is awarded via `/api/achievements/award-xp` endpoint:

```typescript
// Server-side endpoint
app.post('/api/achievements/award-xp', async (req, res) => {
  const { userId, amount, source } = req.body;

  // Validate the rewarded ad was actually watched
  // (Use ad network callback verification)

  // Award XP
  await db.users.update({
    where: { id: userId },
    data: { xp: { increment: amount } }
  });

  res.json({ success: true, newXp: user.xp + amount });
});
```

---

## Best Practices

### Ad Density

- **HomePage:** Maximum 1-2 banner ads
- **Lobby:** Maximum 1 rectangle ad
- **During gameplay:** NO ads (don't interrupt the experience)
- **After game:** Optional video (skippable, max once per 10 min)

### Mobile Responsiveness

All ad containers have responsive styling:

```css
/* Mobile - smaller banner */
@media (max-width: 767px) {
  .ad-banner-inner {
    width: 320px;
    height: 50px;
  }

  .ad-rectangle-inner {
    width: 250px;
    height: 250px;
  }
}
```

### Premium User Exclusion

The `AdContext` automatically determines who sees ads:
- Premium users (`isPremium === true`) see NO ads
- Everyone else (free users AND guests) sees ads

```tsx
// client/src/components/ads/AdContext.tsx
// Show ads to: authenticated free users AND guests (anyone who's not premium)
const shouldShowAds = adsEnabled && !isPremium;
```

### Performance

- Load ads asynchronously (don't block page load)
- Use lazy loading for below-the-fold ads
- Set appropriate ad refresh intervals (not too frequent)

---

## GDPR & Privacy Compliance

### Cookie Consent

Before showing personalized ads, you MUST get user consent in the EU.

**Recommended:** Use a consent management platform (CMP) like:
- Cookiebot
- OneTrust
- Quantcast Choice

### Implementation

1. Add consent banner component
2. Store consent preference
3. Only load personalized ads if consented:

```tsx
const AdBanner = () => {
  const { hasAdConsent } = useConsent();

  if (!hasAdConsent) {
    // Show non-personalized ads or nothing
    return null;
  }

  // Show personalized ads
  return <PersonalizedAd />;
};
```

### Privacy Policy

Update your privacy policy to include:
- What ad networks are used
- What data is collected
- How users can opt out
- Link to ad network privacy policies

---

## Frequency Limiting Reference

| Ad Type | Current Limit | Location |
|---------|--------------|----------|
| Banner | Always visible | HomePage, Lobby sidebar |
| Rectangle | Always visible | Lobby sidebar |
| Support Modal | Once per 10 minutes | After game rounds |
| Rewarded Ad | 5 minute cooldown | Lobby sidebar |

These are configured in `AdContext.tsx`:

```tsx
const VIDEO_AD_COOLDOWN = 10 * 60 * 1000; // 10 minutes
const REWARDED_AD_COOLDOWN = 5 * 60 * 1000; // 5 minutes
```

---

## Testing

### Development Mode

In development, placeholder ads show instead of real ads. This is controlled by the `AdPlaceholder` component which displays:

- Visual representation of ad size
- "Ad Space - Support GameBuddies" text
- Matching dimensions for layout testing

### Test Ads

When integrating AdSense, use test mode:

```tsx
// Add to development only
<ins
  className="adsbygoogle"
  data-adtest="on" // Enable test mode
  // ... other props
/>
```

### Verification Checklist

- [ ] Premium users see NO ads
- [ ] Admin users see NO ads
- [ ] Ads load on HomePage
- [ ] Ads load in lobby sidebar
- [ ] Rewarded ad button shows cooldown
- [ ] Support modal respects 10-min cooldown
- [ ] Mobile responsive sizing works
- [ ] Consent banner shows before personalized ads

---

## Support

For questions about ad implementation:
- Review component source code in `client/src/components/ads/`
- Check AdContext for state management logic
- See this guide for network-specific integration

Last updated: November 2025
