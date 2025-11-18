import prisma from '../utils/prisma.js';

export const friendService = {
  /**
   * 发送好友请求
   */
  async sendFriendRequest(senderId: string, receiverId: string) {
    if (senderId === receiverId) {
      throw new Error('Cannot send friend request to yourself');
    }

    // 检查接收者的隐私设置
    const receiverSettings = await prisma.userSettings.findUnique({
      where: { userId: receiverId },
      select: { friendRequestPrivacy: true },
    });

    // 如果接收者关闭了好友请求
    if (receiverSettings?.friendRequestPrivacy === 'NONE') {
      throw new Error('该用户已关闭好友请求');
    }

    // 如果接收者设置为"好友的好友"，检查是否有共同好友
    if (receiverSettings?.friendRequestPrivacy === 'FRIENDS_OF_FRIENDS') {
      const mutualFriends = await prisma.friendship.findFirst({
        where: {
          AND: [
            {
              OR: [
                { senderId: senderId, status: 'ACCEPTED' },
                { receiverId: senderId, status: 'ACCEPTED' },
              ],
            },
            {
              OR: [
                { senderId: receiverId, status: 'ACCEPTED' },
                { receiverId: receiverId, status: 'ACCEPTED' },
              ],
            },
          ],
        },
      });

      if (!mutualFriends) {
        throw new Error('该用户仅接受好友的好友发送请求');
      }
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

    // 直接删除好友申请记录
    const deletedFriendship = await prisma.friendship.delete({
      where: { id: friendshipId },
    });

    return deletedFriendship;
  },

  /**
   * 获取好友列表
   */
  async getFriends(userId: string) {
    const friendships = await prisma.friendship.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ senderId: userId }, { receiverId: userId }],
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

    // 映射为好友对象
    const friends = friendships.map(
      (f: {
        id: string;
        senderId: string;
        receiverId: string;
        sender: { id: string; username: string; avatarUrl?: string | null; status?: string };
        receiver: { id: string; username: string; avatarUrl?: string | null; status?: string };
      }) => {
        const friend = f.senderId === userId ? f.receiver : f.sender;
        return {
          friendshipId: f.id,
          id: friend.id,
          username: friend.username,
          // 保持与前端约定的字段名一致
          avatarUrl: friend.avatarUrl,
          status: friend.status,
        };
      }
    );

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

    const friendId = friendship.senderId === userId ? friendship.receiverId : friendship.senderId;

    await prisma.friendship.delete({
      where: { id: friendshipId },
    });

    return { success: true, friendship, friendId };
  },
};
