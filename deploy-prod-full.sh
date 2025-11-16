#!/bin/bash
# 自动检测 root 并创建自定义服务用户，配置免密 sudo
if [ "$EUID" -eq 0 ]; then
  echo "检测到当前为 root 用户，推荐使用专用服务用户部署。"
  read -p "请输入要创建的服务用户名（如 chat-svc）: " SVC_USER
  if [ -z "$SVC_USER" ]; then
    SVC_USER="chat-svc"
    echo "未输入，默认使用 chat-svc。"
  fi
  if id "$SVC_USER" &>/dev/null; then
    echo "检测到同名用户 $SVC_USER，正在删除..."
    userdel -r "$SVC_USER" 2>/dev/null || true
    rm -rf "/home/$SVC_USER"
    rm -f "/etc/sudoers.d/$SVC_USER"
    echo "已删除旧用户 $SVC_USER。"
  fi
  useradd -m -s /bin/bash "$SVC_USER"
  echo "$SVC_USER ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/$SVC_USER
  chmod 440 /etc/sudoers.d/$SVC_USER
  echo "已创建服务用户 $SVC_USER（带家目录和 bash shell）并配置免密 sudo。"
  echo "请用如下命令切换到服务用户并重新运行本脚本："
  echo "sudo -iu $SVC_USER"
  exit 0
fi
# Chat Community 完整自动化生产部署脚本
# 适用于 Ubuntu 24.04 LTS，自动安装 Node.js、pnpm、PostgreSQL、nginx、pm2


# 推荐使用专用服务用户（如 chat-svc），避免直接用 root 部署，提高安全性。
# 创建服务用户命令： sudo adduser --system --group chat-svc
# 部署建议：
# 1. 推荐用 chat-svc 或类似专用用户运行本脚本，且仅赋予必要 sudo 权限（如 apt、systemctl、npm 全局安装等）。
# 2. root 用户仅用于首次环境初始化或特殊维护。
# 3. 普通用户运行时，脚本会自动加 sudo，确保依赖安装和服务管理无障碍。
if [ "$EUID" -eq 0 ]; then
  SUDO=""
  echo "[提示] 当前以 root 用户运行，所有命令无需 sudo。建议后续使用专用服务用户（如 chat-svc）部署，提高安全性。"
else
  SUDO="sudo"
  echo "[提示] 当前以普通用户运行，部分命令将自动加 sudo。推荐使用 chat-svc 等专用服务用户部署，避免直接用 root。"
fi

