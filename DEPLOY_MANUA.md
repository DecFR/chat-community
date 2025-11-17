<!-- 手动部署说明（中文） -->
# Chat-Community 手动部署指南

本指南介绍如何在一台 Linux 服务器上手动部署本仓库的生产环境（API + 前端），假设目标服务器当前的用户是 `root`。说明中尽量避免使用远程安装脚本（即不使用 `curl | sh`），按需你可以把其中部分命令改为 `sudo`（如果你不是 root）。

**要点**：
- **Node**: 建议使用 Node 22（与本地 Node ABI 保持一致）。
- **数据库**: PostgreSQL 18（你可以选择在宿主机安装或用 Docker 运行）。
- **包管理**: 使用 `pnpm`（通过 `corepack` 或 `npm` 安装）。
- **服务管理**: 推荐使用 `systemd` 管理 `api` 服务；使用 `nginx` 提供 HTTPS 和前端静态服务。

**文件与路径约定（示例）**
- 项目目录：`/opt/chat-community`（你也可以选择别的路径）
- 后端工作目录：`/opt/chat-community/packages/api`
- 前端静态目录：`/var/www/chat-community/client`
- 环境变量文件：`/etc/chat-community/api.env`（权限 `600`）

--------------------

## 1. 先决条件

- 服务器已联网并可访问外部仓库（用于下载安装包或镜像）。
- 你当前为 `root`（如果不是，可在需要提权处加 `sudo`）。
- 建议创建非 root 运行用户：`chatuser`（在 systemd 中使用该用户运行 Node 服务）。

创建服务用户（示例）：
```bash
useradd -r -m -d /opt/chat-community -s /usr/sbin/nologin chatuser
mkdir -p /opt/chat-community
chown chatuser:chatuser /opt/chat-community
```

--------------------

## 2. 安装 PostgreSQL（两种选择）

选项 A — 使用宿主机包管理器安装（推荐在你熟悉的发行版上按官方文档添加 PGDG 仓库并安装 PostgreSQL 18）。示例（Debian/Ubuntu，需按官方步骤添加仓库）：
```bash
# 请参考 PostgreSQL 官方文档获取正确的仓库添加步骤
apt update
apt install -y postgresql-18
```

选项 B — 使用 Docker 运行 PostgreSQL（如果你想避免在宿主机安装）：
```bash
docker run -d --name chat-pg \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=YOUR_PG_PASSWORD \
  -e POSTGRES_DB=chat_community \
  -v /var/lib/postgresql/data_chat:/var/lib/postgresql/data \
  -p 5432:5432 \
  postgres:18
```

创建数据库用户与数据库（若宿主机安装）：
```bash
su - postgres -c "psql -c \"CREATE USER chatuser WITH PASSWORD 'yourpassword';\""
su - postgres -c "psql -c \"CREATE DATABASE chat_community OWNER chatuser;\""
```

把数据库连接字符串示例记下来：
```
postgresql://chatuser:yourpassword@127.0.0.1:5432/chat_community?schema=public
```

--------------------

## 3. 安装 Node.js 22（不使用远程 `sh`）

办法 A（手动下载安装包并解压）：
```bash
cd /tmp
# 在 nodejs.org 下载对应的 tar.xz（用浏览器或 wget），替换下面的文件名为实际版本
wget https://nodejs.org/dist/v22.*/node-v22.*-linux-x64.tar.xz -O /tmp/node22.tar.xz
tar -xJf /tmp/node22.tar.xz -C /usr/local
ln -s /usr/local/node-v22.*-linux-x64 /usr/local/node22
ln -s /usr/local/node22/bin/node /usr/bin/node
ln -s /usr/local/node22/bin/npm /usr/bin/npm
ln -s /usr/local/node22/bin/npx /usr/bin/npx
```

办法 B（如果发行版仓库提供，可用 `apt`/`dnf` 安装）：
```bash
apt install -y nodejs npm
# 或 dnf/yum，根据你的发行版
```

验证 Node 版本：
```bash
node -v    # 应当为 v22.x
npm -v
```

--------------------

## 4. 安装 pnpm

推荐使用 `corepack`（Node 自带）：
```bash
corepack enable
corepack prepare pnpm@latest --activate
pnpm -v
```

或用 npm 全局安装（如果你不想用 corepack）：
```bash
npm i -g pnpm
```

--------------------

## 5. 获取代码并安装依赖

把仓库克隆到目标目录（或把本地构建好的发布包传上去）：
```bash
cd /opt
git clone <your-repo-url> chat-community
cd chat-community
```

在工作区安装依赖并构建生产代码：
```bash
pnpm install
# 构建整个 monorepo（会运行 packages 的构建脚本）
pnpm -w build
```

如果你只在服务器上为 `api` 安装生产依赖并构建：
```bash
cd /opt/chat-community/packages/api
pnpm install --prod
pnpm build
```

--------------------

## 6. 配置环境变量

