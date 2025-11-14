import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { nanoid } from 'nanoid';
import { authMiddleware } from '../middleware/auth';
import { userController } from '../controllers/user.controller';

const router = Router();

// 配置 Multer 用于文件上传
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.join(__dirname, '../../uploads'));
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `avatar-${nanoid()}-${Date.now()}${ext}`;
    cb(null, filename);
  },
});

const fileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
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
    fileSize: Number(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
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

// 其余路由保持不变

export default router;
