# Chat & Community

一个功能完整、安全、高性能的全栈实时聊天平台，完美融合 Discord 的社区结构与 Telegram 的私聊体验。

## ✨ 特性

### 🎯 核心功能
- 🔐 **安全认证**：JWT Token + bcrypt 密码加密
- 💬 **实时通信**：Socket.IO WebSocket 实时消息推送
- 🔒 **端到端加密**：AES-256-GCM 消息加密
- 🏰 **服务器系统**：支持创建和管理多个服务器
- 📺 **频道管理**：文字频道和语音频道
- 👥 **好友系统**：添加好友、好友请求、好友列表
- 💭 **私聊功能**：一对一加密私聊
- 📖 **阅读状态**：消息已读/未读追踪
- 🔔 **通知系统**：实时通知推送
- 🎨 **主题切换**：亮色/暗色/跟随系统
- 👤 **用户设置**：头像上传、个人资料、隐私设置

### 🛡️ 安全特性
- JWT 认证和授权
- 密码 bcrypt 哈希（10 轮盐值）
- 所有消息 AES-256-GCM 加密存储
- CORS 和 Helmet 安全中间件
- SQL 注入防护（Prisma ORM）

### 🎨 用户体验
- Discord 风格的 4 列布局
- 流畅的动画和过渡效果
- 在线状态实时同步
- 输入状态指示器
- 无限滚动消息历史
- 响应式设计（支持移动端）

## 🚀 快速开始

### 环境要求

- **Node.js**: 20.x LTS 或更高版本
- **PostgreSQL**: 14 或更高版本
- **pnpm**: 8.x 或更高版本

### 安装依赖

```bash
# 克隆仓库
git clone <repository-url>
cd chat-community

# 安装依赖
pnpm install
```

### 配置环境变量

#### 后端配置 (`packages/api/.env`)

```env
# 数据库配置
DATABASE_URL="postgresql://postgres:your_password@localhost:5432/chat_community?schema=public"

# JWT 密钥（请更换为随机字符串）
JWT_SECRET="your-secure-jwt-secret-key"

# 加密密钥（64 位十六进制字符串）
ENCRYPTION_KEY="a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890"

# 服务器配置
PORT=3000
NODE_ENV=development

# 文件上传配置
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760
```

#### 前端配置 (`packages/client/.env`)

```env
VITE_API_URL=http://localhost:3000/api
VITE_SOCKET_URL=http://localhost:3000
```

### 初始化数据库

```bash
cd packages/api

# 生成 Prisma 客户端
npx prisma generate

# 运行数据库迁移
npx prisma migrate dev --name init

# （可选）查看数据库
npx prisma studio
```

### 启动开发服务器

```bash
# 在项目根目录
pnpm run dev
```

这将同时启动：
- **后端 API**: http://localhost:3000
- **前端应用**: http://localhost:5173

## ⚙️ 部署（使用 `deploy_ubuntu.sh`）

仓库根目录包含一个脚本 `deploy_ubuntu.sh`，用于在 Ubuntu（例如 DigitalOcean Droplet）上从源码部署应用（安装依赖、构建、Prisma 迁移、使用 `pm2` 启动后端、配置 `nginx` 和可选的 `certbot` HTTPS）。下面是主要用法与注意事项。

**文件**: `deploy_ubuntu.sh`

**快速示例**

交互式（推荐）——以非 root 用户登录并运行脚本（脚本会在需要时使用 `sudo`）:

```bash
cd /path/to/chat-community
bash deploy_ubuntu.sh
```

在 `root` 下运行时，脚本会提示是否创建一个部署用户（默认 `DecFR`），并可以选择是否复制 `/root/.ssh/authorized_keys` 到新用户以便密钥登录；创建完成后脚本可以自动切换为该用户并继续执行（也可使用 `--no-resume` 禁止自动切换）。

**参数 / 环境变量**
- `DEPLOY_USER`：通过环境变量或脚本第一个参数指定部署用户名（默认 `DecFR`）。
- `--deploy-user=<name>`：在命令行中指定用户名。
- `--yes` / `-y`：自动确认所有提示（包括 `chown -R`），危险操作仅在你确认路径安全时使用。
- `--no-resume`：创建用户但不自动以新用户继续执行脚本，便于手动验证。

示例：

```bash
# 指定用户名并自动确认（危险，慎用）
DEPLOY_USER=deployer bash deploy_ubuntu.sh --yes

# 创建用户但不自动继续
bash deploy_ubuntu.sh --no-resume
```

**安全提示（重要）**
- 脚本会在对目录执行 `chown -R` 前做安全检查：若检测到脚本路径为 `/`、`/etc`、`/var`、`/usr`、`/bin`、`/sbin`、`/root`、`/proc`、`/sys`、`/dev` 等敏感路径，脚本将拒绝自动 chown 并提示手动处理。
- 请在使用 `--yes` 前确认 `SCRIPTPATH`（即脚本运行目录）是仓库目录，避免错误修改系统文件属主。
- 在禁用 root SSH 登录或修改 SSHD 配置前，请先确认部署用户能够通过 SSH 使用密钥登录并具有 `sudo` 权限。

