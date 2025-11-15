module.exports = {
  apps: [
    {
      name: 'chat-api',
      script: './dist/server.js',
      instances: 'max', // 自动根据CPU核心数创建实例
      exec_mode: 'cluster', // 集群模式
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      // Node.js优化参数
      node_args: '--max-old-space-size=2048',
      
      // 自动重启配置
      watch: false, // 生产环境不启用watch
      max_memory_restart: '500M', // 内存超过500MB自动重启
      
      // 日志配置
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // 自动重启策略
      autorestart: true,
      max_restarts: 10, // 最多重启10次
      min_uptime: '10s', // 最小运行时间10秒
      restart_delay: 4000, // 重启延迟4秒
      
      // 进程管理
      kill_timeout: 5000, // 强制kill前等待5秒
      wait_ready: true, // 等待应用ready信号
      listen_timeout: 10000, // 监听超时10秒
    },
  ],
};
