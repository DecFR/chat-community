import prisma from './prisma.js';

/**
 * 发送系统通知给所有管理员
 * @param content 通知内容
 */
export async function notifyAdmins(content: string) {
  // 查找所有管理员用户
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
  if (!admins.length) return;
  // 写入一条系统消息到每个管理员的UserSettings（或可扩展为新表）
  for (const admin of admins) {
    await prisma.appConfig.create({
      data: {
        key: `ADMIN_NOTIFY_${admin.id}_${Date.now()}`,
        value: content,
      },
    });
  }
}

/**
 * 查询管理员未读通知
 * @param adminId 管理员ID
 */
export async function getAdminNotifications(adminId: string) {
  const notifies = await prisma.appConfig.findMany({
    where: { key: { startsWith: `ADMIN_NOTIFY_${adminId}_` } },
    orderBy: { createdAt: 'desc' },
  });
  return notifies.map((n: { id: string; value: string; createdAt: Date }) => ({
    id: n.id,
    content: n.value,
    createdAt: n.createdAt,
  }));
}
