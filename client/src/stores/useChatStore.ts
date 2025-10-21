import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  playerName: string;
  message: string;
  timestamp: number;
  type: 'message' | 'system' | 'join' | 'leave';
}

interface ChatState {
  messages: ChatMessage[];
  unreadCount: number;
  isChatOpen: boolean;

  // Actions
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  addSystemMessage: (message: string) => void;
  clearMessages: () => void;
  setChatOpen: (open: boolean) => void;
  markAsRead: () => void;
}

export const useChatStore = create<ChatState>(set => ({
  messages: [],
  unreadCount: 0,
  isChatOpen: false,

  addMessage: message =>
    set(state => {
      const newMessage: ChatMessage = {
        ...message,
        id: `${Date.now()}-${Math.random()}`,
        timestamp: Date.now(),
      };

      return {
        messages: [...state.messages, newMessage],
        unreadCount: state.isChatOpen ? state.unreadCount : state.unreadCount + 1,
      };
    }),

  addSystemMessage: message =>
    set(state => ({
      messages: [
        ...state.messages,
        {
          id: `${Date.now()}-${Math.random()}`,
          playerName: 'System',
          message,
          timestamp: Date.now(),
          type: 'system',
        },
      ],
    })),

  clearMessages: () =>
    set({
      messages: [],
      unreadCount: 0,
    }),

  setChatOpen: open =>
    set(state => ({
      isChatOpen: open,
      unreadCount: open ? 0 : state.unreadCount,
    })),

  markAsRead: () =>
    set({
      unreadCount: 0,
    }),
}));
