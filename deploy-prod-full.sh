#!/bin/bash
# Chat Community 完整自动化生产部署脚本
# 适用于 Ubuntu 24.04 LTS，自动安装 Node.js、pnpm、PostgreSQL、nginx、pm2

set -e

# 0. 环境依赖自动安装

if ! command -v node >/dev/null 2>&1; then
  echo "安装 Node.js 最新 LTS (22.x)..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  echo "Node.js 已安装，跳过。"
fi

# pnpm

if ! command -v pnpm >/dev/null 2>&1; then
  echo "安装 pnpm 最新 LTS (9.x)..."
  npm install -g pnpm@latest
else
  echo "pnpm 已安装，跳过。"
fi


# PostgreSQL
if ! command -v psql >/dev/null 2>&1; then
  echo "安装 PostgreSQL 最新版 (18.x)..."
  sudo apt-get update
  sudo apt-get install -y wget ca-certificates
  wget -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg
  echo "deb http://apt.postgresql.org/pub/repos/apt/ $(lsb_release -cs)-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list
  sudo apt-get update
  sudo apt-get install -y postgresql-18 postgresql-contrib
  sudo systemctl enable postgresql
  sudo systemctl start postgresql
else
  echo "PostgreSQL 已安装，跳过。"
fi

# nginx
if ! command -v nginx >/dev/null 2>&1; then
  echo "安装 nginx 最新稳定版 (1.26.x)..."
  sudo apt-get install -y nginx
  sudo systemctl enable nginx
  sudo systemctl start nginx
else
  echo "nginx 已安装，跳过。"
fi

# pm2
if ! command -v pm2 >/dev/null 2>&1; then
  echo "安装 pm2 最新 LTS (5.x)..."
  npm install -g pm2@latest
else
  echo "pm2 已安装，跳过。"
fi
fi

# pm2
if ! command -v pm2 >/dev/null 2>&1; then
  echo "安装 pm2..."
  npm install -g pm2
else
  echo "pm2 已安装，跳过。"
fi

# 1. 拉取最新代码（如用 git）
if [ -d .git ]; then
  echo "拉取最新代码..."
  git pull origin main
fi

# 2. 安装依赖
echo "安装依赖..."
pnpm install

# 3. 环境变量配置
if [ ! -f packages/api/.env ]; then
  cp packages/api/.env.example packages/api/.env
  echo "请编辑 packages/api/.env，填写生产数据库、密钥等信息。"
fi
if [ ! -f packages/client/.env ]; then
  cp packages/client/.env.example packages/client/.env
  echo "请编辑 packages/client/.env，填写生产 API 地址。"
fi

# 4. 初始化数据库（首次部署需执行）
echo "初始化数据库..."
pnpm run setup:db

# 5. 构建前后端
echo "构建前后端..."
pnpm build

# 6. 启动后端服务（使用 pm2 管理）
echo "启动后端服务..."
cd packages/api
pm2 start dist/server.js --name chat-api --update-env
cd ../client

# 7. 构建前端后，将 dist 目录交由 nginx 托管
NGINX_CONF_PATH="/etc/nginx/sites-available/chat-community.conf"
FRONTEND_DIST_PATH="$(pwd)/dist"

if [ -d "$FRONTEND_DIST_PATH" ]; then
  echo "生成 nginx 配置..."
  cat <<EOF > $NGINX_CONF_PATH
  # HTTP (端口 80) 流量将被永久重定向到 HTTPS
  server {
    listen 80;
    listen [::]:80;
    server_name your_domain.com;
    return 301 https://$server_name$request_uri;
  }

  # HTTPS (端口 443) 服务配置
  server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name your_domain.com;

    # --- SSL 证书路径 ---
    ssl_certificate /etc/ssl/certs/your_domain.com.pem;
    ssl_certificate_key /etc/ssl/private/your_domain.com.key;

    # --- 推荐的 SSL 安全配置 ---
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;

    # 文件上传最大 100MB
    client_max_body_size 100M;

    # 静态文件服务
    location / {
      root $FRONTEND_DIST_PATH;
      try_files $uri $uri/ /index.html;
    }

    # API 代理
    location /api/ {
      proxy_pass http://localhost:3000/api/;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket 支持
    location /socket.io/ {
      proxy_pass http://localhost:3000/socket.io/;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
    }
  }
EOF
  ln -sf $NGINX_CONF_PATH /etc/nginx/sites-enabled/chat-community.conf
  echo "重载 nginx..."
  nginx -s reload
else
  echo "前端 dist 目录不存在，跳过 nginx 配置。"
fi

# 8. 检查服务状态
pm2 status

# 9. 日志查看
pm2 logs chat-api

# 10. 备份数据库与 .env 文件，定期维护

echo "生产部署完成，请检查 nginx、数据库与服务状态。"
