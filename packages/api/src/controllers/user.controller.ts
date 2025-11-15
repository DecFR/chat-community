import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { userService } from '../services/user.service';
import { successResponse, errorResponse } from '../utils/response';

export const userController = {
  /**
   * 获取用户资料
   */
  async getProfile(req: Request, res: Response) {
    try {
      const userId = req.params.id;
      const user = await userService.getUserProfile(userId);
      res.json(successResponse(user));
    } catch (error: any) {
      res.status(404).json(errorResponse(error.message));
    }
  },

  /**
   * 更新用户资料
   */
  updateProfile: [
    body('bio').optional().trim().isLength({ max: 500 }),
    body('status').optional().isIn(['ONLINE', 'IDLE', 'DO_NOT_DISTURB', 'OFFLINE']),

    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json(errorResponse('Validation failed', errors.array()[0].msg));
        }

        const userId = req.user!.id;
        const updates = req.body;
        const user = await userService.updateProfile(userId, updates);

        res.json(successResponse(user, 'Profile updated successfully'));
      } catch (error: any) {
        res.status(400).json(errorResponse(error.message));
      }
    },
  ],

  /**
   * 上传头像
   */
  async uploadAvatar(req: Request, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json(errorResponse('No file uploaded'));
      }

      const userId = req.user!.id;
      const avatarUrl = `/uploads/${req.file.filename}`;

      // 先取出旧头像，更新成功后再尝试删除
      const current = await userService.getUserProfile(userId);
      const oldAvatar = current.avatarUrl;

      const user = await userService.updateProfile(userId, { avatarUrl });

      // 删除旧头像文件（仅删除以 avatar- 前缀命名的本地文件，避免误删消息附件或外链）
      try {
        if (oldAvatar && oldAvatar !== avatarUrl && oldAvatar.startsWith('/uploads/')) {
          const fname = oldAvatar.split('/').pop() || '';
          if (fname.startsWith('avatar-')) {
            const pathModule = await import('path');
            const fs = await import('fs/promises');
            const filePath = pathModule.join(__dirname, '../../uploads', fname);
            await fs.unlink(filePath).catch(() => {});
          }
        }
      } catch {
        // 清理失败忽略，不影响主流程
      }

      res.json(successResponse({ avatarUrl: user.avatarUrl }, 'Avatar uploaded successfully'));
    } catch (error: any) {
      res.status(400).json(errorResponse(error.message));
    }
  },

  /**
   * 获取用户设置
   */
  async getSettings(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const settings = await userService.getUserSettings(userId);
      res.json(successResponse(settings));
    } catch (error: any) {
      res.status(404).json(errorResponse(error.message));
    }
  },

  /**
   * 更新用户设置
   */
  async updateSettings(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const updates = req.body;
      const settings = await userService.updateUserSettings(userId, updates);

      res.json(successResponse(settings, 'Settings updated successfully'));
    } catch (error: any) {
      res.status(400).json(errorResponse(error.message));
    }
  },

  /**
   * 搜索用户
   */
  async searchUsers(req: Request, res: Response) {
    try {
      const raw = (req.query.q as string) || '';
      const query = raw.trim();
      if (!query || query.length < 1) {
        return res.status(400).json(errorResponse('Query must not be empty'));
      }

      const users = await userService.searchUsers(query, req.user!.id);
      res.json(successResponse(users));
    } catch (error: any) {
      res.status(400).json(errorResponse(error.message));
    }
  },

  /**
   * 更新密码
   */
  async updatePassword(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json(errorResponse('当前密码和新密码不能为空'));
      }

      if (newPassword.length < 6) {
        return res.status(400).json(errorResponse('新密码长度至少为6位'));
      }

      await userService.updatePassword(userId, currentPassword, newPassword);
      res.json(successResponse(null, '密码已更新'));
    } catch (error: any) {
      res.status(400).json(errorResponse(error.message));
    }
  },

  /**
   * 检查用户名是否可用
   */
  async checkUsername(req: Request, res: Response) {
    try {
      const username = req.query.username as string;
      const currentUserId = req.user!.id;

      if (!username || username.trim().length === 0) {
        return res.status(400).json(errorResponse('用户名不能为空'));
      }

      const isAvailable = await userService.checkUsernameAvailability(username, currentUserId);
      res.json(successResponse({ available: isAvailable }));
    } catch (error: any) {
      res.status(400).json(errorResponse(error.message));
    }
  },
};
