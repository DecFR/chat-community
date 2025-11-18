import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';

import { friendService } from '../services/friend.service.js';
import { getIO } from '../socket/index.js';
import { successResponse, errorResponse } from '../utils/response.js';

export const friendController = {
  /**
   * 发送好友请求
   */
  sendRequest: [
    body('receiverId').notEmpty().withMessage('Receiver ID is required'),

    async (req: Request, res: Response) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json(errorResponse('Validation failed', errors.array()[0].msg));
        }

        const senderId = req.user!.id;
        const { receiverId } = req.body;

        const friendship = await friendService.sendFriendRequest(senderId, receiverId);

        // 通过 Socket.IO 通知接收方
        const io = getIO();
        io.to(`user-${receiverId}`).emit('newFriendRequest', {
          ...friendship,
          sender: {
            id: friendship.sender.id,
            username: friendship.sender.username,
            avatarUrl: friendship.sender.avatarUrl,
            status: friendship.sender.status,
          },
        });

        res.status(201).json(successResponse(friendship, 'Friend request sent'));
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'An unknown error occurred';
        res.status(400).json(errorResponse(message));
      }
    },
  ],

  /**
   * 接受好友请求
   */
  async acceptRequest(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const friendshipId = req.params.id;

      const friendship = await friendService.acceptFriendRequest(userId, friendshipId);

      // 通过 Socket.IO 通知申请方好友请求已被接受
      const io = getIO();
      io.to(`user-${friendship.senderId}`).emit('friendRequestAccepted', {
        friendshipId: friendship.id,
        friend: {
          id: friendship.receiver.id,
          username: friendship.receiver.username,
          avatarUrl: friendship.receiver.avatarUrl,
          status: friendship.receiver.status,
        },
      });

      // 也通知接受者本人更新好友列表
      io.to(`user-${userId}`).emit('friendRequestAccepted', {
        friendshipId: friendship.id,
        friend: {
          id: friendship.sender.id,
          username: friendship.sender.username,
          avatarUrl: friendship.sender.avatarUrl,
          status: friendship.sender.status,
        },
      });

      res.json(successResponse(friendship, 'Friend request accepted'));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'An unknown error occurred';
      res.status(400).json(errorResponse(message));
    }
  },

  /**
   * 拒绝好友请求
   */
  async declineRequest(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const friendshipId = req.params.id;

      const friendship = await friendService.declineFriendRequest(userId, friendshipId);

      // 通过 Socket.IO 通知申请方好友请求已被拒绝
      const io = getIO();
      io.to(`user-${friendship.senderId}`).emit('friendRequestDeclined', {
        friendshipId: friendship.id,
      });

      res.json(successResponse(null, 'Friend request declined'));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'An unknown error occurred';
      res.status(400).json(errorResponse(message));
    }
  },

  /**
   * 获取好友列表
   */
  async getFriends(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const friends = await friendService.getFriends(userId);
      res.json(successResponse(friends));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'An unknown error occurred';
      res.status(400).json(errorResponse(message));
    }
  },

  /**
   * 获取待处理的好友请求
   */
  async getPendingRequests(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const requests = await friendService.getPendingRequests(userId);
      res.json(successResponse(requests));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'An unknown error occurred';
      res.status(400).json(errorResponse(message));
    }
  },

  /**
   * 删除好友
   */
  async removeFriend(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const friendshipId = req.params.id;

      const { friendId } = await friendService.removeFriend(userId, friendshipId);

      // 通过 Socket.IO 通知双方已被删除
      const io = getIO();
      io.to(`user-${friendId}`).emit('friendRemoved', {
        friendshipId,
        friendId: userId, // 谁删除了我
      });
      io.to(`user-${userId}`).emit('friendRemoved', {
        friendshipId,
        friendId: friendId, // 我删除了谁
      });

      res.json(successResponse(null, 'Friend removed'));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'An unknown error occurred';
      res.status(400).json(errorResponse(message));
    }
  },
};
