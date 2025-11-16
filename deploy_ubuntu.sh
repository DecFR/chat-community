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
# 参数化部署用户与选项
# 支持：环境变量 DEPLOY_USER 或脚本第一个参数
DEPLOY_USER="${DEPLOY_USER:-${1:-DecFR}}"
# 支持 --yes / --no-resume 作为简单标记（在 env 或命令行传入）
FORCE_CHOWN=0
NO_RESUME=0
for ARG in "$@"; do
  case "$ARG" in
    --yes|-y) FORCE_CHOWN=1 ;;
    --no-resume) NO_RESUME=1 ;;
    --deploy-user=*) DEPLOY_USER="${ARG#--deploy-user=}" ;;
    --install-db) INSTALL_DB=1 ;;
    --db-type=*) DB_TYPE="${ARG#--db-type=}" ;;
    --db-name=*) DB_NAME="${ARG#--db-name=}" ;;
    --db-user=*) DB_USER="${ARG#--db-user=}" ;;
    --db-pass=*) DB_PASS="${ARG#--db-pass=}" ;;
    --force-install-db) FORCE_INSTALL_DB=1 ;;
    --non-interactive) NON_INTERACTIVE=1 ;;
  esac
done

# 默认数据库安装选项与凭据（可由命令行 override）
INSTALL_DB=${INSTALL_DB:-0}
DB_TYPE=${DB_TYPE:-postgres}
DB_NAME=${DB_NAME:-chatdb}
DB_USER=${DB_USER:-chatuser}
DB_PASS=${DB_PASS:-}
FORCE_INSTALL_DB=${FORCE_INSTALL_DB:-0}
NON_INTERACTIVE=${NON_INTERACTIVE:-0}

get_database_url() {
  # Prefer packages/api/.env, then .env.local, then environment
  if [ -f packages/api/.env ]; then
    grep -E '^DATABASE_URL=' packages/api/.env | sed 's/^DATABASE_URL=//' | tr -d '\"' || true
  elif [ -f packages/api/.env.local ]; then
    grep -E '^DATABASE_URL=' packages/api/.env.local | sed 's/^DATABASE_URL=//' | tr -d '\"' || true
  else
    echo "${DATABASE_URL:-}"
  fi
}

SCRIPTPATH="$(pwd)"