echo "[安全加固] 自动清理旧文件、备份数据库、设置权限..."
# 清理前端 dist 目录（部署前，防止残留旧文件）
rm -rf packages/client/dist/* || true
# 清理 uploads 目录下 30 天前的文件
find packages/api/uploads -type f -mtime +30 -exec rm -f {} \; 2>/dev/null || true
# 清理 pm2 日志（30 天前）
find ~/.pm2/logs -type f -mtime +30 -exec rm -f {} \; 2>/dev/null || true
# 清理 nginx 日志（30 天前）
$SUDO find /var/log/nginx -type f -mtime +30 -exec rm -f {} \; 2>/dev/null || true

# 数据库自动备份（部署前）
PG_BACKUP=backup_$(date +%Y%m%d_%H%M%S).sql
$SUDO -u postgres pg_dump chat_community > /tmp/$PG_BACKUP 2>/dev/null && echo "数据库已备份到 /tmp/$PG_BACKUP" || echo "数据库备份失败，跳过。"

# 自动执行 Prisma 数据库迁移（如有）
cd packages/api
if [ -d "prisma/migrations" ]; then
  echo "执行数据库迁移..."
  pnpm prisma migrate deploy || echo "数据库迁移失败，请检查。"
fi
cd ../..

# 自动检测端口占用并释放（3000）
if $SUDO lsof -i:3000 | grep LISTEN; then
  $SUDO fuser -k 3000/tcp || true
fi

# 自动检测磁盘空间
df -h | grep -E '^/|Filesystem' || true

# 自动设置 .env 文件权限
$SUDO chmod 600 packages/api/.env 2>/dev/null || true
$SUDO chmod 600 packages/client/.env 2>/dev/null || true

echo "自动关闭旧服务..."
$SUDO pm2 stop chat-api || true
$SUDO pm2 delete chat-api || true
$SUDO systemctl stop nginx || true

set -e

# 0. 环境依赖自动安装


# Node.js

# 检查并卸载已安装 Node.js
if command -v node >/dev/null 2>&1; then
  echo "检测到已安装 Node.js。是否卸载并重新安装？(y/N)"
  read -r CONFIRM_NODE
  if [[ "$CONFIRM_NODE" =~ ^[Yy]$ ]]; then
    echo "正在卸载 Node.js..."
    $SUDO apt-get remove -y nodejs npm || true
    $SUDO apt-get purge -y nodejs npm || true
    $SUDO rm -rf /usr/local/lib/node_modules /usr/lib/node_modules /usr/local/bin/node /usr/bin/node /usr/local/bin/npm /usr/bin/npm
  else
    echo "跳过 Node.js 卸载和安装。"
    NODE_SKIP_INSTALL=1
  fi
fi
if [ -z "$NODE_SKIP_INSTALL" ]; then
  echo "安装 Node.js 最新 LTS (22.x)..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | $SUDO -E bash -
  $SUDO apt-get install -y nodejs
fi

# pnpm

# 检查并卸载已安装 pnpm
if command -v pnpm >/dev/null 2>&1; then
  echo "检测到已安装 pnpm。是否卸载并重新安装？(y/N)"
  read -r CONFIRM_PNPM
  if [[ "$CONFIRM_PNPM" =~ ^[Yy]$ ]]; then
    echo "正在卸载 pnpm..."
    $SUDO npm uninstall -g pnpm || true
    $SUDO rm -rf /usr/local/bin/pnpm /usr/bin/pnpm
  else
    echo "跳过 pnpm 卸载和安装。"
    PNPM_SKIP_INSTALL=1
  fi
fi
if [ -z "$PNPM_SKIP_INSTALL" ]; then
  echo "安装 pnpm 最新 LTS (9.x)..."
  $SUDO npm install -g pnpm@latest
fi

# PostgreSQL

# 检查并卸载已安装 PostgreSQL
if command -v psql >/dev/null 2>&1; then
  echo "检测到已安装 PostgreSQL。是否卸载并重新安装？(y/N)"
  read -r CONFIRM_PG
  if [[ "$CONFIRM_PG" =~ ^[Yy]$ ]]; then
    echo "正在卸载 PostgreSQL..."
    $SUDO systemctl stop postgresql || true
    $SUDO apt-get remove -y postgresql* || true
    $SUDO apt-get purge -y postgresql* || true
    $SUDO rm -rf /var/lib/postgresql /etc/postgresql /etc/postgresql-common /usr/lib/postgresql /usr/share/postgresql /var/log/postgresql
  else
    echo "跳过 PostgreSQL 卸载和安装。"
    PG_SKIP_INSTALL=1
  fi
fi
if [ -z "$PG_SKIP_INSTALL" ]; then
  echo "安装 PostgreSQL 最新版 (18.x)..."
  $SUDO apt-get update
  $SUDO apt-get install -y wget ca-certificates
  if [ -f /etc/apt/trusted.gpg.d/postgresql.gpg ]; then
    $SUDO rm -f /etc/apt/trusted.gpg.d/postgresql.gpg
  fi
  wget -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | $SUDO gpg --dearmor --yes -o /etc/apt/trusted.gpg.d/postgresql.gpg
  echo "deb http://apt.postgresql.org/pub/repos/apt/ $(lsb_release -cs)-pgdg main" | $SUDO tee /etc/apt/sources.list.d/pgdg.list
  $SUDO apt-get update
  $SUDO apt-get install -y postgresql-18 postgresql-contrib
  $SUDO systemctl enable postgresql
  $SUDO systemctl start postgresql
fi

# nginx

# 检查并卸载已安装 nginx
if command -v nginx >/dev/null 2>&1; then
  echo "检测到已安装 nginx。是否卸载并重新安装？(y/N)"
  read -r CONFIRM_NGINX
  if [[ "$CONFIRM_NGINX" =~ ^[Yy]$ ]]; then
    echo "正在卸载 nginx..."
    $SUDO systemctl stop nginx || true
    $SUDO apt-get remove -y nginx* || true
    $SUDO apt-get purge -y nginx* || true
    $SUDO rm -rf /etc/nginx /var/log/nginx /var/www/html
  else
    echo "跳过 nginx 卸载和安装。"
    NGINX_SKIP_INSTALL=1
  fi
fi
if [ -z "$NGINX_SKIP_INSTALL" ]; then
  echo "安装 nginx 最新稳定版 (1.26.x)..."
  $SUDO apt-get install -y nginx
  $SUDO systemctl enable nginx
  $SUDO systemctl start nginx
fi

# pm2

# 检查并卸载已安装 pm2
if command -v pm2 >/dev/null 2>&1; then
  echo "检测到已安装 pm2。是否卸载并重新安装？(y/N)"
  read -r CONFIRM_PM2
  if [[ "$CONFIRM_PM2" =~ ^[Yy]$ ]]; then
    echo "正在卸载 pm2..."
    $SUDO pm2 kill || true
    $SUDO npm uninstall -g pm2 || true
    $SUDO rm -rf /usr/local/bin/pm2 /usr/bin/pm2 ~/.pm2
  else
    echo "跳过 pm2 卸载和安装。"
    PM2_SKIP_INSTALL=1
  fi
fi
if [ -z "$PM2_SKIP_INSTALL" ]; then
  echo "安装 pm2 最新 LTS (5.x)..."
  $SUDO npm install -g pm2@latest
fi

# 1. 拉取最新代码（如用 git）
if [ -d .git ]; then
  echo "拉取最新代码..."
  git pull origin master
fi

# 2. 安装依赖
echo "安装依赖..."
$SUDO pnpm install

# 3. 环境变量配置
if [ -f packages/api/.env ]; then
  # 先赋予读写权限，防止 grep/sed 权限报错
  $SUDO chmod 600 packages/api/.env 2>/dev/null || true
  # 检查 ENCRYPTION_KEY 格式是否正确，不正确则自动修复
  OLD_KEY=$(grep '^ENCRYPTION_KEY=' packages/api/.env | cut -d'=' -f2)
  if ! echo "$OLD_KEY" | grep -Eq '^[0-9a-fA-F]{64}$'; then
    echo "检测到 ENCRYPTION_KEY 格式错误，自动修复..."
    $SUDO chmod 600 packages/api/.env 2>/dev/null || true
    NEW_KEY=$(openssl rand -hex 32)
    $SUDO sed -i "s/^ENCRYPTION_KEY=.*/ENCRYPTION_KEY=$NEW_KEY/" packages/api/.env
  fi
