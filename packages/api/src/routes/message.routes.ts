import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// 所有消息路由都需要认证
router.use(authMiddleware);

/**
 * @route   GET /api/messages/channel/:channelId
 * @desc    获取频道消息历史
 * @access  Private
 */
router.get('/channel/:channelId', async (req, res) => {
  try {
    const { channelId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const before = req.query.before as string | undefined;

    const prisma = (await import('../utils/prisma')).default;
    const { decrypt } = await import('../utils/encryption');

    const messages = await prisma.message.findMany({
      where: {
        channelId,
        ...(before && { id: { lt: before } }),
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
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    // 解密消息
    const decryptedMessages = messages.map((msg: any) => ({
      ...msg,
      content: decrypt(msg.encryptedContent),
      encryptedContent: undefined,
    }));

    res.json({ success: true, data: decryptedMessages.reverse() });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/messages/conversation/:conversationId
 * @desc    获取私聊消息历史
 * @access  Private
 */
router.get('/conversation/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const before = req.query.before as string | undefined;

    const prisma = (await import('../utils/prisma')).default;
    const { decrypt } = await import('../utils/encryption');

    const messages = await prisma.message.findMany({
      where: {
        directMessageConversationId: conversationId,
        ...(before && { id: { lt: before } }),
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
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    // 解密消息
    const decryptedMessages = messages.map((msg: any) => ({
      ...msg,
      content: decrypt(msg.encryptedContent),
      encryptedContent: undefined,
    }));

    res.json({ success: true, data: decryptedMessages.reverse() });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/messages/conversation/:conversationId/state
 * @desc    获取用户在会话中的阅读状态
 * @access  Private
 */
router.get('/conversation/:conversationId/state', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user!.id;

    const prisma = (await import('../utils/prisma')).default;

    const state = await prisma.userConversationState.findUnique({
      where: {
        userId_conversationId: {
          userId,
          conversationId,
        },
      },
    });

    res.json({ success: true, data: state });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
