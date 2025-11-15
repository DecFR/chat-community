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
  attachments?: Array<{
    url: string;
    type: 'IMAGE' | 'VIDEO' | 'FILE';
    filename?: string;
    mimeType?: string;
    size?: number;
    width?: number;
    height?: number;
    durationMs?: number;
  }>;
}

interface MarkAsReadData {
  conversationId: string;
  messageId: string;
}

interface MarkChannelReadData {
  channelId: string;
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

    // 通知所有服务器成员列表更新
    const userServers = await prisma.serverMember.findMany({
      where: { userId: socket.userId },
      select: { serverId: true },
    });

    for (const { serverId } of userServers) {
      io.to(`server-${serverId}`).emit('serverMemberUpdate', {
        serverId,
        userId: socket.userId,
        username: socket.username,
        status: 'ONLINE',
        action: 'online',
      });
    }

    // 发送直接消息
    socket.on('sendDirectMessage', async (data: SendMessageData) => {
      try {
          const { content, receiverId, attachments } = data;

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
              attachments: attachments && attachments.length > 0 ? {
                create: attachments.map(a => ({
                  url: a.url,
                  type: a.type as any,
                  filename: a.filename || '',
                  mimeType: a.mimeType || '',
                  size: a.size || 0,
                  width: a.width,
                  height: a.height,
                  durationMs: a.durationMs,
                })),
              } : undefined,
          },
          include: {
            author: {
              select: {
                id: true,
                username: true,
                avatarUrl: true,
              },
            },
              attachments: true,
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

    // 加入服务器房间（用于接收服务器频道消息）
    socket.on('joinServer', (data: { serverId?: string }) => {
      if (data?.serverId) {
        socket.join(`server-${data.serverId}`);
        console.log(`User ${socket.username} joined server room: server-${data.serverId}`);
      }
    });

    socket.on('leaveServer', (data: { serverId?: string }) => {
      if (data?.serverId) {
        socket.leave(`server-${data.serverId}`);
        console.log(`User ${socket.username} left server room: server-${data.serverId}`);
      }
    });

    // 加入/离开频道房间（用于 typing 等实时事件）
    socket.on('joinChannel', (data: { channelId?: string }) => {
      if (data?.channelId) {
        socket.join(`channel-${data.channelId}`);
      }
    });

    socket.on('leaveChannel', (data: { channelId?: string }) => {
      if (data?.channelId) {
        socket.leave(`channel-${data.channelId}`);
      }
    });

    // 加入/离开私聊会话房间
    socket.on('joinConversation', (data: { conversationId?: string }) => {
      if (data?.conversationId) {
        socket.join(`conversation-${data.conversationId}`);
      }
    });

    socket.on('leaveConversation', (data: { conversationId?: string }) => {
      if (data?.conversationId) {
        socket.leave(`conversation-${data.conversationId}`);
      }
    });

    // 发送频道消息
    socket.on('sendChannelMessage', async (data: SendMessageData) => {
      try {
          const { content, channelId, attachments } = data;

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
              attachments: attachments && attachments.length > 0 ? {
                create: attachments.map(a => ({
                  url: a.url,
                  type: a.type as any,
                  filename: a.filename || '',
                  mimeType: a.mimeType || '',
                  size: a.size || 0,
                  width: a.width,
                  height: a.height,
                  durationMs: a.durationMs,
                })),
              } : undefined,
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
            attachments: true,
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

    // 标记频道为已读
    socket.on('markChannelAsRead', async (data: MarkChannelReadData) => {
      try {
        const { channelId, messageId } = data;

        await prisma.userChannelState.upsert({
          where: {
            userId_channelId: {
              userId: socket.userId!,
              channelId,
            },
          },
          update: {
            lastReadMessageId: messageId,
          },
          create: {
            userId: socket.userId!,
            channelId,
            lastReadMessageId: messageId,
          },
        });

        socket.emit('channelMarkedAsRead', { channelId, messageId });
      } catch (error) {
        console.error('Error marking channel as read:', error);
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

      // 通知所有服务器成员离线
      const userServers = await prisma.serverMember.findMany({
        where: { userId: socket.userId },
        select: { serverId: true },
      });

      for (const { serverId } of userServers) {
        io.to(`server-${serverId}`).emit('serverMemberUpdate', {
          serverId,
          userId: socket.userId,
          username: socket.username,
          status: 'OFFLINE',
          action: 'offline',
        });
      }
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
