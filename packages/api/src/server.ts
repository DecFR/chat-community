import express, { Application, Request, Response } from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import passport from './middleware/auth';
import { initializeSocket } from './socket';

// 导入路由
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import friendRoutes from './routes/friend.routes';
import serverRoutes from './routes/server.routes';
import messageRoutes from './routes/message.routes';
import adminRoutes from './routes/admin.routes';
import inviteRoutes from './routes/invite.routes';

// 加载环境变量
dotenv.config();

const PORT = process.env.PORT || 3000;

// 创建 Express 应用
const app: Application = express();
const httpServer = http.createServer(app);

// 中间件
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());

// 静态文件服务（上传的文件）
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API 路由
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/invites', inviteRoutes);
app.use('/api/admin', adminRoutes);

// 健康检查
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'Chat & Community API is running' });
});

// 404 处理
app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// 错误处理中间件
app.use((err: any, _req: Request, res: Response, _next: any) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error',
  });
});

// 初始化 Socket.IO
initializeSocket(httpServer);

// 启动服务器
httpServer.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
  console.log(`📡 Socket.IO is ready for connections`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;
