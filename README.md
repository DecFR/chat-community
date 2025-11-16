# Chat Community

一个全栈实时聊天与社区平台，支持多用户、频道、好友、消息、通知等功能，前端基于 React + Vite，后端基于 Express + Prisma。

## 主要功能
- 实时聊天与频道管理
- 好友系统与请求
- 用户注册、登录、鉴权
- 消息通知与推送
- 服务器与频道管理
- 多端支持，响应式界面

## 技术栈
- 前端：React, Vite, Zustand, Socket.IO, TailwindCSS
- 后端：Express, Prisma, PostgreSQL, Passport, Socket.IO
- 工具：pnpm, TypeScript, ESLint

## 目录结构
```
chat-community/
├── packages/
│   ├── api/      # 后端服务
│   └── client/   # 前端应用
├── package.json  # 根依赖与脚本
├── pnpm-workspace.yaml
└── README.md
```

## 环境变量
- 后端：`packages/api/.env.example`
- 前端：`packages/client/.env.example`

## 快速开始
1. 安装依赖：`pnpm install`
2. 初始化数据库：`pnpm run setup:db`
3. 启动开发环境：`pnpm dev`

## 部署
请参考下方部署脚本（Windows PowerShell 示例）：

---

## 隐私与安全
- 请勿上传敏感信息或隐私数据。
- 生产环境请更换所有密钥与数据库配置。
- 上传目录仅用于存储用户头像与媒体文件。

## License
MIT