fi
if [ ! -f packages/api/.env ]; then
  echo "自动生成生产环境 .env 文件..."
  DB_PASS=$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 16)
  JWT_SECRET=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32)
  ENC_KEY=$(openssl rand -hex 32)
  $SUDO tee packages/api/.env > /dev/null <<EOF
DATABASE_URL="postgresql://postgres:$DB_PASS@localhost:5432/chat_community?schema=public"
JWT_SECRET="$JWT_SECRET"
ENCRYPTION_KEY="$ENC_KEY"
PORT=3000
NODE_ENV=production
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=104857600
AVATAR_MAX_FILE_SIZE=31457280
EOF
  $SUDO chmod 600 packages/api/.env 2>/dev/null || true
  echo "已自动生成 packages/api/.env，数据库密码已自动设置。"
fi
# 无论 .env 是新生成还是已存在，统一自动同步数据库密码
if [ -f packages/api/.env ]; then
  $SUDO chmod 600 packages/api/.env 2>/dev/null || true
  # 检查 PostgreSQL 是否已安装
  if command -v psql >/dev/null 2>&1; then
    # 确保 PostgreSQL 服务正在运行
    if ! $SUDO systemctl is-active --quiet postgresql; then
      echo "PostgreSQL 服务未运行，正在启动..."
      $SUDO systemctl start postgresql
    fi
    DB_URL=$(grep '^DATABASE_URL=' packages/api/.env | cut -d'=' -f2 | tr -d '"')
    DB_PASS=$(echo "$DB_URL" | sed -n 's|postgresql://postgres:\([^@]*\)@.*|\1|p')
    if [ -n "$DB_PASS" ]; then
      echo "同步数据库密码..."
      $SUDO -u postgres psql -c "ALTER USER postgres WITH PASSWORD '$DB_PASS';" || echo "数据库密码同步失败，请检查 PostgreSQL 状态。"
    fi
  else
    echo "PostgreSQL 未安装，跳过数据库密码同步。"
  fi
