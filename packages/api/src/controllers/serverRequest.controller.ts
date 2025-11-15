import { Request, Response } from 'express';
import { serverRequestService } from '../services/serverRequest.service';
import { successResponse, errorResponse } from '../utils/response';
import prisma from '../utils/prisma';

export const serverRequestController = {
  /**
   * 用户提交服务器创建申请
   */
  async createRequest(req: Request, res: Response) {
    try {
      const { name, description, reason } = req.body;
      const userId = req.user!.id;

      if (!name || !reason) {
        return res.status(400).json(errorResponse('服务器名称和创建理由不能为空'));
      }

      // 获取用户信息
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { username: true },
      });

      if (!user) {
        return res.status(404).json(errorResponse('用户不存在'));
      }

      const request = serverRequestService.create(
        userId,
        user.username,
        name,
        description,
        reason
      );

      // 通知所有管理员
      try {
        const { getIO } = await import('../socket');
        const io = getIO();
        
        // 获取所有管理员
        const admins = await prisma.user.findMany({
          where: { role: 'ADMIN' },
          select: { id: true },
        });

        // 向每个管理员发送通知
        admins.forEach((admin) => {
          io.to(`user-${admin.id}`).emit('notification', {
            id: `server-request-${request.id}`,
            type: 'system',
            title: '新的服务器申请',
            message: `用户 ${user.username} 申请创建服务器 "${name}"`,
            data: {
              requestId: request.id,
              userId,
              username: user.username,
              serverName: name,
            },
          });
        });
      } catch (notifyError) {
        console.error('Failed to send notification to admins:', notifyError);
        // 不影响主流程，继续返回成功
      }

      res.json(successResponse(request, '申请已提交,等待管理员审批'));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  },

  /**
   * 获取当前用户的申请列表
   */
  async getMyRequests(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const userRole = req.user!.role;
      const allRequests = serverRequestService.getByUser(userId);
      
      // 普通用户只显示已批准的申请,管理员可以看到所有
      const requests = userRole === 'ADMIN' 
        ? allRequests 
        : allRequests.filter(r => r.status === 'APPROVED');
      
      res.json(successResponse(requests));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  },

  /**
   * 管理员获取所有申请
   */
  async getAllRequests(req: Request, res: Response) {
      // Admin only
    try {
      const requests = serverRequestService.getAll();
      res.json(successResponse(requests));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  },

  /**
   * 管理员获取待审批申请
   */
  async getPendingRequests(req: Request, res: Response) {
      // Admin only
    try {
      const requests = serverRequestService.getPending();
      res.json(successResponse(requests));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  },

  /**
   * 管理员审批申请
   */
  async reviewRequest(req: Request, res: Response) {
    try {
      const { requestId } = req.params;
      const { approved, reviewNote } = req.body;
      const reviewerId = req.user!.id;

      if (approved === undefined) {
        return res.status(400).json(errorResponse('必须指定是否批准'));
      }

      let serverId: string | undefined;

      // 如果批准,创建服务器
      if (approved) {
        const request = serverRequestService.getAll().find(r => r.id === requestId);
        if (!request) {
          return res.status(404).json(errorResponse('申请不存在'));
        }

        // 创建服务器(用户申请创建的服务器默认为私有)
        const server = await prisma.server.create({
          data: {
            name: request.name,
            description: request.description,
            ownerId: request.requesterId,
            isPublic: false, // 用户申请创建的服务器默认为私有
          },
          include: {
            channels: true,
          },
        });

        // 创建默认频道
        await prisma.channel.create({
          data: {
            name: '常规',
            serverId: server.id,
            type: 'TEXT',
          },
        });

        // 将申请者添加为服务器成员
        await prisma.serverMember.create({
          data: {
            serverId: server.id,
            userId: request.requesterId,
            role: 'OWNER',
          },
        });

        serverId = server.id;
      }

      const updatedRequest = serverRequestService.review(
        requestId,
        reviewerId,
        approved,
        reviewNote,
        serverId
      );

      if (!updatedRequest) {
        return res.status(404).json(errorResponse('申请不存在'));
      }

      // 通知申请者审批结果
      try {
        const { getIO } = await import('../socket');
        const io = getIO();
        
        io.to(`user-${updatedRequest.requesterId}`).emit('notification', {
          id: `server-request-result-${requestId}`,
          type: approved ? 'server_invite' : 'system',
          title: approved ? '服务器申请已通过' : '服务器申请被拒绝',
          message: approved 
            ? `恭喜！你的服务器 "${updatedRequest.name}" 申请已通过${reviewNote ? '，备注：' + reviewNote : ''}`
            : `很抱歉，你的服务器 "${updatedRequest.name}" 申请被拒绝${reviewNote ? '，原因：' + reviewNote : ''}`,
          data: {
            requestId,
            serverName: updatedRequest.name,
            approved,
            serverId,
            reviewNote,
          },
        });
      } catch (notifyError) {
        console.error('Failed to send notification to requester:', notifyError);
        // 不影响主流程
      }

      res.json(successResponse(updatedRequest, approved ? '已批准申请' : '已拒绝申请'));
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  },

  /**
   * 删除申请
   */
  async deleteRequest(req: Request, res: Response) {
    try {
      const { requestId } = req.params;
      const userId = req.user!.id;

      // 获取用户角色
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });

      const requests = serverRequestService.getAll();
      const request = requests.find(r => r.id === requestId);

      if (!request) {
        return res.status(404).json(errorResponse('申请不存在'));
      }

      // 只允许申请者本人或管理员删除
      if (request.requesterId !== userId && user?.role !== 'ADMIN') {
        return res.status(403).json(errorResponse('无权删除此申请'));
      }

      const success = serverRequestService.delete(requestId);
      if (success) {
        res.json(successResponse(null, '申请已删除'));
      } else {
        res.status(404).json(errorResponse('申请不存在'));
      }
    } catch (error: any) {
      res.status(500).json(errorResponse(error.message));
    }
  },
};
