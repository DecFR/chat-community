# 快速部署指南

## 🔧 修复内容

已修复服务器加入请求审核时的数据库唯一约束错误。

**问题**: 当用户已经是服务器成员时，再次批准加入请求会导致数据库唯一约束错误。

**解决**: 在批准请求前检查用户是否已是成员，如果已是成员则只更新申请状态。

---

## 🚀 30分钟快速部署到Linux

### 前提条件
- 一台Ubuntu 20.04/22.04服务器
- 域名（可选，推荐）
- SSH访问权限

### 步骤1: 准备服务器 (5分钟)

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 安装pnpm和PM2
corepack enable
corepack prepare pnpm@latest --activate
npm install -g pm2@latest

# 安装PostgreSQL 16
sudo apt install -y wget ca-certificates
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo gpg --dearmor -o /usr/share/keyrings/postgresql-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/postgresql-keyring.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list
sudo apt update
sudo apt install -y postgresql-16 postgresql-contrib-16

# 安装Nginx
sudo apt install -y nginx

# 创建应用用户
sudo adduser chatapp
```

### 步骤2: 配置数据库 (3分钟)

```bash
# 切换到postgres用户
sudo -u postgres psql

# 执行SQL
CREATE DATABASE chatcommunity;
CREATE USER chatapp_user WITH ENCRYPTED PASSWORD 'YOUR_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE chatcommunity TO chatapp_user;
ALTER DATABASE chatcommunity OWNER TO chatapp_user;
\q
```

### 步骤3: 部署应用 (10分钟)

```bash
# 切换到应用用户
sudo su - chatapp

# 上传代码（从本地）
# scp -r chat-community chatapp@your-server:/home/chatapp/

# 或使用git
git clone YOUR_REPO_URL chat-community
cd chat-community

# 配置环境变量
cd packages/api
nano .env.production
```

**填入以下内容**:
```env
NODE_ENV=production
PORT=3000
DATABASE_URL="postgresql://chatapp_user:YOUR_STRONG_PASSWORD@localhost:5432/chatcommunity?schema=public"
JWT_SECRET="生成: openssl rand -base64 64"
ENCRYPTION_KEY="生成: openssl rand -hex 32"
CLIENT_URL="https://yourdomain.com"
```

**安装并构建**:
```bash
cd ~/chat-community

# 安装依赖
pnpm install

# 运行数据库迁移
cd packages/api
pnpm prisma migrate deploy

# 构建
cd ~/chat-community
pnpm build
```

### 步骤4: 配置Nginx (5分钟)

```bash
sudo nano /etc/nginx/sites-available/chatcommunity
```

**粘贴以下配置**:
```nginx
server {
    listen 80;
    server_name yourdomain.com;  # 改为你的域名或服务器IP
    
    client_max_body_size 10M;

    location / {
        root /home/chatapp/chat-community/packages/client/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /socket.io {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }

    location /uploads {
        alias /home/chatapp/chat-community/packages/api/uploads;
    }
}
```

**启用配置**:
```bash
sudo ln -s /etc/nginx/sites-available/chatcommunity /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 步骤5: 启动应用 (2分钟)

```bash
# 创建PM2配置
cd ~/chat-community
nano ecosystem.config.js
```

**配置内容**:
```javascript
module.exports = {
  apps: [{
    name: 'chat-api',
    cwd: '/home/chatapp/chat-community/packages/api',
    script: 'dist/server.js',
    instances: 'max', // 自动使用所有CPU核心
    exec_mode: 'cluster',
    env: { NODE_ENV: 'production', PORT: 3000 },
    node_args: '--max-old-space-size=2048',
  }],
};
```

**启动**:
```bash
pm2 start ecosystem.config.js
pm2 startup
pm2 save
pm2 status
```

### 步骤6: 配置防火墙 (2分钟)

```bash
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

### 步骤7: 配置SSL (可选，3分钟)

```bash
# 安装Certbot
sudo apt install -y certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d yourdomain.com

# 测试自动续期
sudo certbot renew --dry-run
```

---

## 🔒 安全检查清单

完成部署后，检查以下项目：

✅ **必须完成**:
- [ ] 更改所有默认密码为强密码
- [ ] JWT_SECRET 和 ENCRYPTION_KEY 使用随机生成
- [ ] 数据库只监听localhost
- [ ] 防火墙已启用
- [ ] 应用使用非root用户运行

✅ **强烈推荐**:
- [ ] 配置SSL证书（使用Let's Encrypt）
- [ ] 设置SSH密钥认证，禁用密码登录
- [ ] 配置数据库和文件备份
- [ ] 启用日志轮转
- [ ] 安装Fail2ban防止暴力破解

✅ **生产环境**:
- [ ] 使用域名而非IP
- [ ] 配置监控和告警
- [ ] 设置远程备份
- [ ] 更改SSH默认端口
- [ ] 定期更新系统和依赖

---

## 📊 验证部署

1. **检查API健康**:
   ```bash
   curl http://localhost:3000/api/health
   ```

2. **检查Socket连接**:
   ```bash
   curl -i http://localhost:3000/socket.io/
   ```

3. **检查Nginx**:
   ```bash
   sudo nginx -t
   sudo systemctl status nginx
   ```

4. **检查PM2**:
   ```bash
   pm2 status
   pm2 logs chat-api --lines 20
   ```

5. **访问应用**:
   打开浏览器访问: `http://yourdomain.com` 或 `http://your-server-ip`

---

## 🔄 更新应用

```bash
cd ~/chat-community
git pull
pnpm install
cd packages/api
pnpm prisma migrate deploy
cd ~/chat-community
pnpm build
pm2 restart chat-api
```

---

## 🆘 常见问题

### API无法启动
```bash
# 查看详细日志
pm2 logs chat-api --lines 100

# 检查端口是否被占用
sudo netstat -tulpn | grep 3000

# 检查环境变量
cat packages/api/.env.production
```

### 数据库连接失败
```bash
# 测试数据库连接
psql -U chatapp_user -d chatcommunity -h localhost

# 检查PostgreSQL状态
sudo systemctl status postgresql
```

### Nginx 502错误
```bash
# 检查API是否运行
pm2 status

# 查看Nginx错误日志
sudo tail -f /var/log/nginx/error.log
```

### Socket连接失败
- 确保Nginx配置了WebSocket支持（Connection: upgrade）
- 检查防火墙是否允许WebSocket连接
- 查看浏览器控制台错误信息

---

## 📚 详细文档

完整的部署文档请参考: [DEPLOYMENT.md](./DEPLOYMENT.md)

包含内容：
- 详细的安全配置
- 监控和日志管理
- 备份恢复策略
- 性能优化建议
- 故障排查指南

---

## 🎯 生产环境注意事项

1. **永远不要**使用默认密码或弱密码
2. **永远不要**暴露敏感的环境变量
3. **定期备份**数据库和上传文件
4. **及时更新**系统和依赖包
5. **监控日志**及时发现和解决问题
6. **配置告警**在出现问题时及时通知

---

祝部署顺利！🎉
