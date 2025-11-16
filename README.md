
# Chat Community

## 安全加固建议

1. **依赖安全**：定期更新所有依赖，使用 `pnpm audit` 检查并修复安全漏洞。
2. **环境变量管理**：敏感信息（如数据库密码、密钥）仅通过环境变量传递，严禁硬编码。
3. **内网访问限制**：数据库、Redis 等服务仅允许内网访问，防止外部攻击。
4. **HTTPS/SSL 加密**：nginx 配置 SSL 证书，强制所有流量走 HTTPS。
5. **nginx 安全 headers**：建议在 nginx 配置中加入：
	- `X-Frame-Options: DENY`
	- `X-Content-Type-Options: nosniff`
	- `Content-Security-Policy: default-src 'self'`
	- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
6. **前端防 XSS**：所有用户输入内容需转义，富文本/消息渲染时禁止注入脚本。
7. **后端防 SQL 注入**：所有数据库操作使用 ORM（如 Prisma），严禁拼接 SQL。
8. **认证与权限**：接口需校验用户身份和权限，敏感操作需二次确认。
9. **关闭调试与详细错误**：生产环境关闭 debug 日志和详细错误输出，防止信息泄露。
10. **日志与监控**：建议接入日志收集与异常监控（如 Prometheus、ELK），及时发现异常。
11. **自动化脚本安全**：部署/卸载脚本不暴露敏感信息，关键操作需 sudo 权限。
12. **API 限流与防刷**：接口建议加限流（如 express-rate-limit），防止暴力攻击。
13. **会话安全**：用户登录态建议使用 HttpOnly、Secure Cookie，支持多端会话管理。
14. **定期备份**：数据库和重要数据定期自动备份，防止数据丢失。
15. **自动化测试**：建议加入安全相关自动化测试（如 XSS、SQL 注入、权限绕过等）。

> 拓展：如需更高级安全方案，可集成 OAuth2、双因子认证、Web Application Firewall（WAF）、安全审计等。
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

```text
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

### 卸载与重装

如需彻底清理旧环境，可使用卸载脚本：

```bash
chmod +x uninstall-prod-full.sh
bash uninstall-prod-full.sh
```

卸载脚本会删除所有服务、配置、数据库和上传文件，数据不可恢复，请提前备份重要内容。
卸载后可直接重新运行安装脚本，获得全新干净的部署环境。

### 验证服务

部署完成后，访问你的域名，确认前端页面和 API 能正常访问。

---

## 隐私与安全

- 请勿上传敏感信息或隐私数据。
- 生产环境请更换所有密钥与数据库配置。
- 上传目录仅用于存储用户头像与媒体文件。

## License

MIT
