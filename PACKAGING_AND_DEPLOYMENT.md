# 打包和部署说明

## 📦 项目打包指南

### 方式1: 直接部署（Git Clone）

**最简单的方式，推荐用于生产环境**

```bash
# 在服务器上克隆仓库
git clone <your-repo-url> chat-community
cd chat-community

# 运行部署脚本
chmod +x deploy.sh
./deploy.sh
```

### 方式2: 压缩包部署

**适用于无法访问Git的环境**

#### 本地打包

```bash
# Windows PowerShell
cd d:\DecFR\Program\chat-community

# 方法A: 打包整个项目（不含node_modules）
Compress-Archive -Path * -DestinationPath chat-community-v1.0.0.zip -Force -Exclude node_modules,packages\*\node_modules,packages\*\dist,.git,_archived

# 方法B: 仅打包必要文件
$files = @(
    "packages/api/prisma",
    "packages/api/ecosystem.config.js",
    "packages/api/package.json",
    "packages/api/tsconfig.json",
    "packages/api/.env.example",
    "packages/client/package.json",
    "packages/client/.env.example",
    "packages/client/vite.config.ts",
    "packages/client/tsconfig*.json",
    "packages/client/index.html",
    "packages/client/postcss.config.js",
    "packages/client/public",
    "packages/client/src",
    "DEPLOYMENT.md",
    "QUICK_DEPLOY.md",
    "PRE_DEPLOYMENT_CHECKLIST.md",
    "README.md",
    "QUICKSTART.md",
    "SINGLE_SIGN_ON.md",
    "VERSION_UPDATE.md",
    "package.json",
    "pnpm-workspace.yaml",
    "deploy.sh"
)
```

#### 服务器解压和部署

```bash
# 上传到服务器
scp chat-community-v1.0.0.zip user@your-server:/home/user/

# 在服务器上解压
cd /home/user
unzip chat-community-v1.0.0.zip -d chat-community
cd chat-community

# 运行部署脚本
chmod +x deploy.sh
./deploy.sh
```

### 方式3: Docker部署

**最佳实践，推荐用于容器化环境**

#### 创建Dockerfile

**后端Dockerfile** (`packages/api/Dockerfile`):

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# 启用corepack并安装pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# 复制依赖文件
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/api/package.json ./packages/api/

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制源代码
COPY packages/api ./packages/api

# 编译TypeScript
WORKDIR /app/packages/api
RUN pnpm build

# 生产镜像
FROM node:20-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# 复制编译产物和必要文件
COPY --from=builder /app/packages/api/dist ./dist
COPY --from=builder /app/packages/api/prisma ./prisma
COPY --from=builder /app/packages/api/package.json ./
COPY --from=builder /app/packages/api/node_modules ./node_modules

# 创建必要目录
RUN mkdir -p uploads logs

# 暴露端口
EXPOSE 3000

