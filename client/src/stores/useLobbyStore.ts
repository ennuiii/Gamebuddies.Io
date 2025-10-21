import { create } from 'zustand';

interface Player {
  id: string;
  username: string;
  isReady: boolean;
  isHost: boolean;
}

interface LobbyState {
  // Room state
  roomCode: string | null;
  isInLobby: boolean;
  isHost: boolean;
  players: Player[];
  selectedGame: string | null;
  maxPlayers: number;
  isPublic: boolean;
  streamerMode: boolean;

  // Actions
  setRoomCode: (code: string | null) => void;
  setIsInLobby: (inLobby: boolean) => void;
  setIsHost: (isHost: boolean) => void;
  setPlayers: (players: Player[]) => void;
  addPlayer: (player: Player) => void;
  removePlayer: (playerId: string) => void;
  updatePlayer: (playerId: string, updates: Partial<Player>) => void;
  setSelectedGame: (game: string | null) => void;
  setRoomSettings: (settings: {
    maxPlayers?: number;
    isPublic?: boolean;
    streamerMode?: boolean;
  }) => void;
  leaveLobby: () => void;
  reset: () => void;
}

const initialState = {
  roomCode: null,
  isInLobby: false,
  isHost: false,
  players: [],
  selectedGame: null,
  maxPlayers: 10,
  isPublic: true,
  streamerMode: false,
};

export const useLobbyStore = create<LobbyState>(set => ({
  ...initialState,

  setRoomCode: code => set({ roomCode: code }),

  setIsInLobby: inLobby => set({ isInLobby: inLobby }),

  setIsHost: isHost => set({ isHost }),

  setPlayers: players => set({ players }),

  addPlayer: player =>
    set(state => ({
      players: [...state.players, player],
    })),

  removePlayer: playerId =>
    set(state => ({
      players: state.players.filter(p => p.id !== playerId),
    })),

  updatePlayer: (playerId, updates) =>
    set(state => ({
      players: state.players.map(p => (p.id === playerId ? { ...p, ...updates } : p)),
    })),

  setSelectedGame: game => set({ selectedGame: game }),

  setRoomSettings: settings => set(settings),

  leaveLobby: () =>
    set({
      roomCode: null,
      isInLobby: false,
      isHost: false,
      players: [],
      selectedGame: null,
    }),

  reset: () => set(initialState),
}));
