import { io, Socket } from 'socket.io-client';
import { logoutProxy, updateUserProxy } from './authProxy';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const SOCKET_URL = API_URL.replace('/api', ''); // 移除 /api 后缀获取Socket.io服务器URL

class SocketService {
  private socket: Socket | null = null;
  private pendingServerJoins: Set<string> = new Set(); // 待加入的服务器队列
  private joinedServers: Set<string> = new Set(); // 已加入的服务器房间
  private reconnectCallback: (() => void) | null = null; // Socket重连时的回调

  connect(token: string) {
    if (this.socket?.connected) {
      return this.socket;
    }

    this.socket = io(SOCKET_URL, {
      auth: {
        token,
      },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      transports: ['polling', 'websocket'],
    });

    this.socket.on('connect', () => {
      console.log('Socket connected');
      
      // 连接建立后，立即加入所有待处理的服务器房间
      if (this.pendingServerJoins.size > 0) {
        console.log('[Socket] Processing pending server joins:', Array.from(this.pendingServerJoins));
        this.pendingServerJoins.forEach(serverId => {
          this.socket?.emit('joinServer', { serverId });
          this.joinedServers.add(serverId);
        });
        this.pendingServerJoins.clear();
      }
      
      // 执行重连回调（用于重新加入所有房间）
      if (this.reconnectCallback) {
        this.reconnectCallback();
      }
    });

    this.socket.on('disconnect', () => {
      console.log('Socket disconnected');
      // 断开连接时清空已加入房间记录，以便重连后重新加入
      this.joinedServers.clear();
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    // 监听强制登出事件
    this.socket.on('forceLogout', (data: { reason: string; message: string }) => {
      try {
        console.warn('Force logout:', data);
        // 使用 authProxy 调用已注册的登出函数
        logoutProxy();
        // 断开Socket连接
        this.disconnect();
        // 显示提示消息并跳转到登录页
        alert(data.message || '您的账号在其他设备登录，您已被强制下线');
        window.location.href = '/login';
      } catch (e) {
        console.error('Error handling forceLogout:', e);
      }
    });

    // 全局监听自身资料更新，直接写入 authStore，保证任何界面都实时更新
    this.socket.on('userProfileUpdate', (data: { userId: string; avatarUrl?: string; username?: string }) => {
      try {
        updateUserProxy({ ...(data.avatarUrl !== undefined && { avatarUrl: data.avatarUrl }), ...(data.username && { username: data.username }), id: data.userId });
      } catch (e) {
        console.error('Error handling userProfileUpdate:', e);
      }
    });

    return this.socket;
  }
  
  // 设置重连回调
  setReconnectCallback(callback: () => void) {
    this.reconnectCallback = callback;
  }

  disconnect() {
    if (this.socket) {
      // 在断开连接前更新状态为离线
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
  
  // 检查Socket是否已连接
  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  // 发送直接消息
  sendDirectMessage(receiverId: string, content: string, attachments?: any[]) {
    this.socket?.emit('sendDirectMessage', { receiverId, content, attachments });
  }

  // 发送频道消息
  sendChannelMessage(channelId: string, content: string, attachments?: any[]) {
    this.socket?.emit('sendChannelMessage', { channelId, content, attachments });
  }

  // 标记会话为已读
  markConversationAsRead(conversationId: string, messageId: string) {
    this.socket?.emit('markConversationAsRead', { conversationId, messageId });
  }

  // 标记频道为已读
  markChannelAsRead(channelId: string, messageId: string) {
    this.socket?.emit('markChannelAsRead', { channelId, messageId });
  }

  // 发送正在输入事件
  sendTyping(data: { channelId?: string; conversationId?: string }) {
    this.socket?.emit('typing', data);
  }

  // 更新用户状态
  updateStatus(status: string) {
    this.socket?.emit('updateStatus', status);
  }

  // 加入服务器房间（优化：添加连接状态检查和去重）
  joinServer(serverId: string) {
    if (!serverId) return;
    
    // 如果已经在房间中，跳过
    if (this.joinedServers.has(serverId)) {
      console.log(`[Socket] Already in server room: ${serverId}`);
      return;
    }
    
    if (this.socket?.connected) {
      // Socket已连接，立即加入
      console.log(`[Socket] Joining server room: ${serverId}`);
      this.socket.emit('joinServer', { serverId });
      this.joinedServers.add(serverId);
    } else {
      // Socket未连接，加入待处理队列
      console.log(`[Socket] Socket not connected, queuing server join: ${serverId}`);
      this.pendingServerJoins.add(serverId);
    }
  }
  
  // 批量加入服务器房间
  joinServers(serverIds: string[]) {
    console.log(`[Socket] Batch joining ${serverIds.length} server rooms`);
    serverIds.forEach(id => this.joinServer(id));
  }

  // 离开服务器房间
  leaveServer(serverId: string) {
    if (!serverId) return;
    this.socket?.emit('leaveServer', { serverId });
    this.joinedServers.delete(serverId);
    this.pendingServerJoins.delete(serverId);
  }

  // 监听事件
  on(event: string, callback: (...args: any[]) => void) {
    this.socket?.on(event, callback);
  }

  // 移除监听
  off(event: string, callback?: (...args: any[]) => void) {
    this.socket?.off(event, callback);
  }
}

export const socketService = new SocketService();
