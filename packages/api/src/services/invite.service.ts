import { nanoid } from 'nanoid';

import prisma from '../utils/prisma.js';

export const inviteService = {
  /**
   * 生成用户邀请码
   */
  async generateUserInviteCode(userId: string, expiresInDays: number = 7) {
    const code = nanoid(12);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    const inviteCode = await prisma.userInviteCode.create({
      data: {
        code,
        userId,
        expiresAt,
      },
    });

    return inviteCode;
  },

  /**
   * 验证用户邀请码
   */
  async validateUserInviteCode(code: string) {
    const inviteCode = await prisma.userInviteCode.findUnique({
      where: { code },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            role: true,
          },
        },
      },
    });

    if (!inviteCode) {
      throw new Error('邀请码无效');
    }

    if (new Date() > inviteCode.expiresAt) {
      throw new Error('邀请码已过期');
    }

    return inviteCode;
  },

  /**
   * 获取用户的所有邀请码
   */
  async getUserInviteCodes(userId: string) {
    return await prisma.userInviteCode.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * 删除邀请码
   */
  async deleteUserInviteCode(codeId: string, userId: string) {
    const inviteCode = await prisma.userInviteCode.findUnique({
      where: { id: codeId },
    });

    if (!inviteCode || inviteCode.userId !== userId) {
      throw new Error('Invite code not found or unauthorized');
    }

    await prisma.userInviteCode.delete({
      where: { id: codeId },
    });
  },

  /**
   * 生成服务器邀请码
   */
  async generateServerInviteCode(serverId: string, expiresInDays: number = 7) {
    const code = nanoid(10);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    const inviteCode = await prisma.serverInviteCode.create({
      data: {
        code,
        serverId,
        expiresAt,
      },
      include: {
        server: {
          select: {
            id: true,
            name: true,
            description: true,
            iconUrl: true,
          },
        },
      },
    });

    return inviteCode;
  },

  /**
   * 验证服务器邀请码
   */
  async validateServerInviteCode(code: string) {
    const inviteCode = await prisma.serverInviteCode.findUnique({
      where: { code },
      include: {
        server: {
          select: {
            id: true,
            name: true,
            description: true,
            iconUrl: true,
            ownerId: true,
          },
        },
      },
    });

    if (!inviteCode) {
      throw new Error('服务器邀请码无效');
    }

    if (new Date() > inviteCode.expiresAt) {
      throw new Error('服务器邀请码已过期');
    }

    return inviteCode;
  },

  /**
   * 使用服务器邀请码加入服务器
   */
  async joinServerByInviteCode(code: string, userId: string) {
    const inviteCode = await this.validateServerInviteCode(code);

    // 检查用户是否已经是成员
    const existingMember = await prisma.serverMember.findUnique({
      where: {
        serverId_userId: {
          serverId: inviteCode.server.id,
          userId,
        },
      },
    });

    if (existingMember) {
      throw new Error('您已经是该服务器的成员');
    }

    // 添加用户为服务器成员
    await prisma.serverMember.create({
      data: {
        userId,
        serverId: inviteCode.server.id,
        role: 'MEMBER',
      },
    });

    return inviteCode.server;
  },

  /**
   * 获取服务器的所有邀请码
   */
  async getServerInviteCodes(serverId: string) {
    return await prisma.serverInviteCode.findMany({
      where: { serverId },
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * 删除服务器邀请码
   */
  async deleteServerInviteCode(codeId: string, serverId: string) {
    const inviteCode = await prisma.serverInviteCode.findUnique({
      where: { id: codeId },
    });

    if (!inviteCode || inviteCode.serverId !== serverId) {
      throw new Error('邀请码不存在或无权操作');
    }

    await prisma.serverInviteCode.delete({
      where: { id: codeId },
    });
  },
};