把运行所需的环境变量写入文件 `/etc/chat-community/api.env`（权限 `600`）：
```bash
mkdir -p /etc/chat-community
cat > /etc/chat-community/api.env <<'EOF'
DATABASE_URL="postgresql://chatuser:yourpassword@127.0.0.1:5432/chat_community?schema=public"
JWT_SECRET="replace-with-a-strong-jwt-secret"
ENCRYPTION_KEY="replace-with-32-byte-hex-64chars"
PORT=3000
NODE_ENV=production
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760
EOF
chmod 600 /etc/chat-community/api.env
```

注意：`ENCRYPTION_KEY` 是用于仓库 `packages/api/.env` 中的对称密钥，示例长度为 32 字节的十六进制（64 个 hex 字符）。

--------------------

## 7. 运行 Prisma 迁移（生成客户端并运行迁移）

在 `packages/api` 目录下运行：
```bash
cd /opt/chat-community/packages/api
pnpm prisma:generate
pnpm prisma:migrate    # package.json 中映射为 `prisma migrate deploy`，适用于生产
```

如果你使用 Docker 中的 Postgres，确保此时数据库容器已启动并可连接。

--------------------

## 8. 设置 systemd 服务（示例）

创建 `/etc/systemd/system/chat-community-api.service`，内容示例如下：
```
[Unit]
Description=Chat Community API
After=network.target

[Service]
Type=simple
User=chatuser
Group=chatuser
WorkingDirectory=/opt/chat-community/packages/api
EnvironmentFile=/etc/chat-community/api.env
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

加载并启动服务：
```bash
systemctl daemon-reload
systemctl enable --now chat-community-api.service
journalctl -u chat-community-api.service -f
```

如果你不想用 `node dist/server.js`，也可以使用 `pnpm start`：把 `ExecStart=/usr/bin/pnpm --silent start`（但需保证 `pnpm` 在 PATH 并且服务用户有权限）。

--------------------

## 9. 部署前端静态文件并配置 Nginx

构建前端（如果尚未构建）：
```bash
pnpm -C packages/client build
```

复制到静态目录并设置所有者（示例使用 `www-data`）：
```bash
mkdir -p /var/www/chat-community/client
cp -r packages/client/dist/* /var/www/chat-community/client/
chown -R www-data:www-data /var/www/chat-community/client
```

示例 `nginx` 配置（放在 `/etc/nginx/sites-available/chat-community`）：
```nginx
server {
  listen 80;
  server_name your_domain.com;
  return 301 https://$host$request_uri;
}
server {
  listen 443 ssl http2;
  server_name your_domain.com;

  ssl_certificate /etc/ssl/certs/your_domain.com.pem;
  ssl_certificate_key /etc/ssl/private/your_domain.com.key;

  root /var/www/chat-community/client;
  index index.html;

  location /api/ {
    proxy_pass http://127.0.0.1:3000/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

启用站点并重载 nginx：
```bash
ln -s /etc/nginx/sites-available/chat-community /etc/nginx/sites-enabled/chat-community
nginx -t && systemctl reload nginx
```

关于 HTTPS 证书：建议使用 `certbot`（通过发行版包管理器安装），交互式获取证书或在你可控的环境下申请并把证书路径写入 nginx 配置。请勿使用未审核的远程安装脚本。

--------------------

## 10. 验证与排查

- 检查 systemd 服务状态：
  ```bash
  systemctl status chat-community-api.service
  journalctl -u chat-community-api.service -f
  ```
- 检查后端是否监听端口：
  ```bash
  ss -ltnp | grep 3000
  ```
- 使用 curl 测试本地接口：
  ```bash
  curl -I http://127.0.0.1:3000/
  curl -I https://your_domain.com/   # 测试 nginx + TLS
  ```
- 查看 Prisma 连接与迁移日志（在 `pnpm prisma:migrate` 的输出中）。

--------------------

## 11. 安全与运维建议

- 不要以 root 运行 Node 进程，使用 `chatuser` 或其他受限用户。 
- 把环境文件权限设为 `600` 并确保只有服务用户可读。
- 定期备份 Postgres 数据卷并验证备份可恢复。
- 设置日志轮转（`/etc/logrotate.d`）或把日志发往集中式日志系统。
- 考虑使用 process manager（systemd）+ 监控（Prometheus/Node exporter / 简单脚本）来保证可观测性。

--------------------

## 常见问题

- Q: 我可以直接把 `node_modules` 一并打包上传吗？
  - A: 可以，但只有在构建平台（ABI）与目标服务器完全一致时才可靠（例如相同的 glibc、arch）。更稳妥的做法是在目标服务器上 `pnpm install --prod` 或在 CI 中为目标平台构建生产包并一起传输。

- Q: 我不想安装 Postgres，用 SQLite 可以吗？
  - A: 项目用的是 PostgreSQL 特性（Prisma schema 与迁移以 postgres 为主），切换到 SQLite 需要修改 Prisma schema 与迁移，不推荐直接在生产切换。

--------------------

需要我为你做的可选项：
- 生成 `systemd` 单元文件并提交到仓库（示例）
- 生成 `nginx` 配置文件模板并提交
- 根据你的域名/路径生成并填充 `/etc/chat-community/api.env` 样例

告诉我你要我继续做哪一项，我会把对应文件直接添加到仓库或把内容拷贝给你。

---
文件：`DEPLOY_MANUAL.md` 生成于仓库根。
