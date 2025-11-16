#!/usr/bin/env bash
set -euo pipefail

# deploy_ubuntu.sh
# 自动化部署脚本（Ubuntu）——用于在 DigitalOcean / Ubuntu Droplet 上从源码部署 chat-community
# 使用说明:
#   1. 将此脚本上传到服务器或在仓库根目录执行
#   2. 以非 root 用户运行：bash deploy_ubuntu.sh
#   3. 脚本会提示仓库 URL、分支与域名，并执行安装、构建、迁移与启动（pm2 + nginx + certbot）

REPO_DEFAULT="https://github.com/DecFR/chat-community.git"
DEFAULT_BRANCH="master"

read -p "Repository URL [${REPO_DEFAULT}]: " REPO_URL
REPO_URL=${REPO_URL:-$REPO_DEFAULT}
read -p "Branch to deploy [${DEFAULT_BRANCH}]: " BRANCH
BRANCH=${BRANCH:-$DEFAULT_BRANCH}
read -p "Domain for site (leave empty to skip nginx/certbot): " DOMAIN

if [ "$EUID" -eq 0 ]; then
  echo "请不要以 root 用户运行此脚本。使用普通用户并具有 sudo 权限。"
  exit 1
fi

echo "部署配置： repo=${REPO_URL} branch=${BRANCH} domain=${DOMAIN}"

sudo apt update
sudo apt upgrade -y
sudo apt install -y curl git build-essential nginx ufw

# Node 20
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d"v" -f2 | cut -d'.' -f1)" -lt 20 ]; then
  echo "安装 Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

corepack enable || true
corepack prepare pnpm@latest --activate || true

if ! command -v pm2 >/dev/null 2>&1; then
  sudo npm install -g pm2
fi

if [ -n "$DOMAIN" ]; then
  sudo apt install -y certbot python3-certbot-nginx
fi

# create deploy dir
WORKDIR="/var/www/chat-community"
sudo mkdir -p "$WORKDIR"
sudo chown "$USER":"$USER" "$WORKDIR"
cd "$WORKDIR"

if [ -d .git ]; then
  echo "已有仓库，拉取并切换分支"
  git fetch --all --prune
  git checkout "$BRANCH"
  git pull origin "$BRANCH"
else
  echo "克隆仓库 ${REPO_URL} -> ${WORKDIR}"
  git clone "$REPO_URL" .
  git checkout "$BRANCH" || git checkout -b "$BRANCH"
fi

echo "复制 .env 示例并提醒填写（若已存在 .env 则保留）"
if [ ! -f packages/api/.env ]; then
  if [ -f packages/api/.env.example ]; then
    cp packages/api/.env.example packages/api/.env
    echo "已复制 packages/api/.env.example -> packages/api/.env，请编辑该文件并设置 DATABASE_URL 等真实值。"
    echo "现在暂停以便你编辑 .env（按回车继续）"
    read -r
  else
    echo "未找到 packages/api/.env.example，请手动创建 packages/api/.env。"
    exit 1
  fi
else
  echo "检测到 packages/api/.env 已存在，跳过复制。"
fi

echo "安装依赖（pnpm）并构建项目..."
pnpm install --frozen-lockfile || pnpm install

cd packages/api

echo "准备 Prisma 客户端与数据库迁移（请确保 DATABASE_URL 配置正确并已备份 DB）"
read -p "已备份数据库并确认要运行生产迁移？ (y/N): " CONFIRM_MIG
CONFIRM_MIG=${CONFIRM_MIG:-N}
if [ "$CONFIRM_MIG" = "y" ] || [ "$CONFIRM_MIG" = "Y" ]; then
  pnpm prisma migrate deploy
else
  echo "跳过 prisma migrate deploy。你可以稍后手动运行： pnpm prisma migrate deploy"
fi

pnpm prisma generate || true
pnpm build

cd ../client
pnpm build
cd ../..

echo "创建上传与日志目录"
mkdir -p packages/api/uploads packages/api/logs
chmod 755 packages/api/uploads

echo "使用 PM2 启动后端"
cd packages/api
pm2 delete chat-api 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
pm2 startup || true

cd "$WORKDIR"

if [ -n "$DOMAIN" ]; then
  echo "配置 Nginx..."
  NGINX_CONF="/etc/nginx/sites-available/chat-community"
  sudo tee "$NGINX_CONF" >/dev/null <<EOF
server {
    listen 80;
    server_name ${DOMAIN};

    root ${WORKDIR}/packages/client/dist;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

  sudo ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/chat-community
  sudo nginx -t
  sudo systemctl restart nginx

  echo "尝试为 ${DOMAIN} 获取证书（Certbot）"
  sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m admin@${DOMAIN} || echo "certbot 失败，可手动运行 certbot 来获取证书"
fi

echo "部署完成。检查 PM2 状态和日志： pm2 status && pm2 logs chat-api"
echo "检查 Nginx 状态与 HTTPS（如已配置）"

cat <<'SUMMARY'
快速检查列表：
- API: curl -I http://127.0.0.1:3000/health
- 前端: https://<domain>/
- PM2: pm2 status
- Nginx: sudo systemctl status nginx
SUMMARY

exit 0
