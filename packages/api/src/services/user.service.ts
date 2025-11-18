import prisma from '../utils/prisma.js';

interface UpdateProfileData {
  username?: string;
  email?: string;
  bio?: string;
  status?: 'ONLINE' | 'IDLE' | 'DO_NOT_DISTURB' | 'OFFLINE';
  avatarUrl?: string;
}

interface UpdateSettingsData {
  lastSelectedServerId?: string | null;
  lastSelectedChannelId?: string | null;
  theme?: 'LIGHT' | 'DARK' | 'SYSTEM';
  friendRequestPrivacy?: 'EVERYONE' | 'FRIENDS_OF_FRIENDS' | 'NONE';
}

export const userService = {
  /**
   * 获取用户资料
   */
  async getUserProfile(userId: string) {
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
      },
    });

    if (!user) {
      throw new Error('用户不存在');
    }

    return user;
  },

  /**
   * 更新用户资料
   */
  async updateProfile(userId: string, updates: UpdateProfileData) {
    // 验证用户名唯一性
    if (updates.username) {
      const existingUser = await prisma.user.findFirst({
        where: {
          username: updates.username,
          NOT: { id: userId },
        },
      });
      if (existingUser) {
        throw new Error('用户名已被使用');
      }
    }

    // 验证邮箱唯一性
    if (updates.email) {
      const existingUser = await prisma.user.findFirst({
        where: {
          email: updates.email,
          NOT: { id: userId },
        },
      });
      if (existingUser) {
        throw new Error('邮箱已被使用');
      }
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: updates,
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

    return user;
  },

  /**
   * 获取用户设置
   */
  async getUserSettings(userId: string) {
    let settings = await prisma.userSettings.findUnique({
      where: { userId },
    });

    // 如果设置不存在，创建默认设置
    if (!settings) {
      settings = await prisma.userSettings.create({
        data: { userId },
      });
    }

    return settings;
  },

  /**
   * 更新用户设置
   */
  async updateUserSettings(userId: string, updates: UpdateSettingsData) {
    const settings = await prisma.userSettings.upsert({
      where: { userId },
      update: updates,
      create: {
        userId,
        ...updates,
      },
    });

    return settings;
  },

  /**
   * 搜索用户
   */
  async searchUsers(query: string, currentUserId?: string) {
    const users = await prisma.user.findMany({
      where: {
        AND: [
          currentUserId ? { id: { not: currentUserId } } : {},
          {
            OR: [
              { username: { contains: query, mode: 'insensitive' } },
              { email: { contains: query, mode: 'insensitive' } },
            ],
          },
        ],
      },
      select: {
        id: true,
        username: true,
        avatarUrl: true,
        bio: true,
        status: true,
      },
      take: 20,
      orderBy: { username: 'asc' },
    });

    if (!currentUserId || users.length === 0) return users;

    const targetIds = users.map((u: { id: string }) => u.id);
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { senderId: currentUserId, receiverId: { in: targetIds } },
          { receiverId: currentUserId, senderId: { in: targetIds } },
        ],
      },
      select: {
        id: true,
        senderId: true,
        receiverId: true,
        status: true,
      },
    });

    const relByUser = new Map<
      string,
      'FRIEND' | 'OUTGOING_PENDING' | 'INCOMING_PENDING' | 'NONE'
    >();
    for (const u of users) relByUser.set(u.id, 'NONE');
    for (const f of friendships) {
      if (f.status === 'ACCEPTED') {
        relByUser.set(f.senderId === currentUserId ? f.receiverId : f.senderId, 'FRIEND');
      } else if (f.status === 'PENDING') {
        if (f.senderId === currentUserId) {
          relByUser.set(f.receiverId, 'OUTGOING_PENDING');
        } else if (f.receiverId === currentUserId) {
          relByUser.set(f.senderId, 'INCOMING_PENDING');
        }
      }
    }

    // 将关系附加到返回对象
    return users.map(
      (u: {
        id: string;
        username: string;
        avatarUrl?: string | null;
        bio?: string | null;
        status?: string;
      }) => ({
        ...u,
        relationship: relByUser.get(u.id) || 'NONE',
      })
    );
  },

  /**
   * 更新密码
   */
  async updatePassword(userId: string, currentPassword: string, newPassword: string) {
    const bcrypt = await import('bcryptjs');

    // 获取用户当前密码
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });

    if (!user) {
      throw new Error('用户不存在');
    }

    // 验证当前密码
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      throw new Error('当前密码不正确');
    }

    // 加密新密码
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 更新密码
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return { success: true };
  },

  /**
   * 检查用户名是否可用
   */
  async checkUsernameAvailability(username: string, currentUserId: string) {
    const existingUser = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });

    // 如果不存在该用户名，或者该用户名是当前用户自己的，则可用
    return !existingUser || existingUser.id === currentUserId;
  },
};
