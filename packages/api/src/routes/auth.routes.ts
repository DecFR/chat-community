import { Router } from 'express';

import { authController } from '../controllers/auth.controller.js';
import { authMiddleware } from '../middleware/auth.js';
import logger from '../utils/logger.js';

const router: Router = Router();

/**
 * @route   POST /api/auth/register
 * @desc    注册新用户
 * @access  Public
 */
router.post('/register', authController.register);

/**
 * @route   GET /api/auth/check-users
 * @desc    检查是否有注册用户
 * @access  Public
 */
router.get('/check-users', async (_req, res) => {
  try {
    const prisma = (await import('../utils/prisma.js')).default;
    // 返回是否存在管理员账号（与后端注册策略保持一致）
    const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
    res.json({ success: true, data: { hasUsers: adminCount > 0 } });
  } catch (error) {
    logger.error('Check users error:', { error });
    res.status(500).json({ success: false, error: '检查用户失败' });
  }
});

/**
 * @route   POST /api/auth/login
 * @desc    用户登录
 * @access  Public
 */
router.post('/login', authController.login);

/**
 * @route   GET /api/auth/me
 * @desc    获取当前用户信息
 * @access  Private
 */
router.get('/me', authMiddleware, authController.getMe);

export default router;