is_unsafe_path() {
  # 拒绝对根或关键系统目录执行递归 chown
  case "$1" in
    /|/etc|/var|/usr|/bin|/sbin|/root|/proc|/sys|/dev) return 0 ;;
    /etc/*|/var/*|/usr/*|/bin/*|/sbin/*|/root/*|/proc/*|/sys/*|/dev/*) return 0 ;;
    *) return 1 ;;
  esac
}

if [ "$EUID" -eq 0 ]; then
  echo "检测到以 root 身份运行脚本。建议使用非 root 用户运行（带 sudo 权限）。"
  read -p "是否创建用户 '$DEPLOY_USER' 并配置 sudo 与 SSH 公钥，然后以该用户继续执行脚本？ (Y/n): " CREATE_USER
  CREATE_USER=${CREATE_USER:-Y}
  if [ "$CREATE_USER" = "Y" ] || [ "$CREATE_USER" = "y" ]; then
    if id -u "$DEPLOY_USER" >/dev/null 2>&1; then
      echo "用户 '$DEPLOY_USER' 已存在，跳过创建。"
    else
      echo "正在创建用户 '$DEPLOY_USER'..."
      if ! useradd -m -s /bin/bash "$DEPLOY_USER" >/dev/null 2>&1; then
        echo "useradd 失败，尝试使用 adduser 备选方式..."
        adduser --disabled-password --gecos "" "$DEPLOY_USER" || true
      fi
      passwd -d "$DEPLOY_USER" >/dev/null 2>&1 || true
      usermod -aG sudo "$DEPLOY_USER" || true

      SSH_DIR="/home/$DEPLOY_USER/.ssh"
      mkdir -p "$SSH_DIR"
      chown "$DEPLOY_USER":"$DEPLOY_USER" "$SSH_DIR"
      chmod 700 "$SSH_DIR"
      if [ -f /root/.ssh/authorized_keys ]; then
        read -p "检测到 /root/.ssh/authorized_keys，是否复制到 $SSH_DIR/authorized_keys ? (y/N): " COPY_KEYS
        COPY_KEYS=${COPY_KEYS:-N}
        if [ "$COPY_KEYS" = "Y" ] || [ "$COPY_KEYS" = "y" ] || [ "$FORCE_CHOWN" -eq 1 ]; then
          cp /root/.ssh/authorized_keys "$SSH_DIR/authorized_keys"
          chown "$DEPLOY_USER":"$DEPLOY_USER" "$SSH_DIR/authorized_keys"
          chmod 600 "$SSH_DIR/authorized_keys"
          echo "已复制 root 的 SSH 公钥到 $SSH_DIR/authorized_keys"
        else
          echo "跳过复制 authorized_keys，请手动将公钥追加到 $SSH_DIR/authorized_keys"
        fi
      else
        echo "未找到 /root/.ssh/authorized_keys；请手动将公钥追加到 $SSH_DIR/authorized_keys"
      fi
    fi

    # 在对目录执行 chown -R 前做安全检查
    if is_unsafe_path "$SCRIPTPATH"; then
      echo "警告：脚本目录 '$SCRIPTPATH' 被视为敏感路径，脚本不会自动执行 chown -R。"
      echo "请手动确认并更改属主，例如： sudo chown -R $DEPLOY_USER:$DEPLOY_USER $SCRIPTPATH"
      if [ "$NO_RESUME" -eq 1 ]; then
        echo "已设置 --no-resume，退出。"
        exit 0
      fi
    else
      if [ "$FORCE_CHOWN" -ne 1 ]; then
        read -p "将把目录 '$SCRIPTPATH' 递归 chown 给 $DEPLOY_USER，这会修改目录内所有文件所有者。确认继续？ (y/N): " CONFIRM_CHOWN
        CONFIRM_CHOWN=${CONFIRM_CHOWN:-N}
      else
        CONFIRM_CHOWN=Y
      fi

      if [ "$CONFIRM_CHOWN" = "Y" ] || [ "$CONFIRM_CHOWN" = "y" ]; then
        echo "执行: chown -R $DEPLOY_USER:$DEPLOY_USER $SCRIPTPATH"
        chown -R "$DEPLOY_USER":"$DEPLOY_USER" "$SCRIPTPATH" || true
      else
        echo "已选择不更改目录属主。若需要请手动执行 chown 后以 $DEPLOY_USER 运行脚本。"
        if [ "$NO_RESUME" -eq 1 ]; then
          echo "已设置 --no-resume，退出。"
          exit 0
        fi
      fi
    fi

    if [ "$NO_RESUME" -eq 1 ]; then
      echo "已选择 --no-resume，用户已创建，退出。请以 $DEPLOY_USER 登录并继续部署。"
      exit 0
    fi

    echo "现在以用户 '$DEPLOY_USER' 继续执行脚本（会在登录 shell 中运行）。"
    exec su - "$DEPLOY_USER" -c "cd '$SCRIPTPATH' && bash deploy_ubuntu.sh"
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

echo "准备数据库连接测试（在继续其他环境配置前）"
# 如果需要，先在本机安装并初始化 PostgreSQL
DB_URL_LINE=$(get_database_url)

# Decide whether to install DB non-interactively
SHOULD_INSTALL_DB=0
if [ "$FORCE_INSTALL_DB" -eq 1 ]; then
  SHOULD_INSTALL_DB=1
elif [ "$INSTALL_DB" -eq 1 ]; then
  SHOULD_INSTALL_DB=1
elif [ "$NON_INTERACTIVE" -eq 1 ] && [ -z "$DB_URL_LINE" ]; then
  SHOULD_INSTALL_DB=1
fi

if [ "$SHOULD_INSTALL_DB" -eq 1 ]; then
  echo "（自动模式）将安装 PostgreSQL 并创建数据库/用户： name=${DB_NAME} user=${DB_USER}"
  sudo apt update
  sudo apt install -y postgresql postgresql-contrib
  sudo systemctl enable --now postgresql || true

  if [ -z "$DB_PASS" ]; then
    echo "未提供数据库密码，生成随机密码..."
    DB_PASS=$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 16 || echo "changeme123")
  fi

  echo "创建 PostgreSQL 用户与数据库（若已存在会忽略错误）"
  sudo -u postgres psql -c "DO \\$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${DB_USER}') THEN CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}'; END IF; END \\$\$;" || true
  sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" || true

  DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:5432/${DB_NAME}?schema=public"
  # 写入 .env.local（避免误提交），并导出以供后续命令使用
  echo "DATABASE_URL=\"${DATABASE_URL}\"" > packages/api/.env.local
  chmod 600 packages/api/.env.local || true
  export DATABASE_URL="${DATABASE_URL}"
  echo "已写入 packages/api/.env.local（权限 600），并为当前进程导出 DATABASE_URL。请不要将 .env.local 提交到仓库。"
else
  echo "跳过自动安装 Postgres（可交互式方式或使用 --force-install-db/--install-db 标志）。"
fi

cd packages/api
echo "将在 packages/api 中安装依赖以便测试数据库连接（使用 pnpm）"
pnpm install --frozen-lockfile || pnpm install || true

TEST_DB_OK=0
while [ "$TEST_DB_OK" -ne 1 ]; do
  echo "尝试使用 Prisma 测试 DATABASE_URL（pnpm prisma db pull）..."
  # Ensure Prisma sees DATABASE_URL: use env var if set, otherwise rely on files
  if [ -n "${DATABASE_URL:-}" ]; then
    # Exported earlier when created non-interactively
    export DATABASE_URL
  else
    # Try load from files into environment for the command
    if [ -f packages/api/.env ]; then
      # shellcheck disable=SC1090
      set -o allexport; source packages/api/.env 2>/dev/null || true; set +o allexport
    elif [ -f packages/api/.env.local ]; then
      set -o allexport; source packages/api/.env.local 2>/dev/null || true; set +o allexport
    fi
  fi

  if pnpm prisma db pull >/dev/null 2>&1; then
    echo "数据库连接测试成功。"
    TEST_DB_OK=1
    break
  else
      echo "数据库连接测试失败。可能是 DATABASE_URL 未设置或无法连通。"
      echo "选择： (r) 重试  (e) 编辑 packages/api/.env  (i) 在本机安装 Postgres 并初始化  (s) 跳过测试并继续"
      read -p "请输入 r/e/i/s: " CHOICE
    CHOICE=${CHOICE:-r}
    case "$CHOICE" in
      r|R)
        echo "重试数据库连接测试..." ;;
      e|E)
        echo "请编辑 packages/api/.env（例如使用 nano 或你的编辑器），保存后按回车继续。"
        read -r
        ;;

      i|I)
        echo "将安装并初始化本机 PostgreSQL（name=${DB_NAME} user=${DB_USER}）..."
        sudo apt update
        sudo apt install -y postgresql postgresql-contrib
        sudo systemctl enable --now postgresql || true

        if [ -z "$DB_PASS" ]; then
          echo "未提供数据库密码，生成随机密码..."
          DB_PASS=$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 16 || echo "changeme123")
        fi

        sudo -u postgres psql -c "DO \\$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${DB_USER}') THEN CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}'; END IF; END \\$\$;" || true
        sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" || true

        DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:5432/${DB_NAME}?schema=public"
        echo "DATABASE_URL=\"${DATABASE_URL}\"" > packages/api/.env.local
        chmod 600 packages/api/.env.local || true
        export DATABASE_URL="${DATABASE_URL}"
        echo "已在本机安装并写入 packages/api/.env.local（权限 600），并为当前进程导出 DATABASE_URL。"
        echo "正在重试数据库连接测试..."
        ;;
      s|S)
        echo "已选择跳过数据库测试，继续后续步骤（注意：可能导致迁移/运行失败）。"
        break
        ;;
      *)
        echo "未知选项，默认重试。" ;;
    esac
  fi
done

cd "$WORKDIR"

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
