import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma';

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

    // 检查是否是第一个用户（设为 ADMIN）
    const userCount = await prisma.user.count();
    const role = userCount === 0 ? 'ADMIN' : 'USER';

    // 如果不是第一个用户，需要验证邀请码
    if (userCount > 0) {
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
    const { username, password } = data;

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

    // 更新用户状态为在线
    await prisma.user.update({
      where: { id: user.id },
      data: { status: 'ONLINE' },
    });

    // 生成 JWT token
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, {
      expiresIn: '7d',
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
