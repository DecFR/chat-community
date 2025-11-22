import { Server as HttpServer } from 'http';

import { UserStatus, Friendship } from '@prisma/client';
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
const MIN_INTERVAL_MS = 500;

export function initializeSocket(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // 读取配置的客户端地址
        const allowed = process.env.CLIENT_URL || 'http://localhost:5173';
        // 判断是否为开发环境
        const isDev = (process.env.NODE_ENV || 'development') === 'development';

        // 1. 允许无 Origin 请求 (如 Postman, 移动端 App, 或服务器内部调用)
        if (!origin) return callback(null, true);

        // 2. 生产环境：必须精确匹配 .env 里的 CLIENT_URL
        if (origin === allowed) return callback(null, true);

        // 3. 开发环境：允许 localhost 或 127.0.0.1 的任意端口
        if (isDev && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
          return callback(null, true);
        }

        // 4. 其他情况拒绝连接
        return callback(new Error(`CORS blocked for origin: ${origin}`));
      },
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

      // 验证会话是否存在且有效
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

      // 检查是否有其他活跃的Socket连接（单点登录控制）
      if (session.socketId && session.socketId !== socket.id) {
        const oldSocketId = session.socketId;
        const socketsMap = io.sockets.sockets as Map<string, Socket>;
        
        // 🔴 关键修复：检查旧 Socket 是否真的还活着
        const isOldSocketActive = socketsMap.has(oldSocketId);

        if (isOldSocketActive) {
          // 只有当旧连接 *真的* 在线时，才认为是冲突
          logger.info(`forceLogout check: Found active old socket ${oldSocketId}. Kicking it out.`);
          
          io.to(oldSocketId).emit('forceLogout', {
            reason: 'new_login',
            message: '您的账号在其他设备登录',
          });

          const oldSocket = socketsMap.get(oldSocketId);
          if (oldSocket) {
            oldSocket.disconnect(true);
          }
        } else {
          // 如果旧 ID 不在线（可能是刷新页面导致的残留），则忽略，允许新连接覆盖
          logger.debug(`Session has old socketId ${oldSocketId} but it is not active. Assuming page refresh.`);
        }
      }

      // 更新会话的Socket ID和活跃时间
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

  // 连接事件
  io.on('connection', async (socket: AuthSocket) => {
    logger.info(`User connected: ${socket.username} (${socket.userId})`);

    // 加入用户个人房间
    socket.join(`user-${socket.userId}`);

    // 更新用户状态为在线
    await prisma.user.update({
      where: { id: socket.userId },
      data: { status: 'ONLINE' },
    });

    // 通知好友用户上线
    await notifyFriendsStatus(socket.userId!, 'ONLINE');

    // 仅加入个人房间，服务器房间在用户点击/进入服务器时按需 join
    // 这样能避免在用户加入大量服务器时占用过多 socket 房间资源，
    // 同时我们会在消息发送处对未加入服务器房间的成员使用个人房间推送通知。
    logger.debug(`User ${socket.username} joined personal room only`);

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

        // 速率限制检查
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

        // 加密并保存消息
        const encryptedContent = encrypt(content);
        const message = await prisma.message.create({
          data: {
            encryptedContent,
            authorId: socket.userId!,
            directMessageConversationId: conversation.id,
            attachments:
              attachments && attachments.length > 0
                ? {
                    create: attachments.map(
                      (a: {
                        url: string;
                        type: 'IMAGE' | 'VIDEO' | 'FILE';
                        filename?: string;
                        mimeType?: string;
                        size?: number;
                        width?: number;
                        height?: number;
                        durationMs?: number;
                      }) => ({
                        url: a.url,
                        type: a.type,
                        filename: a.filename || '',
                        mimeType: a.mimeType || '',
                        size: a.size || 0,
                        width: a.width,
                        height: a.height,
                        durationMs: a.durationMs,
                      })
                    ),
                  }
                : undefined,
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
          directMessageConversationId: conversation.id,
          authorId: socket.userId!,
        };

        // 发送给发送者和接收者
        io.to(`user-${socket.userId}`).emit('directMessage', decryptedMessage);
        io.to(`user-${receiverId}`).emit('directMessage', decryptedMessage);
        lastMessageAt.set(socket.userId!, now);
      } catch (error) {
        logger.error('Error sending direct message:', { error });
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // 加入服务器房间（用于接收服务器频道消息）
    socket.on('joinServer', (data: { serverId?: string }) => {
      if (data?.serverId) {
        socket.join(`server-${data.serverId}`);
        logger.debug(`User ${socket.username} joined server room: server-${data.serverId}`);
      }
    });

    socket.on('leaveServer', (data: { serverId?: string }) => {
      if (data?.serverId) {
        socket.leave(`server-${data.serverId}`);
        logger.debug(`User ${socket.username} left server room: server-${data.serverId}`);
      }
    });

    // 加入申请批准后客户端会调用 joinServer，这里不处理，只保持房间结构轻量

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

        // 速率限制检查
        const now = Date.now();
        const lastAt = lastMessageAt.get(socket.userId!);
        if (lastAt && now - lastAt < MIN_INTERVAL_MS) {
          const waitMs = MIN_INTERVAL_MS - (now - lastAt);
          socket.emit('messageRateLimited', { waitMs });
          return;
        }

        // 加密并保存消息
        const encryptedContent = encrypt(content);
        const message = await prisma.message.create({
          data: {
            encryptedContent,
            authorId: socket.userId!,
            channelId,
            attachments:
              attachments && attachments.length > 0
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
          channelId: channelId,
          authorId: socket.userId!,
        };

        // 广播到服务器房间（对已加入该房间的客户端）
        io.to(`server-${message.channel?.serverId}`).emit('channelMessage', decryptedMessage);

        // 额外：对那些未加入服务器房间的在线成员，使用个人房间发送消息通知，保证他们也能实时收到消息（例如收到未读提醒或消息预览）
        try {
          const serverId = message.channel?.serverId;
          if (serverId) {
            const members = await prisma.serverMember.findMany({ where: { serverId }, select: { userId: true } });
            const memberIds = members.map((m) => m.userId);

            // 获取这些成员的活跃 session（包含 socketId）
            const sessions = await prisma.userSession.findMany({
              where: {
                userId: { in: memberIds },
                expiresAt: { gt: new Date() },
              },
              select: { userId: true, socketId: true },
            });

            const socketsMap = io.sockets.sockets as Map<string, Socket>;

            for (const s of sessions) {
              const memberId = s.userId;
              const sid = s.socketId;
              if (!sid) continue;

              const sock = socketsMap.get(sid);
              const alreadyInServerRoom = sock && sock.rooms && typeof sock.rooms.has === 'function' && sock.rooms.has(`server-${serverId}`);

              // 如果该成员没有加入服务器房间，则发送个人房间消息
              if (!alreadyInServerRoom) {
                io.to(`user-${memberId}`).emit('channelMessage', decryptedMessage);
              }
            }
          }
        } catch (err) {
          logger.error('Error notifying members via personal rooms:', err);
        }
        lastMessageAt.set(socket.userId!, now);
      } catch (error) {
        logger.error('Error sending channel message:', { error });
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
        logger.error('Error marking conversation as read:', { error });
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
        logger.error('Error marking channel as read:', { error });
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
          data: { status: status as UserStatus },
        });

        await notifyFriendsStatus(socket.userId!, status);
      } catch (error) {
        logger.error('Error updating status:', { error });
      }
    });

    // 断开连接
    socket.on('disconnect', async () => {
      logger.info(`User disconnected: ${socket.username} (${socket.userId})`);

      // 清除会话中的Socket ID
      await prisma.userSession.updateMany({
        where: {
          userId: socket.userId!,
          socketId: socket.id,
        },
        data: {
          socketId: null,
        },
      });

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
