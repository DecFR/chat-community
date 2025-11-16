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

# 如果以 root 运行，提示可自动创建一个带 sudo 权限的普通用户并复制 SSH 公钥。
# 脚本默认不推荐以 root 直接运行；创建用户后会自动切换为该用户并继续执行脚本。
NEW_USER="DecFR"
SCRIPTPATH="$(pwd)"
if [ "$EUID" -eq 0 ]; then
  echo "检测到以 root 身份运行脚本。脚本建议使用非 root 用户运行（带 sudo 权限）。"
  read -p "是否创建用户 '$NEW_USER' 并配置 sudo 与 SSH 公钥，然后以该用户继续执行脚本？ (Y/n): " CREATE_USER
  CREATE_USER=${CREATE_USER:-Y}
  if [ "$CREATE_USER" = "Y" ] || [ "$CREATE_USER" = "y" ]; then
    if id -u "$NEW_USER" >/dev/null 2>&1; then
      echo "用户 '$NEW_USER' 已存在。跳过创建步骤。"
    else
      echo "正在创建用户 '$NEW_USER'..."
      if ! useradd -m -s /bin/bash "$NEW_USER" >/dev/null 2>&1; then
        echo "useradd 失败，尝试使用 adduser 备选方式..."
        adduser --disabled-password --gecos "" "$NEW_USER" || true
      fi
      passwd -d "$NEW_USER" >/dev/null 2>&1 || true
      usermod -aG sudo "$NEW_USER" || true

      SSH_DIR="/home/$NEW_USER/.ssh"
      mkdir -p "$SSH_DIR"
      chown "$NEW_USER":"$NEW_USER" "$SSH_DIR"
      chmod 700 "$SSH_DIR"
      if [ -f /root/.ssh/authorized_keys ]; then
        cp /root/.ssh/authorized_keys "$SSH_DIR/authorized_keys"
        chown "$NEW_USER":"$NEW_USER" "$SSH_DIR/authorized_keys"
        chmod 600 "$SSH_DIR/authorized_keys"
        echo "已复制 root 的 SSH 公钥到 $SSH_DIR/authorized_keys"
      else
        echo "未找到 /root/.ssh/authorized_keys；请手动将公钥追加到 $SSH_DIR/authorized_keys"
      fi
    fi

    echo "确保脚本目录 $SCRIPTPATH 对新用户可读写（将 chown 给 $NEW_USER）..."
    chown -R "$NEW_USER":"$NEW_USER" "$SCRIPTPATH" || true

    echo "现在以用户 '$NEW_USER' 继续执行脚本（会在子进程中运行）。"
    su - "$NEW_USER" -c "cd '$SCRIPTPATH' && bash deploy_ubuntu.sh"
    EXIT_CODE=$?
    echo "以 $NEW_USER 运行后退出，返回码: $EXIT_CODE"
    exit $EXIT_CODE
  else
    echo "未创建用户，退出。请以非 root 用户运行此脚本。"
    exit 1
  fi
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

# 询问是否先将依赖升级到最新版本（危险操作，可能引入 breaking change）
read -p "是否在服务器上将所有依赖升级到最新版本？这会修改 package.json 与锁文件，并可能引入不兼容改动。已备份数据库并接受风险？ (y/N): " USE_LATEST
USE_LATEST=${USE_LATEST:-N}
if [ "$USE_LATEST" = "y" ] || [ "$USE_LATEST" = "Y" ]; then
  echo "将尝试升级所有依赖到最新版本（会修改 package.json 与 pnpm-lock.yaml）。建议先在分支/CI上测试再在生产运行。"
  # 尝试升级（如果失败也继续安装现有版本）
  pnpm up --latest --recursive || echo "pnpm up 失败，继续进行安装（使用当前 lockfile）"
  pnpm install || pnpm install --shamefully-hoist
else
  # 优先使用 frozen lockfile 保持可重复性，否则允许更新锁文件
  pnpm install --frozen-lockfile || pnpm install
fi

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