fi
if [ ! -f packages/client/.env ]; then
  echo "自动生成前端 .env 文件..."
  SERVER_IP=$(hostname -I | awk '{print $1}')
  if [ -z "$SERVER_IP" ]; then
    echo "未能自动检测服务器 IP，请手动填写 VITE_API_URL。"
    SERVER_IP="127.0.0.1"
  fi
  $SUDO tee packages/client/.env > /dev/null <<EOF
VITE_API_URL=http://$SERVER_IP:3000/api
VITE_SOCKET_URL=http://$SERVER_IP:3000
EOF
  echo "已自动生成 packages/client/.env，API 地址为 http://$SERVER_IP:3000/api。"
fi

# 4. 初始化数据库（首次部署需执行）
if command -v psql >/dev/null 2>&1; then
  echo "初始化数据库..."
  $SUDO pnpm run setup:db
else
  echo "PostgreSQL 未安装，跳过数据库初始化。"
fi

# 5. 构建前后端
echo "构建前后端..."
$SUDO pnpm build

# 自动修复静态文件和上传目录权限，确保 nginx/后端可读
$SUDO chown -R $USER:$USER packages/client/dist
$SUDO chmod -R 755 packages/client/dist
# 自动创建 uploads 目录（如不存在）
if [ ! -d packages/api/uploads ]; then
  mkdir -p packages/api/uploads
fi
$SUDO chown -R $USER:$USER packages/api/uploads
$SUDO chmod -R 755 packages/api/uploads

# 6. 启动后端服务（使用 pm2 管理）
echo "启动后端服务..."
cd packages/api
# 自动检测构建产物 dist/server.js 是否存在
if [ ! -f dist/server.js ]; then
  echo "[错误] 构建产物 dist/server.js 不存在，后端无法启动！请检查 pnpm build 输出。"
  cd ../..
  exit 1
fi
if $SUDO pm2 list | grep -q "chat-api"; then
  $SUDO pm2 restart chat-api --update-env
else
  $SUDO pm2 start dist/server.js --name chat-api --update-env
fi
cd ../..
cd packages/client

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
  $SUDO tee $NGINX_CONF_PATH > /dev/null <<EOF
# 安全加固：添加常用安全头部
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' ws: wss:;" always;
server_tokens off;
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
  $SUDO ln -sf $NGINX_CONF_PATH /etc/nginx/sites-enabled/chat-community.conf
  echo "重载 nginx..."
  $SUDO systemctl restart nginx
  echo "$DOMAIN_MSG"
  echo "$CERT_MSG"
  echo "$KEY_MSG"
else
  echo "前端 dist 目录不存在，跳过 nginx 配置。"
fi

# 8. 检查服务状态
pm2 status

# 9. 日志查看
# pm2 logs chat-api

# 10. 备份数据库与 .env 文件，定期维护

echo "生产部署完成，请检查 nginx、数据库与服务状态。"
