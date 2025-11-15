# 生产部署检查清单

## 📋 部署前必检项目

### 1. 环境变量配置 ✅

#### 后端 (packages/api/.env)
```bash
# 数据库
DATABASE_URL="postgresql://user:password@localhost:5432/chat_community"

# JWT密钥（必须修改！至少64字符）
JWT_SECRET="your_production_jwt_secret_key_at_least_64_characters_long_here"

# 加密密钥（32字节的十六进制字符串）
ENCRYPTION_KEY="your_32_byte_hex_encryption_key_here_64_characters_total"

# 服务端口
PORT=3000

# 客户端URL（用于CORS）
CLIENT_URL="https://yourdomain.com"

# Node环境
NODE_ENV="production"

# 集群模式（可选，默认true）
ENABLE_CLUSTER="true"
```

#### 前端 (packages/client/.env)
```bash
# API地址
VITE_API_URL="https://api.yourdomain.com/api"

# 或本地开发
# VITE_API_URL="http://localhost:3000/api"
```

### 2. 代码质量检查 ✅

- [x] 后端TypeScript编译成功
- [x] 所有导入路径正确（.js扩展名）
- [x] 数据库迁移文件完整
- [ ] 前端构建成功（运行 `pnpm build`）
- [ ] 无console.log遗留在生产代码
- [ ] 无硬编码的敏感信息

### 3. 数据库准备 ⚠️

```bash
# 1. 创建生产数据库
createdb chat_community

# 2. 应用所有迁移
cd packages/api
pnpm prisma migrate deploy

# 3. 生成Prisma Client
pnpm prisma generate

# 4. （可选）填充初始数据
# 创建第一个管理员用户（通过注册接口，第一个用户自动为ADMIN）
```

### 4. 安全性检查 🔒

- [ ] JWT_SECRET已修改为强随机字符串
- [ ] ENCRYPTION_KEY已修改为强随机字符串
- [ ] 数据库密码足够强
- [ ] .env文件不在Git中（已在.gitignore）
- [ ] CORS配置正确（CLIENT_URL）
- [ ] 文件上传大小限制合理（当前10MB）
- [ ] 启用了HTTPS（生产环境必须）

### 5. 性能优化 ⚡

- [ ] 启用cluster模式（多核CPU）
- [ ] 配置PM2监控和自动重启
- [ ] Nginx启用gzip压缩
- [ ] 数据库索引已创建（Prisma自动处理）
- [ ] 静态资源CDN配置（可选）

### 6. 监控和日志 📊

- [ ] 日志目录可写 (./logs)
- [ ] 磁盘空间充足（至少10GB可用）
- [ ] PM2已安装并配置
- [ ] 设置日志轮转（防止日志文件过大）

### 7. 备份策略 💾

- [ ] 数据库自动备份脚本
- [ ] 用户上传文件备份计划
- [ ] 环境变量文件备份（安全存储）

---

## 🚀 部署步骤

### 方法1: 快速部署（使用QUICK_DEPLOY.md）

适用于：测试环境、快速验证

```bash
# 参考 QUICK_DEPLOY.md
# 30分钟快速部署
```

### 方法2: 完整部署（使用DEPLOYMENT.md）

适用于：生产环境、完整配置

```bash
# 参考 DEPLOYMENT.md
# 包含监控、备份、安全加固
```

### 方法3: Docker部署（推荐）

创建 `docker-compose.yml`:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: chat_community
      POSTGRES_USER: chatapp_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    restart: unless-stopped

  api:
    build: ./packages/api
    depends_on:
      - postgres
    environment:
      DATABASE_URL: postgresql://chatapp_user:${DB_PASSWORD}@postgres:5432/chat_community
      JWT_SECRET: ${JWT_SECRET}
      ENCRYPTION_KEY: ${ENCRYPTION_KEY}
      NODE_ENV: production
      CLIENT_URL: ${CLIENT_URL}
    ports:
      - "3000:3000"
    restart: unless-stopped
    volumes:
      - ./packages/api/uploads:/app/uploads

  client:
    build: ./packages/client
    depends_on:
      - api
    environment:
      VITE_API_URL: ${API_URL}
    ports:
      - "80:80"
    restart: unless-stopped

