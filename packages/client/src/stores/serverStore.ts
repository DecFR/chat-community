import { create } from 'zustand';
import { serverAPI } from '../lib/api';

export interface Channel {
  id: string;
  name: string;
  description?: string;
  type: string;
  serverId: string;
}

export interface Server {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  ownerId: string;
  owner: { username: string };
  channels: Channel[];
  createdAt: string;
  _count?: {
    members: number;
    channels: number;
  };
}

interface ServerState {
  servers: Server[];
  currentServerId: string | null;
  currentChannelId: string | null;
  isLoading: boolean;
  isServersLoaded: boolean; // 新增状态
  loadServers: () => Promise<void>;
  createServer: (name: string, description?: string) => Promise<void>;
  selectServer: (serverId: string) => void;
  selectChannel: (channelId: string) => void;
  createChannel: (serverId: string, name: string, description?: string) => Promise<void>;
  updateChannel: (channelId: string, name: string, description?: string) => Promise<void>;
  deleteChannel: (channelId: string) => Promise<void>;
  deleteServer: (serverId: string) => Promise<void>;
}

export const useServerStore = create<ServerState>((set, get) => ({
  servers: [],
  currentServerId: null,
  currentChannelId: null,
  isLoading: false,
  isServersLoaded: false, // 初始值为 false

  loadServers: async () => {
    try {
      console.log('[loadServers] Starting to load servers...');
      const response = await serverAPI.getServers();
      const servers = response.data.data;
      console.log('[loadServers] Loaded servers:', servers);
      console.log('[loadServers] Number of servers:', servers.length);
      servers.forEach((s: any) => {
        console.log(`  - Server: ${s.name}, Channels: ${s.channels?.length || 0}`);
      });
      // 一次性更新所有状态，避免中间状态
      set({ servers, isLoading: false, isServersLoaded: true });
      console.log('[loadServers] State updated successfully');
    } catch (error) {
      console.error('[loadServers] Failed to load servers:', error);
      set({ isLoading: false, isServersLoaded: false });
    }
  },

  createServer: async (name, description) => {
    try {
      const response = await serverAPI.createServer({ name, description });
      const newServer = response.data.data;
      await get().loadServers();
      
      // 创建服务器后立即加入 Socket 房间以接收实时消息
      const { socketService } = await import('../lib/socket');
      if (newServer?.id) {
        socketService.joinServer(newServer.id);
      }
    } catch (error) {
      console.error('Failed to create server:', error);
      throw error;
    }
  },

  selectServer: (serverId) => {
    set({ currentServerId: serverId || null });
    if (!serverId) {
      // 切换到好友视图时清除频道选择
      set({ currentChannelId: null });
    }
    // 注意: 不在这里自动设置 currentChannelId
    // 让 ServerList 组件负责导航到具体频道
  },

  selectChannel: (channelId) => {
    set({ currentChannelId: channelId });
    
    // 找到频道所属的服务器并设置为当前服务器
    const state = get();
    for (const server of state.servers) {
      if (server.channels.some(c => c.id === channelId)) {
        if (state.currentServerId !== server.id) {
          set({ currentServerId: server.id });
        }
        break;
      }
    }
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

  updateChannel: async (channelId, name, description) => {
    try {
      // 找到频道所属的服务器ID
      const state = get();
      let serverId = '';
      for (const server of state.servers) {
        if (server.channels.some(c => c.id === channelId)) {
          serverId = server.id;
          break;
        }
      }
      
      if (!serverId) throw new Error('Server not found for channel');
      
      const response = await serverAPI.updateChannel(serverId, channelId, { name, description });
      const updatedChannel = response.data.data;

      set((state) => ({
        servers: state.servers.map((server) => ({
          ...server,
          channels: server.channels.map((channel) =>
            channel.id === channelId ? updatedChannel : channel
          ),
        })),
      }));
    } catch (error) {
      console.error('Failed to update channel:', error);
      throw error;
    }
  },

  deleteChannel: async (channelId) => {
    try {
      // 找到频道所属的服务器ID
      const state = get();
      let serverId = '';
      for (const server of state.servers) {
        if (server.channels.some(c => c.id === channelId)) {
          serverId = server.id;
          break;
        }
      }
      
      if (!serverId) throw new Error('Server not found for channel');
      
      await serverAPI.deleteChannel(serverId, channelId);

      set((state) => ({
        servers: state.servers.map((server) => ({
          ...server,
          channels: server.channels.filter((channel) => channel.id !== channelId),
        })),
        currentChannelId: state.currentChannelId === channelId ? null : state.currentChannelId,
      }));
    } catch (error) {
      console.error('Failed to delete channel:', error);
      throw error;
    }
  },

  deleteServer: async (serverId) => {
    try {
      await serverAPI.deleteServer(serverId);

      set((state) => ({
        servers: state.servers.filter((server) => server.id !== serverId),
        currentServerId: state.currentServerId === serverId ? null : state.currentServerId,
      }));
    } catch (error) {
      console.error('Failed to delete server:', error);
      throw error;
    }
  },
}));
