import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { useAuth } from '../../contexts/AuthContext';

interface AdContextType {
  // Core state
  shouldShowAds: boolean;
  adsEnabled: boolean;

  // Frequency limiting
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

interface AdProviderProps {
  children: ReactNode;
}

export const AdProvider: React.FC<AdProviderProps> = ({ children }) => {
  const { isPremium, isAuthenticated, isGuest } = useAuth();

  // Core state
  const [adsEnabled] = useState(true); // Global toggle for emergencies
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);

  // Frequency limiting
  const [lastVideoAdShown, setLastVideoAdShown] = useState<number | null>(null);
  const [lastRewardedAdShown, setLastRewardedAdShown] = useState<number | null>(null);
  const [rewardedAdCooldown, setRewardedAdCooldown] = useState(0);

  // Stats
  const [totalAdsWatched, setTotalAdsWatched] = useState(0);

  // Determine if ads should show
  const shouldShowAds = adsEnabled && isAuthenticated && !isPremium && !isGuest;

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
    lastVideoAdShown,
    canShowVideoAd,
    rewardedAdCooldown,
    canShowRewardedAd,
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
