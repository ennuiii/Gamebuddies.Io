import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { useAuth } from '../../contexts/AuthContext';

interface AdContextType {
  // Core state
  shouldShowAds: boolean;
  adsEnabled: boolean;

  // Banner frequency limiting
  canShowBannerAd: boolean;
  bannerImpressions: number;
  isInGracePeriod: boolean;
  onBannerImpression: () => void;

  // Video/Rewarded frequency limiting
  lastVideoAdShown: number | null;
  canShowVideoAd: boolean;
  rewardedAdCooldown: number;
  canShowRewardedAd: boolean;

  // Actions
  showSupportModal: () => void;
  hideSupportModal: () => void;
  isSupportModalOpen: boolean;

  // Callbacks
  onAdWatched: (type: 'banner' | 'video' | 'rewarded') => void;
  onRewardedAdComplete: () => Promise<void>;

  // Stats (for fun messaging)
  totalAdsWatched: number;
}

const AdContext = createContext<AdContextType | undefined>(undefined);

const VIDEO_AD_COOLDOWN = 10 * 60 * 1000; // 10 minutes
const REWARDED_AD_COOLDOWN = 5 * 60 * 1000; // 5 minutes

// Banner ad frequency settings (based on industry research)
const BANNER_GRACE_PERIOD_MS = 2 * 60 * 1000; // 2 minutes - let users enjoy the site first
const MAX_BANNER_IMPRESSIONS_PER_SESSION = 3; // Max 3 banner views per session

interface AdProviderProps {
  children: ReactNode;
}

export const AdProvider: React.FC<AdProviderProps> = ({ children }) => {
  const { isPremium } = useAuth();

  // Core state
  const [adsEnabled] = useState(true); // Global toggle for emergencies
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);

  // Session tracking for banner frequency
  const [sessionStart] = useState(Date.now());
  const [bannerImpressions, setBannerImpressions] = useState(0);
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Video/Rewarded frequency limiting
  const [lastVideoAdShown, setLastVideoAdShown] = useState<number | null>(null);
  const [lastRewardedAdShown, setLastRewardedAdShown] = useState<number | null>(null);
  const [rewardedAdCooldown, setRewardedAdCooldown] = useState(0);

  // Stats
  const [totalAdsWatched, setTotalAdsWatched] = useState(0);

  // Update current time every 30 seconds to check grace period
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Determine if ads should show (base check)
  // Show ads to: authenticated free users AND guests (anyone who's not premium)
  const shouldShowAds = adsEnabled && !isPremium;

  // Banner-specific checks
  const isInGracePeriod = currentTime - sessionStart < BANNER_GRACE_PERIOD_MS;
  const canShowBannerAd = shouldShowAds && !isInGracePeriod && bannerImpressions < MAX_BANNER_IMPRESSIONS_PER_SESSION;

  // Track banner impression
  const onBannerImpression = useCallback(() => {
    setBannerImpressions(prev => prev + 1);
  }, []);

  // Check if video ad can be shown (10 min cooldown)
  const canShowVideoAd = !lastVideoAdShown || (Date.now() - lastVideoAdShown) > VIDEO_AD_COOLDOWN;

  // Check if rewarded ad can be shown (5 min cooldown)
  const canShowRewardedAd = !lastRewardedAdShown || (Date.now() - lastRewardedAdShown) > REWARDED_AD_COOLDOWN;

  // Update rewarded ad cooldown timer
  useEffect(() => {
    if (!lastRewardedAdShown) {
      setRewardedAdCooldown(0);
      return;
    }

    const updateCooldown = () => {
      const elapsed = Date.now() - lastRewardedAdShown;
      const remaining = Math.max(0, Math.ceil((REWARDED_AD_COOLDOWN - elapsed) / 1000));
      setRewardedAdCooldown(remaining);
    };

    updateCooldown();
    const interval = setInterval(updateCooldown, 1000);

    return () => clearInterval(interval);
  }, [lastRewardedAdShown]);

  // Actions
  const showSupportModal = useCallback(() => {
    if (shouldShowAds && canShowVideoAd) {
      setIsSupportModalOpen(true);
    }
  }, [shouldShowAds, canShowVideoAd]);

  const hideSupportModal = useCallback(() => {
    setIsSupportModalOpen(false);
  }, []);

  // Called when any ad is watched
  const onAdWatched = useCallback((type: 'banner' | 'video' | 'rewarded') => {
    setTotalAdsWatched(prev => prev + 1);

    if (type === 'video') {
      setLastVideoAdShown(Date.now());
      setIsSupportModalOpen(false);
    } else if (type === 'rewarded') {
      setLastRewardedAdShown(Date.now());
    }

    // Could send analytics here
    console.log(`Ad watched: ${type}`);
  }, []);

  // Called when rewarded ad completes - awards XP
  const onRewardedAdComplete = useCallback(async () => {
    onAdWatched('rewarded');

    // TODO: Integrate with XP system when ad network is connected
    // await awardXP(user.id, 50, 'rewarded_ad');

    console.log('Rewarded ad complete - would award 50 XP');
  }, [onAdWatched]);

  const value: AdContextType = {
    shouldShowAds,
    adsEnabled,
    // Banner frequency
    canShowBannerAd,
    bannerImpressions,
    isInGracePeriod,
    onBannerImpression,
    // Video/Rewarded
    lastVideoAdShown,
    canShowVideoAd,
    rewardedAdCooldown,
    canShowRewardedAd,
    // Actions
    showSupportModal,
    hideSupportModal,
    isSupportModalOpen,
    onAdWatched,
    onRewardedAdComplete,
    totalAdsWatched,
  };

  return <AdContext.Provider value={value}>{children}</AdContext.Provider>;
};

export const useAds = (): AdContextType => {
  const context = useContext(AdContext);
  if (context === undefined) {
    throw new Error('useAds must be used within an AdProvider');
  }
  return context;
};

export default AdContext;
