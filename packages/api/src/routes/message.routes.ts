import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import multer from 'multer';
import path from 'path';
import { nanoid } from 'nanoid';

const router = Router();

// 所有消息路由都需要认证
router.use(authMiddleware);

// 媒体上传（图片/视频/文件）
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.join(__dirname, '../../uploads'));
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `media-${nanoid()}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 单个媒体最大 50MiB
  },
});

/**
 * @route   POST /api/messages/upload
 * @desc    上传媒体并返回URL
 * @access  Private
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: '未选择文件' });
    }

    const mime = req.file.mimetype;
    let type: 'IMAGE' | 'VIDEO' | 'FILE' = 'FILE';
    if (mime.startsWith('image/')) type = 'IMAGE';
    else if (mime.startsWith('video/')) type = 'VIDEO';

    const url = `/uploads/${req.file.filename}`;
    return res.json({
      success: true,
      data: {
        url,
        type,
        filename: req.file.originalname,
        mimeType: mime,
        size: req.file.size,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

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
    const after = req.query.after as string | undefined;

    const prisma = (await import('../utils/prisma')).default;
    const { decrypt } = await import('../utils/encryption');

    const messages = await prisma.message.findMany({
      where: {
        channelId,
        ...(before && { id: { lt: before } }),
        ...(after && { id: { gt: after } }),
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
      orderBy: {
        createdAt: after ? 'asc' : 'desc',
      },
      take: limit,
    });

    // 解密消息
    const decryptedMessages = messages.map((msg: any) => ({
      ...msg,
      content: decrypt(msg.encryptedContent),
      encryptedContent: undefined,
    }));

    // 如果是 after 查询，消息已经是正序，不需要 reverse
    res.json({ success: true, data: after ? decryptedMessages : decryptedMessages.reverse() });
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
    const after = req.query.after as string | undefined;

    const prisma = (await import('../utils/prisma')).default;
    const { decrypt } = await import('../utils/encryption');

    const messages = await prisma.message.findMany({
      where: {
        directMessageConversationId: conversationId,
        ...(before && { id: { lt: before } }),
        ...(after && { id: { gt: after } }),
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
      orderBy: {
        createdAt: after ? 'asc' : 'desc',
      },
      take: limit,
    });

    // 解密消息
    const decryptedMessages = messages.map((msg: any) => ({
      ...msg,
      content: decrypt(msg.encryptedContent),
      encryptedContent: undefined,
    }));

    // 如果是 after 查询，消息已经是正序，不需要 reverse
    res.json({ success: true, data: after ? decryptedMessages : decryptedMessages.reverse() });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/messages/conversation/:friendId/state
 * @desc    获取用户在会话中的阅读状态
 * @access  Private
 */
router.get('/conversation/:friendId/state', async (req, res) => {
  try {
    const { friendId } = req.params;
    const userId = req.user!.id;

    const prisma = (await import('../utils/prisma')).default;

    // 查找或创建会话
    let conversation = await prisma.directMessageConversation.findFirst({
      where: {
        OR: [
          { user1Id: userId, user2Id: friendId },
          { user1Id: friendId, user2Id: userId },
        ],
      },
    });

    if (!conversation) {
      // 创建新会话
      const [smallerId, largerId] = [userId, friendId].sort();
      conversation = await prisma.directMessageConversation.create({
        data: {
          user1Id: smallerId,
          user2Id: largerId,
        },
      });
    }

    const state = await prisma.userConversationState.findUnique({
      where: {
        userId_conversationId: {
          userId,
          conversationId: conversation.id,
        },
      },
    });

    res.json({ success: true, data: { ...state, conversationId: conversation.id } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/messages/channel/:channelId/state
 * @desc    获取用户在频道中的阅读状态
 * @access  Private
 */
router.get('/channel/:channelId/state', async (req, res) => {
  try {
    const { channelId } = req.params;
    const userId = req.user!.id;

    const prisma = (await import('../utils/prisma')).default;

    const state = await prisma.userChannelState.findUnique({
      where: {
        userId_channelId: {
          userId,
          channelId,
        },
      },
    });

    res.json({ success: true, data: state || null });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