如需更详细的部署步骤或将部署流程加入 CI，我可以帮你生成 `docs/DEPLOY.md` 或一个非交互的一键部署命令。


## 📁 项目结构

```
chat-community/
├── packages/
│   ├── api/                      # 后端 Express API
│   │   ├── src/
│   │   │   ├── controllers/      # 路由处理器
│   │   │   ├── middleware/       # 中间件（认证等）
│   │   │   ├── routes/           # API 路由
│   │   │   ├── services/         # 业务逻辑
│   │   │   ├── socket/           # Socket.IO 实时通信
│   │   │   ├── utils/            # 工具函数（加密等）
│   │   │   └── server.ts         # 服务器入口
│   │   ├── prisma/
│   │   │   └── schema.prisma     # 数据库模型
│   │   ├── uploads/              # 文件上传目录
│   │   ├── .env                  # 环境变量
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── client/                   # 前端 React 应用
│       ├── src/
│       │   ├── components/       # React 组件
│       │   │   ├── ChatView.tsx           # 聊天窗口
│       │   │   ├── ChannelList.tsx        # 频道列表
│       │   │   ├── ServerList.tsx         # 服务器列表
│       │   │   ├── MemberList.tsx         # 成员列表
│       │   │   ├── UserSettingsModal.tsx  # 用户设置
│       │   │   ├── UserSearchModal.tsx    # 用户搜索
│       │   │   ├── NotificationCenter.tsx # 通知中心
│       │   │   ├── OnlineIndicator.tsx    # 在线状态
│       │   │   ├── TypingIndicator.tsx    # 输入状态
│       │   │   └── ...
│       │   ├── pages/            # 页面组件
│       │   │   ├── LoginPage.tsx
│       │   │   ├── RegisterPage.tsx
│       │   │   └── MainLayout.tsx
│       │   ├── stores/           # Zustand 状态管理
│       │   │   ├── authStore.ts
│       │   │   ├── serverStore.ts
│       │   │   └── friendStore.ts
│       │   ├── lib/              # 工具库
│       │   │   ├── api.ts        # Axios HTTP 客户端
│       │   │   └── socket.ts     # Socket.IO 客户端
│       │   ├── App.tsx
│       │   ├── main.tsx
│       │   └── index.css         # Tailwind CSS
│       ├── .env
│       ├── package.json
│       ├── tailwind.config.js
│       └── vite.config.ts
│
├── pnpm-workspace.yaml           # pnpm 工作区配置
├── package.json
├── TESTING.md                    # 测试指南
└── README.md
```

## 🔧 技术栈

### 后端
- **框架**: Express.js 4.x
- **语言**: TypeScript 5.x
- **数据库**: PostgreSQL + Prisma ORM
- **实时通信**: Socket.IO 4.x
- **认证**: JWT + Passport.js
- **加密**: bcrypt + Node.js crypto
- **文件上传**: Multer
- **安全**: Helmet + CORS

### 前端
- **框架**: React 19 + TypeScript
- **构建工具**: Vite 7.x
- **样式**: Tailwind CSS 3.x
- **状态管理**: Zustand 5.x
- **路由**: React Router 7.x
- **HTTP 客户端**: Axios 1.x
- **实时通信**: Socket.IO Client 4.x

## 📊 数据库模型

### 核心表
- **User**: 用户信息（用户名、密码哈希、角色、状态）
- **UserSettings**: 用户设置（主题、隐私设置）
- **Friendship**: 好友关系（PENDING/ACCEPTED/BLOCKED）
- **Server**: 服务器信息
- **Channel**: 频道信息（TEXT/VOICE）
- **ServerMember**: 服务器成员（OWNER/ADMIN/MODERATOR/MEMBER）
- **Message**: 消息（加密内容）
- **DirectMessageConversation**: 私聊对话
- **UserConversationState**: 用户对话状态（已读位置）
- **InviteCode**: 邀请码（用户邀请、服务器邀请）

## 🔌 API 端点

### 认证
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录
- `GET /api/auth/me` - 获取当前用户信息

### 用户
- `GET /api/users/profile` - 获取个人资料
- `PUT /api/users/profile` - 更新个人资料
- `POST /api/users/avatar` - 上传头像
- `GET /api/users/settings` - 获取用户设置
- `PUT /api/users/settings` - 更新用户设置
- `GET /api/users/search?q=xxx` - 搜索用户

### 好友
- `POST /api/friends/request` - 发送好友请求
- `POST /api/friends/:id/accept` - 接受好友请求
- `POST /api/friends/:id/decline` - 拒绝好友请求
- `GET /api/friends` - 获取好友列表
- `GET /api/friends/pending` - 获取待处理请求
- `DELETE /api/friends/:id` - 移除好友

