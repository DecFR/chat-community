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

### 生成安全密钥（推荐）

建议使用安全的随机字节生成器来创建密钥，而不要手工编写或使用短文本。下面是一些常用方式（任选其一）。

- 使用 OpenSSL（Linux / macOS）：

  - 生成用于 `JWT_SECRET` 的 Base64 字符串（48 字节 -> 更长更安全）：
    ```bash
    openssl rand -base64 48
    ```

  - 生成用于 `ENCRYPTION_KEY` 的 32 字节十六进制（64 字符 hex）：
    ```bash
    openssl rand -hex 32
    ```

- 使用 Node.js（跨平台，适合已安装 Node 的环境）：

  - 生成 `JWT_SECRET`（Base64）：
    ```bash
    node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
    ```

  - 生成 `ENCRYPTION_KEY`（32 字节 hex）：
    ```bash
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    ```

- 使用 PowerShell（Windows / pwsh）：

  - 生成 `JWT_SECRET`（Base64）：
    ```powershell
    $b = New-Object 'System.Byte[]' 48; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
    ```

  - 生成 `ENCRYPTION_KEY`（32 字节 hex）：
    ```powershell
    $b = New-Object 'System.Byte[]' 32; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); ($b | ForEach-Object { $_.ToString('x2') }) -join ''
    ```

把生成的值粘回到 `/etc/chat-community/api.env` 或 `packages/api/.env` 的相应字段中，确保文件权限为 `600` 并且只有服务运行用户可读。

重要说明：仓库中默认不包含 `packages/api/.env` 文件（这是敏感凭据），因此在服务器上需要手动创建该文件或确保环境变量已通过 `/etc/chat-community/api.env`、systemd `EnvironmentFile` 或 shell `source` 的方式加载到运行迁移/启动服务的进程中。

在服务器 `packages/api` 目录中创建 `.env` 的示例：
```bash
cd /opt/chat-community/packages/api
cat > .env <<'EOF'
DATABASE_URL="postgresql://chatuser:yourpassword@127.0.0.1:5432/chat_community?schema=public"
JWT_SECRET="replace-with-a-strong-jwt-secret"
ENCRYPTION_KEY="replace-with-32-byte-hex-64chars"
PORT=3000
NODE_ENV=production
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760
EOF
chmod 600 .env
```

创建后，在当前 shell 导入并运行 Prisma 迁移：
```bash
set -o allexport
source .env
set +o allexport
pnpm run prisma:generate
pnpm run prisma:migrate
```

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

### 快速修复：创建服务用户与日志目录权限

如果在启动时遇到 `status=217/USER` 或日志目录权限错误（例如 `EACCES: permission denied, mkdir '/opt/chat-community/packages/api/logs'`），可先运行下面的命令确保服务用户与日志目录存在并具有正确权限：

```bash
# 如果 chatuser 不存在，先创建（推荐长期使用）
useradd -r -m -d /opt/chat-community -s /usr/sbin/nologin chatuser

# 创建日志目录并归属 chatuser
mkdir -p /opt/chat-community/packages/api/logs
chown -R chatuser:chatuser /opt/chat-community/packages/api/logs

# 也确保工作目录归该用户（防止其它写权限问题）
chown -R chatuser:chatuser /opt/chat-community/packages/api

# 设置合理权限
chmod 750 /opt/chat-community/packages/api/logs

# 重启服务并查看日志
systemctl restart chat-community-api.service
journalctl -u chat-community-api.service -f
```

说明：上面通过 `chown` 把工作目录和日志目录的所有权交给服务运行用户（`chatuser`），并通过 `chmod` 限制访问权限。也可以在 systemd 单元中添加 `ExecStartPre` 指令，由 root 在启动前创建并 chown 日志目录。

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

示例 `nginx` 配置（放在 `/etc/nginx/sites-available/chat-community.conf`）：
```nginx
# upstream 定义（后端 API）
upstream chat_api {
  server 127.0.0.1:3000;
  # 如需 socket 代理到不同端口或进程，添加相应 server 行
}

# HTTP: 只处理 ACME challenge，并将其它请求重定向到 HTTPS
server {
  listen 80;
  listen [::]:80;
  server_name your_domain.com; # 替换为你的域名

  # Certbot 的 http-01 验证路径（如果使用 webroot 插件）
  location /.well-known/acme-challenge/ {
    root /var/www/letsencrypt;
  }

  # 其余流量永久重定向到 HTTPS
  location / {
    return 301 https://$host$request_uri;
  }
}

# HTTPS 主站点：前端静态 + 后端代理
server {
  listen 443 ssl http2;
  listen [::]:443 ssl http2;
  server_name your_domain.com; # 替换为你的域名

  # SSL 证书路径（示例使用系统默认位置，按你实际证书路径替换）
  ssl_certificate /etc/ssl/certs/your_domain.com.crt;
  ssl_certificate_key /etc/ssl/private/your_domain.com.key;
  # 如果你的证书提供了单独的中间证书链文件，可在此指定（可选）
  ssl_trusted_certificate /etc/ssl/certs/your_domain.com.chain.crt;

  # 安全优化（推荐）
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_prefer_server_ciphers on;
  ssl_session_timeout 1d;
  ssl_session_cache shared:SSL:50m;
  ssl_stapling on;
  ssl_stapling_verify on;

  # 站点安全头部
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header Referrer-Policy "no-referrer-when-downgrade" always;
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

  # 前端静态文件（SPA）
  root /var/www/chat-community/client; # 请确保已把前端构建输出复制到此目录
  index index.html;

  # 对 SPA 路由使用 try_files 回退到 index.html
  location / {
    try_files $uri $uri/ /index.html;
    # 对静态文件使用缓存
    expires 1d;
    add_header Cache-Control "public, no-transform";
  }

  # 将 /api/ 请求代理到后端（API 与 WebSocket）
  location /api/ {
    proxy_pass http://chat_api/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 86400;
    proxy_send_timeout 86400;
    proxy_connect_timeout 30s;
    # WebSocket 性能优化
    proxy_buffering off;
  }

  # 如果后端直接在根路径提供 API（非 /api 前缀），保留一个 healthcheck 代理
  location = /healthz {
    proxy_pass http://chat_api/healthz;
    proxy_set_header Host $host;
  }

  # 文件上传与大请求设置（根据应用需求调整）
  client_max_body_size 50M;

  # 访问日志和错误日志（可按需修改路径）
  access_log /var/log/nginx/chat-community.access.log;
  error_log /var/log/nginx/chat-community.error.log warn;
}

# helper: 将 Upgrade header 适配成 Connection 值
map $http_upgrade $connection_upgrade {
  default upgrade;
  ''      close;
}

```
```

启用站点并重载 nginx：
```bash
ln -s /etc/nginx/sites-available/chat-community.conf /etc/nginx/sites-enabled/chat-community.conf
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

