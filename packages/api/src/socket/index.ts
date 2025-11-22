import { Server as HttpServer } from 'http';

import jwt from 'jsonwebtoken';
import { Server, Socket } from 'socket.io';

import { encrypt, decrypt } from '../utils/encryption.js';
import logger from '../utils/logger.js';
import prisma from '../utils/prisma.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

interface AuthSocket extends Socket {
  userId?: string;
  username?: string;
}

let io: Server;
const lastMessageAt = new Map<string, number>();
const MIN_INTERVAL_MS = 500;

export function initializeSocket(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        const allowed = process.env.CLIENT_URL || 'http://localhost:5173';
        const isDev = (process.env.NODE_ENV || 'development') === 'development';
        if (
          !origin ||
          origin === allowed ||
          (isDev && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin))
        ) {
          return callback(null, true);
        }
        return callback(new Error(`CORS blocked: ${origin}`));
      },
      credentials: true,
    },
    pingTimeout: 60000,
  });

  // --- 1. 认证 (Fix: 移除踢人逻辑，保证稳定) ---
  io.use(async (socket: AuthSocket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('No token'));

      const decoded = jwt.verify(token, JWT_SECRET) as { id: string; username: string };
      socket.userId = decoded.id;
      socket.username = decoded.username;

      const session = await prisma.userSession.findUnique({ where: { token } });
      if (!session) return next(new Error('Session invalid'));

      // 🚀 关键修改：移除 "forceLogout" 踢人逻辑
      // 仅仅更新数据库里的 socketId，允许用户刷新页面或多端登录
      await prisma.userSession.update({
        where: { id: session.id },
        data: { socketId: socket.id, lastActiveAt: new Date() },
      });

      next();
    } catch (error) {
      next(new Error('Authentication failed'));
    }
  });

  // --- 2. 连接逻辑 ---
  io.on('connection', async (socket: AuthSocket) => {
    logger.info(`Connected: ${socket.username}`);

    // 加入个人房间
    socket.join(`user-${socket.userId}`);

    // 🚀 关键修复：自动加入所有服务器房间 (确保能收到消息)
    try {
      const userServers = await prisma.serverMember.findMany({
        where: { userId: socket.userId },
        select: { serverId: true },
      });
      if (userServers.length > 0) {
        const rooms = userServers.map((s) => `server-${s.serverId}`);
        socket.join(rooms);
      }
    } catch (e) {
      logger.error(e);
    }

    await prisma.user.update({ where: { id: socket.userId }, data: { status: 'ONLINE' } });
    notifyFriendsStatus(socket.userId!, 'ONLINE');

    // --- 消息发送 ---
    socket.on('sendChannelMessage', async (data) => {
      try {
        const { content, channelId, attachments } = data;
        if (!channelId) return;

        // 存库
        const encryptedContent = encrypt(content);
        const message = await prisma.message.create({
          data: {
            encryptedContent,
            authorId: socket.userId!,
            channelId,
            attachments: attachments?.length ? { create: attachments } : undefined,
          },
          include: { author: true, channel: true, attachments: true },
        });

        const decrypted = {
          ...message,
          content: decrypt(message.encryptedContent),
          encryptedContent: undefined,
          channelId,
          authorId: socket.userId!,
        };

        // 🚀 关键修复：广播给 Server 房间 (所有人可见)
        if (message.channel?.serverId) {
          io.to(`server-${message.channel.serverId}`).emit('channelMessage', decrypted);
        }
      } catch (e) {
        logger.error(e);
        socket.emit('error', { message: 'Send failed' });
      }
    });

    socket.on('sendDirectMessage', async (data) => {
      try {
        const { content, receiverId, attachments } = data;
        let conv = await prisma.directMessageConversation.findFirst({
          where: {
            OR: [
              { user1Id: socket.userId, user2Id: receiverId },
              { user1Id: receiverId, user2Id: socket.userId },
            ],
          },
        });
        if (!conv)
          conv = await prisma.directMessageConversation.create({
            data: { user1Id: socket.userId!, user2Id: receiverId },
          });

        const msg = await prisma.message.create({
          data: {
            encryptedContent: encrypt(content),
            authorId: socket.userId!,
            directMessageConversationId: conv.id,
            attachments: attachments?.length ? { create: attachments } : undefined,
          },
          include: { author: true, attachments: true },
        });

        const decrypted = { ...msg, content, encryptedContent: undefined };
        io.to(`user-${socket.userId}`).emit('directMessage', decrypted);
        io.to(`user-${receiverId}`).emit('directMessage', decrypted);
      } catch (e) {
        logger.error(e);
      }
    });

    // --- 房间管理 (用于 Typing 和 Channel 切换) ---
    // 前端切换频道时会调用 joinChannel，这用于 Typing 状态
    socket.on('joinChannel', (data) => {
      if (data?.channelId) socket.join(`channel-${data.channelId}`);
    });
    socket.on('leaveChannel', (data) => {
      if (data?.channelId) socket.leave(`channel-${data.channelId}`);
    });
    socket.on('joinServer', (data) => {
      if (data?.serverId) socket.join(`server-${data.serverId}`);
    });

    // --- Typing ---
    socket.on('typing', (data) => {
      // 广播给 Channel 房间 (只有正在看这个频道的人才需要看到 typing)
      if (data.channelId)
        socket.to(`channel-${data.channelId}`).emit('userTyping', {
          userId: socket.userId,
          username: socket.username,
          channelId: data.channelId,
        });
      if (data.conversationId)
        socket.to(`conversation-${data.conversationId}`).emit('userTyping', {
          userId: socket.userId,
          username: socket.username,
          conversationId: data.conversationId,
        });
    });

    socket.on('disconnect', async () => {
      await prisma.user.update({ where: { id: socket.userId }, data: { status: 'OFFLINE' } });
      notifyFriendsStatus(socket.userId!, 'OFFLINE');
    });
  });

  return io;
}

async function notifyFriendsStatus(userId: string, status: string) {
  const friendships = await prisma.friendship.findMany({
    where: {
      OR: [
        { senderId: userId, status: 'ACCEPTED' },
        { receiverId: userId, status: 'ACCEPTED' },
      ],
    },
  });
  friendships.forEach((f) => {
    const fid = f.senderId === userId ? f.receiverId : f.senderId;
    io.to(`user-${fid}`).emit('friendStatusUpdate', { userId, status });
  });
}

export function getIO(): Server {
  if (!io) throw new Error('Socket not initialized');
  return io;
}
