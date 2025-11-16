import path from 'path';
import { fileURLToPath } from 'url';

import { Request, Router } from 'express';
import multer from 'multer';
import { nanoid } from 'nanoid';

import { userController } from '../controllers/user.controller.js';
import { authMiddleware } from '../middleware/auth.js';

const router: Router = Router();

// ESM 解析当前文件目录，统一 uploads 绝对路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');

// 配置 Multer 用于文件上传
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `avatar-${nanoid()}-${Date.now()}${ext}`;
    cb(null, filename);
  },
});

const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    // 头像限制最大为 30MiB
    fileSize: 30 * 1024 * 1024,
  },
});

/**
 * 注意: 路由顺序很重要。像 "/:id" 这样的通配路由必须放在更具体路由之后，
 * 否则例如 "/search" 会被当作 id 捕获，导致搜索接口失效。
 */

/**
 * @route   GET /api/users/search
 * @desc    搜索用户（放在前面，避免被 ":id" 捕获）
 * @access  Private
 */
router.get('/search', authMiddleware, userController.searchUsers);

/**
 * @route   GET /api/users/check-username
 * @desc    检查用户名是否可用
 * @access  Private
 */
router.get('/check-username', authMiddleware, userController.checkUsername);

/**
 * @route   GET /api/users/:id
 * @desc    获取用户资料
 * @access  Private
 */
router.get('/:id', authMiddleware, userController.getProfile);

/**
 * @route   PUT /api/users/profile
 * @desc    更新用户资料
 * @access  Private
 */
router.put('/profile', authMiddleware, userController.updateProfile);

/**
 * @route   POST /api/users/avatar
 * @desc    上传用户头像
 * @access  Private
 */
router.post('/avatar', authMiddleware, upload.single('avatar'), userController.uploadAvatar);

/**
 * @route   GET /api/users/settings
 * @desc    获取用户设置
 * @access  Private
 */
router.get('/settings', authMiddleware, userController.getSettings);

/**
 * @route   PUT /api/users/settings
 * @desc    更新用户设置
 * @access  Private
 */
router.put('/settings', authMiddleware, userController.updateSettings);

/**
 * @route   PUT /api/users/password
 * @desc    更新用户密码
 * @access  Private
 */
router.put('/password', authMiddleware, userController.updatePassword);

// 其余路由保持不变

export default router;
