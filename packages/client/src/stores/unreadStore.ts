import { create } from 'zustand';

interface UnreadState {
  channelUnread: Record<string, number>;
  dmUnreadByFriend: Record<string, number>;
  incrementChannel: (channelId: string, delta?: number) => void;
  decrementChannel: (channelId: string, delta?: number) => void;
  clearChannel: (channelId: string) => void;
  incrementDM: (friendId: string, delta?: number) => void;
  decrementDM: (friendId: string, delta?: number) => void;
  clearDM: (friendId: string) => void;
  setChannelCount: (channelId: string, count: number) => void;
  setDMCount: (friendId: string, count: number) => void;
  resetAll: () => void;
}

export const useUnreadStore = create<UnreadState>((set) => ({
  channelUnread: {},
  dmUnreadByFriend: {},

  incrementChannel: (channelId, delta = 1) =>
    set((state) => ({
      channelUnread: {
        ...state.channelUnread,
        [channelId]: (state.channelUnread[channelId] || 0) + delta,
      },
    })),

  decrementChannel: (channelId, delta = 1) =>
    set((state) => ({
      channelUnread: {
        ...state.channelUnread,
        [channelId]: Math.max(0, (state.channelUnread[channelId] || 0) - delta),
      },
    })),

  clearChannel: (channelId) =>
    set((state) => {
      if (!state.channelUnread[channelId]) return state;
      const next = { ...state.channelUnread };
      delete next[channelId];
      return { channelUnread: next } as Pick<UnreadState, 'channelUnread'>;
    }),

  incrementDM: (friendId, delta = 1) =>
    set((state) => ({
      dmUnreadByFriend: {
        ...state.dmUnreadByFriend,
        [friendId]: (state.dmUnreadByFriend[friendId] || 0) + delta,
      },
    })),

  decrementDM: (friendId, delta = 1) =>
    set((state) => ({
      dmUnreadByFriend: {
        ...state.dmUnreadByFriend,
        [friendId]: Math.max(0, (state.dmUnreadByFriend[friendId] || 0) - delta),
      },
    })),

  clearDM: (friendId) =>
    set((state) => {
      if (!state.dmUnreadByFriend[friendId]) return state;
      const next = { ...state.dmUnreadByFriend };
      delete next[friendId];
      return { dmUnreadByFriend: next } as Pick<UnreadState, 'dmUnreadByFriend'>;
    }),

  setChannelCount: (channelId, count) =>
    set((state) => ({
      channelUnread: { ...state.channelUnread, [channelId]: Math.max(0, count) },
    })),

  setDMCount: (friendId, count) =>
    set((state) => ({
      dmUnreadByFriend: { ...state.dmUnreadByFriend, [friendId]: Math.max(0, count) },
    })),

  resetAll: () => set({ channelUnread: {}, dmUnreadByFriend: {} }),
}));
