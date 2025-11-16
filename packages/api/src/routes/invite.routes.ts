import { Router } from 'express';

import { inviteController } from '../controllers/invite.controller.js';
import { authMiddleware } from '../middleware/auth.js';

const router: Router = Router();

// 所有邀请码路由都需要认证
router.use(authMiddleware);

/**
 * @route   POST /api/invites/user
 * @desc    生成用户邀请码
 * @access  Private
 */
router.post('/user', inviteController.generateUserInviteCode);

/**
 * @route   GET /api/invites/user
 * @desc    获取我的邀请码列表
 * @access  Private
 */
router.get('/user', inviteController.getUserInviteCodes);

/**
 * @route   DELETE /api/invites/user/:id
 * @desc    删除邀请码
 * @access  Private
 */
router.delete('/user/:id', inviteController.deleteUserInviteCode);

/**
 * @route   POST /api/invites/validate/user
 * @desc    验证用户邀请码
 * @access  Public (在注册时使用)
 */
router.post('/validate/user', inviteController.validateUserInviteCode);

/**
 * @route   POST /api/invites/server
 * @desc    生成服务器邀请码
 * @access  Private
 */
router.post('/server', inviteController.generateServerInviteCode);

/**
 * @route   GET /api/invites/server/:serverId
 * @desc    获取服务器的邀请码列表
 * @access  Private
 */
router.get('/server/:serverId', inviteController.getServerInviteCodes);

/**
 * @route   DELETE /api/invites/server/:id
 * @desc    删除服务器邀请码
 * @access  Private
 */
router.delete('/server/:id', inviteController.deleteServerInviteCode);

/**
 * @route   POST /api/invites/join/:code
 * @desc    使用邀请码加入服务器
 * @access  Private
 */
router.post('/join/:code', inviteController.joinServerByInviteCode);

export default router;
