import { Request, Response } from 'express';
import { inviteService } from '../services/invite.service';
import { successResponse, errorResponse } from '../utils/response';

export const inviteController = {
  /**
   * 生成用户邀请码
   */
  async generateUserInviteCode(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const { expiresInDays = 7 } = req.body;

      const inviteCode = await inviteService.generateUserInviteCode(userId, expiresInDays);

      res.json(successResponse(inviteCode, 'User invite code generated successfully'));
    } catch (error: any) {
      res.status(400).json(errorResponse(error.message));
    }
  },

  /**
   * 获取用户的邀请码列表
   */
  async getUserInviteCodes(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const inviteCodes = await inviteService.getUserInviteCodes(userId);

      res.json(successResponse(inviteCodes));
    } catch (error: any) {
      res.status(400).json(errorResponse(error.message));
    }
  },

  /**
   * 删除用户邀请码
   */
  async deleteUserInviteCode(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const { id } = req.params;

      await inviteService.deleteUserInviteCode(id, userId);

      res.json(successResponse(null, 'Invite code deleted successfully'));
    } catch (error: any) {
      res.status(400).json(errorResponse(error.message));
    }
  },

  /**
   * 验证用户邀请码
   */
  async validateUserInviteCode(req: Request, res: Response) {
    try {
      const { code } = req.body;

      if (!code) {
        return res.status(400).json(errorResponse('Invite code is required'));
      }

      const inviteCode = await inviteService.validateUserInviteCode(code);

      res.json(successResponse({ valid: true, inviteCode }));
    } catch (error: any) {
      res.status(400).json(errorResponse(error.message));
    }
  },

  /**
   * 生成服务器邀请码
   */
  async generateServerInviteCode(req: Request, res: Response) {
    try {
      const { serverId, expiresInDays = 7 } = req.body;

      if (!serverId) {
        return res.status(400).json(errorResponse('Server ID is required'));
      }

      const inviteCode = await inviteService.generateServerInviteCode(serverId, expiresInDays);

      res.json(successResponse(inviteCode, 'Server invite code generated successfully'));
    } catch (error: any) {
      res.status(400).json(errorResponse(error.message));
    }
  },

  /**
   * 获取服务器的邀请码列表
   */
  async getServerInviteCodes(req: Request, res: Response) {
    try {
      const { serverId } = req.params;
      const inviteCodes = await inviteService.getServerInviteCodes(serverId);

      res.json(successResponse(inviteCodes));
    } catch (error: any) {
      res.status(400).json(errorResponse(error.message));
    }
  },

  /**
   * 删除服务器邀请码
   */
  async deleteServerInviteCode(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { serverId } = req.body;

      if (!serverId) {
        return res.status(400).json(errorResponse('Server ID is required'));
      }

      await inviteService.deleteServerInviteCode(id, serverId);

      res.json(successResponse(null, 'Server invite code deleted successfully'));
    } catch (error: any) {
      res.status(400).json(errorResponse(error.message));
    }
  },

  /**
   * 使用邀请码加入服务器
   */
  async joinServerByInviteCode(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const { code } = req.params;

      const server = await inviteService.joinServerByInviteCode(code, userId);

      res.json(successResponse(server, 'Successfully joined the server'));
    } catch (error: any) {
      res.status(400).json(errorResponse(error.message));
    }
  },
};
