import { useState, useEffect } from 'react';

type OrientationType = 'portrait' | 'landscape';

interface OrientationState {
  type: OrientationType;
  isPortrait: boolean;
  isLandscape: boolean;
  angle: number;
}

export const useOrientation = (): OrientationState => {
  const getOrientation = (): OrientationState => {
    const isPortrait = window.innerHeight > window.innerWidth;
    const angle = window.screen?.orientation?.angle || 0;

    return {
      type: isPortrait ? 'portrait' : 'landscape',
      isPortrait,
      isLandscape: !isPortrait,
      angle,
    };
  };

  const [orientation, setOrientation] = useState<OrientationState>(getOrientation());

  useEffect(() => {
    const handleOrientationChange = () => {
      setOrientation(getOrientation());
    };

    // Listen for orientation changes
    window.addEventListener('orientationchange', handleOrientationChange);
    window.addEventListener('resize', handleOrientationChange);

    // Check on mount
    handleOrientationChange();

    return () => {
      window.removeEventListener('orientationchange', handleOrientationChange);
      window.removeEventListener('resize', handleOrientationChange);
    };
  }, []);

  return orientation;
};

// Helper to request fullscreen + landscape
export const requestLandscapeFullscreen = async (): Promise<void> => {
  try {
    // Request fullscreen
    if (document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
    }

    // Lock to landscape orientation (if supported)
    if (window.screen.orientation?.lock) {
      try {
        await window.screen.orientation.lock('landscape');
      } catch (err) {
        console.warn('Orientation lock not supported:', err);
      }
    }
  } catch (err) {
    console.error('Failed to enter fullscreen landscape:', err);
  }
};

// Helper to exit fullscreen
export const exitFullscreen = (): void => {
  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen();
  }
};

export default useOrientation;