# 启动命令
CMD ["node", "dist/server.js"]
```

**前端Dockerfile** (`packages/client/Dockerfile`):

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# 复制依赖文件
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/client/package.json ./packages/client/

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制源代码
COPY packages/client ./packages/client

# 构建
WORKDIR /app/packages/client
RUN pnpm build

# Nginx镜像
FROM nginx:alpine

# 复制构建产物
COPY --from=builder /app/packages/client/dist /usr/share/nginx/html

# Nginx配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

**Nginx配置** (`packages/client/nginx.conf`):

```nginx
server {
    listen 80;
    server_name _;
    
    root /usr/share/nginx/html;
    index index.html;
    
    # Gzip压缩
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript;
    
    # SPA路由支持
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

**docker-compose.yml** (根目录):

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: chat-postgres
    environment:
      POSTGRES_DB: chat_community
      POSTGRES_USER: chatapp_user
      POSTGRES_PASSWORD: ${DB_PASSWORD:-changeme}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U chatapp_user"]
      interval: 10s
      timeout: 5s
      retries: 5

  api:
    build:
      context: .
      dockerfile: packages/api/Dockerfile
    container_name: chat-api
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://chatapp_user:${DB_PASSWORD:-changeme}@postgres:5432/chat_community
      JWT_SECRET: ${JWT_SECRET}
      ENCRYPTION_KEY: ${ENCRYPTION_KEY}
      NODE_ENV: production
      CLIENT_URL: ${CLIENT_URL:-http://localhost}
      PORT: 3000
    ports:
      - "3000:3000"
    volumes:
      - api_uploads:/app/uploads
      - api_logs:/app/logs
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/health')"]
      interval: 30s
      timeout: 10s
      retries: 3

  client:
    build:
      context: .
      dockerfile: packages/client/Dockerfile
    container_name: chat-client
    depends_on:
      - api
    ports:
      - "80:80"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  postgres_data:
  api_uploads:
  api_logs:
```

#### Docker部署步骤

```bash
# 1. 创建环境变量文件
cat > .env << EOF
DB_PASSWORD=your_secure_db_password
JWT_SECRET=your_64_character_jwt_secret_here_make_it_random_and_strong
ENCRYPTION_KEY=your_32_byte_hex_encryption_key_64_chars_total_here
CLIENT_URL=https://yourdomain.com
EOF

# 2. 构建并启动
docker-compose up -d

# 3. 查看日志
docker-compose logs -f

# 4. 应用数据库迁移
docker-compose exec api sh -c "cd /app && npx prisma migrate deploy"

# 5. 检查服务状态
docker-compose ps

# 6. 健康检查
curl http://localhost:3000/health
curl http://localhost/
```

---

## 🚀 快速部署命令

### 开发环境

```bash
# 安装依赖
pnpm install

# 数据库迁移
cd packages/api
pnpm prisma migrate dev
cd ../..

# 启动开发服务器
pnpm dev
```

### 生产环境（自动脚本）

```bash
# 一键部署
./deploy.sh
```

### 生产环境（手动步骤）

```bash
# 1. 安装依赖
pnpm install --frozen-lockfile

# 2. 数据库迁移
cd packages/api
pnpm prisma migrate deploy
pnpm prisma generate

# 3. 编译后端
pnpm build

# 4. 编译前端
cd ../client
pnpm build

# 5. 启动后端（PM2）
cd ../api
pm2 start ecosystem.config.js

# 6. 部署前端
# 将 packages/client/dist 复制到Web服务器
```

---

## 📋 部署前检查清单

使用 `PRE_DEPLOYMENT_CHECKLIST.md` 确保所有准备工作完成：

- [ ] 环境变量已配置
- [ ] JWT_SECRET已修改（至少64字符）
- [ ] ENCRYPTION_KEY已修改（64字符十六进制）
- [ ] 数据库已创建
- [ ] 代码编译成功
- [ ] uploads目录已创建
- [ ] 防火墙端口已开放
- [ ] Nginx已配置
- [ ] SSL证书已安装（生产环境）

---

## 🔧 维护命令

### PM2管理

```bash
# 查看状态
pm2 status

# 查看日志
pm2 logs chat-api

# 重启服务
pm2 restart chat-api

# 停止服务
pm2 stop chat-api

# 删除服务
pm2 delete chat-api

# 保存配置
pm2 save

# 开机自启
pm2 startup
```

### Docker管理

```bash
# 查看容器状态
docker-compose ps

# 查看日志
docker-compose logs -f api
docker-compose logs -f client

# 重启服务
docker-compose restart api

# 停止所有服务
docker-compose down

# 完全清理（包括卷）
docker-compose down -v

# 重新构建
docker-compose up -d --build
```

### 数据库管理

```bash
# 备份数据库
pg_dump chat_community > backup-$(date +%Y%m%d).sql

# 恢复数据库
psql chat_community < backup-20250116.sql

# 查看数据库大小
psql -d chat_community -c "SELECT pg_size_pretty(pg_database_size('chat_community'));"
```

---

## 📊 性能监控

### PM2监控

```bash
# 实时监控
pm2 monit

# Web监控界面（可选）
pm2 install pm2-server-monit
pm2 web
```

### 日志查看

```bash
# 后端日志
tail -f packages/api/logs/combined.log
tail -f packages/api/logs/error.log

# PM2日志
pm2 logs chat-api --lines 100

# Docker日志
docker-compose logs -f --tail=100
```

---

## 🔄 更新部署

### Git Pull更新

```bash
# 1. 拉取最新代码
git pull origin main

# 2. 安装新依赖
pnpm install

# 3. 数据库迁移
cd packages/api
pnpm prisma migrate deploy

# 4. 重新编译
pnpm build
cd ../client
pnpm build

# 5. 重启服务
pm2 restart chat-api
```

### Docker更新

```bash
# 重新构建并启动
docker-compose up -d --build

# 应用数据库迁移
docker-compose exec api npx prisma migrate deploy
```

---

## 🆘 故障排查

### 后端无法启动

```bash
# 检查日志
pm2 logs chat-api --err --lines 50

# 检查端口占用
netstat -tulpn | grep 3000

# 检查数据库连接
psql -U chatapp_user -d chat_community -c "SELECT 1"

# 检查环境变量
cat packages/api/.env
```

### 前端无法访问

```bash
# 检查Nginx状态
systemctl status nginx

# 检查Nginx配置
nginx -t

# 查看Nginx日志
tail -f /var/log/nginx/error.log
```

### 数据库连接失败

```bash
# 检查PostgreSQL状态
systemctl status postgresql

# 检查监听端口
netstat -tulpn | grep 5432

# 测试连接
psql -h localhost -U chatapp_user -d chat_community
```

---

## 📚 相关文档

- **DEPLOYMENT.md** - 完整部署文档（包含监控、备份、安全加固）
- **QUICK_DEPLOY.md** - 30分钟快速部署指南
- **PRE_DEPLOYMENT_CHECKLIST.md** - 部署前检查清单
- **QUICKSTART.md** - 快速开始指南
- **SINGLE_SIGN_ON.md** - 单点登录功能说明
- **VERSION_UPDATE.md** - 版本更新说明
- **README.md** - 项目概述

---

## ✅ 验证部署成功

```bash
# 1. 后端健康检查
curl http://localhost:3000/health
# 预期: {"status":"ok","message":"Chat & Community API is running"}

# 2. 前端访问
curl -I http://localhost
# 预期: HTTP/1.1 200 OK

# 3. 数据库连接
psql -d chat_community -c "\dt"
# 预期: 显示所有表

# 4. 注册测试用户
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"test123456"}'
# 预期: 返回用户信息和token
```

---

最后更新: 2025年11月16日
部署版本: 1.0.0
