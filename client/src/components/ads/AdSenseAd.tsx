/**
 * AdSense Ad Component
 *
 * React component for displaying Google AdSense ads.
 * Automatically respects premium user status and doesn't show ads to premium users.
 */

import React, { useEffect } from 'react';

interface AdSenseAdProps {
  /**
   * AdSense client ID (ca-pub-XXXXXXXXXXXXXXXX)
   */
  client: string;

  /**
   * Ad slot ID
   */
  slot: string;

  /**
   * Ad format (auto, fluid, rectangle, vertical, horizontal)
   */
  format?: string;

  /**
   * Ad layout (optional, for in-feed/in-article ads)
   */
  layout?: string;

  /**
   * Layout key (optional, for responsive ads)
   */
  layoutKey?: string;

  /**
   * Ad style (CSS object)
   */
  style?: React.CSSProperties;

  /**
   * Class name for the ad container
   */
  className?: string;

  /**
   * Whether the user is premium (ads won't show if true)
   */
  isPremium?: boolean;

  /**
   * Ad placement identifier for tracking
   */
  placement?: string;

  /**
   * Callback when ad is loaded
   */
  onAdLoaded?: () => void;

  /**
   * Callback when ad fails to load
   */
  onAdError?: (error: Error) => void;
}

/**
 * AdSense Ad Component
 */
export const AdSenseAd: React.FC<AdSenseAdProps> = ({
  client,
  slot,
  format = 'auto',
  layout,
  layoutKey,
  style = { display: 'block' },
  className = '',
  isPremium = false,
  placement,
  onAdLoaded,
  onAdError,
}) => {
  useEffect(() => {
    // Don't show ads to premium users
    if (isPremium) {
      return;
    }

    try {
      // Push ad to AdSense queue
      if (typeof window !== 'undefined' && (window as any).adsbygoogle) {
        ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
      }

      // Track ad impression
      if (placement) {
        trackAdImpression(placement);
      }

      if (onAdLoaded) {
        onAdLoaded();
      }
    } catch (error) {
      console.error('AdSense error:', error);
      if (onAdError) {
        onAdError(error as Error);
      }
    }
  }, [isPremium, placement, onAdLoaded, onAdError]);

  // Don't render anything for premium users
  if (isPremium) {
    return null;
  }

  return (
    <div className={className}>
      <ins
        className="adsbygoogle"
        style={style}
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format={format}
        {...(layout && { 'data-ad-layout': layout })}
        {...(layoutKey && { 'data-ad-layout-key': layoutKey })}
      />
    </div>
  );
};

/**
 * Track ad impression to the server
 */
async function trackAdImpression(placement: string): Promise<void> {
  try {
    await fetch('/api/ads/impression', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        placement,
        ad_type: 'display',
        ad_network: 'adsense',
      }),
      credentials: 'include',
    });
  } catch (error) {
    console.error('Failed to track ad impression:', error);
  }
}

/**
 * Helper component for common ad placements
 */
export const AdPlacements = {
  /**
   * Banner ad (top of page)
   */
  Banner: (props: Omit<AdSenseAdProps, 'format' | 'style'>) => (
    <AdSenseAd
      {...props}
      format="horizontal"
      style={{ display: 'block', width: '100%', height: '90px' }}
      placement="banner"
    />
  ),

  /**
   * Sidebar ad (rectangle)
   */
  Sidebar: (props: Omit<AdSenseAdProps, 'format' | 'style'>) => (
    <AdSenseAd
      {...props}
      format="rectangle"
      style={{ display: 'block', width: '300px', height: '250px' }}
      placement="sidebar"
    />
  ),

  /**
   * In-content ad (responsive)
   */
  InContent: (props: Omit<AdSenseAdProps, 'format' | 'style'>) => (
    <AdSenseAd {...props} format="auto" style={{ display: 'block' }} placement="in-content" />
  ),

  /**
   * Between games ad (full width)
   */
  BetweenGames: (props: Omit<AdSenseAdProps, 'format' | 'style'>) => (
    <AdSenseAd
      {...props}
      format="auto"
      style={{ display: 'block', width: '100%', minHeight: '250px' }}
      placement="between-games"
    />
  ),
};

export default AdSenseAd;
