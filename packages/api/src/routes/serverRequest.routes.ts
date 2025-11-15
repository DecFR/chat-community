import { Router } from 'express';

import { serverRequestController } from '../controllers/serverRequest.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// 所有路由都需要认证
router.use(authMiddleware);

/**
 * @route   POST /api/server-requests
 * @desc    用户提交服务器创建申请
 * @access  Private
 */
router.post('/', serverRequestController.createRequest);

/**
 * @route   GET /api/server-requests/my
 * @desc    获取当前用户的申请列表
 * @access  Private
 */
router.get('/my', serverRequestController.getMyRequests);

/**
 * @route   GET /api/server-requests
 * @desc    管理员获取所有申请
 * @access  Admin
 */
router.get('/', serverRequestController.getAllRequests);

/**
 * @route   GET /api/server-requests/pending
 * @desc    管理员获取待审批申请
 * @access  Admin
 */
router.get('/pending', serverRequestController.getPendingRequests);

/**
 * @route   POST /api/server-requests/:requestId/review
 * @desc    管理员审批申请
 * @access  Admin
 */
router.post('/:requestId/review', serverRequestController.reviewRequest);

/**
 * @route   DELETE /api/server-requests/:requestId
 * @desc    删除申请(申请者本人或管理员)
 * @access  Private
 */
router.delete('/:requestId', serverRequestController.deleteRequest);

export default router;
