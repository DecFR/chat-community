import { Router } from 'express';

import { authMiddleware, adminMiddleware } from '../middleware/auth';
import { getAdminNotifications } from '../utils/adminNotify';
import { rescheduleAvatarCleanupScheduler } from '../utils/avatarCleanupScheduler';
import { cleanupUnusedAvatars } from '../utils/cleanup';
import { getAvatarCleanupConfig, updateAvatarCleanupConfig } from '../utils/config';

const router = Router();
/**
 * @route   GET /api/admin/notifications
 * @desc    获取当前管理员的系统通知
 * @access  Admin
 */
router.get('/notifications', async (req, res) => {
  try {
    const adminId = req.user?.id;
    if (!adminId) return res.status(401).json({ success: false, error: '未登录' });
    const notifies = await getAdminNotifications(adminId);
    res.json({ success: true, data: notifies });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    res.status(500).json({ success: false, error: message });
  }
});

// 所有 admin 路由都需要认证和管理员权限
router.use(authMiddleware, adminMiddleware);

/**
 * @route   GET /api/admin/users
 * @desc    获取所有用户列表
 * @access  Admin
 */
router.get('/users', async (_req, res) => {
  try {
    const prisma = (await import('../utils/prisma')).default;
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json({ success: true, data: users });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * @route   GET /api/admin/servers
 * @desc    获取所有服务器列表
 * @access  Admin
 */
router.get('/servers', async (_req, res) => {
  try {
    const prisma = (await import('../utils/prisma')).default;
    const servers = await prisma.server.findMany({
      include: {
        _count: {
          select: {
            members: true,
            channels: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json({ success: true, data: servers });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * @route   DELETE /api/admin/users/:id
 * @desc    删除用户
 * @access  Admin
 */
router.delete('/users/:id', async (req, res) => {
  try {
    const prisma = (await import('../utils/prisma')).default;

    // 获取第一个用户（超级管理员）
    const firstUser = await prisma.user.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    // 检查是否尝试删除超级管理员
    if (firstUser && firstUser.id === req.params.id) {
      return res.status(403).json({
        success: false,
        error: '不能删除超级管理员（第一个用户）',
      });
    }

    await prisma.user.delete({
      where: { id: req.params.id },
    });

    res.json({ success: true, message: 'User deleted' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * @route   DELETE /api/admin/servers/:id
 * @desc    删除服务器
 * @access  Admin
 */
router.delete('/servers/:id', async (req, res) => {
  try {
    const prisma = (await import('../utils/prisma')).default;
    await prisma.server.delete({
      where: { id: req.params.id },
    });

    res.json({ success: true, message: 'Server deleted' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * @route   DELETE /api/admin/messages
 * @desc    清理所有消息或指定频道/会话的消息
 * @access  Admin
 */
router.delete('/messages', async (req, res) => {
  try {
    const { channelId, conversationId } = req.query;
    const prisma = (await import('../utils/prisma')).default;
    const { getIO } = await import('../socket');
    const io = getIO();

    let deletedCount = 0;

    if (channelId) {
      // 清理指定频道的消息
      const result = await prisma.message.deleteMany({
        where: { channelId: channelId as string },
      });
      deletedCount = result.count;

      // 获取频道信息用于通知
      const channel = await prisma.channel.findUnique({
        where: { id: channelId as string },
        include: { server: true },
      });

      // 广播通知到服务器房间
      if (channel) {
        io.to(`server-${channel.serverId}`).emit('notification', {
          id: `msg-cleanup-${Date.now()}`,
          type: 'message',
          title: '消息清理通知',
          message: `管理员已清理频道 #${channel.name} 的所有消息`,
        });
      }
    } else if (conversationId) {
      // 清理指定会话的消息
      const result = await prisma.message.deleteMany({
        where: { directMessageConversationId: conversationId as string },
      });
      deletedCount = result.count;

      // 通知会话双方用户
      const conversation = await prisma.directMessageConversation.findUnique({
        where: { id: conversationId as string },
      });

      if (conversation) {
        io.to(`user-${conversation.user1Id}`).emit('notification', {
          id: `msg-cleanup-${Date.now()}`,
          type: 'message',
          title: '消息清理通知',
          message: '管理员已清理此会话的所有消息',
        });
        io.to(`user-${conversation.user2Id}`).emit('notification', {
          id: `msg-cleanup-${Date.now()}`,
          type: 'message',
          title: '消息清理通知',
          message: '管理员已清理此会话的所有消息',
        });
      }
    } else {
      // 清理所有消息
      const result = await prisma.message.deleteMany({});
      deletedCount = result.count;

      // 广播通知给所有在线用户
      io.emit('notification', {
        id: `msg-cleanup-${Date.now()}`,
        type: 'message',
        title: '系统消息清理通知',
        message: '管理员已清理系统所有消息',
      });
    }

    res.json({
      success: true,
      message: 'Messages cleaned',
      deletedCount,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * @route   POST /api/admin/invite-codes
 * @desc    为任意用户生成邀请码（不指定userId时为当前管理员生成）
 * @access  Admin
 */
router.post('/invite-codes', async (req, res) => {
  try {
    const { userId, expiresInDays = 7 } = req.body;
    const { inviteService } = await import('../services/invite.service');

    // 如果没有指定userId，使用当前登录的管理员ID
    const targetUserId = userId || req.user?.id;

    if (!targetUserId) {
      return res.status(400).json({ success: false, error: '用户ID是必需的' });
    }

    const inviteCode = await inviteService.generateUserInviteCode(targetUserId, expiresInDays);

    res.json({ success: true, data: inviteCode });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * @route   GET /api/admin/invite-codes
 * @desc    获取所有邀请码
 * @access  Admin
 */
router.get('/invite-codes', async (_req, res) => {
  try {
    const prisma = (await import('../utils/prisma')).default;
    const inviteCodes = await prisma.userInviteCode.findMany({
      include: {
        user: {
          select: {
            id: true,
            username: true,
            role: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json({ success: true, data: inviteCodes });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * @route   PATCH /api/admin/users/:id/role
 * @desc    修改用户角色
 * @access  Admin
 */
router.patch('/users/:id/role', async (req, res) => {
  try {
    const prisma = (await import('../utils/prisma')).default;
    const { role } = req.body;

    if (!['ADMIN', 'USER'].includes(role)) {
      return res.status(400).json({ success: false, error: '无效的角色' });
    }

    // 获取第一个用户（超级管理员）
    const firstUser = await prisma.user.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    // 检查是否尝试修改超级管理员的角色
    if (firstUser && firstUser.id === req.params.id && role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: '不能降低超级管理员（第一个用户）的权限',
      });
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { role },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
      },
    });

    res.json({ success: true, data: user });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * @route   POST /api/admin/maintenance/cleanup-avatars
 * @desc    手动触发头像清理（可选覆盖 maxAgeMs）
 * @access  Admin
 */
router.post('/maintenance/cleanup-avatars', async (req, res) => {
  try {
    const { maxAgeMs } = req.body || {};
    const result = await cleanupUnusedAvatars(typeof maxAgeMs === 'number' ? maxAgeMs : undefined);
    res.json({ success: true, data: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * @route   GET /api/admin/config/cleanup-avatars
 * @desc    获取头像清理持久化配置
 * @access  Admin
 */
router.get('/config/cleanup-avatars', async (_req, res) => {
  try {
    const cfg = await getAvatarCleanupConfig();
    res.json({ success: true, data: cfg });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * @route   PUT /api/admin/config/cleanup-avatars
 * @desc    更新头像清理的持久化配置（maxAgeMs / intervalMs）
 * @access  Admin
 */
router.put('/config/cleanup-avatars', async (req, res) => {
  try {
    const { maxAgeMs, intervalMs } = req.body || {};
    if (maxAgeMs !== undefined && typeof maxAgeMs !== 'number') {
      return res.status(400).json({ success: false, error: 'maxAgeMs 必须是数字（毫秒）' });
    }
    if (intervalMs !== undefined && typeof intervalMs !== 'number') {
      return res.status(400).json({ success: false, error: 'intervalMs 必须是数字（毫秒）' });
    }

    const next = await updateAvatarCleanupConfig({ maxAgeMs, intervalMs });
    // 保存后重置调度器
    await rescheduleAvatarCleanupScheduler();
    res.json({ success: true, data: next });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * @route   GET /api/admin/stats
 * @desc    获取系统统计信息
 * @access  Admin
 */
router.get('/stats', async (_req, res) => {
  try {
    const prisma = (await import('../utils/prisma')).default;

    const [totalUsers, totalServers, totalMessages, onlineUsers] = await Promise.all([
      prisma.user.count(),
      prisma.server.count(),
      prisma.message.count(),
      prisma.user.count({ where: { status: 'ONLINE' } }),
    ]);

    res.json({
      success: true,
      data: {
        totalUsers,
        totalServers,
        totalMessages,
        onlineUsers,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * @route   GET /api/admin/system-info
 * @desc    获取服务器硬件信息
 * @access  Admin
 */
router.get('/system-info', async (_req, res) => {
  try {
    const os = await import('os');
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const platform = os.platform();
    const arch = os.arch();
    const uptime = os.uptime();

    res.json({
      success: true,
      data: {
        cpu: {
          model: cpus[0]?.model || 'Unknown',
          cores: cpus.length,
          speed: cpus[0]?.speed || 0,
        },
        memory: {
          total: totalMem,
          free: freeMem,
          used: totalMem - freeMem,
          usagePercent: (((totalMem - freeMem) / totalMem) * 100).toFixed(2),
        },
        platform,
        arch,
        uptime,
        nodeVersion: process.version,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * @route   GET /api/admin/config/thread-pool
 * @desc    获取线程池配置
 * @access  Admin
 */
router.get('/config/thread-pool', async (_req, res) => {
  try {
    const { getThreadPoolConfig } = await import('../utils/config');
    const cfg = await getThreadPoolConfig();
    res.json({ success: true, data: cfg });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * @route   PUT /api/admin/config/thread-pool
 * @desc    更新线程池配置
 * @access  Admin
 */
router.put('/config/thread-pool', async (req, res) => {
  try {
    const { maxThreads } = req.body || {};
    if (maxThreads !== undefined && (typeof maxThreads !== 'number' || maxThreads < 1)) {
      return res.status(400).json({ success: false, error: 'maxThreads 必须是大于 0 的整数' });
    }

    const { updateThreadPoolConfig } = await import('../utils/config');
    const next = await updateThreadPoolConfig({ maxThreads });
    res.json({ success: true, data: next });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
