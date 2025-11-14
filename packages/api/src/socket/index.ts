import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma';
import { encrypt, decrypt } from '../utils/encryption';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

interface AuthSocket extends Socket {
  userId?: string;
  username?: string;
}

interface SendMessageData {
  content: string;
  channelId?: string;
  conversationId?: string;
  receiverId?: string;
}

interface MarkAsReadData {
  conversationId: string;
  messageId: string;
}

let io: Server;

export function initializeSocket(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      credentials: true,
    },
  });

  // 认证中间件
  io.use(async (socket: AuthSocket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Authentication error'));
      }

      const decoded = jwt.verify(token, JWT_SECRET) as { id: string; username: string };
      socket.userId = decoded.id;
      socket.username = decoded.username;

      next();
    } catch (error) {
      next(new Error('Authentication error'));
    }
  });

  // 连接事件
  io.on('connection', async (socket: AuthSocket) => {
    console.log(`User connected: ${socket.username} (${socket.userId})`);

    // 加入用户个人房间
    socket.join(`user-${socket.userId}`);

    // 更新用户状态为在线
    await prisma.user.update({
      where: { id: socket.userId },
      data: { status: 'ONLINE' },
    });

    // 通知好友用户上线
    await notifyFriendsStatus(socket.userId!, 'ONLINE');

    // 加入所有服务器房间(包括成员服务器和公共服务器)
    const servers = await prisma.server.findMany({
      select: {
        id: true,
      },
    });

    servers.forEach((server: any) => {
      socket.join(`server-${server.id}`);
    });

    // 发送直接消息
    socket.on('sendDirectMessage', async (data: SendMessageData) => {
      try {
        const { content, receiverId } = data;

        if (!receiverId) {
          socket.emit('error', { message: 'Receiver ID is required' });
          return;
        }

        // 查找或创建对话
        let conversation = await prisma.directMessageConversation.findFirst({
          where: {
            OR: [
              { user1Id: socket.userId!, user2Id: receiverId },
              { user1Id: receiverId, user2Id: socket.userId! },
            ],
          },
        });

        if (!conversation) {
          conversation = await prisma.directMessageConversation.create({
            data: {
              user1Id: socket.userId!,
              user2Id: receiverId,
            },
          });
        }

        // 加密并保存消息
        const encryptedContent = encrypt(content);
        const message = await prisma.message.create({
          data: {
            encryptedContent,
            authorId: socket.userId!,
            directMessageConversationId: conversation.id,
          },
          include: {
            author: {
              select: {
                id: true,
                username: true,
                avatarUrl: true,
              },
            },
          },
        });

        // 解密后发送
        const decryptedMessage = {
          ...message,
          content: decrypt(message.encryptedContent),
          encryptedContent: undefined,
        };

        // 发送给发送者和接收者
        io.to(`user-${socket.userId}`).emit('directMessage', decryptedMessage);
        io.to(`user-${receiverId}`).emit('directMessage', decryptedMessage);
      } catch (error) {
        console.error('Error sending direct message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // 发送频道消息
    socket.on('sendChannelMessage', async (data: SendMessageData) => {
      try {
        const { content, channelId } = data;

        if (!channelId) {
          socket.emit('error', { message: 'Channel ID is required' });
          return;
        }

        // 加密并保存消息
        const encryptedContent = encrypt(content);
        const message = await prisma.message.create({
          data: {
            encryptedContent,
            authorId: socket.userId!,
            channelId,
          },
          include: {
            author: {
              select: {
                id: true,
                username: true,
                avatarUrl: true,
              },
            },
            channel: {
              select: {
                serverId: true,
              },
            },
          },
        });

        // 解密后发送
        const decryptedMessage = {
          ...message,
          content: decrypt(message.encryptedContent),
          encryptedContent: undefined,
        };

        // 广播到服务器房间
        io.to(`server-${message.channel?.serverId}`).emit('channelMessage', decryptedMessage);
      } catch (error) {
        console.error('Error sending channel message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // 标记会话为已读
    socket.on('markConversationAsRead', async (data: MarkAsReadData) => {
      try {
        const { conversationId, messageId } = data;

        await prisma.userConversationState.upsert({
          where: {
            userId_conversationId: {
              userId: socket.userId!,
              conversationId,
            },
          },
          update: {
            lastReadMessageId: messageId,
          },
          create: {
            userId: socket.userId!,
            conversationId,
            lastReadMessageId: messageId,
          },
        });

        socket.emit('conversationMarkedAsRead', { conversationId, messageId });
      } catch (error) {
        console.error('Error marking conversation as read:', error);
      }
    });

    // 用户正在输入
    socket.on('typing', (data: { channelId?: string; conversationId?: string }) => {
      if (data.channelId) {
        socket.to(`channel-${data.channelId}`).emit('userTyping', {
          userId: socket.userId,
          username: socket.username,
          channelId: data.channelId,
        });
      } else if (data.conversationId) {
        socket.to(`conversation-${data.conversationId}`).emit('userTyping', {
          userId: socket.userId,
          username: socket.username,
          conversationId: data.conversationId,
        });
      }
    });

    // 更新用户状态
    socket.on('updateStatus', async (status: string) => {
      try {
        await prisma.user.update({
          where: { id: socket.userId },
          data: { status: status as any },
        });

        await notifyFriendsStatus(socket.userId!, status);
      } catch (error) {
        console.error('Error updating status:', error);
      }
    });

    // 断开连接
    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${socket.username} (${socket.userId})`);

      // 更新用户状态为离线
      await prisma.user.update({
        where: { id: socket.userId },
        data: { status: 'OFFLINE' },
      });

      // 通知好友用户离线
      await notifyFriendsStatus(socket.userId!, 'OFFLINE');
    });
  });

  return io;
}

// 通知好友用户状态变更
async function notifyFriendsStatus(userId: string, status: string) {
  const friendships = await prisma.friendship.findMany({
    where: {
      OR: [
        { senderId: userId, status: 'ACCEPTED' },
        { receiverId: userId, status: 'ACCEPTED' },
      ],
    },
  });

  const friendIds = friendships.map((f: any) =>
    f.senderId === userId ? f.receiverId : f.senderId
  );

  friendIds.forEach((friendId: string) => {
    io.to(`user-${friendId}`).emit('friendStatusUpdate', {
      userId,
      status,
    });
  });
}

export function getIO(): Server {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
}
