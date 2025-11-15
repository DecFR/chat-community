import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const SOCKET_URL = API_URL.replace('/api', ''); // 移除 /api 后缀获取Socket.io服务器URL

class SocketService {
  private socket: Socket | null = null;

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
    });

    this.socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    // 全局监听自身资料更新，直接写入 authStore，保证任何界面都实时更新
    this.socket.on('userProfileUpdate', (data: { userId: string; avatarUrl?: string; username?: string }) => {
      const current = useAuthStore.getState().user;
      if (current && current.id === data.userId) {
        useAuthStore.getState().updateUser({
          ...(data.avatarUrl !== undefined && { avatarUrl: data.avatarUrl }),
          ...(data.username && { username: data.username })
        });
      }
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      // 在断开连接前更新状态为离线
      this.socket.emit('updateStatus', 'OFFLINE');
      this.socket.disconnect();
      this.socket = null;
    }
  }

  getSocket(): Socket | null {
    return this.socket;
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

  // 加入服务器房间
  joinServer(serverId: string) {
    this.socket?.emit('joinServer', { serverId });
  }

  // 离开服务器房间
  leaveServer(serverId: string) {
    this.socket?.emit('leaveServer', { serverId });
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
