import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000';

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
  sendDirectMessage(receiverId: string, content: string) {
    this.socket?.emit('sendDirectMessage', { receiverId, content });
  }

  // 发送频道消息
  sendChannelMessage(channelId: string, content: string) {
    this.socket?.emit('sendChannelMessage', { channelId, content });
  }

  // 标记会话为已读
  markConversationAsRead(conversationId: string, messageId: string) {
    this.socket?.emit('markConversationAsRead', { conversationId, messageId });
  }

  // 发送正在输入事件
  sendTyping(data: { channelId?: string; conversationId?: string }) {
    this.socket?.emit('typing', data);
  }

  // 更新用户状态
  updateStatus(status: string) {
    this.socket?.emit('updateStatus', status);
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
