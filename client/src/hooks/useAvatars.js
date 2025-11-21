import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

// Cache to prevent re-fetching, keyed by token (or 'guest' for no token)
const avatarCache = {};
let activeFetchPromise = null;

export const useAvatars = () => {
  const { session } = useAuth();
  const token = session?.access_token;
  const cacheKey = token || 'guest';

  const [avatars, setAvatars] = useState(avatarCache[cacheKey] || []);
  const [loading, setLoading] = useState(!avatarCache[cacheKey]);

  useEffect(() => {
    // If we have cached data for this state, use it
    if (avatarCache[cacheKey]) {
      setAvatars(avatarCache[cacheKey]);
      setLoading(false);
      return;
    }

    const fetchAvatars = async () => {
      setLoading(true);
      try {
        const headers = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        // Cancel previous fetch if needed? simpler to just fetch
        const res = await fetch('/api/avatars', { headers });
        const data = await res.json();

        if (data.success) {
          avatarCache[cacheKey] = data.avatars;
          setAvatars(data.avatars);
        }
      } catch (err) {
        console.error('Failed to load avatars', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAvatars();
  }, [token, cacheKey]);

  const getAvatarSrc = (id) => {
    // Search in current avatars first, then try to find in any cache as fallback
    let avatar = avatars.find(a => a.id === id);
    
    if (!avatar) {
      // Fallback: search all caches (useful if user logs out but still needs to show an avatar)
      for (const key in avatarCache) {
        const found = avatarCache[key].find(a => a.id === id);
        if (found) {
          avatar = found;
          break;
        }
      }
    }
    
    return avatar ? avatar.src : null;
  };

  return { avatars, loading, getAvatarSrc };
};
