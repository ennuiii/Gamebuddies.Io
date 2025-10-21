import { create } from 'zustand';

interface Notification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
}

interface UIState {
  // Loading states
  isLoading: boolean;
  loadingMessage: string | null;

  // Modals
  isCreateRoomModalOpen: boolean;
  isJoinRoomModalOpen: boolean;
  isSettingsModalOpen: boolean;

  // Notifications
  notifications: Notification[];

  // Actions
  setLoading: (loading: boolean, message?: string) => void;
  setCreateRoomModalOpen: (open: boolean) => void;
  setJoinRoomModalOpen: (open: boolean) => void;
  setSettingsModalOpen: (open: boolean) => void;
  addNotification: (notification: Omit<Notification, 'id'>) => void;
  removeNotification: (id: string) => void;
  closeAllModals: () => void;
}

export const useUIStore = create<UIState>(set => ({
  isLoading: false,
  loadingMessage: null,
  isCreateRoomModalOpen: false,
  isJoinRoomModalOpen: false,
  isSettingsModalOpen: false,
  notifications: [],

  setLoading: (loading, message) => set({ isLoading: loading, loadingMessage: message || null }),

  setCreateRoomModalOpen: open => set({ isCreateRoomModalOpen: open }),

  setJoinRoomModalOpen: open => set({ isJoinRoomModalOpen: open }),

  setSettingsModalOpen: open => set({ isSettingsModalOpen: open }),

  addNotification: notification =>
    set(state => ({
      notifications: [
        ...state.notifications,
        { ...notification, id: Date.now().toString() + Math.random() },
      ],
    })),

  removeNotification: id =>
    set(state => ({
      notifications: state.notifications.filter(n => n.id !== id),
    })),

  closeAllModals: () =>
    set({
      isCreateRoomModalOpen: false,
      isJoinRoomModalOpen: false,
      isSettingsModalOpen: false,
    }),
}));
