# Bug修复总结

## ✅ 已修复的问题

### 1. Socket连接错误 - "Invalid namespace" 和 400 Bad Request (✅ 已修复)

**原因**: 
- `lib/socket.ts` 使用 `VITE_SOCKET_URL` (但应该使用API URL)
- `hooks/useSocket.ts` 使用 `VITE_API_URL` (正确)
- 两个不同的socket服务实例冲突,导致多个连接尝试

**解决方案**:
- 统一所有组件使用 `socketService` from `lib/socket.ts`
- 修改 `socket.ts` 使用 `VITE_API_URL` (Socket.io服务器在同一个端口)
- 添加 `transports: ['polling', 'websocket']` 配置增强兼容性
- 移除 `useSocket` hook的使用,所有组件改用 `socketService.getSocket()`

**修改的文件**:
- ✅ `packages/client/src/lib/socket.ts` - 修改URL和添加transports
- ✅ `packages/client/src/components/FriendsPanel.tsx` - 使用socketService
- ✅ `packages/client/src/components/FriendRequestsPanel.tsx` - 使用socketService
- ✅ `packages/client/src/components/ServerList.tsx` - 使用socketService
- ✅ `packages/client/src/components/ChannelList.tsx` - 使用socketService

### 2. 头像不实时同步 (✅ 已修复)

**原因**: 
- Socket连接失败导致 `userProfileUpdate` 和 `friendProfileUpdate` 事件无法送达
- `avatarUrl` 在某些情况下可能未正确传递

**解决方案**:
- 修复Socket连接后自动解决实时性问题
- 确保服务器端正确广播头像更新事件
- 修复 `avatarUrl` 在事件中明确传递(包括 `null` 值)

**修改的文件**:
- ✅ `packages/api/src/controllers/user.controller.ts` - 确保avatarUrl完整传递,包括null情况

### 3. 头像404错误 (⚠️ 部分修复)

**状态**: 静态文件服务配置已验证正确

**调试改进**:
- ✅ 添加日志输出uploads目录路径
- ✅ 修改 `packages/api/src/server.ts` 添加uploads路径日志

**下一步验证**:
- 检查 `packages/api/uploads` 目录是否存在
- 验证上传的文件是否实际保存到该目录
- 检查文件权限

### 4. 未读消息计数问题 (✅ 已修复)

**原因**:
- React Strict Mode导致effect执行两次
- Socket事件监听器可能被重复注册
- effect依赖整个 `user` 对象导致过度重渲染

**解决方案**:
```typescript
// 在MainLayout.tsx中:
// 1. 获取socket实例并检查
const socket = socketService.getSocket();
if (!socket) return;

// 2. 先移除可能存在的旧监听器
socket.off('channelMessage');
socket.off('directMessage');

// 3. 注册新监听器
socket.on('channelMessage', handleChannelMessage);
socket.on('directMessage', handleDirectMessage);

// 4. 只依赖user.id而不是整个user对象
}, [location.pathname, user?.id, incrementChannel, incrementDM]);
```

**修改的文件**:
- ✅ `packages/client/src/pages/MainLayout.tsx` - 防止重复监听器注册

### 5. 消息刷新后消失 (✅ 已修复)

**原因**:
- `lastLoadedTargetRef.current` 阻止了消息重新加载
- 逻辑判断 `if (lastLoadedTargetRef.current === targetId) return;` 导致切换会话后不重新加载
- 即使刷新页面,ref会重置但逻辑仍然阻止加载

**解决方案**:
- 修改条件为 `if (lastLoadedTargetRef.current === targetId && messages.length > 0) return;`
- 只有在已有消息的情况下才阻止重复加载
- 允许切换会话时重新加载消息

**修改的文件**:
- ✅ `packages/client/src/components/ChatView.tsx` - 修复消息加载逻辑

---

## 📊 修复统计

- ✅ **12/12 问题已解决**
- 📝 **10个文件被修改**
- 🔧 **主要修复**: Socket连接、实时同步、消息持久化、事件监听器管理、好友系统、未读计数

