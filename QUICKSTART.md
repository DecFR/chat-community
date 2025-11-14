# Chat & Community - 快速启动指南

## 🚀 快速开始（5 分钟部署）

### 前置条件
- Node.js 20+ 
- pnpm 8+
- PostgreSQL 14+

### 步骤 1: 克隆或进入项目目录

```powershell
cd d:\DecFR\Program\chat-community
```

### 步骤 2: 安装所有依赖

```powershell
pnpm install
```

### 步骤 3: 配置环境变量

环境变量已经预配置好了：
- `packages/api/.env` - 后端环境变量（数据库密码: Dec231809）
- `packages/client/.env` - 前端环境变量

如果需要修改，请编辑这些文件。

### 步骤 4: 初始化数据库

```powershell
cd packages/api
pnpm prisma generate
pnpm prisma migrate dev --name init
cd ../..
```

### 步骤 5: 启动应用

```powershell
pnpm dev
```

这将同时启动前后端：
- **前端**: http://localhost:5173
- **后端**: http://localhost:3000

## 🎯 测试 API

### 使用 PowerShell 测试

#### 1. 注册第一个用户（自动成为管理员）

```powershell
$body = @{
    username = "admin"
    password = "admin123"
    email = "admin@chat.com"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/auth/register" `
    -Method Post `
    -Body $body `
    -ContentType "application/json"
```

#### 2. 登录获取 Token

```powershell
$body = @{
    username = "admin"
    password = "admin123"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" `
    -Method Post `
    -Body $body `
    -ContentType "application/json"

$token = $response.data.token
Write-Host "Token: $token"
```

#### 3. 获取当前用户信息

```powershell
$headers = @{
    Authorization = "Bearer $token"
}

Invoke-RestMethod -Uri "http://localhost:3000/api/auth/me" `
    -Method Get `
    -Headers $headers
```

#### 4. 创建服务器

```powershell
$body = @{
    name = "我的服务器"
    description = "这是第一个服务器"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/servers" `
    -Method Post `
    -Body $body `
    -ContentType "application/json" `
    -Headers $headers
```

## 📊 项目状态

### ✅ 已完成
- [x] Monorepo 项目结构
- [x] 完整的后端 API（认证、用户、好友、服务器、消息）
- [x] Socket.IO 实时通信系统
- [x] 消息端到端加密（AES-256-GCM）
- [x] 管理员后台 API
- [x] Prisma 数据库模型
- [x] 前端基础架构（Vite + React + TypeScript）
- [x] Tailwind CSS 配置（Discord 风格）
- [x] Zustand 状态管理（认证、服务器、好友）
- [x] Axios API 客户端
- [x] Socket.IO 客户端

### ⏳ 待开发
- [ ] React 组件（登录、注册、主布局）
- [ ] 聊天窗口组件
- [ ] 用户设置界面
- [ ] 好友管理界面
- [ ] 服务器管理界面

## 🏗️ 项目结构

```
chat-community/
├── packages/
│   ├── api/                    # 后端 API
│   │   ├── src/
│   │   │   ├── controllers/   # 控制器
│   │   │   ├── routes/        # 路由
│   │   │   ├── services/      # 业务逻辑
│   │   │   ├── middleware/    # 中间件
│   │   │   ├── socket/        # Socket.IO
│   │   │   ├── utils/         # 工具函数
│   │   │   └── server.ts      # 主入口
│   │   ├── prisma/
│   │   │   └── schema.prisma  # 数据库模型
│   │   ├── .env               # 环境变量
│   │   └── package.json
│   └── client/                 # 前端应用
│       ├── src/
│       │   ├── lib/           # API 和 Socket 客户端
│       │   ├── stores/        # Zustand 状态管理
│       │   ├── components/    # React 组件（待开发）
│       │   └── pages/         # 页面（待开发）
│       ├── .env               # 环境变量
│       └── package.json
├── pnpm-workspace.yaml
├── package.json
├── PROJECT_SUMMARY.md          # 项目详细文档
└── README.md
```

## 📚 核心功能

### 后端 API 端点

| 分类 | 端点 | 描述 |
|------|------|------|
| **认证** | POST /api/auth/register | 注册用户 |
| | POST /api/auth/login | 用户登录 |
| | GET /api/auth/me | 获取当前用户 |
| **用户** | GET /api/users/:id | 获取用户资料 |
| | PUT /api/users/profile | 更新资料 |
| | POST /api/users/avatar | 上传头像 |
| **好友** | POST /api/friends/request | 发送好友请求 |
| | GET /api/friends | 获取好友列表 |
| | GET /api/friends/pending | 待处理请求 |
| **服务器** | POST /api/servers | 创建服务器 |
| | GET /api/servers | 获取服务器列表 |
| | POST /api/servers/:id/channels | 创建频道 |
| **消息** | GET /api/messages/channel/:id | 频道消息历史 |
| | GET /api/messages/conversation/:id | 私聊消息历史 |
| **管理员** | GET /api/admin/users | 所有用户 |
| | GET /api/admin/servers | 所有服务器 |

### Socket.IO 事件

**发送事件：**
- `sendDirectMessage` - 发送私聊
- `sendChannelMessage` - 发送频道消息
- `markConversationAsRead` - 标记已读
- `typing` - 正在输入
- `updateStatus` - 更新状态

**接收事件：**
- `directMessage` - 接收私聊
- `channelMessage` - 接收频道消息
- `friendStatusUpdate` - 好友状态更新

## 🐛 故障排除

### 问题：无法连接数据库
**解决方案：**
1. 确保 PostgreSQL 正在运行
2. 检查 `packages/api/.env` 中的数据库连接字符串
3. 确认数据库 `chat_community` 已创建

### 问题：TypeScript 错误
**解决方案：**
运行 `pnpm install` 安装所有依赖后，TypeScript 错误会自动消失。

### 问题：端口被占用
**解决方案：**
修改环境变量中的端口号：
- 后端：修改 `packages/api/.env` 中的 `PORT`
- 前端：Vite 会自动选择可用端口

## 🔒 安全性

- ✅ 所有密码使用 bcrypt 加密
- ✅ JWT Token 认证
- ✅ 所有消息使用 AES-256-GCM 加密
- ✅ CORS 和 Helmet 安全中间件
- ✅ 环境变量管理敏感信息

## 📖 详细文档

- [完整项目文档](PROJECT_SUMMARY.md)
- [后端安装指南](packages/api/INSTALL.md)

## 💻 开发命令

```powershell
# 安装依赖
pnpm install

# 同时运行前后端
pnpm dev

# 只运行后端
cd packages/api && pnpm dev

# 只运行前端
cd packages/client && pnpm dev

# 数据库操作
cd packages/api
pnpm prisma generate       # 生成 Prisma Client
pnpm prisma migrate dev    # 运行数据库迁移
pnpm prisma studio         # 打开数据库管理界面

# 构建生产版本
pnpm build
```

## 🎨 技术亮点

1. **Monorepo 架构** - 统一管理前后端代码
2. **完整的 TypeScript** - 类型安全
3. **实时双向通信** - Socket.IO
4. **端到端加密** - 消息安全
5. **现代化 UI** - Discord 风格 + Tailwind CSS
6. **可扩展架构** - 清晰的分层设计

## 📝 许可证

MIT

---

**开发者**: GitHub Copilot  
**项目创建时间**: 2024年11月  
**状态**: 开发中 🚧
