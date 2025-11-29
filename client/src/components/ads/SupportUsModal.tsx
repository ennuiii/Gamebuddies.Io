import React, { useState, useEffect } from 'react';
import { useAds } from './AdContext';
import AdPlaceholder from './AdPlaceholder';
import './ads.css';

interface SupportUsModalProps {
  onClose?: () => void;
}

/**
 * Optional "Support Us" modal shown after game rounds.
 * Users can skip immediately or watch an ad to support the platform.
 */
const SupportUsModal: React.FC<SupportUsModalProps> = ({ onClose }) => {
  const { isSupportModalOpen, hideSupportModal, onAdWatched, shouldShowAds } = useAds();
  const [isWatching, setIsWatching] = useState(false);
  const [watchProgress, setWatchProgress] = useState(0);

  // Don't render if not open or shouldn't show ads
  if (!isSupportModalOpen || !shouldShowAds) {
    return null;
  }

  const handleSkip = () => {
    hideSupportModal();
    onClose?.();
  };

  const handleWatch = () => {
    setIsWatching(true);
    // Simulate ad watching (15 seconds)
    // TODO: Replace with real video ad SDK
  };

  // Simulate ad progress
  useEffect(() => {
    if (!isWatching) return;

    const duration = 15; // seconds
    const interval = setInterval(() => {
      setWatchProgress(prev => {
        const next = prev + (100 / duration);
        if (next >= 100) {
          clearInterval(interval);
          onAdWatched('video');
          setTimeout(() => {
            setIsWatching(false);
            setWatchProgress(0);
            hideSupportModal();
            onClose?.();
          }, 500);
          return 100;
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isWatching, onAdWatched, hideSupportModal, onClose]);

  return (
    <div className="support-modal-overlay" onClick={handleSkip}>
      <div className="support-modal" onClick={e => e.stopPropagation()}>
        {!isWatching ? (
          <>
            <div className="support-modal-header">
              <span className="support-modal-heart">💙</span>
              <h3>Help Keep GameBuddies Free!</h3>
            </div>

            <p className="support-modal-text">
              Watch a short ad to support our servers? It helps us keep the games running for everyone!
            </p>

            <div className="support-modal-preview">
              <AdPlaceholder width={300} height={169} label="Video Ad" />
            </div>

            <div className="support-modal-actions">
              <button className="support-modal-skip" onClick={handleSkip}>
                Skip
              </button>
              <button className="support-modal-watch" onClick={handleWatch}>
                Support Us (15s)
              </button>
            </div>

            <p className="support-modal-premium-hint">
              Premium users never see ads ✨
            </p>
          </>
        ) : (
          <>
            <div className="support-modal-watching">
              <h3>Thanks for supporting us! 💙</h3>
              <div className="ad-video-container">
                <AdPlaceholder width={400} height={225} label="Video Playing..." />
              </div>
              <div className="ad-progress-bar">
                <div
                  className="ad-progress-fill"
                  style={{ width: `${watchProgress}%` }}
                />
              </div>
              <p className="ad-progress-text">
                {Math.ceil((100 - watchProgress) / (100 / 15))}s remaining
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SupportUsModal;