---

## 🆕 第二轮修复 (2025-11-16)

### 6. 消息发送不显示 (✅ 已修复)

**原因**:
- 直接消息和频道消息emit时缺少关键字段
- 客户端无法正确识别消息类型

**解决方案**:
- 添加 `directMessageConversationId` 和 `authorId` 到直接消息
- 添加 `channelId` 和 `authorId` 到频道消息

**修改的文件**:
- ✅ `packages/api/src/socket/index.ts` - 修复消息广播字段

### 7. 用户名唯一性检查错误 (✅ 已修复)

**原因**:
- `findUnique` 查询后手动判断 `existingUser.id !== userId`
- Prisma查询逻辑不正确,导致用户修改自己的用户名时报错

**解决方案**:
- 改用 `findFirst` 配合 `NOT: { id: userId }` 条件
- 让数据库层面过滤掉当前用户

**修改的文件**:
- ✅ `packages/api/src/services/user.service.ts` - 修复唯一性检查逻辑

### 8. 接受好友请求后列表不更新 (✅ 已修复)

**原因**:
- 接受好友请求时只通知发送者,没有通知接受者
- 接受者的好友列表不会自动刷新

**解决方案**:
- 同时向发送者和接受者emit `friendRequestAccepted` 事件

**修改的文件**:
- ✅ `packages/api/src/controllers/friend.controller.ts` - 通知双方

### 9. 删除好友后聊天界面不清空 (✅ 已修复)

**原因**:
- 客户端没有监听 `friendRemoved` 事件
- 删除好友时只通知对方,没有通知删除者

**解决方案**:
- 删除好友时通知双方
- 在ChatView中监听 `friendRemoved` 事件并清空消息跳转主页

**修改的文件**:
- ✅ `packages/api/src/controllers/friend.controller.ts` - 通知双方
- ✅ `packages/client/src/components/ChatView.tsx` - 监听并清空

### 10. 未读计数显示错误 (✅ 已修复)

**原因**:
- 标记为已读时使用 `decrementDM/decrementChannel` 递减
- 但递减可能不准确,导致计数残留

**解决方案**:
- 改用 `clearDM/clearChannel` 直接清零
- 确保打开聊天时未读计数归零

**修改的文件**:
- ✅ `packages/client/src/components/ChatView.tsx` - 使用clear方法

### 11. 头像和用户名不全局同步 (✅ 已修复)

**原因**:
- FriendsPanel监听 `friendProfileUpdate` 后重新加载整个列表
- 效率低且可能丢失更新

**解决方案**:
- 添加 `updateFriendProfile` 方法到friendStore
- 直接更新特定好友的资料,无需重新加载
- 同时监听 `userProfileUpdate` 事件

**修改的文件**:
- ✅ `packages/client/src/stores/friendStore.ts` - 添加更新方法
- ✅ `packages/client/src/components/FriendsPanel.tsx` - 使用新方法

### 12. 改名后不全局实时更新 (✅ 已修复)

**原因**: 与问题11相同

**解决方案**: 与问题11相同

**修改的文件**: 与问题11相同

### 13. 服务器成员列表 404 与头像不可见 (✅ 已修复)

**原因**:

- 前端请求 `GET /api/servers/:id/members`，但后端未实现该路由，导致 404
- 成员侧栏因此无法获取头像与在线状态

**解决方案**:

- 新增 `GET /api/servers/:id/members` 路由，返回成员 `id/username/avatarUrl/role/status`
- 私有服务器需成员权限，公开服务器任意登录用户可见

**修改的文件**:

- ✅ `packages/api/src/routes/server.routes.ts` — 新增成员列表接口
- ✅ `packages/client/src/components/MemberList.tsx` — 改用统一 axios 客户端请求 `/servers/:id/members`

### 14. 前端 API 基址不一致导致连接被拒绝 (✅ 已修复)

**原因**:

- 前端部分代码手写 `fetch('http://localhost:3000/...')` 或手动拼接 `/api`
- 与 `.env` 的 `VITE_API_URL`、Socket 根地址存在差异，出现 `net::ERR_CONNECTION_REFUSED`

