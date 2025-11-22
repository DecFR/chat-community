import { io, Socket } from 'socket.io-client';
import { logoutProxy, updateUserProxy } from './authProxy';

// 处理 API URL，增加类型安全检查
const envApiUrl = import.meta.env.VITE_API_URL;
let SOCKET_URL: string | undefined;

if (typeof envApiUrl === 'string' && envApiUrl) {
  // 移除末尾的 /api 和斜杠
  const cleanUrl = envApiUrl.replace(/\/api\/?$/, '').replace(/\/$/, '');
  // 如果配置的是 '/' (生产环境相对路径)，则设为 undefined 让 io() 自动推断当前 Origin
  SOCKET_URL = cleanUrl === '' ? undefined : cleanUrl;
}

class SocketService {
  private socket: Socket | null = null;
  private pendingServerJoins: Set<string> = new Set(); // 待加入的服务器队列
  private joinedServers: Set<string> = new Set(); // 已加入的服务器房间
  private reconnectCallback: (() => void) | null = null; // Socket重连时的回调

  connect(token: string) {
    if (this.socket?.connected) {
      return this.socket;
    }

    // 🟢 修复：移除 :any 类型，使用具体配置对象
    const opts = {
      auth: { token },
      // 显式指定路径，匹配 Nginx location /socket.io/
      path: '/socket.io/',
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
      // 建议顺序：先 polling 握手，再升级 websocket
      transports: ['polling', 'websocket'] as string[], // 👈 显式断言为 string 数组
      withCredentials: true, // 允许携带 Cookie
    };

    console.log('[Socket] Connecting to:', SOCKET_URL || 'Current Origin', 'Path:', opts.path);

    // 若未提供 SOCKET_URL，则让 socket.io 以同源方式连接
    if (SOCKET_URL) {
      this.socket = io(SOCKET_URL, opts);
    } else {
      // 不传 URL，默认连接 window.location.origin
      this.socket = io(opts);
    }

    this.socket.on('connect', () => {
      console.log('Socket connected, ID:', this.socket?.id);
      
      // 连接建立后，立即加入所有待处理的服务器房间
      if (this.pendingServerJoins.size > 0) {
        console.log('[Socket] Processing pending server joins:', Array.from(this.pendingServerJoins));
        this.pendingServerJoins.forEach(serverId => {
          this.socket?.emit('joinServer', { serverId });
          this.joinedServers.add(serverId);
        });
        this.pendingServerJoins.clear();
      }
      
      // 执行重连回调
      if (this.reconnectCallback) {
        this.reconnectCallback();
      }
    });

    this.socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      // 断开连接时清空已加入房间记录
      this.joinedServers.clear();
    });

    // 监听强制登出事件
    this.socket.on('forceLogout', (data: { reason: string; message: string }) => {
      try {
        console.warn('Force logout:', data);
        logoutProxy();
        this.disconnect();
        // eslint-disable-next-line no-alert
        alert(data.message || '您的账号在其他设备登录，您已被强制下线');
        window.location.href = '/login';
      } catch (e) {
        console.error('Error handling forceLogout:', e);
      }
    });

    // 全局监听自身资料更新
    this.socket.on('userProfileUpdate', (data: { userId: string; avatarUrl?: string; username?: string }) => {
      try {
        updateUserProxy({ 
          ...(data.avatarUrl !== undefined && { avatarUrl: data.avatarUrl }), 
          ...(data.username && { username: data.username }), 
          id: data.userId 
        });
      } catch (e) {
        console.error('Error handling userProfileUpdate:', e);
      }
    });

    return this.socket;
  }
  
  setReconnectCallback(callback: () => void) {
    this.reconnectCallback = callback;
  }

  disconnect() {
    if (this.socket) {
      this.socket.emit('updateStatus', 'OFFLINE');
      this.socket.disconnect();
      this.socket = null;
      this.joinedServers.clear();
      this.pendingServerJoins.clear();
    }
  }

  getSocket(): Socket | null {
    return this.socket;
  }
  
  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sendDirectMessage(receiverId: string, content: string, attachments?: any[]) {
    this.socket?.emit('sendDirectMessage', { receiverId, content, attachments });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sendChannelMessage(channelId: string, content: string, attachments?: any[]) {
    this.socket?.emit('sendChannelMessage', { channelId, content, attachments });
  }

  markConversationAsRead(conversationId: string, messageId: string) {
    this.socket?.emit('markConversationAsRead', { conversationId, messageId });
  }

  markChannelAsRead(channelId: string, messageId: string) {
    this.socket?.emit('markChannelAsRead', { channelId, messageId });
  }

  sendTyping(data: { channelId?: string; conversationId?: string }) {
    this.socket?.emit('typing', data);
  }

  updateStatus(status: string) {
    this.socket?.emit('updateStatus', status);
  }

  joinServer(serverId: string) {
    if (!serverId) return;
    if (this.joinedServers.has(serverId)) return;
    
    if (this.socket?.connected) {
      this.socket.emit('joinServer', { serverId });
      this.joinedServers.add(serverId);
    } else {
      this.pendingServerJoins.add(serverId);
    }
  }
  
  joinServers(serverIds: string[]) {
    serverIds.forEach(id => this.joinServer(id));
  }

  leaveServer(serverId: string) {
    if (!serverId) return;
    this.socket?.emit('leaveServer', { serverId });
    this.joinedServers.delete(serverId);
    this.pendingServerJoins.delete(serverId);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, callback: (...args: any[]) => void) {
    this.socket?.on(event, callback);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  off(event: string, callback?: (...args: any[]) => void) {
    this.socket?.off(event, callback);
  }
}

export const socketService = new SocketService();