import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middleware/auth';

const router = Router();

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
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
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
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
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
    await prisma.user.delete({
      where: { id: req.params.id },
    });

    res.json({ success: true, message: 'User deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
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
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
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
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
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
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
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
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
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
    
    const [
      totalUsers,
      totalServers,
      totalMessages,
      onlineUsers,
    ] = await Promise.all([
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
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