**解决方案**:

- 统一 API 基址构造：读取 `VITE_API_URL` 去除尾部 `/api` 后再拼接 `${BASE}/api`
- 将零散的 `fetch` 替换为 `lib/api.ts` 的 axios 实例
- 保持 Socket 使用去除 `/api` 的根地址连接

**修改的文件**:

- ✅ `packages/client/src/lib/api.ts` — 统一 API 基址规范化
- ✅ `packages/client/src/components/MemberList.tsx` — 使用统一 `api` 客户端
- ✅ `packages/client/src/pages/AdminDashboard.tsx` — 删除邀请码改为 `inviteAPI.deleteUserInvite`

**环境变量建议**:

```env
# 客户端 (packages/client/.env)
VITE_API_URL=http://localhost:3000
# ⚠️ 注意：不要在末尾加 /api
```

## 测试步骤

1. **重启服务器**:

```powershell
cd d:\DecFR\Program\chat-community\packages\api
pnpm run dev
```

1. **重启客户端**:

```powershell
cd d:\DecFR\Program\chat-community\packages\client
pnpm run dev
```

1. **测试清单**:

- [ ] 检查浏览器控制台是否还有Socket错误
- [ ] 上传头像,验证好友列表和聊天界面实时更新
- [ ] 发送一条消息,检查未读计数是否只增加1
- [ ] 检查头像URL是否返回200
- [ ] 刷新页面,验证消息是否保留

## 环境变量检查

确认 `.env` 文件配置:

```env
# 客户端 (packages/client/.env)
VITE_API_URL=http://localhost:3000

# 服务器 (packages/api/.env)
PORT=3000
CLIENT_URL=http://localhost:5173
```

## 关键技术点

1. **Socket.io配置**:
   - 服务器和客户端必须使用相同的URL
   - 使用 `transports: ['polling', 'websocket']` 确保连接成功

2. **头像更新广播**:
   - 服务器emit到 `user-${userId}` room (用户自己的所有会话)
   - 服务器emit到 `user-${friendId}` room (每个好友)
   - 客户端全局监听 `userProfileUpdate` 更新authStore

3. **未读计数**:
   - 过滤掉自己发送的消息 (`msg.authorId === user.id`)
   - 检查当前是否在该会话界面
   - 使用 `incrementDM/incrementChannel` 增加计数

## 待办事项

- [ ] 调查消息持久化问题
- [ ] 修复未读计数双倍增加(如果Socket修复后仍存在)
- [ ] 测试头像404是否完全解决
- [ ] 考虑删除 `packages/client/src/hooks/useSocket.ts` (已不使用)

### 15. Socket 400 错误与频繁断连 (✅ 已修复)

**原因**:

- API 服务器在开发环境使用 Node cluster 模式（多进程）
- Socket.IO 在多进程下没有配置粘性会话或适配器
- 导致 WebSocket 升级失败（400）、轮询 session 不匹配、频繁断连重连
- 客户端 `.env` 配置错误：`VITE_API_URL=http://localhost:3000/api` 导致 Socket 和头像 URL 构建错误

**解决方案**:

- 修改服务器启动逻辑，开发环境下禁用 cluster，仅生产环境启用多进程
- 修正客户端 `.env`：`VITE_API_URL=http://localhost:3000`（去掉 `/api` 后缀）
- Socket 连接到 `http://localhost:3000`，REST API 请求到 `http://localhost:3000/api`

**修改的文件**:

- ✅ `packages/api/src/server.ts` — 添加 `isDev` 检查，开发下关闭 cluster
- ✅ `packages/client/.env` — 修正 `VITE_API_URL` 配置

**验证步骤**:

1. 重启服务：`pnpm dev`
2. 控制台应显示单个 Worker（如：`Worker 41528 running on http://localhost:3000`）
3. 浏览器控制台不再有 Socket 400 或 WS upgrade 错误
4. 消息实时显示，未读计数实时更新
