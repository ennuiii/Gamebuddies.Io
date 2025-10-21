/**
 * useAdManager Hook
 *
 * React hook for managing ad display and premium status.
 * Provides utilities for checking premium status and controlling ad visibility.
 */

import { useState, useEffect } from 'react';

interface AdConfig {
  /**
   * AdSense client ID
   */
  client: string;

  /**
   * Whether ads are enabled globally
   */
  enabled: boolean;

  /**
   * Ad slot IDs for different placements
   */
  slots: {
    banner?: string;
    sidebar?: string;
    inContent?: string;
    betweenGames?: string;
  };
}

interface UseAdManagerReturn {
  /**
   * Whether the current user is premium
   */
  isPremium: boolean;

  /**
   * Whether ads should be shown
   */
  showAds: boolean;

  /**
   * AdSense configuration
   */
  adConfig: AdConfig;

  /**
   * Check if user is premium
   */
  checkPremiumStatus: () => Promise<void>;

  /**
   * Loading state
   */
  loading: boolean;
}

/**
 * Default AdSense configuration
 * Replace with your actual AdSense client ID and slot IDs
 */
const DEFAULT_AD_CONFIG: AdConfig = {
  client: process.env.REACT_APP_ADSENSE_CLIENT || 'ca-pub-XXXXXXXXXXXXXXXX',
  enabled: process.env.REACT_APP_ADS_ENABLED !== 'false',
  slots: {
    banner: process.env.REACT_APP_ADSENSE_SLOT_BANNER,
    sidebar: process.env.REACT_APP_ADSENSE_SLOT_SIDEBAR,
    inContent: process.env.REACT_APP_ADSENSE_SLOT_IN_CONTENT,
    betweenGames: process.env.REACT_APP_ADSENSE_SLOT_BETWEEN_GAMES,
  },
};

/**
 * Hook for managing ads
 */
export function useAdManager(): UseAdManagerReturn {
  const [isPremium, setIsPremium] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [adConfig] = useState<AdConfig>(DEFAULT_AD_CONFIG);

  /**
   * Check if the user has a premium subscription
   */
  const checkPremiumStatus = async (): Promise<void> => {
    try {
      setLoading(true);
      const response = await fetch('/api/subscription/status', {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setIsPremium(data.isPremium || false);
      } else {
        setIsPremium(false);
      }
    } catch (error) {
      console.error('Failed to check premium status:', error);
      setIsPremium(false);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Check premium status on mount
   */
  useEffect(() => {
    checkPremiumStatus();
  }, []);

  /**
   * Load AdSense script if ads are enabled and user is not premium
   */
  useEffect(() => {
    if (!isPremium && adConfig.enabled && typeof window !== 'undefined') {
      // Check if script is already loaded
      const existingScript = document.querySelector(
        'script[src*="adsbygoogle.js"]'
      );

      if (!existingScript) {
        const script = document.createElement('script');
        script.async = true;
        script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adConfig.client}`;
        script.crossOrigin = 'anonymous';
        document.head.appendChild(script);
      }
    }
  }, [isPremium, adConfig.enabled, adConfig.client]);

  return {
    isPremium,
    showAds: !isPremium && adConfig.enabled,
    adConfig,
    checkPremiumStatus,
    loading,
  };
}

export default useAdManager;
