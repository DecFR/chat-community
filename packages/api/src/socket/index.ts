import { Server as HttpServer } from 'http';

import { UserStatus, Friendship } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { Server, Socket } from 'socket.io';

import { encrypt, decrypt } from '../utils/encryption.js';
import logger from '../utils/logger.js';
import prisma from '../utils/prisma.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// 扩展 Socket 类型以包含用户信息
interface AuthSocket extends Socket {
  userId?: string;
  username?: string;
}

// 消息发送数据接口
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
// 简单的消息发送速率限制：记录用户上次发送时间戳
const lastMessageAt = new Map<string, number>();
// 最小发送间隔（毫秒）
const MIN_INTERVAL_MS = 700;

export function initializeSocket(httpServer: HttpServer) {
  // --- 1. 初始化 Socket.io (CORS 修复) ---
  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        const allowed = process.env.CLIENT_URL || 'http://localhost:5173';
        const isDev = (process.env.NODE_ENV || 'development') === 'development';

        // 1. 允许无 Origin (Postman, 服务器内部调用)
        if (!origin) return callback(null, true);

        // 2. 精确匹配配置的 URL
        if (origin === allowed) return callback(null, true);

        // 3. 开发环境：允许 localhost 或 127.0.0.1 的任意端口
        if (isDev && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
          return callback(null, true);
        }

        return callback(new Error(`CORS blocked for origin: ${origin}`));
      },
      credentials: true,
    },
    pingTimeout: 60000, // 增加超时时间防止频繁断连
  });

  // --- 2. 认证中间件 (修复刷新踢人问题) ---
  io.use(async (socket: AuthSocket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Authentication error: No token'));
      }

      // 验证 JWT
      const decoded = jwt.verify(token, JWT_SECRET) as { id: string; username: string };
      socket.userId = decoded.id;
      socket.username = decoded.username;

      // 验证数据库 Session
      const session = await prisma.userSession.findUnique({
        where: { token },
      });

      if (!session) {
        return next(new Error('Session expired or invalid'));
      }

      if (session.expiresAt < new Date()) {
        await prisma.userSession.delete({ where: { id: session.id } });
        return next(new Error('Session expired'));
      }

      // 检查异地登录 (Fix: 增加活跃性检测)
      if (session.socketId && session.socketId !== socket.id) {
        const oldSocketId = session.socketId;
        const socketsMap = io.sockets.sockets; // 获取当前所有连接

        // 🔴 关键修复：只有当旧 Socket 确实还在连接池中时，才踢人
        if (socketsMap.has(oldSocketId)) {
          logger.info(`Force logout active socket: ${oldSocketId} for user ${socket.username}`);

          // 通知旧设备下线
          io.to(oldSocketId).emit('forceLogout', {
            reason: 'new_login',
            message: '您的账号在其他设备登录',
          });

          // 断开旧连接
          const oldSocket = socketsMap.get(oldSocketId);
          if (oldSocket) {
            oldSocket.disconnect(true);
          }
        } else {
          // 旧 Socket 不在内存里，说明是刷新页面或异常断开，直接覆盖，不报错
          logger.debug(`Overwrite stale socketId: ${oldSocketId} for user ${socket.username}`);
        }
      }

      // 更新会话的 Socket ID 和活跃时间
      await prisma.userSession.update({
        where: { id: session.id },
        data: {
          socketId: socket.id,
          lastActiveAt: new Date(),
        },
      });

      next();
    } catch (error) {
      logger.error('Socket authentication error:', error);
      next(new Error('Authentication error'));
    }
  });

  // --- 3. 连接事件处理 ---
  io.on('connection', async (socket: AuthSocket) => {
    logger.info(`User connected: ${socket.username} (${socket.userId})`);

    // 3.1 加入用户个人房间 (用于接收私信、通知)
    socket.join(`user-${socket.userId}`);

    // 3.2 自动加入所有已加入的服务器房间 (修复消息不刷新问题)
    try {
      const userServers = await prisma.serverMember.findMany({
        where: { userId: socket.userId },
        select: { serverId: true },
      });

      if (userServers.length > 0) {
        const serverRooms = userServers.map((s) => `server-${s.serverId}`);
        socket.join(serverRooms);
        logger.debug(`User ${socket.username} auto-joined ${serverRooms.length} server rooms`);
      }
    } catch (e) {
      logger.error('Failed to auto-join server rooms', e);
    }

    // 3.3 更新状态为在线
    await prisma.user.update({
      where: { id: socket.userId },
      data: { status: 'ONLINE' },
    });

    // 通知好友用户上线
    await notifyFriendsStatus(socket.userId!, 'ONLINE');

    // 通知相关服务器成员状态更新
    const userServersList = await prisma.serverMember.findMany({
      where: { userId: socket.userId },
      select: { serverId: true },
    });
    for (const { serverId } of userServersList) {
      io.to(`server-${serverId}`).emit('serverMemberUpdate', {
        serverId,
        userId: socket.userId,
        username: socket.username,
        status: 'ONLINE',
        action: 'online',
      });
    }

    // --- 事件监听 ---

    // 发送私信 (Direct Message)
    socket.on('sendDirectMessage', async (data: SendMessageData) => {
      try {
        const { content, receiverId, attachments } = data;

        if (!receiverId) {
          socket.emit('error', { message: 'Receiver ID is required' });
          return;
        }

        // 速率限制
        const now = Date.now();
        const lastAt = lastMessageAt.get(socket.userId!);
        if (lastAt && now - lastAt < MIN_INTERVAL_MS) {
          const waitMs = MIN_INTERVAL_MS - (now - lastAt);
          socket.emit('messageRateLimited', { waitMs });
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

        // 加密并保存
        const encryptedContent = encrypt(content);
        const message = await prisma.message.create({
          data: {
            encryptedContent,
            authorId: socket.userId!,
            directMessageConversationId: conversation.id,
            attachments: attachments?.length
              ? {
                  create: attachments.map((a) => ({
                    url: a.url,
                    type: a.type,
                    filename: a.filename || '',
                    mimeType: a.mimeType || '',
                    size: a.size || 0,
                    width: a.width,
                    height: a.height,
                    durationMs: a.durationMs,
                  })),
                }
              : undefined,
          },
          include: {
            author: { select: { id: true, username: true, avatarUrl: true } },
            attachments: true,
          },
        });

        // 解密用于发送
        const decryptedMessage = {
          ...message,
          content: decrypt(message.encryptedContent),
          encryptedContent: undefined,
          directMessageConversationId: conversation.id,
          authorId: socket.userId!,
        };

        // 推送给双方
        io.to(`user-${socket.userId}`).emit('directMessage', decryptedMessage);
        io.to(`user-${receiverId}`).emit('directMessage', decryptedMessage);

        lastMessageAt.set(socket.userId!, now);
      } catch (error) {
        logger.error('Error sending direct message:', { error });
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // 发送服务器频道消息 (Channel Message)
    socket.on('sendChannelMessage', async (data: SendMessageData) => {
      try {
        const { content, channelId, attachments } = data;

        if (!channelId) {
          socket.emit('error', { message: 'Channel ID is required' });
          return;
        }

        // 速率限制
        const now = Date.now();
        const lastAt = lastMessageAt.get(socket.userId!);
        if (lastAt && now - lastAt < MIN_INTERVAL_MS) {
          const waitMs = MIN_INTERVAL_MS - (now - lastAt);
          socket.emit('messageRateLimited', { waitMs });
          return;
        }

        // 加密并保存
        const encryptedContent = encrypt(content);
        const message = await prisma.message.create({
          data: {
            encryptedContent,
            authorId: socket.userId!,
            channelId,
            attachments: attachments?.length
              ? {
                  create: attachments.map((a) => ({
                    url: a.url,
                    type: a.type,
                    filename: a.filename || '',
                    mimeType: a.mimeType || '',
                    size: a.size || 0,
                    width: a.width,
                    height: a.height,
                    durationMs: a.durationMs,
                  })),
                }
              : undefined,
          },
          include: {
            author: { select: { id: true, username: true, avatarUrl: true } },
            channel: { select: { serverId: true } },
            attachments: true,
          },
        });

        // 解密
        const decryptedMessage = {
          ...message,
          content: decrypt(message.encryptedContent),
          encryptedContent: undefined,
          channelId: channelId,
          authorId: socket.userId!,
        };

        // 广播到服务器房间
        // 因为我们在 connection 时已经自动 join 了 server-{id}，所以这里直接 emit 即可
        if (message.channel?.serverId) {
          io.to(`server-${message.channel.serverId}`).emit('channelMessage', decryptedMessage);
        }

        lastMessageAt.set(socket.userId!, now);
      } catch (error) {
        logger.error('Error sending channel message:', { error });
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // 加入/离开服务器房间 (手动操作时)
    socket.on('joinServer', (data: { serverId?: string }) => {
      if (data?.serverId) socket.join(`server-${data.serverId}`);
    });
    socket.on('leaveServer', (data: { serverId?: string }) => {
      if (data?.serverId) socket.leave(`server-${data.serverId}`);
    });

    // 加入/离开频道房间 (用于 typing 状态等)
    socket.on('joinChannel', (data: { channelId?: string }) => {
      if (data?.channelId) socket.join(`channel-${data.channelId}`);
    });
    socket.on('leaveChannel', (data: { channelId?: string }) => {
      if (data?.channelId) socket.leave(`channel-${data.channelId}`);
    });

    // 加入/离开私信房间
    socket.on('joinConversation', (data: { conversationId?: string }) => {
      if (data?.conversationId) socket.join(`conversation-${data.conversationId}`);
    });
    socket.on('leaveConversation', (data: { conversationId?: string }) => {
      if (data?.conversationId) socket.leave(`conversation-${data.conversationId}`);
    });

    // 正在输入 (Typing)
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

    // 标记已读 (Read Receipts)
    socket.on('markConversationAsRead', async (data: MarkAsReadData) => {
      try {
        const { conversationId, messageId } = data;
        await prisma.userConversationState.upsert({
          where: { userId_conversationId: { userId: socket.userId!, conversationId } },
          update: { lastReadMessageId: messageId },
          create: { userId: socket.userId!, conversationId, lastReadMessageId: messageId },
        });
        socket.emit('conversationMarkedAsRead', { conversationId, messageId });
      } catch (e) {
        logger.error(e);
      }
    });

    socket.on('markChannelAsRead', async (data: MarkChannelReadData) => {
      try {
        const { channelId, messageId } = data;
        await prisma.userChannelState.upsert({
          where: { userId_channelId: { userId: socket.userId!, channelId } },
          update: { lastReadMessageId: messageId },
          create: { userId: socket.userId!, channelId, lastReadMessageId: messageId },
        });
        socket.emit('channelMarkedAsRead', { channelId, messageId });
      } catch (e) {
        logger.error(e);
      }
    });

    // 更新用户状态
    socket.on('updateStatus', async (status: string) => {
      try {
        await prisma.user.update({
          where: { id: socket.userId },
          data: { status: status as UserStatus },
        });
        await notifyFriendsStatus(socket.userId!, status);
      } catch (e) {
        logger.error(e);
      }
    });

    // 断开连接
    socket.on('disconnect', async () => {
      logger.info(`User disconnected: ${socket.username} (${socket.userId})`);

      // 清除会话绑定
      await prisma.userSession.updateMany({
        where: { userId: socket.userId!, socketId: socket.id },
        data: { socketId: null },
      });

      // 更新状态为离线
      await prisma.user.update({
        where: { id: socket.userId },
        data: { status: 'OFFLINE' },
      });

      // 通知好友
      await notifyFriendsStatus(socket.userId!, 'OFFLINE');

      // 通知服务器成员
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

// 辅助函数：通知所有好友状态更新
async function notifyFriendsStatus(userId: string, status: string) {
  const friendships = await prisma.friendship.findMany({
    where: {
      OR: [
        { senderId: userId, status: 'ACCEPTED' },
        { receiverId: userId, status: 'ACCEPTED' },
      ],
    },
  });

  const friendIds = friendships.map((f: Friendship) =>
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
