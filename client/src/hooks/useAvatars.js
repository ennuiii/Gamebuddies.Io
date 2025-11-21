import { useState, useEffect } from 'react';

// Global cache to prevent re-fetching
let cachedAvatars = [];
let isFetching = false;
let fetchPromise = null;

export const useAvatars = () => {
  const [avatars, setAvatars] = useState(cachedAvatars);
  const [loading, setLoading] = useState(cachedAvatars.length === 0);

  useEffect(() => {
    if (cachedAvatars.length > 0) {
      setLoading(false);
      return;
    }

    if (!isFetching) {
      isFetching = true;
      fetchPromise = fetch('/api/avatars')
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            cachedAvatars = data.avatars;
            return cachedAvatars;
          }
          return [];
        })
        .catch(err => {
          console.error('Failed to load avatars', err);
          return [];
        })
        .finally(() => {
          isFetching = false;
        });
    }

    if (fetchPromise) {
      fetchPromise.then(data => {
        setAvatars(data);
        setLoading(false);
      });
    }
  }, []);

  const getAvatarSrc = (id) => {
    const avatar = avatars.find(a => a.id === id);
    return avatar ? avatar.src : null;
  };

  return { avatars, loading, getAvatarSrc };
};
