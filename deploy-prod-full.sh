#!/bin/bash
# Chat Community 完整自动化生产部署脚本
# 适用于 Ubuntu 24.04 LTS，自动安装 Node.js、pnpm、PostgreSQL、nginx、pm2

echo "自动关闭旧服务..."
pm2 stop chat-api || true
pm2 delete chat-api || true
sudo systemctl stop nginx || true

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
  if [ -f /etc/apt/trusted.gpg.d/postgresql.gpg ]; then
    sudo rm -f /etc/apt/trusted.gpg.d/postgresql.gpg
  fi
  wget -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo gpg --dearmor --yes -o /etc/apt/trusted.gpg.d/postgresql.gpg
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

if ! command -v pm2 >/dev/null 2>&1; then
  echo "安装 pm2 最新 LTS (5.x)..."
  npm install -g pm2@latest
else
  echo "pm2 已安装，跳过。"
fi

# 1. 拉取最新代码（如用 git）
if [ -d .git ]; then
  echo "拉取最新代码..."
  git pull origin master
fi

# 2. 安装依赖
echo "安装依赖..."
pnpm install

# 3. 环境变量配置
if [ ! -f packages/api/.env ]; then
  echo "自动生成生产环境 .env 文件..."
  DB_PASS=$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 16)
  JWT_SECRET=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32)
  ENC_KEY=$(openssl rand -hex 64)
  sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD '$DB_PASS';"
  cat > packages/api/.env <<EOF
DATABASE_URL="postgresql://postgres:$DB_PASS@localhost:5432/chat_community?schema=public"
JWT_SECRET="$JWT_SECRET"
ENCRYPTION_KEY="$ENC_KEY"
PORT=3000
NODE_ENV=production
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=104857600
AVATAR_MAX_FILE_SIZE=31457280
EOF
  echo "已自动生成 packages/api/.env，数据库密码已自动设置。"
fi
if [ ! -f packages/client/.env ]; then
  echo "自动生成前端 .env 文件..."
  SERVER_IP=$(hostname -I | awk '{print $1}')
  if [ -z "$SERVER_IP" ]; then
    echo "未能自动检测服务器 IP，请手动填写 VITE_API_URL。"
    SERVER_IP="127.0.0.1"
  fi
  cat > packages/client/.env <<EOF
VITE_API_URL=http://$SERVER_IP:3000/api
VITE_SOCKET_URL=http://$SERVER_IP:3000
EOF
  echo "已自动生成 packages/client/.env，API 地址为 http://$SERVER_IP:3000/api。"
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
pm2 restart chat-api || pm2 start dist/server.js --name chat-api --update-env
cd ../client

# 7. 构建前端后，将 dist 目录交由 nginx 托管
NGINX_CONF_PATH="/etc/nginx/sites-available/chat-community.conf"
FRONTEND_DIST_PATH="$(pwd)/dist"

if [ -d "$FRONTEND_DIST_PATH" ]; then
  echo "请输入你的域名（如 chat.example.com），直接回车则留空："
  read DOMAIN_NAME
  if [ -z "$DOMAIN_NAME" ]; then
    DOMAIN_NAME="your_domain.com"
    DOMAIN_MSG="未输入域名，已使用默认 your_domain.com。请部署后手动修改 $NGINX_CONF_PATH 并重载 nginx。"
  else
    DOMAIN_MSG="已设置域名为 $DOMAIN_NAME。"
  fi
  echo "请输入 SSL 证书路径（如 /etc/ssl/certs/chat.pem），直接回车则留空："
  read SSL_CERT_PATH
  if [ -z "$SSL_CERT_PATH" ]; then
    SSL_CERT_PATH="/etc/ssl/certs/$DOMAIN_NAME.pem"
    CERT_MSG="未输入证书路径，已使用默认 $SSL_CERT_PATH。请部署后手动修改 $NGINX_CONF_PATH 并重载 nginx。"
  else
    CERT_MSG="已设置证书路径为 $SSL_CERT_PATH。"
  fi
  echo "请输入 SSL 密钥路径（如 /etc/ssl/private/chat.key），直接回车则留空："
  read SSL_KEY_PATH
  if [ -z "$SSL_KEY_PATH" ]; then
    SSL_KEY_PATH="/etc/ssl/private/$DOMAIN_NAME.key"
    KEY_MSG="未输入密钥路径，已使用默认 $SSL_KEY_PATH。请部署后手动修改 $NGINX_CONF_PATH 并重载 nginx。"
  else
    KEY_MSG="已设置密钥路径为 $SSL_KEY_PATH。"
  fi
  echo "生成 nginx 配置..."
  cat > $NGINX_CONF_PATH <<EOF
# HTTP (端口 80) 流量将被永久重定向到 HTTPS
server {
  listen 80;
  listen [::]:80;
  server_name $DOMAIN_NAME;
  return 301 https://$DOMAIN_NAME$request_uri;
}

# HTTPS (端口 443) 服务配置
server {
  listen 443 ssl http2;
  listen [::]:443 ssl http2;
  server_name $DOMAIN_NAME;

  # --- SSL 证书路径 ---
  ssl_certificate $SSL_CERT_PATH;
  ssl_certificate_key $SSL_KEY_PATH;

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
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }

  # WebSocket 支持
  location /socket.io/ {
    proxy_pass http://localhost:3000/socket.io/;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
}
EOF
  ln -sf $NGINX_CONF_PATH /etc/nginx/sites-enabled/chat-community.conf
  echo "重载 nginx..."
  sudo nginx -s reload
  echo "$DOMAIN_MSG"
  echo "$CERT_MSG"
  echo "$KEY_MSG"
else
  echo "前端 dist 目录不存在，跳过 nginx 配置。"
fi

# 8. 检查服务状态
pm2 status

# 9. 日志查看
pm2 logs chat-api

# 10. 备份数据库与 .env 文件，定期维护

echo "生产部署完成，请检查 nginx、数据库与服务状态。"
