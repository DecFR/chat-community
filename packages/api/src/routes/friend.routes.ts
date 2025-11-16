import { Router } from 'express';

import { friendController } from '../controllers/friend.controller.js';
import { authMiddleware } from '../middleware/auth.js';

const router: Router = Router();

/**
 * @route   POST /api/friends/request
 * @desc    发送好友请求
 * @access  Private
 */
router.post('/request', authMiddleware, friendController.sendRequest);

/**
 * @route   POST /api/friends/:id/accept
 * @desc    接受好友请求
 * @access  Private
 */
router.post('/:id/accept', authMiddleware, friendController.acceptRequest);

/**
 * @route   POST /api/friends/:id/decline
 * @desc    拒绝好友请求
 * @access  Private
 */
router.post('/:id/decline', authMiddleware, friendController.declineRequest);

/**
 * @route   GET /api/friends
 * @desc    获取好友列表
 * @access  Private
 */
router.get('/', authMiddleware, friendController.getFriends);

/**
 * @route   GET /api/friends/pending
 * @desc    获取待处理的好友请求
 * @access  Private
 */
router.get('/pending', authMiddleware, friendController.getPendingRequests);

/**
 * @route   DELETE /api/friends/:id
 * @desc    删除好友
 * @access  Private
 */
router.delete('/:id', authMiddleware, friendController.removeFriend);

export default router;
