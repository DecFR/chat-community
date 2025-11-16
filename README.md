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

## 生产环境一键部署

推荐使用自动化脚本 `deploy-prod-full.sh` 进行生产部署，支持 Ubuntu 24.04 LTS。

### 步骤
1. 上传项目代码到服务器（如用 scp、rsync 或 git clone）。
2. 进入项目根目录：
	```bash
	cd ~/chat-community
	```
3. 赋予脚本执行权限：
	```bash
	chmod +x deploy-prod-full.sh
	```
4. 运行部署脚本（建议用 bash）：
	```bash
	bash deploy-prod-full.sh
	```
5. 按提示输入域名、SSL 证书路径、密钥路径（可直接回车跳过，后续可手动修改 nginx 配置）。
6. 部署完成后，脚本会自动安装依赖、生成环境变量、初始化数据库、构建前后端、配置并重载 nginx、启动服务。

### 自动化说明
- 环境变量（.env）会自动生成，数据库密码与密钥自动填充。
- nginx 配置会根据输入自动生成，未输入则使用默认 your_domain.com 与默认证书路径。
- 如需修改 nginx 配置、证书路径、域名等，编辑 `/etc/nginx/sites-available/chat-community.conf`，然后执行：
  ```bash
  sudo nginx -s reload
  ```
- 如遇端口或防火墙问题，记得开放 80/443 端口（如 `sudo ufw allow 80,443/tcp`）。

### 验证服务
部署完成后，访问你的域名，确认前端页面和 API 能正常访问。

---

---

## 隐私与安全
- 请勿上传敏感信息或隐私数据。
- 生产环境请更换所有密钥与数据库配置。
- 上传目录仅用于存储用户头像与媒体文件。

## License
MIT
