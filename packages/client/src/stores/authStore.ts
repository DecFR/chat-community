import { create } from 'zustand';
import { authAPI } from '../lib/api';
import { socketService } from '../lib/socket';

interface User {
  id: string;
  username: string;
  email?: string | null;
  displayName?: string | null;
  role: string;
  avatarUrl?: string | null;
  bio?: string | null;
  status: string;
  settings?: {
    theme?: 'LIGHT' | 'DARK' | 'SYSTEM';
    friendRequestPrivacy?: 'EVERYONE' | 'FRIENDS_OF_FRIENDS' | 'NONE';
  };
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, email?: string, inviteCode?: string) => Promise<void>;
  logout: () => void;
  loadUser: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUser: (user: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: localStorage.getItem('token'),
  isLoading: false,
  isAuthenticated: !!localStorage.getItem('token'),

  login: async (username, password) => {
    try {
      set({ isLoading: true });
      const response = await authAPI.login({ username, password });
      const { user, token } = response.data.data;

      localStorage.setItem('token', token);
      set({ user, token, isAuthenticated: true, isLoading: false });

      // 连接 Socket.IO
      socketService.connect(token);
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  register: async (username, password, email, inviteCode) => {
    try {
      set({ isLoading: true });
      const response = await authAPI.register({ username, password, email, inviteCode });
      const { user, token } = response.data.data;

      localStorage.setItem('token', token);
      set({ user, token, isAuthenticated: true, isLoading: false });

      // 连接 Socket.IO
      socketService.connect(token);
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    socketService.disconnect();
    set({ user: null, token: null, isAuthenticated: false });
  },

  loadUser: async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      set({ isAuthenticated: false });
      return;
    }

    try {
      set({ isLoading: true });
      const response = await authAPI.getMe();
      const user = response.data.data;

      set({ user, isAuthenticated: true, isLoading: false });

      // 连接 Socket.IO
      socketService.connect(token);
    } catch (error) {
      localStorage.removeItem('token');
      set({ user: null, token: null, isAuthenticated: false, isLoading: false });
    }
  },

  refreshUser: async () => {
    try {
      const response = await authAPI.getMe();
      const user = response.data.data;
      set({ user });
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  },

  updateUser: (userData) => {
    const { user } = get();
    if (user) {
      set({ user: { ...user, ...userData } });
    }
  },
}));
