import prisma from '../utils/prisma';

interface UpdateProfileData {
  bio?: string;
  status?: 'ONLINE' | 'IDLE' | 'DO_NOT_DISTURB' | 'OFFLINE';
  avatarUrl?: string;
}

interface UpdateSettingsData {
  lastSelectedServerId?: string | null;
  lastSelectedChannelId?: string | null;
  theme?: 'LIGHT' | 'DARK' | 'SYSTEM';
  friendRequestPrivacy?: 'EVERYONE' | 'FRIENDS_OF_FRIENDS';
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
  async searchUsers(query: string) {
    const users = await prisma.user.findMany({
      where: {
        username: {
          contains: query,
          mode: 'insensitive',
        },
      },
      select: {
        id: true,
        username: true,
        avatarUrl: true,
        bio: true,
        status: true,
      },
      take: 20,
    });

    return users;
  },
};
