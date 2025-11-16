import path from 'path';
import { fileURLToPath } from 'url';

import { Message, User, MessageAttachment } from '@prisma/client';
import { Router } from 'express';
import multer from 'multer';
import { nanoid } from 'nanoid';

import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// 所有消息路由都需要认证
router.use(authMiddleware);

// 解析当前文件目录，构造 uploads 绝对路径（ESM 无 __dirname）
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');

// 媒体上传（图片/视频/文件）
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `media-${nanoid()}-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 单个媒体最大 100MiB
  },
});

type MessageWithAuthorAndAttachments = Message & {
  author: Pick<User, 'id' | 'username' | 'avatarUrl'>;
  attachments: MessageAttachment[];
};

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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    return res.status(500).json({ success: false, error: message });
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
    const beforeId = req.query.before as string | undefined;
    const afterId = req.query.after as string | undefined;

    const prisma = (await import('../utils/prisma.js')).default;
    const { decrypt } = await import('../utils/encryption.js');

    // 将 before/after 的消息ID转换为 createdAt 光标，避免使用 cuid 进行比较
    let beforeCursor: Date | undefined;
    let afterCursor: Date | undefined;
    if (beforeId) {
      const m = await prisma.message.findUnique({
        where: { id: beforeId },
        select: { createdAt: true },
      });
      beforeCursor = m?.createdAt;
    }
    if (afterId) {
      const m = await prisma.message.findUnique({
        where: { id: afterId },
        select: { createdAt: true },
      });
      afterCursor = m?.createdAt;
    }

    const messages = await prisma.message.findMany({
      where: {
        channelId,
        ...(beforeCursor && beforeId
          ? {
              OR: [
                { createdAt: { lt: beforeCursor } },
                { AND: [{ createdAt: beforeCursor }, { id: { lt: beforeId } }] },
              ],
            }
          : {}),
        ...(afterCursor && afterId
          ? {
              OR: [
                { createdAt: { gt: afterCursor } },
                { AND: [{ createdAt: afterCursor }, { id: { gt: afterId } }] },
              ],
            }
          : {}),
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
      orderBy: [{ createdAt: afterCursor ? 'asc' : 'desc' }, { id: afterCursor ? 'asc' : 'desc' }],
      take: limit,
    });

    // 解密消息
    const decryptedMessages = messages.map((msg: MessageWithAuthorAndAttachments) => ({
      ...msg,
      content: decrypt(msg.encryptedContent),
      encryptedContent: undefined,
    }));

    // 如果是 after 查询，消息已经是正序，不需要 reverse
    res.json({
      success: true,
      data: afterCursor ? decryptedMessages : decryptedMessages.reverse(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    res.status(500).json({ success: false, error: message });
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
    const beforeId = req.query.before as string | undefined;
    const afterId = req.query.after as string | undefined;

    const prisma = (await import('../utils/prisma.js')).default;
    const { decrypt } = await import('../utils/encryption.js');

    let beforeCursor: Date | undefined;
    let afterCursor: Date | undefined;
    if (beforeId) {
      const m = await prisma.message.findUnique({
        where: { id: beforeId },
        select: { createdAt: true },
      });
      beforeCursor = m?.createdAt;
    }
    if (afterId) {
      const m = await prisma.message.findUnique({
        where: { id: afterId },
        select: { createdAt: true },
      });
      afterCursor = m?.createdAt;
    }

    const messages = await prisma.message.findMany({
      where: {
        directMessageConversationId: conversationId,
        ...(beforeCursor && beforeId
          ? {
              OR: [
                { createdAt: { lt: beforeCursor } },
                { AND: [{ createdAt: beforeCursor }, { id: { lt: beforeId } }] },
              ],
            }
          : {}),
        ...(afterCursor && afterId
          ? {
              OR: [
                { createdAt: { gt: afterCursor } },
                { AND: [{ createdAt: afterCursor }, { id: { gt: afterId } }] },
              ],
            }
          : {}),
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
      orderBy: [{ createdAt: afterCursor ? 'asc' : 'desc' }, { id: afterCursor ? 'asc' : 'desc' }],
      take: limit,
    });

    // 解密消息
    const decryptedMessages = messages.map((msg: MessageWithAuthorAndAttachments) => ({
      ...msg,
      content: decrypt(msg.encryptedContent),
      encryptedContent: undefined,
    }));

    // 如果是 after 查询，消息已经是正序，不需要 reverse
    res.json({
      success: true,
      data: afterCursor ? decryptedMessages : decryptedMessages.reverse(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    res.status(500).json({ success: false, error: message });
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

    const prisma = (await import('../utils/prisma.js')).default;

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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    res.status(500).json({ success: false, error: message });
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

    const prisma = (await import('../utils/prisma.js')).default;

    const state = await prisma.userChannelState.findUnique({
      where: {
        userId_channelId: {
          userId,
          channelId,
        },
      },
    });

    res.json({ success: true, data: state || null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    res.status(500).json({ success: false, error: message });
  }
});

export default router;
