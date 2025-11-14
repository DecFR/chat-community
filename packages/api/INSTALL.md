# Chat & Community 后端 API 安装与运行指南

## 安装步骤

### 1. 安装依赖

在项目根目录运行：

```bash
cd d:\DecFR\Program\chat-community
pnpm install
```

### 2. 配置数据库

确保 PostgreSQL 已安装并运行。然后在 `packages/api/.env` 文件中配置数据库连接：

```env
DATABASE_URL="postgresql://postgres:Dec231809@localhost:5432/chat_community?schema=public"
```

### 3. 初始化数据库

```bash
cd packages/api
pnpm prisma generate
pnpm prisma migrate dev --name init
```

### 4. 启动开发服务器

回到根目录：

```bash
cd ../..
pnpm dev
```

或者单独启动后端：

```bash
cd packages/api
pnpm dev
```

服务器将在 http://localhost:3000 运行。

## API 端点概览

### 认证 (/api/auth)
- `POST /api/auth/register` - 注册新用户
- `POST /api/auth/login` - 用户登录
- `GET /api/auth/me` - 获取当前用户信息（需认证）

### 用户 (/api/users)
- `GET /api/users/:id` - 获取用户资料
- `PUT /api/users/profile` - 更新用户资料
- `POST /api/users/avatar` - 上传头像
- `GET /api/users/settings` - 获取用户设置
- `PUT /api/users/settings` - 更新用户设置
- `GET /api/users/search` - 搜索用户

### 好友 (/api/friends)
- `POST /api/friends/request` - 发送好友请求
- `POST /api/friends/:id/accept` - 接受好友请求
- `POST /api/friends/:id/decline` - 拒绝好友请求
- `GET /api/friends` - 获取好友列表
- `GET /api/friends/pending` - 获取待处理的好友请求
- `DELETE /api/friends/:id` - 删除好友

### 服务器 (/api/servers)
- `POST /api/servers` - 创建新服务器
- `GET /api/servers` - 获取用户的所有服务器
- `GET /api/servers/:id` - 获取服务器详情
- `POST /api/servers/:id/channels` - 创建新频道

### 消息 (/api/messages)
- `GET /api/messages/channel/:channelId` - 获取频道消息历史
- `GET /api/messages/conversation/:conversationId` - 获取私聊消息历史
- `GET /api/messages/conversation/:conversationId/state` - 获取阅读状态

### 管理后台 (/api/admin)
- `GET /api/admin/users` - 获取所有用户
- `GET /api/admin/servers` - 获取所有服务器
- `DELETE /api/admin/users/:id` - 删除用户
- `DELETE /api/admin/servers/:id` - 删除服务器

## Socket.IO 事件

### 客户端发送的事件
- `sendDirectMessage` - 发送私聊消息
- `sendChannelMessage` - 发送频道消息
- `markConversationAsRead` - 标记会话为已读
- `typing` - 正在输入通知
- `updateStatus` - 更新用户状态

### 服务器推送的事件
- `directMessage` - 接收私聊消息
- `channelMessage` - 接收频道消息
- `conversationMarkedAsRead` - 会话已标记为已读
- `userTyping` - 其他用户正在输入
- `friendStatusUpdate` - 好友状态更新
- `error` - 错误消息

## 测试第一个用户

使用 POST /api/auth/register 注册第一个用户，该用户将自动成为管理员（ADMIN）：

```json
{
  "username": "admin",
  "password": "password123",
  "email": "admin@example.com"
}
```

## 故障排除

如果遇到类型错误，请确保安装了所有依赖：
```bash
pnpm install
```

如果数据库连接失败，检查 PostgreSQL 是否运行，并验证 .env 文件中的连接字符串。

如果 Prisma 报错，尝试重新生成客户端：
```bash
pnpm prisma generate
```
