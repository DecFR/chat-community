import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// 所有服务器路由都需要认证
router.use(authMiddleware);

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
 * @desc    获取所有服务器
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const prisma = (await import('../utils/prisma')).default;

    const servers = await prisma.server.findMany({
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

export default router;
