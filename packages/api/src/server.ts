import cluster from 'cluster';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

import 'dotenv/config';
import dotenv from 'dotenv';

import logger from './utils/logger.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = process.env.UPLOAD_DIR || 'uploads';
const absoluteUploadPath = path.resolve(process.cwd(), uploadDir);
console.log(`Checking upload directory: ${absoluteUploadPath}`);

const cpuCores = os.cpus().length;
const isSingleCore = cpuCores <= 1;
// 线程数自动为核心数一半，最少1
const maxThreads = isSingleCore ? 1 : Math.ceil(cpuCores / 2);
const isDev = (process.env.NODE_ENV || 'development') === 'development';
const enableCluster = !isDev && !isSingleCore && process.env.ENABLE_CLUSTER !== 'false';

if (enableCluster && cluster.isPrimary) {
  logger.info(`🚀 主进程 ${process.pid} 启动，准备 fork ${maxThreads} 个 worker...`);
  for (let i = 0; i < maxThreads; i++) {
    cluster.fork();
  }
  cluster.on('exit', (worker, code, signal) => {
    logger.warn(
      `⚠️ Worker ${worker.process.pid} 退出，code=${code}, signal=${signal}，自动重启...`
    );
    cluster.fork();
  });
} else {
  // Worker 进程运行原有 Express + Socket.IO 服务
  Promise.all([
    import('express'),
    import('http'),
    import('cors'),
    import('helmet'),
    import('passport'),
    import('./middleware/auth.js'),
    import('./socket/index.js'),
    import('./routes/auth.routes.js'),
    import('./routes/user.routes.js'),
    import('./routes/friend.routes.js'),
    import('./routes/server.routes.js'),
    import('./routes/message.routes.js'),
    import('./routes/admin.routes.js'),
    import('./routes/serverRequest.routes.js'),
    import('./routes/invite.routes.js'),
    import('./utils/avatarCleanupScheduler.js'),
    import('./utils/sessionCleanupScheduler.js'),
    import('./utils/perfMonitor.js'),
  ])
    .then(
      ([
        { default: express },
        { default: http },
        { default: cors },
        { default: helmet },
        { default: passport },
        _authMiddlewareModule, // auth.js (unused)
        socketModule, // socket.js
        { default: authRoutes },
        { default: userRoutes },
        { default: friendRoutes },
        { default: serverRoutes },
        { default: messageRoutes },
        { default: adminRoutes },
        { default: serverRequestRoutes },
        { default: inviteRoutes },
        { startAvatarCleanupScheduler },
        { startSessionCleanupScheduler },
        { startPerfMonitor },
      ]) => {
        const { initializeSocket } = socketModule;
        // 注意：authMiddlewareModule 包含 passport 本身，因为它是这样导出的
        // 我们在这里不需要直接使用它，因为 passport.initialize() 会处理
        const PORT = process.env.PORT || 3000;
        if (!fs.existsSync(absoluteUploadPath)) {
          try {
            fs.mkdirSync(absoluteUploadPath, { recursive: true });
            console.log(`✅ Upload directory created successfully at: ${absoluteUploadPath}`);
          } catch (error) {
            console.error('❌ Failed to create upload directory:', error);
          }
        } else {
          console.log(`✅ Upload directory exists.`);
        }
        const app: import('express').Application = express();
        const httpServer = http.createServer(app);
        app.use(
          helmet({
            contentSecurityPolicy: {
              directives: {
                ...helmet.contentSecurityPolicy.getDefaultDirectives(),
                'img-src': [
                  "'self'",
                  'data:',
                  'blob:',
                  'http://localhost:3000',
                  'http://localhost:5173',
                ],
              },
            },
          })
        );
        app.use(
          cors({
            origin: (origin, callback) => {
              const allowed = process.env.CLIENT_URL || 'http://localhost:5173';
              const isDev = (process.env.NODE_ENV || 'development') === 'development';
              if (!origin) return callback(null, true);
              if (origin === allowed) return callback(null, true);
              if (isDev && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
                return callback(null, true);
              }
              return callback(new Error(`CORS blocked for origin: ${origin}`));
            },
            credentials: true,
          })
        );
        app.use(express.json());
        app.use(express.urlencoded({ extended: true }));
        app.use(passport.initialize());

        // 静态文件服务 - uploads目录
        const uploadsPath = path.join(__dirname, '../uploads');
        logger.info('[Static Files] Serving /uploads from: ' + uploadsPath);
        app.use(
          '/uploads',
          cors({
            origin: '*',
            methods: ['GET', 'HEAD', 'OPTIONS'],
            credentials: false,
          }),
          express.static(uploadsPath)
        );
        app.use('/api/auth', authRoutes);
        // 分片上传路由
        import('./routes/chunk-upload.routes.js').then(({ default: chunkUploadRoutes }) => {
          app.use('/api', chunkUploadRoutes);
        });
        app.use('/api/users', userRoutes);
        app.use('/api/friends', friendRoutes);
        app.use('/api/servers', serverRoutes);
        app.use('/api/messages', messageRoutes);
        app.use('/api/invites', inviteRoutes);
        app.use('/api/admin', adminRoutes);
        app.use('/api/server-requests', serverRequestRoutes);
        app.get('/health', (_req: import('express').Request, res: import('express').Response) => {
          res.json({
            status: 'ok',
            message: 'Chat & Community API is running',
          });
        });
        app.use((_req: import('express').Request, res: import('express').Response) => {
          res.status(404).json({
            success: false,
            error: 'Route not found',
          });
        });

        interface HttpError extends Error {
          status?: number;
        }

        app.use(
          (
            err: HttpError,
            _req: import('express').Request,
            res: import('express').Response,
            _next: import('express').NextFunction
          ) => {
            logger.error('Error:', err);
            res.status(err.status || 500).json({
              success: false,
              error: err.message || 'Internal server error',
            });
          }
        );
        initializeSocket(httpServer);

        // 单核时不启用多线程/多进程
        if (!isSingleCore) {
          process.env.THREAD_POOL_MAX_THREADS = String(maxThreads);
        } else {
          process.env.THREAD_POOL_MAX_THREADS = '1';
        }
        startPerfMonitor();
        httpServer.listen(PORT, () => {
          logger.info(`🚀 Worker ${process.pid} running on http://localhost:${PORT}`);
          startAvatarCleanupScheduler().catch((e: unknown) =>
            logger.error('Failed to start cleanup scheduler', e)
          );
          startSessionCleanupScheduler();
        });

        process.on('SIGTERM', () => {
          logger.info('SIGTERM received, shutting down gracefully...');
          httpServer.close(() => {
            logger.info('Server closed');
            process.exit(0);
          });
        });
      }
    )
    .catch((error) => {
      logger.error('Failed to load modules:', error);
      process.exit(1);
    });
}
