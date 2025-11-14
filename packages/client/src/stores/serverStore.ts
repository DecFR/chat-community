import { create } from 'zustand';
import { serverAPI } from '../lib/api';

interface Channel {
  id: string;
  name: string;
  description?: string;
  type: string;
  serverId: string;
}

interface Server {
  id: string;
  name: string;
  description?: string;
  iconUrl?: string;
  ownerId: string;
  channels: Channel[];
}

interface ServerState {
  servers: Server[];
  currentServerId: string | null;
  currentChannelId: string | null;
  isLoading: boolean;
  loadServers: () => Promise<void>;
  createServer: (name: string, description?: string) => Promise<void>;
  selectServer: (serverId: string) => void;
  selectChannel: (channelId: string) => void;
  createChannel: (serverId: string, name: string, description?: string) => Promise<void>;
}

export const useServerStore = create<ServerState>((set, get) => ({
  servers: [],
  currentServerId: null,
  currentChannelId: null,
  isLoading: false,

  loadServers: async () => {
    try {
      set({ isLoading: true });
      const response = await serverAPI.getServers();
      const servers = response.data.data;
      set({ servers, isLoading: false });
    } catch (error) {
      console.error('Failed to load servers:', error);
      set({ isLoading: false });
    }
  },

  createServer: async (name, description) => {
    try {
      const response = await serverAPI.createServer({ name, description });
      const newServer = response.data.data;
      set((state) => ({ servers: [...state.servers, newServer] }));
    } catch (error) {
      console.error('Failed to create server:', error);
      throw error;
    }
  },

  selectServer: (serverId) => {
    set({ currentServerId: serverId });
    const server = get().servers.find((s) => s.id === serverId);
    if (server && server.channels.length > 0) {
      set({ currentChannelId: server.channels[0].id });
    }
  },

  selectChannel: (channelId) => {
    set({ currentChannelId: channelId });
  },

  createChannel: async (serverId, name, description) => {
    try {
      const response = await serverAPI.createChannel(serverId, { name, description });
      const newChannel = response.data.data;

      set((state) => ({
        servers: state.servers.map((server) =>
          server.id === serverId
            ? { ...server, channels: [...server.channels, newChannel] }
            : server
        ),
      }));
    } catch (error) {
      console.error('Failed to create channel:', error);
      throw error;
    }
  },
}));
