import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { friendService } from '../services/friend.service';
import { successResponse, errorResponse } from '../utils/response';

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
        res.status(201).json(successResponse(friendship, 'Friend request sent'));
      } catch (error: any) {
        res.status(400).json(errorResponse(error.message));
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
      res.json(successResponse(friendship, 'Friend request accepted'));
    } catch (error: any) {
      res.status(400).json(errorResponse(error.message));
    }
  },

  /**
   * 拒绝好友请求
   */
  async declineRequest(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const friendshipId = req.params.id;

      await friendService.declineFriendRequest(userId, friendshipId);
      res.json(successResponse(null, 'Friend request declined'));
    } catch (error: any) {
      res.status(400).json(errorResponse(error.message));
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
    } catch (error: any) {
      res.status(400).json(errorResponse(error.message));
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
    } catch (error: any) {
      res.status(400).json(errorResponse(error.message));
    }
  },

  /**
   * 删除好友
   */
  async removeFriend(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const friendshipId = req.params.id;

      await friendService.removeFriend(userId, friendshipId);
      res.json(successResponse(null, 'Friend removed'));
    } catch (error: any) {
      res.status(400).json(errorResponse(error.message));
    }
  },
};
