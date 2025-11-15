import prisma from './prisma.js';
import logger from './logger.js';

/**
 * 清理过期的用户会话
 */
export async function cleanupExpiredSessions() {
  try {
    const result = await prisma.userSession.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    if (result.count > 0) {
      logger.info(`Cleaned up ${result.count} expired sessions`);
    }
  } catch (error) {
    logger.error('Error cleaning up expired sessions:', error);
  }
}

/**
 * 启动会话清理定时任务
 * 每小时执行一次
 */
export function startSessionCleanupScheduler() {
  // 立即执行一次
  cleanupExpiredSessions();

  // 每小时执行一次
  setInterval(() => {
    cleanupExpiredSessions();
  }, 60 * 60 * 1000); // 1小时

  logger.info('Session cleanup scheduler started');
}
