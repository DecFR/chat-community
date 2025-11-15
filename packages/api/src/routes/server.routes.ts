import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// 所有服务器路由都需要认证
router.use(authMiddleware);

/**
 * @route   GET /api/servers/search
 * @desc    搜索公开服务器（按名称或描述，模糊匹配）
 * @access  Private
 */
router.get('/search', async (req, res) => {
  try {
    const q = (req.query.q as string | undefined)?.trim();
    const prisma = (await import('../utils/prisma')).default;

    const where: any = {
      isPublic: true, // 只搜索公开服务器
    };

    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
    }

    const servers = await prisma.server.findMany({
      where,
      include: {
        _count: { select: { members: true, channels: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({ success: true, data: servers });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/servers
 * @desc    创建新服务器
 * @access  Private
 */
router.post('/', async (req, res) => {
  const { name, description } = req.body;
  const userId = req.user!.id;

  if (!name) {
    return res.status(400).json({ success: false, error: '服务器名称不能为空' });
  }

  try {
    const prisma = (await import('../utils/prisma')).default;

    // 使用事务确保服务器和默认频道/成员的原子创建
    const newServer = await prisma.$transaction(async (tx) => {
      // 1. 创建服务器
      const server = await tx.server.create({
        data: {
          name,
          description: description || '',
          ownerId: userId,
        },
      });

      // 2. 创建默认的 "常规" 频道
      await tx.channel.create({
        data: {
          name: '常规',
          type: 'TEXT',
          serverId: server.id,
        },
      });

      // 3. 将创建者添加为服务器的 OWNER
      await tx.serverMember.create({
        data: {
          userId,
          serverId: server.id,
          role: 'OWNER',
        },
      });
      
      // 4. 返回包含完整信息的服务器数据
      return tx.server.findUnique({
        where: { id: server.id },
        include: {
          channels: true,
          owner: true,
          _count: {
            select: {
              members: true,
              channels: true,
            },
          },
        },
      });
    });

    res.status(201).json({ success: true, data: newServer });
  } catch (error: any) {
    console.error('创建服务器失败:', error);
    res.status(500).json({ success: false, error: '创建服务器时发生内部错误' });
  }
});

/**
 * @route   GET /api/servers
 * @desc    获取用户可见的服务器（公开服务器 + 用户已加入的私有服务器）
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user!.id;
    const prisma = (await import('../utils/prisma')).default;

    // 获取用户已加入的服务器ID列表
    const userMemberships = await prisma.serverMember.findMany({
      where: { userId },
      select: { serverId: true },
    });
    const userServerIds = userMemberships.map(m => m.serverId);

    // 查询: 公开服务器 OR 用户已加入的服务器
    const servers = await prisma.server.findMany({
      where: {
        OR: [
          { isPublic: true },
          { id: { in: userServerIds } },
        ],
      },
      include: {
        channels: true,
        owner: true,
        _count: {
          select: {
            members: true,
            channels: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      }
    });

    res.json({ success: true, data: servers });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/servers/:id
 * @desc    获取服务器详情
 * @access  Private
 */
router.get('/:id', async (req, res) => {
  try {
    const serverId = req.params.id;
    const prisma = (await import('../utils/prisma')).default;

    const server = await prisma.server.findUnique({
      where: { id: serverId },
      include: {
        channels: true,
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatarUrl: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    res.json({ success: true, data: server });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   PUT /api/servers/:id
 * @desc    更新服务器信息
 * @access  Private
 */
router.put('/:id', async (req, res) => {
  try {
    const serverId = req.params.id;
    const { name, description } = req.body;
    const userId = req.user!.id;

    const prisma = (await import('../utils/prisma')).default;

    // 检查用户是否是服务器所有者或管理员
    const member = await prisma.serverMember.findFirst({
      where: {
        serverId,
        userId,
      },
    });

    if (!member || (member.role !== 'OWNER' && member.role !== 'ADMIN')) {
      return res.status(403).json({ success: false, error: 'No permission to update server' });
    }

    const server = await prisma.server.update({
      where: { id: serverId },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
      },
      include: {
        channels: true,
      },
    });

    res.json({ success: true, data: server });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   DELETE /api/servers/:id
 * @desc    删除服务器
 * @access  Private
 */
router.delete('/:id', async (req, res) => {
  try {
    const serverId = req.params.id;
    const userId = req.user!.id;

    const prisma = (await import('../utils/prisma')).default;

    // 检查用户是否是服务器所有者
    const server = await prisma.server.findUnique({
      where: { id: serverId },
    });

    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    if (server.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Only server owner can delete the server' });
    }

    await prisma.server.delete({
      where: { id: serverId },
    });

    res.json({ success: true, message: 'Server deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/servers/:id/channels
 * @desc    创建新频道
 * @access  Private
 */
router.post('/:id/channels', async (req, res) => {
  try {
    const serverId = req.params.id;
    const { name, description, type } = req.body;

    const prisma = (await import('../utils/prisma')).default;

    const channel = await prisma.channel.create({
      data: {
        name,
        description,
        type: type || 'TEXT',
        serverId,
      },
    });

    res.status(201).json({ success: true, data: channel });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   PUT /api/servers/:serverId/channels/:channelId
 * @desc    更新频道信息
 * @access  Private
 */
router.put('/:serverId/channels/:channelId', async (req, res) => {
  try {
    const { serverId, channelId } = req.params;
    const { name, description } = req.body;
    const userId = req.user!.id;

    const prisma = (await import('../utils/prisma')).default;

    // 检查用户是否是服务器成员且有权限
    const member = await prisma.serverMember.findFirst({
      where: {
        serverId,
        userId,
      },
    });

    if (!member || (member.role !== 'OWNER' && member.role !== 'ADMIN')) {
      return res.status(403).json({ success: false, error: 'No permission to update channel' });
    }

    const channel = await prisma.channel.update({
      where: { id: channelId },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
      },
    });

    res.json({ success: true, data: channel });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   DELETE /api/servers/:serverId/channels/:channelId
 * @desc    删除频道
 * @access  Private
 */
router.delete('/:serverId/channels/:channelId', async (req, res) => {
  try {
    const { serverId, channelId } = req.params;
    const userId = req.user!.id;

    const prisma = (await import('../utils/prisma')).default;

    // 检查用户是否是服务器成员且有权限
    const member = await prisma.serverMember.findFirst({
      where: {
        serverId,
        userId,
      },
    });

    if (!member || (member.role !== 'OWNER' && member.role !== 'ADMIN')) {
      return res.status(403).json({ success: false, error: 'No permission to delete channel' });
    }

    // 检查是否是最后一个频道
    const channelCount = await prisma.channel.count({
      where: { serverId },
    });

    if (channelCount <= 1) {
      return res.status(400).json({ success: false, error: 'Cannot delete the last channel' });
    }

    await prisma.channel.delete({
      where: { id: channelId },
    });

    res.json({ success: true, message: 'Channel deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/servers/:id/join-requests
 * @desc    提交加入服务器申请（审核者为服务器创建者/owner）
 * @access  Private
 */
router.post('/:id/join-requests', async (req, res) => {
  try {
    const serverId = req.params.id;
    const userId = req.user!.id;
    const { reason } = req.body as { reason?: string };
    const prisma = (await import('../utils/prisma')).default;

    // 检查服务器存在
    const server = await prisma.server.findUnique({ where: { id: serverId } });
    if (!server) return res.status(404).json({ success: false, error: '服务器不存在' });

    // 已是成员
    const exists = await prisma.serverMember.findUnique({
      where: { serverId_userId: { serverId, userId } },
    });
    if (exists) return res.status(400).json({ success: false, error: '你已在该服务器中' });

    // 是否已有待处理申请
    const pending = await prisma.serverJoinRequest.findFirst({
      where: { serverId, applicantId: userId, status: 'PENDING' },
    });
    if (pending) return res.status(400).json({ success: false, error: '已提交过申请，请耐心等待审核' });

    const created = await prisma.serverJoinRequest.create({
      data: {
        serverId,
        applicantId: userId,
        reason: reason?.trim() || null,
      },
      include: {
        applicant: {
          select: { id: true, username: true, avatarUrl: true },
        },
      },
    });

    // 通知服务器创建者有新的加入申请
    const { getIO } = await import('../socket');
    const io = getIO();
    io.to(`user-${server.ownerId}`).emit('serverJoinRequest', {
      serverId,
      serverName: server.name,
      request: created,
    });

    res.json({ success: true, data: created });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/servers/:id/join-requests
 * @desc    服务器所有者查看加入申请列表
 * @access  Private (owner-only)
 */
router.get('/:id/join-requests', async (req, res) => {
  try {
    const serverId = req.params.id;
    const userId = req.user!.id;
    const prisma = (await import('../utils/prisma')).default;

    const server = await prisma.server.findUnique({ where: { id: serverId } });
    if (!server) return res.status(404).json({ success: false, error: '服务器不存在' });
    if (server.ownerId !== userId) return res.status(403).json({ success: false, error: '无权查看该服务器的申请' });

    const list = await prisma.serverJoinRequest.findMany({
      where: { serverId },
      orderBy: { createdAt: 'desc' },
      include: { applicant: { select: { id: true, username: true, avatarUrl: true } } },
    });
    res.json({ success: true, data: list });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   POST /api/servers/:serverId/join-requests/:requestId/review
 * @desc    服务器所有者审核加入申请（approve/reject）
 * @access  Private (owner-only)
 */
router.post('/:serverId/join-requests/:requestId/review', async (req, res) => {
  try {
    const { serverId, requestId } = req.params as { serverId: string; requestId: string };
    const { approved, reviewNote } = req.body as { approved: boolean; reviewNote?: string };
    const userId = req.user!.id;
    const prisma = (await import('../utils/prisma')).default;

    const server = await prisma.server.findUnique({ where: { id: serverId } });
    if (!server) return res.status(404).json({ success: false, error: '服务器不存在' });
    if (server.ownerId !== userId) return res.status(403).json({ success: false, error: '无权审核该服务器的申请' });

    const reqRec = await prisma.serverJoinRequest.findUnique({ where: { id: requestId } });
    if (!reqRec || reqRec.serverId !== serverId) return res.status(404).json({ success: false, error: '申请不存在' });
    if (reqRec.status !== 'PENDING') return res.status(400).json({ success: false, error: '该申请已处理' });

    if (approved) {
      // 同意：创建成员，更新申请
      await prisma.$transaction([
        prisma.serverMember.create({ data: { serverId, userId: reqRec.applicantId, role: 'MEMBER' } }),
        prisma.serverJoinRequest.update({
          where: { id: requestId },
          data: { status: 'APPROVED', reviewNote: reviewNote || null, reviewedAt: new Date(), reviewerId: userId },
        }),
      ]);
    } else {
      await prisma.serverJoinRequest.update({
        where: { id: requestId },
        data: { status: 'REJECTED', reviewNote: reviewNote || null, reviewedAt: new Date(), reviewerId: userId },
      });
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
