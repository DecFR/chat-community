import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { getIO } from '../socket/index.js';
import logger from '../utils/logger.js';
import prisma from '../utils/prisma.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const SALT_ROUNDS = 10;

interface RegisterData {
  username: string;
  password: string;
  email?: string;
  inviteCode?: string;
}

interface LoginData {
  username: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}

export const authService = {
  /**
   * 用户注册
   */
  async register(data: RegisterData) {
    const { username, password, email, inviteCode } = data;

    // 检查用户名是否已存在
    const existingUser = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUser) {
      throw new Error('用户名已存在');
    }

    // 检查邮箱是否已存在
    if (email) {
      const existingEmail = await prisma.user.findUnique({
        where: { email },
      });

      if (existingEmail) {
        throw new Error('邮箱已被使用');
      }
    }

    // 如果没有管理员账户（首次设置管理员），第一个注册的用户成为 ADMIN，且无需邀请码。
    // 这样比仅判断用户总数更鲁棒（例如存在仅测试用户但无管理员的情况）。
    const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
    const isFirstAdmin = adminCount === 0;
    const role = isFirstAdmin ? 'ADMIN' : 'USER';

    // 如果已经存在管理员，则需要验证邀请码才能注册新用户
    if (!isFirstAdmin) {
      if (!inviteCode) {
        throw new Error('注册需要邀请码');
      }

      // 验证邀请码
      const invite = await prisma.userInviteCode.findUnique({
        where: { code: inviteCode },
      });

      if (!invite) {
        throw new Error('邀请码无效');
      }

      if (new Date() > invite.expiresAt) {
        throw new Error('邀请码已过期');
      }

      // 邀请码验证成功后删除（一次性使用）
      await prisma.userInviteCode.delete({
        where: { id: invite.id },
      });
    }

    // 哈希密码
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // 创建用户
    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        email,
        role,
        settings: {
          create: {
            theme: 'DARK',
          },
        },
      },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        avatarUrl: true,
        bio: true,
        status: true,
        createdAt: true,
      },
    });

    // 生成 JWT token
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, {
      expiresIn: '7d',
    });

    return { user, token };
  },

  /**
   * 用户登录
   */
  async login(data: LoginData) {
    const { username, password, ipAddress, userAgent } = data;

    // 查找用户
    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      throw new Error('用户名或密码错误');
    }

    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new Error('用户名或密码错误');
    }

    // 生成 JWT token
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, {
      expiresIn: '7d',
    });

    // 计算过期时间
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // 查找用户的所有活跃会话（保留记录，但不再限制并发设备数）
    // 关闭设备限制：不删除旧会话，也不向旧 socket 发送 forceLogout。
    // 这样允许用户在多个设备/浏览器同时在线。保留会话以便后续审计或会话管理。
    const existingSessions = await prisma.userSession.findMany({
      where: {
        userId: user.id,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'asc' },
    });

    // 创建新会话记录
    await prisma.userSession.create({
      data: {
        userId: user.id,
        token,
        ipAddress,
        userAgent,
        expiresAt,
      },
    });

    // 更新用户状态为在线
    await prisma.user.update({
      where: { id: user.id },
      data: { status: 'ONLINE' },
    });

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        avatarUrl: user.avatarUrl,
        bio: user.bio,
        status: 'ONLINE',
        createdAt: user.createdAt,
      },
      token,
    };
  },

  /**
   * 获取当前用户信息
   */
  async getCurrentUser(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        avatarUrl: true,
        bio: true,
        status: true,
        createdAt: true,
        settings: true,
      },
    });

    if (!user) {
      throw new Error('用户不存在');
    }

    return user;
  },
};
