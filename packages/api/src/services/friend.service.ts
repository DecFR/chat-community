import prisma from '../utils/prisma';

export const friendService = {
  /**
   * 发送好友请求
   */
  async sendFriendRequest(senderId: string, receiverId: string) {
    if (senderId === receiverId) {
      throw new Error('Cannot send friend request to yourself');
    }

    // 检查是否已经是好友或有待处理的请求
    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { senderId, receiverId },
          { senderId: receiverId, receiverId: senderId },
        ],
      },
    });

    if (existing) {
      if (existing.status === 'ACCEPTED') {
        throw new Error('Already friends');
      } else if (existing.status === 'PENDING') {
        throw new Error('Friend request already sent');
      } else if (existing.status === 'BLOCKED') {
        throw new Error('Cannot send friend request');
      }
    }

    const friendship = await prisma.friendship.create({
      data: {
        senderId,
        receiverId,
        status: 'PENDING',
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            status: true,
          },
        },
        receiver: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            status: true,
          },
        },
      },
    });

    return friendship;
  },

  /**
   * 接受好友请求
   */
  async acceptFriendRequest(userId: string, friendshipId: string) {
    const friendship = await prisma.friendship.findUnique({
      where: { id: friendshipId },
    });

    if (!friendship) {
      throw new Error('Friend request not found');
    }

    if (friendship.receiverId !== userId) {
      throw new Error('Not authorized');
    }

    if (friendship.status !== 'PENDING') {
      throw new Error('Friend request is not pending');
    }

    const updated = await prisma.friendship.update({
      where: { id: friendshipId },
      data: { status: 'ACCEPTED' },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            status: true,
          },
        },
        receiver: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            status: true,
          },
        },
      },
    });

    return updated;
  },

  /**
   * 拒绝好友请求
   */
  async declineFriendRequest(userId: string, friendshipId: string) {
    const friendship = await prisma.friendship.findUnique({
      where: { id: friendshipId },
    });

    if (!friendship) {
      throw new Error('Friend request not found');
    }

    if (friendship.receiverId !== userId) {
      throw new Error('Not authorized');
    }

    await prisma.friendship.delete({
      where: { id: friendshipId },
    });

    return { success: true };
  },

  /**
   * 获取好友列表
   */
  async getFriends(userId: string) {
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { senderId: userId, status: 'ACCEPTED' },
          { receiverId: userId, status: 'ACCEPTED' },
        ],
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            status: true,
            bio: true,
          },
        },
        receiver: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            status: true,
            bio: true,
          },
        },
      },
    });

    // 映射为好友对象
    const friends = friendships.map((f: any) => {
      const friend = f.senderId === userId ? f.receiver : f.sender;
      return {
        friendshipId: f.id,
        ...friend,
      };
    });

    return friends;
  },

  /**
   * 获取待处理的好友请求
   */
  async getPendingRequests(userId: string) {
    const requests = await prisma.friendship.findMany({
      where: {
        receiverId: userId,
        status: 'PENDING',
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            status: true,
            bio: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return requests;
  },

  /**
   * 删除好友
   */
  async removeFriend(userId: string, friendshipId: string) {
    const friendship = await prisma.friendship.findUnique({
      where: { id: friendshipId },
    });

    if (!friendship) {
      throw new Error('Friendship not found');
    }

    if (friendship.senderId !== userId && friendship.receiverId !== userId) {
      throw new Error('Not authorized');
    }

    await prisma.friendship.delete({
      where: { id: friendshipId },
    });

    return { success: true };
  },
};