volumes:
  postgres_data:
```

---

## 📦 打包文件清单

### 必须打包的文件

```
chat-community/
├── packages/
│   ├── api/
│   │   ├── dist/                 # 编译后的代码
│   │   ├── prisma/
│   │   │   ├── schema.prisma     # 数据库Schema
│   │   │   └── migrations/       # 所有迁移文件
│   │   ├── uploads/              # 上传文件目录（或创建空目录）
│   │   ├── .env.example          # 环境变量示例
│   │   ├── package.json
│   │   └── ecosystem.config.js   # PM2配置
│   └── client/
│       ├── dist/                 # 构建后的静态文件
│       └── .env.example
├── DEPLOYMENT.md                 # 部署文档
├── QUICK_DEPLOY.md               # 快速部署
├── QUICKSTART.md                 # 快速开始
├── README.md                     # 项目说明
├── SINGLE_SIGN_ON.md             # SSO功能说明
├── VERSION_UPDATE.md             # 版本更新说明
├── package.json                  # 根package.json
└── pnpm-workspace.yaml           # pnpm工作区配置
```

### 不需要打包的文件

```
.git/                  # Git仓库（太大）
node_modules/          # 依赖包（服务器上重新安装）
packages/*/src/        # TypeScript源码（已编译到dist）
packages/*/.env        # 环境变量（每台服务器不同）
_archived/             # 归档文件
*.log                  # 日志文件
.DS_Store              # macOS系统文件
```

---

## 🔍 部署后验证

### 1. 后端API检查

```bash
# 健康检查
curl http://localhost:3000/health

# 预期响应:
# {"status":"ok","message":"Chat & Community API is running"}
```

### 2. 数据库连接

```bash
# 检查数据库表
psql -d chat_community -c "\dt"

# 应该看到所有Prisma表
```

### 3. 注册第一个用户（管理员）

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123456",
    "email": "admin@example.com"
  }'
```

### 4. 登录测试

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123456"
  }'
```

### 5. WebSocket连接测试

打开浏览器控制台：
```javascript
const socket = io('http://localhost:3000', {
  auth: { token: 'YOUR_JWT_TOKEN' }
});
socket.on('connect', () => console.log('Connected!'));
```

### 6. 前端访问

访问 `http://localhost:5173` (开发) 或 `https://yourdomain.com` (生产)

---

## 🐛 常见部署问题

### 问题1: 编译失败

```bash
# 清理并重新安装依赖
rm -rf node_modules packages/*/node_modules
pnpm install

# 重新编译
cd packages/api
pnpm build
```

### 问题2: 数据库连接失败

检查：
- PostgreSQL是否运行: `systemctl status postgresql`
- DATABASE_URL是否正确
- 数据库用户权限: `GRANT ALL ON DATABASE chat_community TO chatapp_user;`

### 问题3: 文件上传失败

```bash
# 确保uploads目录存在且可写
mkdir -p packages/api/uploads
chmod 755 packages/api/uploads
```

### 问题4: CORS错误

检查后端.env中的CLIENT_URL是否与前端域名匹配

### 问题5: WebSocket连接失败

- 检查防火墙是否开放端口
- Nginx配置WebSocket代理
- 确保HTTPS环境下使用wss://而非ws://

---

## 📞 技术支持

如有问题，请参考：
1. DEPLOYMENT.md - 完整部署文档
2. QUICK_DEPLOY.md - 30分钟快速部署
3. SINGLE_SIGN_ON.md - 单点登录功能说明
4. README.md - 项目概述

---

## ✅ 部署完成检查

部署成功的标志：
- [ ] 后端API响应正常（/health返回200）
- [ ] 数据库表已创建
- [ ] 可以注册新用户
- [ ] 可以登录并获取Token
- [ ] WebSocket连接成功
- [ ] 前端页面加载正常
- [ ] 可以创建服务器/频道
- [ ] 可以发送消息
- [ ] 消息实时显示（无需刷新）
- [ ] 单点登录工作正常（多设备测试）

**恭喜！部署成功！** 🎉

---

最后更新: 2025年11月16日
部署版本: 1.0.0
