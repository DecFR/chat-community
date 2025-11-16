import { Prisma } from '@prisma/client';
import { Router } from 'express';

import { authMiddleware } from '../middleware/auth.js';
import { getIO } from '../socket/index.js';

const router: Router = Router();

// 所有服务器路由都需要认证
router.use(authMiddleware);

/**
 * @route   GET /api/servers/search
 * @desc    搜索服务器（按名称或描述，模糊匹配）。
 *         设计要求：用户申请创建的服务器默认为私有，但可被搜索到并发起加入申请。
 *         因此，这里不再仅限 isPublic=true。
 * @access  Private
 */
router.get('/search', async (req, res) => {
  try {
    const q = (req.query.q as string | undefined)?.trim();
    const prisma = (await import('../utils/prisma.js')).default;

    const where: Prisma.ServerWhereInput = {};

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
      // 优先显示公开服务器，其次按创建时间倒序
      orderBy: [
        { isPublic: 'desc' },
        { createdAt: 'desc' },
      ],
      take: 50,
    });

    res.json({ success: true, data: servers });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    return res.status(500).json({ success: false, error: message });
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
  const userRole = req.user!.role;

  if (!name) {
    return res.status(400).json({ success: false, error: '服务器名称不能为空' });
  }

  try {
    const prisma = (await import('../utils/prisma.js')).default;

    // 管理员创建的服务器默认公开,用户申请的默认私有
    const isPublic = userRole === 'ADMIN';

    // 使用事务确保服务器和默认频道/成员的原子创建
    const newServer = await prisma.$transaction(async (tx) => {
      // 1. 创建服务器
      const server = await tx.server.create({
        data: {
          name,
          description: description || '',
          ownerId: userId,
          isPublic,
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
      const fullServerData = await tx.server.findUnique({
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

      if (fullServerData) {
        // 5. 如果服务器是公开的，则广播给所有在线用户
        const { getIO } = await import('../socket/index.js');
        const io = getIO();
        if (fullServerData.isPublic) {
          io.emit('serverCreate', fullServerData);
        }
      }

      return fullServerData;
    });

    res.status(201).json({ success: true, data: newServer });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '创建服务器时发生内部错误';
    return res.status(500).json({ success: false, error: message });
  }
});

/**
 * @route   GET /api/servers
 * @desc    获取用户可见的服务器(用户已加入的服务器 + 管理员创建的公开服务器)
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user!.id;
    const prisma = (await import('../utils/prisma.js')).default;

    // 获取用户已加入的服务器ID列表
    const userMemberships = await prisma.serverMember.findMany({
      where: { userId },
      select: { serverId: true },
    });
    const userServerIds = userMemberships.map((m: { serverId: string }) => m.serverId);

    // 查询所有服务器(包含owner信息用于过滤)
    const allServers = await prisma.server.findMany({
      include: {
        channels: true,
        owner: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            role: true,
          },
        },
        _count: {
          select: {
            members: true,
            channels: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // 过滤: 用户已加入的服务器 OR (管理员创建的公开服务器)
    const servers = allServers.filter((server: any) => {
      const isUserMember = userServerIds.includes(server.id);
      const isAdminPublicServer = server.owner.role === 'ADMIN' && server.isPublic;
      return isUserMember || isAdminPublicServer;
    });

    res.json({ success: true, data: servers });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    return res.status(500).json({ success: false, error: message });
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
    const prisma = (await import('../utils/prisma.js')).default;

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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    return res.status(500).json({ success: false, error: message });
  }
});

/**
 * @route   GET /api/servers/:id/members
 * @desc    获取服务器成员列表（用于右侧成员栏）
 * @access  Private（公开服务器任何登录用户可见；私有服务器需成员权限）
 */
router.get('/:id/members', async (req, res) => {
  try {
    const serverId = req.params.id;
    const userId = req.user!.id;
    const prisma = (await import('../utils/prisma.js')).default;

    // 服务器存在性与公开性
    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: { id: true, isPublic: true },
    });
    if (!server) return res.status(404).json({ success: false, error: 'Server not found' });

    // 私有服务器需要成员权限
    if (!server.isPublic) {
      const membership = await prisma.serverMember.findUnique({
        where: { serverId_userId: { serverId, userId } },
      });
      if (!membership) {
        return res.status(403).json({ success: false, error: 'No permission to view members' });
      }
    }

    // 查询成员并包含用户信息
    const members = await prisma.serverMember.findMany({
      where: { serverId },
      include: {
        user: {
          select: { id: true, username: true, avatarUrl: true, status: true },
        },
      },
      orderBy: [
        // 角色排序：OWNER, ADMIN, MEMBER（枚举按字母顺序已满足常见排序，必要时可在客户端再分组）
        { role: 'asc' },
        { joinedAt: 'asc' },
      ],
    });

    // 映射为前端所需结构
    const result = members.map((m: any) => ({
      id: m.user.id,
      username: m.user.username,
      avatarUrl: m.user.avatarUrl ?? undefined,
      role: m.role,
      status: m.user.status,
    }));

    return res.json({ success: true, data: result });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    return res.status(500).json({ success: false, error: message });
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
    const { name, description } = req.body as { name?: string; description?: string };
    const userId = req.user!.id;

    const prisma = (await import('../utils/prisma.js')).default;

    // 检查用户是否是服务器所有者 (仅 OWNER 可管理服务器)
    const member = await prisma.serverMember.findFirst({
      where: {
        serverId,
        userId,
      },
    });
    if (!member || member.role !== 'OWNER') {
      return res.status(403).json({ success: false, error: 'Only owner can update server' });
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

    // Socket实时广播服务器更新
    const io = getIO();
    io.to(`server-${serverId}`).emit('serverUpdate', {
      serverId,
      server: {
        id: server.id,
        name: server.name,
        description: server.description,
        isPublic: server.isPublic,
      },
    });

    res.json({ success: true, data: server });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    return res.status(500).json({ success: false, error: message });
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

    const prisma = (await import('../utils/prisma.js')).default;

    // 检查用户是否是服务器所有者
    const server = await prisma.server.findUnique({
      where: { id: serverId },
    });

    if (!server) {
      return res.status(404).json({ success: false, error: 'Server not found' });
    }

    if (server.ownerId !== userId) {
      return res
        .status(403)
        .json({ success: false, error: 'Only server owner can delete the server' });
    }

    await prisma.server.delete({
      where: { id: serverId },
    });

    // Socket实时广播服务器删除
    const io = getIO();
    io.to(`server-${serverId}`).emit('serverDelete', { serverId });

    res.json({ success: true, message: 'Server deleted successfully' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    return res.status(500).json({ success: false, error: message });
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
    const userId = req.user!.id;

    const prisma = (await import('../utils/prisma.js')).default;

    // 权限：仅服务器所有者可创建频道
    const server = await prisma.server.findUnique({ where: { id: serverId } });
    if (!server) return res.status(404).json({ success: false, error: 'Server not found' });
    if (server.ownerId !== userId) {
      return res.status(403).json({ success: false, error: 'Only owner can create channel' });
    }

    const channel = await prisma.channel.create({
      data: {
        name,
        description,
        type: type || 'TEXT',
        serverId,
      },
    });

    // Socket实时广播频道创建
    const io = getIO();
    io.to(`server-${serverId}`).emit('channelCreate', {
      serverId,
      channel,
    });

    res.status(201).json({ success: true, data: channel });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    return res.status(500).json({ success: false, error: message });
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

    const prisma = (await import('../utils/prisma.js')).default;

    // 检查用户是否是服务器成员且为所有者
    const member = await prisma.serverMember.findFirst({
      where: {
        serverId,
        userId,
      },
    });
    if (!member || member.role !== 'OWNER') {
      return res.status(403).json({ success: false, error: 'Only owner can update channel' });
    }

    const channel = await prisma.channel.update({
      where: { id: channelId },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
      },
    });

    // Socket实时广播频道更新
    const io = getIO();
    io.to(`server-${serverId}`).emit('channelUpdate', {
      serverId,
      channelId,
      channel,
    });

    res.json({ success: true, data: channel });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    return res.status(500).json({ success: false, error: message });
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

    const prisma = (await import('../utils/prisma.js')).default;

    // 检查用户是否是服务器成员且为所有者
    const member = await prisma.serverMember.findFirst({
      where: {
        serverId,
        userId,
      },
    });
    if (!member || member.role !== 'OWNER') {
      return res.status(403).json({ success: false, error: 'Only owner can delete channel' });
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

    // Socket实时广播频道删除
    const io = getIO();
    io.to(`server-${serverId}`).emit('channelDelete', {
      serverId,
      channelId,
    });

    res.json({ success: true, message: 'Channel deleted successfully' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    return res.status(500).json({ success: false, error: message });
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
    const prisma = (await import('../utils/prisma.js')).default;

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
    if (pending)
      return res.status(400).json({ success: false, error: '已提交过申请，请耐心等待审核' });

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
    const { getIO } = await import('../socket/index.js');
    const io = getIO();
    io.to(`user-${server.ownerId}`).emit('serverJoinRequest', {
      serverId,
      serverName: server.name,
      request: created,
    });

    res.json({ success: true, data: created });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    return res.status(500).json({ success: false, error: message });
  }
});

/**
 * @route   GET /api/servers/my-join-requests
 * @desc    获取当前用户的所有服务器加入申请记录
 * @access  Private
 */
router.get('/my-join-requests', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: '未授权' });

    const prisma = (await import('../utils/prisma.js')).default;
    const requests = await prisma.serverJoinRequest.findMany({
      where: { applicantId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        server: {
          select: {
            id: true,
            name: true,
            description: true,
            iconUrl: true,
          },
        },
      },
    });

    // 格式化数据以匹配客户端期望的格式
    const formattedRequests = requests.map((request) => ({
      id: request.id,
      name: request.server.name,
      description: request.server.description,
      status: request.status,
      reason: request.reason,
      reviewNote: request.reviewNote,
      reviewedAt: request.reviewedAt,
      createdAt: request.createdAt,
      serverId: request.serverId,
      serverIconUrl: request.server.iconUrl,
    }));

    return res.json({ success: true, data: formattedRequests });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    return res.status(500).json({ success: false, error: message });
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
    const prisma = (await import('../utils/prisma.js')).default;

    const server = await prisma.server.findUnique({ where: { id: serverId } });
    if (!server) return res.status(404).json({ success: false, error: '服务器不存在' });
    if (server.ownerId !== userId)
      return res.status(403).json({ success: false, error: '无权查看该服务器的申请' });

    const list = await prisma.serverJoinRequest.findMany({
      where: { serverId },
      orderBy: { createdAt: 'desc' },
      include: { applicant: { select: { id: true, username: true, avatarUrl: true } } },
    });
    res.json({ success: true, data: list });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    return res.status(500).json({ success: false, error: message });
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
    const prisma = (await import('../utils/prisma.js')).default;

    const server = await prisma.server.findUnique({ where: { id: serverId } });
    if (!server) return res.status(404).json({ success: false, error: '服务器不存在' });
    if (server.ownerId !== userId)
      return res.status(403).json({ success: false, error: '无权审核该服务器的申请' });

    const reqRec = await prisma.serverJoinRequest.findUnique({ where: { id: requestId } });
    if (!reqRec || reqRec.serverId !== serverId)
      return res.status(404).json({ success: false, error: '申请不存在' });
    if (reqRec.status !== 'PENDING')
      return res.status(400).json({ success: false, error: '该申请已处理' });

    if (approved) {
      // 检查用户是否已经是成员
      const existingMember = await prisma.serverMember.findUnique({
        where: { serverId_userId: { serverId, userId: reqRec.applicantId } },
      });
      
      if (existingMember) {
        // 用户已经是成员，只更新申请状态
        await prisma.serverJoinRequest.update({
          where: { id: requestId },
          data: {
            status: 'APPROVED',
            reviewNote: reviewNote || '用户已是服务器成员',
            reviewedAt: new Date(),
            reviewerId: userId,
          },
        });
        return res.json({ success: true, message: '用户已是服务器成员' });
      }
      
      // 同意：创建成员，更新申请
      await prisma.$transaction([
        prisma.serverMember.create({
          data: { serverId, userId: reqRec.applicantId, role: 'MEMBER' },
        }),
        prisma.serverJoinRequest.update({
          where: { id: requestId },
          data: {
            status: 'APPROVED',
            reviewNote: reviewNote || null,
            reviewedAt: new Date(),
            reviewerId: userId,
          },
        }),
      ]);

      // 通知申请用户加入已批准 => 客户端可自动加入 socket 房间并刷新服务器列表
      const io = getIO();
      io.to(`user-${reqRec.applicantId}`).emit('serverJoinApproved', {
        serverId,
        serverName: server.name,
      });
    } else {
      await prisma.serverJoinRequest.update({
        where: { id: requestId },
        data: {
          status: 'REJECTED',
          reviewNote: reviewNote || null,
          reviewedAt: new Date(),
          reviewerId: userId,
        },
      });
    }

    res.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    return res.status(500).json({ success: false, error: message });
  }
});

/**
 * @route   DELETE /api/servers/:id/leave
 * @desc    当前用户离开服务器（OWNER 不可离开，需要删除服务器）
 * @access  Private
 */
router.delete('/:id/leave', async (req, res) => {
  try {
    const serverId = req.params.id;
    const userId = req.user!.id;
    const prisma = (await import('../utils/prisma.js')).default;

    const server = await prisma.server.findUnique({ where: { id: serverId } });
    if (!server) return res.status(404).json({ success: false, error: 'Server not found' });

    // 创建者不能直接离开，只能删除服务器
    if (server.ownerId === userId) {
      return res.status(400).json({ success: false, error: 'Owner cannot leave the server' });
    }

    const membership = await prisma.serverMember.findUnique({
      where: { serverId_userId: { serverId, userId } },
    });
    if (!membership) {
      return res.status(400).json({ success: false, error: 'You are not a member of this server' });
    }

    await prisma.serverMember.delete({
      where: { serverId_userId: { serverId, userId } },
    });

    // 发送成员离开事件（用于刷新成员列表与服务器列表）
    const io = getIO();
    io.to(`server-${serverId}`).emit('serverMemberUpdate', {
      serverId,
      userId,
      action: 'leave',
    });

    return res.json({ success: true, message: 'Left server successfully' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    return res.status(500).json({ success: false, error: message });
  }
});

export default router;