### 服务器
- `POST /api/servers` - 创建服务器
- `GET /api/servers` - 获取用户的服务器列表
- `GET /api/servers/:id` - 获取服务器详情
- `PUT /api/servers/:id` - 更新服务器
- `DELETE /api/servers/:id` - 删除服务器
- `POST /api/servers/:id/channels` - 创建频道
- `PUT /api/servers/:sid/channels/:cid` - 更新频道
- `DELETE /api/servers/:sid/channels/:cid` - 删除频道

### 消息
- `GET /api/messages/channel/:id` - 获取频道消息历史
- `GET /api/messages/conversation/:id` - 获取私聊消息历史
- `GET /api/messages/conversation/:id/state` - 获取对话状态

### 管理员
- `GET /api/admin/users` - 获取所有用户
- `GET /api/admin/servers` - 获取所有服务器
- `DELETE /api/admin/users/:id` - 删除用户
- `DELETE /api/admin/servers/:id` - 删除服务器

## 🔌 Socket.IO 事件

### 客户端发送
- `sendDirectMessage` - 发送私聊消息
- `sendChannelMessage` - 发送频道消息
- `markConversationAsRead` - 标记对话已读
- `typing` - 发送输入状态
- `updateStatus` - 更新在线状态

### 服务器推送
- `directMessage` - 接收私聊消息
- `channelMessage` - 接收频道消息
- `friendStatusUpdate` - 好友状态更新
- `notification` - 接收通知

## 🧪 测试

详细的测试指南请参阅 [TESTING.md](./TESTING.md)

### 快速测试

1. 启动应用: `pnpm run dev`
2. 打开浏览器: http://localhost:5173
3. 注册第一个用户（自动成为 ADMIN）
4. 创建服务器和频道
5. 注册第二个用户测试好友和消息功能

## 🔐 安全注意事项

### 生产环境配置

1. **更换密钥**：
   - 生成新的 `JWT_SECRET`
   - 生成新的 64 位十六进制 `ENCRYPTION_KEY`

2. **数据库安全**：
   - 使用强密码
   - 限制数据库访问权限
   - 定期备份数据

3. **HTTPS**：
   - 生产环境必须使用 HTTPS
   - 配置 SSL 证书

4. **环境变量**：
   - 不要提交 `.env` 文件到 Git
   - 使用环境变量管理服务（如 Vercel、Railway）

## 📝 开发笔记

### 添加新功能

1. **后端**:
   - 在 `prisma/schema.prisma` 添加数据模型
   - 运行 `npx prisma migrate dev`
   - 在 `services/` 添加业务逻辑
   - 在 `controllers/` 添加控制器
   - 在 `routes/` 注册路由

2. **前端**:
   - 在 `lib/api.ts` 添加 API 方法
   - 在 `stores/` 添加状态管理
   - 在 `components/` 创建组件
   - 在 `pages/` 添加页面

### 调试技巧

- **后端日志**: 查看终端输出
- **前端日志**: 打开浏览器开发者工具
- **数据库**: 使用 `npx prisma studio`
- **Socket.IO**: 浏览器 Network 标签查看 WebSocket

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 🎉 致谢

感谢所有开源项目和社区的贡献者！

---

**开始使用**: `pnpm run dev` 🚀

**测试指南**: [TESTING.md](./TESTING.md) 📖

一个功能完整的全栈实时聊天平台，融合 Discord 的社区结构与 Telegram 的私聊体验。

## 技术栈

### 后端 (packages/api)
- Node.js + Express.js
- PostgreSQL + Prisma ORM
- Socket.IO (实时通信)
- JWT 认证
- AES-256-GCM 加密

### 前端 (packages/client)
- React + TypeScript
- Vite
- Tailwind CSS
- Zustand (状态管理)
- Socket.IO Client

## 快速开始

### 前置要求
- Node.js >= 20.0.0
- pnpm >= 8.0.0
- PostgreSQL >= 14

### 安装

```bash
# 安装依赖
pnpm install

# 配置环境变量
# 在 packages/api 目录下创建 .env 文件
cp packages/api/.env.example packages/api/.env

# 初始化数据库
cd packages/api
pnpm prisma migrate dev

# 启动开发服务器（前后端同时启动）
cd ../..
pnpm dev
```

### 访问应用
- 前端: http://localhost:5173
- 后端 API: http://localhost:3000

## 项目结构

```
chat-community/
├── packages/
│   ├── api/          # Express 后端
│   │   ├── src/
│   │   │   ├── controllers/
│   │   │   ├── routes/
│   │   │   ├── services/
│   │   │   ├── middleware/
│   │   │   ├── socket/
│   │   │   ├── utils/
│   │   │   └── server.ts
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   └── package.json
│   └── client/       # React 前端
│       ├── src/
│       │   ├── components/
│       │   ├── pages/
│       │   ├── stores/
│       │   ├── lib/
│       │   └── App.tsx
│       └── package.json
└── package.json
```

## 核心功能

- ✅ 用户认证与授权
- ✅ 好友系统
- ✅ 服务器/频道管理
- ✅ 实时私聊与群聊
- ✅ 消息加密
- ✅ 阅读状态追踪
- ✅ 文件/图片上传
- ✅ 用户状态管理
- ✅ 主题切换
- ✅ 管理后台

## License

MIT
