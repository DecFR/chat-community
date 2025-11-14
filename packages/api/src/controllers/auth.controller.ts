import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authService } from '../services/auth.service';
import { successResponse, errorResponse } from '../utils/response';

export const authController = {
  /**
   * 用户注册
   */
  register: [
    // 验证规则
    body('username')
      .trim()
      .isLength({ min: 3, max: 30 })
      .withMessage('Username must be between 3 and 30 characters')
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage('Username can only contain letters, numbers, and underscores'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters long'),
    body('email')
      .optional()
      .trim()
      .isEmail()
      .withMessage('Invalid email address'),

    // 处理函数
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json(errorResponse('Validation failed', errors.array()[0].msg));
        }

        const { username, password, email, inviteCode } = req.body;
        const result = await authService.register({ username, password, email, inviteCode });

        res.status(201).json(successResponse(result, 'User registered successfully'));
      } catch (error: any) {
        res.status(400).json(errorResponse(error.message));
      }
    },
  ],

  /**
   * 用户登录
   */
  login: [
    // 验证规则
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),

    // 处理函数
    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json(errorResponse('Validation failed', errors.array()[0].msg));
        }

        const { username, password } = req.body;
        const result = await authService.login({ username, password });

        res.json(successResponse(result, 'Login successful'));
      } catch (error: any) {
        res.status(401).json(errorResponse(error.message));
      }
    },
  ],

  /**
   * 获取当前用户信息
   */
  async getMe(req: Request, res: Response) {
    try {
      const user = await authService.getCurrentUser(req.user!.id);
      res.json(successResponse(user));
    } catch (error: any) {
      res.status(404).json(errorResponse(error.message));
    }
  },
};
