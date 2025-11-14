import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

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
    const prisma = (await import('../utils/prisma')).default;
    const userCount = await prisma.user.count();
    res.json({ success: true, data: { hasUsers: userCount > 0 } });
  } catch (error) {
    console.error('Check users error:', error);
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
