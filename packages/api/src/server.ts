
import cluster from 'cluster';
import os from 'os';

const cpuCores = os.cpus().length;
const isSingleCore = cpuCores <= 1;
// 线程数自动为核心数一半，最少1
const maxThreads = isSingleCore ? 1 : Math.ceil(cpuCores / 2);

if (!isSingleCore && cluster.isPrimary) {
  console.log(`🚀 主进程 ${process.pid} 启动，准备 fork ${maxThreads} 个 worker...`);
  for (let i = 0; i < maxThreads; i++) {
    cluster.fork();
  }
  cluster.on('exit', (worker, code, signal) => {
    console.log(`⚠️ Worker ${worker.process.pid} 退出，code=${code}, signal=${signal}，自动重启...`);
    cluster.fork();
  });
} else {
  // Worker 进程运行原有 Express + Socket.IO 服务
  import('express').then(({ default: express, Application, Request, Response }) => {
    import('http').then(({ default: http }) => {
      import('cors').then(({ default: cors }) => {
        import('helmet').then(({ default: helmet }) => {
          import('dotenv').then(({ default: dotenv }) => {
            import('path').then(({ default: path }) => {
              import('./middleware/auth').then(({ default: passport }) => {
                import('./socket').then(({ initializeSocket }) => {
                  import('./routes/auth.routes').then(({ default: authRoutes }) => {
                    import('./routes/user.routes').then(({ default: userRoutes }) => {
                      import('./routes/friend.routes').then(({ default: friendRoutes }) => {
                        import('./routes/server.routes').then(({ default: serverRoutes }) => {
                          import('./routes/message.routes').then(({ default: messageRoutes }) => {
                            import('./routes/admin.routes').then(({ default: adminRoutes }) => {
                              import('./routes/serverRequest.routes').then(({ default: serverRequestRoutes }) => {
                                import('./routes/invite.routes').then(({ default: inviteRoutes }) => {
                                  import('./utils/avatarCleanupScheduler').then(({ startAvatarCleanupScheduler }) => {
                                    dotenv.config();
                                    const PORT = process.env.PORT || 3000;
                                    const app: Application = express();
                                    const httpServer = http.createServer(app);
                                    app.use(helmet());
                                    app.use(cors({
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
                                    }));
                                    app.use(express.json());
                                    app.use(express.urlencoded({ extended: true }));
                                    app.use(passport.initialize());
                                    app.use('/uploads', cors({
                                      origin: '*',
                                      methods: ['GET', 'HEAD', 'OPTIONS'],
                                      credentials: false,
                                    }), express.static(path.join(__dirname, '../uploads')));
                                    app.use('/api/auth', authRoutes);
                                    app.use('/api/users', userRoutes);
                                    app.use('/api/friends', friendRoutes);
                                    app.use('/api/servers', serverRoutes);
                                    app.use('/api/messages', messageRoutes);
                                    app.use('/api/invites', inviteRoutes);
                                    app.use('/api/admin', adminRoutes);
                                    app.use('/api/server-requests', serverRequestRoutes);
                                    app.get('/health', (_req: Request, res: Response) => {
                                      res.json({ status: 'ok', message: 'Chat & Community API is running' });
                                    });
                                    app.use((_req: Request, res: Response) => {
                                      res.status(404).json({ success: false, error: 'Route not found' });
                                    });
                                    app.use((err: any, _req: Request, res: Response, _next: any) => {
                                      console.error('Error:', err);
                                      res.status(err.status || 500).json({
                                        success: false,
                                        error: err.message || 'Internal server error',
                                      });
                                    });
                                    initializeSocket(httpServer);
                                    import('./utils/perfMonitor').then(({ startPerfMonitor }) => {
                                      // 单核时不启用多线程/多进程
                                      if (!isSingleCore) {
                                        process.env.THREAD_POOL_MAX_THREADS = String(maxThreads);
                                      } else {
                                        process.env.THREAD_POOL_MAX_THREADS = '1';
                                      }
                                      startPerfMonitor();
                                      httpServer.listen(PORT, () => {
                                        console.log(`🚀 Worker ${process.pid} running on http://localhost:${PORT}`);
                                        startAvatarCleanupScheduler().catch((e) => console.error('Failed to start cleanup scheduler', e));
                                      });
                                    });
                                    process.on('SIGTERM', () => {
                                      console.log('SIGTERM received, shutting down gracefully...');
                                      httpServer.close(() => {
                                        console.log('Server closed');
                                        process.exit(0);
                                      });
                                    });
                                  });
                                });
                              });
                            });
                          });
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
}
