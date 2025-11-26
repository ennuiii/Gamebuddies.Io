import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface Avatar {
  id: string;
  src: string;
  name?: string;
  premium?: boolean;
}

const avatarCache: Record<string, Avatar[]> = {};

export const useAvatars = (): {
  avatars: Avatar[];
  loading: boolean;
  getAvatarSrc: (id: string) => string | null;
} => {
  const { session } = useAuth();
  const token = session?.access_token;
  const cacheKey = token || 'guest';

  const [avatars, setAvatars] = useState<Avatar[]>(avatarCache[cacheKey] || []);
  const [loading, setLoading] = useState(!avatarCache[cacheKey]);

  useEffect(() => {
    if (avatarCache[cacheKey]) {
      setAvatars(avatarCache[cacheKey]);
      setLoading(false);
      return;
    }

    const fetchAvatars = async (): Promise<void> => {
      setLoading(true);
      try {
        const headers: Record<string, string> = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

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

  const getAvatarSrc = (id: string): string | null => {
    let avatar = avatars.find((a) => a.id === id);

    if (!avatar) {
      for (const key in avatarCache) {
        const found = avatarCache[key].find((a) => a.id === id);
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
