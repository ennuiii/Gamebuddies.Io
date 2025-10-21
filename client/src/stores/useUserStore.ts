import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UserSettings {
  soundEnabled: boolean;
  musicVolume: number;
  sfxVolume: number;
  theme: 'light' | 'dark' | 'auto';
  language: string;
}

interface UserState {
  // User info
  playerName: string | null;
  userId: string | null;

  // Settings
  settings: UserSettings;

  // Actions
  setPlayerName: (name: string) => void;
  setUserId: (id: string) => void;
  updateSettings: (settings: Partial<UserSettings>) => void;
  reset: () => void;
}

const defaultSettings: UserSettings = {
  soundEnabled: true,
  musicVolume: 0.7,
  sfxVolume: 0.8,
  theme: 'auto',
  language: 'en',
};

export const useUserStore = create<UserState>()(
  persist(
    set => ({
      playerName: null,
      userId: null,
      settings: defaultSettings,

      setPlayerName: name => set({ playerName: name }),

      setUserId: id => set({ userId: id }),

      updateSettings: newSettings =>
        set(state => ({
          settings: { ...state.settings, ...newSettings },
        })),

      reset: () =>
        set({
          playerName: null,
          userId: null,
          settings: defaultSettings,
        }),
    }),
    {
      name: 'gamebuddies-user-storage',
      partialize: state => ({
        playerName: state.playerName,
        settings: state.settings,
      }),
    }
  )
);
