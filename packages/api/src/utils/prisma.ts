import { PrismaClient } from '@prisma/client';

const isDev = process.env.NODE_ENV === 'development';

const prisma = new PrismaClient({
  log: isDev
    ? ['query', 'error', 'warn'] // 开发环境：显示查询（如果你觉得太吵，把 'query' 删掉即可）
    : ['error'], // 生产环境：只显示错误
});

export default prisma;
