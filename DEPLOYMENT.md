# Linux服务器部署指南

本指南将帮助你将Chat Community应用部署到Linux服务器上，并配置安全措施。

## 目录
- [环境要求](#环境要求)
- [准备工作](#准备工作)
- [数据库配置](#数据库配置)
- [应用部署](#应用部署)
- [Nginx反向代理配置](#nginx反向代理配置)
- [SSL证书配置](#ssl证书配置)
- [进程管理](#进程管理)
- [安全加固](#安全加固)
- [监控和日志](#监控和日志)
- [备份策略](#备份策略)

---

## 环境要求

- **操作系统**: Ubuntu 22.04/24.04 LTS 或 Debian 12+
- **Node.js**: v20.x LTS (推荐) 或 v22.x (最新)
- **pnpm**: v9.x 或更高版本
- **PostgreSQL**: v16 或更高版本
- **Nginx**: v1.24+ 或最新稳定版
- **内存**: 至少 2GB RAM (推荐 4GB+)
- **存储**: 至少 20GB 可用空间

---

## 准备工作

### 1. 更新系统

```bash
# Ubuntu/Debian
sudo apt update && sudo apt upgrade -y

# CentOS/RHEL
sudo yum update -y
```

### 2. 安装Node.js和pnpm

```bash
# 方法1: 使用nvm (推荐，可管理多个Node版本)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.bashrc

# 安装Node.js 20 LTS
nvm install 20
nvm use 20
nvm alias default 20

# 方法2: 直接安装Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 安装pnpm (使用Corepack，Node 16.13+内置)
corepack enable
corepack prepare pnpm@latest --activate

# 或使用npm安装
npm install -g pnpm@latest

# 验证安装
node --version  # 应显示 v20.x.x
pnpm --version  # 应显示 v9.x.x 或更高
```

### 3. 安装PostgreSQL 16

```bash
# 添加PostgreSQL官方APT仓库
sudo apt install -y wget ca-certificates
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo gpg --dearmor -o /usr/share/keyrings/postgresql-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/postgresql-keyring.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list

# 更新并安装PostgreSQL 16
sudo apt update
sudo apt install -y postgresql-16 postgresql-contrib-16

# 启动PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# 验证安装
sudo systemctl status postgresql
psql --version  # 应显示 16.x
```

### 4. 创建部署用户

```bash
# 创建专用用户（不使用root）
sudo adduser chatapp
sudo usermod -aG sudo chatapp  # 如需sudo权限

# 切换到该用户
sudo su - chatapp
```

---

## 数据库配置

### 1. 创建数据库和用户

```bash
# 切换到postgres用户
sudo -u postgres psql

# 在PostgreSQL命令行中执行
CREATE DATABASE chatcommunity;
CREATE USER chatapp_user WITH ENCRYPTED PASSWORD 'your_secure_password_here';
GRANT ALL PRIVILEGES ON DATABASE chatcommunity TO chatapp_user;
ALTER DATABASE chatcommunity OWNER TO chatapp_user;

# 退出
\q
```

### 2. 配置PostgreSQL远程访问（如需要）

```bash
# 编辑配置文件 (注意版本号改为16)
sudo nano /etc/postgresql/16/main/postgresql.conf

# 修改监听地址（仅在需要远程访问时）
listen_addresses = 'localhost'  # 生产环境建议只监听localhost

# 配置访问控制
sudo nano /etc/postgresql/16/main/pg_hba.conf

# 添加（仅本地访问）
local   chatcommunity   chatapp_user                    scram-sha-256
host    chatcommunity   chatapp_user    127.0.0.1/32    scram-sha-256

# 重启PostgreSQL
sudo systemctl restart postgresql
```

---

## 应用部署

### 1. 上传代码到服务器

```bash
# 在本地机器上打包代码
cd /path/to/chat-community
tar -czf chat-community.tar.gz --exclude=node_modules --exclude=.git .

# 使用scp上传到服务器
scp chat-community.tar.gz chatapp@your-server-ip:/home/chatapp/

# 或使用git clone（推荐）
ssh chatapp@your-server-ip
cd ~
git clone https://your-repository-url.git chat-community
cd chat-community
```

### 2. 配置环境变量

```bash
cd ~/chat-community/packages/api

# 创建生产环境配置
nano .env.production

# 填入以下内容（根据实际情况修改）
NODE_ENV=production
PORT=3000

# 数据库连接
DATABASE_URL="postgresql://chatapp_user:your_secure_password_here@localhost:5432/chatcommunity?schema=public"

# JWT密钥（使用强随机密钥）
JWT_SECRET="your_very_long_random_jwt_secret_at_least_32_characters"

# 加密密钥（32字节hex，使用下面的命令生成）
ENCRYPTION_KEY="your_64_character_hex_encryption_key_here"

# 客户端URL
CLIENT_URL="https://yourdomain.com"

# 文件上传配置
MAX_FILE_SIZE=104857600
UPLOAD_DIR=/home/chatapp/chat-community/packages/api/uploads

# 日志配置
LOG_LEVEL=info
LOG_FILE=/home/chatapp/logs/app.log
```

**生成安全密钥：**

```bash
# 生成JWT_SECRET（64字符，更安全）
openssl rand -base64 64

# 生成ENCRYPTION_KEY（32字节 = 64个hex字符）
openssl rand -hex 32

# 如果需要生成多个密钥，可以一次性生成
echo "JWT_SECRET=$(openssl rand -base64 64)"
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)"
```

### 3. 安装依赖并构建

```bash
cd ~/chat-community

# 安装依赖
pnpm install

# 运行数据库迁移
cd packages/api
pnpm prisma migrate deploy

# 构建应用
cd ~/chat-community
pnpm build

# 测试API是否能启动
cd packages/api
NODE_ENV=production node dist/server.js
# 按Ctrl+C停止
```

### 4. 配置客户端环境

```bash
cd ~/chat-community/packages/client

# 创建生产环境配置
nano .env.production

# 填入以下内容
VITE_API_URL=https://yourdomain.com/api
```

重新构建客户端：

```bash
cd ~/chat-community/packages/client
pnpm build
```

---

## Nginx反向代理配置

### 1. 安装Nginx

```bash
# 方法1: 安装最新稳定版 (推荐)
sudo apt install -y curl gnupg2 ca-certificates lsb-release ubuntu-keyring
curl https://nginx.org/keys/nginx_signing.key | gpg --dearmor | sudo tee /usr/share/keyrings/nginx-archive-keyring.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/nginx-archive-keyring.gpg] http://nginx.org/packages/ubuntu $(lsb_release -cs) nginx" | sudo tee /etc/apt/sources.list.d/nginx.list
sudo apt update
sudo apt install -y nginx

# 方法2: 使用Ubuntu仓库版本
# sudo apt install -y nginx

# 启动Nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# 验证版本
nginx -v  # 应显示 1.24.x 或更高
```

### 2. 配置Nginx

```bash
sudo nano /etc/nginx/sites-available/chatcommunity
```

**配置内容：**

```nginx
# WebSocket 升级支持
map $http_upgrade $connection_upgrade {
    default upgrade;
    '' close;
}

# 限制并发连接
limit_conn_zone $binary_remote_addr zone=conn_limit:10m;

# 限流配置
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=upload_limit:10m rate=2r/s;

server {
    listen 80;
    listen [::]:80;
    server_name yourdomain.com;
    
    # 重定向到HTTPS（配置SSL后启用）
    # return 301 https://$server_name$request_uri;

    # 客户端最大上传大小
    client_max_body_size 10M;

    # 日志
    access_log /var/log/nginx/chatcommunity_access.log;
    error_log /var/log/nginx/chatcommunity_error.log;

    # 静态文件（客户端）
    location / {
        root /home/chatapp/chat-community/packages/client/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
        
        # 缓存静态资源
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # API代理
    location /api {
        limit_req zone=api_limit burst=20 nodelay;
        
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Socket.io代理
    location /socket.io {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket专用超时
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
    }

    # 上传的文件
    location /uploads {
        limit_req zone=upload_limit burst=5 nodelay;
        alias /home/chatapp/chat-community/packages/api/uploads;
        
        # 安全头
        add_header X-Content-Type-Options nosniff;
        add_header Content-Security-Policy "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'";
    }

    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
    
    # 限制并发连接数
    limit_conn conn_limit 10;
}
```

### 3. 启用配置

```bash
# 创建软链接
sudo ln -s /etc/nginx/sites-available/chatcommunity /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重新加载Nginx
sudo systemctl reload nginx
```

---

## SSL证书配置

### 使用Let's Encrypt（推荐）

```bash
# 安装Certbot
sudo apt install -y certbot python3-certbot-nginx

# 获取证书并自动配置Nginx
sudo certbot --nginx -d yourdomain.com

# 测试自动续期
sudo certbot renew --dry-run

# Certbot会自动添加续期cron任务
```

### 手动配置SSL（如果已有证书）

编辑Nginx配置：

```nginx
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name yourdomain.com;

    # SSL证书
    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    # SSL配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # HSTS
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # ... 其他配置同上 ...
}

# HTTP重定向到HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

---

## 进程管理

### 使用PM2（推荐）

```bash
# 安装最新版PM2
npm install -g pm2@latest

# 或使用pnpm
pnpm add -g pm2@latest

# 创建PM2配置文件
cd ~/chat-community
nano ecosystem.config.js
```

**配置内容：**

```javascript
module.exports = {
  apps: [
    {
      name: 'chat-api',
      cwd: '/home/chatapp/chat-community/packages/api',
      script: 'dist/server.js',
      instances: 'max', // 自动使用所有CPU核心，或指定数字如 2
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      node_args: '--max-old-space-size=2048', // 限制内存使用
      error_file: '/home/chatapp/logs/api-error.log',
      out_file: '/home/chatapp/logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      max_memory_restart: '1G',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
    },
  ],
};
```

**启动和管理：**

```bash
# 创建日志目录
mkdir -p ~/logs

# 启动应用
pm2 start ecosystem.config.js

# 查看状态
pm2 status

# 查看日志
pm2 logs chat-api

# 监控
pm2 monit

# 重启
pm2 restart chat-api

# 停止
pm2 stop chat-api

# 设置开机自启
pm2 startup
pm2 save
```

### 使用Systemd（备选）

```bash
sudo nano /etc/systemd/system/chatcommunity.service
```

**配置内容：**

```ini
[Unit]
Description=Chat Community API Server
After=network.target postgresql.service

[Service]
Type=simple
User=chatapp
WorkingDirectory=/home/chatapp/chat-community/packages/api
Environment="NODE_ENV=production"
EnvironmentFile=/home/chatapp/chat-community/packages/api/.env.production
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=10
StandardOutput=append:/home/chatapp/logs/api-out.log
StandardError=append:/home/chatapp/logs/api-error.log

[Install]
WantedBy=multi-user.target
```

**启动服务：**

```bash
sudo systemctl daemon-reload
sudo systemctl start chatcommunity
sudo systemctl enable chatcommunity
sudo systemctl status chatcommunity
```

---

## 安全加固

### 1. 防火墙配置

```bash
# 使用UFW (Ubuntu)
sudo apt install -y ufw

# 允许SSH
sudo ufw allow 22/tcp

# 允许HTTP和HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# 启用防火墙
sudo ufw enable

# 查看状态
sudo ufw status
```

### 2. Fail2ban防止暴力破解

```bash
# 安装Fail2ban
sudo apt install -y fail2ban

# 配置Nginx规则
sudo nano /etc/fail2ban/jail.local
```

**配置内容：**

```ini
[nginx-http-auth]
enabled = true
port = http,https
logpath = /var/log/nginx/error.log

[nginx-limit-req]
enabled = true
port = http,https
logpath = /var/log/nginx/error.log
maxretry = 5
findtime = 600
bantime = 3600
```

```bash
# 重启Fail2ban
sudo systemctl restart fail2ban
sudo systemctl enable fail2ban

# 查看状态
sudo fail2ban-client status
```

### 3. SSH安全配置

```bash
sudo nano /etc/ssh/sshd_config
```

**推荐配置：**

```
# 禁用root登录
PermitRootLogin no

# 禁用密码认证（使用密钥）
PasswordAuthentication no
PubkeyAuthentication yes

# 更改SSH端口（可选）
Port 2222

# 限制登录用户
AllowUsers chatapp
```

```bash
# 重启SSH服务
sudo systemctl restart sshd
```

### 4. 定期更新

```bash
# 创建自动更新脚本
sudo nano /etc/cron.weekly/security-updates

#!/bin/bash
apt update && apt upgrade -y
apt autoremove -y
```

```bash
sudo chmod +x /etc/cron.weekly/security-updates
```

### 5. 文件权限

```bash
# 设置正确的文件权限
cd ~/chat-community

# 应用文件
sudo chown -R chatapp:chatapp .
find . -type f -exec chmod 644 {} \;
find . -type d -exec chmod 755 {} \;

# uploads目录需要写入权限
chmod 755 packages/api/uploads

# 环境文件（包含敏感信息）
chmod 600 packages/api/.env.production
```

---

## 监控和日志

### 1. 日志管理

```bash
# 安装logrotate（通常已安装）
sudo apt install -y logrotate

# 配置日志轮转
sudo nano /etc/logrotate.d/chatcommunity
```

**配置内容：**

```
/home/chatapp/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    missingok
    create 0644 chatapp chatapp
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}

/var/log/nginx/chatcommunity*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    missingok
    sharedscripts
    postrotate
        systemctl reload nginx
    endscript
}
```

### 2. 性能监控

```bash
# 使用PM2监控
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7

# 查看资源使用
pm2 monit

# 或安装htop
sudo apt install -y htop
htop
```

### 3. 应用健康检查

创建健康检查脚本：

```bash
nano ~/healthcheck.sh
```

```bash
#!/bin/bash

API_URL="http://localhost:3000/api/health"
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" $API_URL)

if [ $RESPONSE -eq 200 ]; then
    echo "$(date): API is healthy"
else
    echo "$(date): API is down (HTTP $RESPONSE), restarting..."
    pm2 restart chat-api
fi
```

```bash
chmod +x ~/healthcheck.sh

# 添加到crontab（每5分钟检查一次）
crontab -e

# 添加这行
*/5 * * * * /home/chatapp/healthcheck.sh >> /home/chatapp/logs/healthcheck.log 2>&1
```

---

## 备份策略

### 1. 数据库备份

```bash
# 创建备份脚本
nano ~/backup-db.sh
```

```bash
#!/bin/bash

BACKUP_DIR="/home/chatapp/backups/db"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="chatcommunity"
DB_USER="chatapp_user"

mkdir -p $BACKUP_DIR

# 备份数据库
PGPASSWORD='your_password' pg_dump -U $DB_USER -h localhost $DB_NAME | gzip > $BACKUP_DIR/backup_$DATE.sql.gz

# 删除30天前的备份
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +30 -delete

echo "$(date): Database backup completed"
```

```bash
chmod +x ~/backup-db.sh

# 添加到crontab（每天凌晨3点备份）
crontab -e

# 添加这行
0 3 * * * /home/chatapp/backup-db.sh >> /home/chatapp/logs/backup.log 2>&1
```

### 2. 上传文件备份

```bash
# 创建备份脚本
nano ~/backup-uploads.sh
```

```bash
#!/bin/bash

BACKUP_DIR="/home/chatapp/backups/uploads"
DATE=$(date +%Y%m%d_%H%M%S)
UPLOAD_DIR="/home/chatapp/chat-community/packages/api/uploads"

mkdir -p $BACKUP_DIR

# 增量备份上传文件
tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz -C $(dirname $UPLOAD_DIR) $(basename $UPLOAD_DIR)

# 删除60天前的备份
find $BACKUP_DIR -name "uploads_*.tar.gz" -mtime +60 -delete

echo "$(date): Uploads backup completed"
```

```bash
chmod +x ~/backup-uploads.sh

# 添加到crontab（每周日凌晨4点备份）
crontab -e

# 添加这行
0 4 * * 0 /home/chatapp/backup-uploads.sh >> /home/chatapp/logs/backup.log 2>&1
```

### 3. 远程备份（推荐）

使用rsync同步到远程服务器：

```bash
# 安装rsync
sudo apt install -y rsync

# 配置SSH密钥
ssh-keygen -t ed25519
ssh-copy-id backup-user@backup-server

# 创建远程备份脚本
nano ~/sync-to-remote.sh
```

```bash
#!/bin/bash

REMOTE_USER="backup-user"
REMOTE_HOST="backup-server"
REMOTE_DIR="/backup/chatcommunity"

# 同步数据库备份
rsync -avz --delete /home/chatapp/backups/db/ $REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/db/

# 同步上传文件备份
rsync -avz --delete /home/chatapp/backups/uploads/ $REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/uploads/

echo "$(date): Remote sync completed"
```

```bash
chmod +x ~/sync-to-remote.sh

# 添加到crontab（每天凌晨5点同步）
crontab -e

# 添加这行
0 5 * * * /home/chatapp/sync-to-remote.sh >> /home/chatapp/logs/sync.log 2>&1
```

---

## 故障排查

### 常见问题

1. **API无法启动**
   ```bash
   # 查看日志
   pm2 logs chat-api --lines 100
   
   # 检查端口占用
   sudo netstat -tulpn | grep 3000
   
   # 检查数据库连接
   cd ~/chat-community/packages/api
   pnpm prisma db pull
   ```

2. **Socket连接失败**
   ```bash
   # 检查Nginx配置
   sudo nginx -t
   
   # 查看Nginx错误日志
   sudo tail -f /var/log/nginx/chatcommunity_error.log
   
   # 确保WebSocket升级头正确
   curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" http://localhost:3000/socket.io/
   ```

3. **上传文件失败**
   ```bash
   # 检查目录权限
   ls -la ~/chat-community/packages/api/uploads
   
   # 确保目录可写
   chmod 755 ~/chat-community/packages/api/uploads
   ```

4. **数据库连接错误**
   ```bash
   # 测试数据库连接
   psql -U chatapp_user -d chatcommunity -h localhost
   
   # 检查PostgreSQL日志
   sudo tail -f /var/log/postgresql/postgresql-14-main.log
   ```

---

## 更新部署

当需要更新应用时：

```bash
# 1. 备份当前版本
cd ~
tar -czf chat-community-backup-$(date +%Y%m%d).tar.gz chat-community/

# 2. 拉取最新代码
cd ~/chat-community
git pull origin main

# 3. 安装依赖
pnpm install

# 4. 运行数据库迁移
cd packages/api
pnpm prisma migrate deploy

# 5. 构建应用
cd ~/chat-community
pnpm build

# 6. 重启服务
pm2 restart chat-api

# 7. 验证
pm2 logs chat-api --lines 50
```

---

## 安全检查清单

部署完成后，确保检查以下项目：

- [ ] 所有密码和密钥都是强随机生成的
- [ ] 数据库只监听localhost
- [ ] 防火墙已启用且规则正确
- [ ] SSH使用密钥认证，禁用root登录
- [ ] SSL证书已配置且有效
- [ ] Nginx安全头已配置
- [ ] 文件权限设置正确
- [ ] 日志轮转已配置
- [ ] 备份脚本已设置并测试
- [ ] Fail2ban已启用
- [ ] 应用以非root用户运行
- [ ] 环境变量文件权限为600
- [ ] 定期更新策略已实施

---

## 性能优化建议

1. **启用Gzip压缩** - Nginx配置中已包含
2. **配置CDN** - 使用Cloudflare等CDN加速静态资源
3. **数据库连接池** - 调整Prisma连接池大小
4. **Redis缓存** - 考虑添加Redis缓存热点数据
5. **负载均衡** - 使用PM2 cluster模式或多台服务器
6. **定期清理** - 清理过期数据和日志文件

---

## 联系和支持

如有问题，请查看：
- 应用日志: `/home/chatapp/logs/`
- Nginx日志: `/var/log/nginx/`
- PostgreSQL日志: `/var/log/postgresql/`

祝部署顺利！🚀
