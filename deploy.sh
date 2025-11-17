#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_DIR="$ROOT_DIR/deploy_package"
API_PKG="$ROOT_DIR/packages/api"
CLIENT_PKG="$ROOT_DIR/packages/client"

SUDO=""
if [ "$EUID" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  else
    SUDO=""
  fi
fi

AUTO_YES=0
for arg in "$@"; do
  case "$arg" in
    --yes|-y)
      AUTO_YES=1
      ;;
  esac
done

echo "== Chat-Community 一键构建、环境安装与打包脚本 =="

function fail() { echo "ERROR: $*" >&2; exit 1; }

function detect_distro() {
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    DISTRO_ID="$ID"
    DISTRO_NAME="$NAME"
  else
    DISTRO_ID="unknown"
    DISTRO_NAME="unknown"
  fi
}

function pkg_mgr() {
  if command -v apt-get >/dev/null 2>&1; then
    echo "apt"
  elif command -v dnf >/dev/null 2>&1; then
    echo "dnf"
  elif command -v yum >/dev/null 2>&1; then
    echo "yum"
  else
    echo "unknown"
  fi
}

function install_prereqs() {
  PM="$(pkg_mgr)"
  echo "安装基础工具（curl、wget、ca-certificates、gnupg） via: $PM"
  if [ "$PM" = "apt" ]; then
    $SUDO apt-get update
    $SUDO apt-get install -y curl wget ca-certificates gnupg lsb-release build-essential
  elif [ "$PM" = "dnf" ] || [ "$PM" = "yum" ]; then
    $SUDO ${PM} install -y curl wget ca-certificates gnupg2 tar gzip make gcc
  else
    echo "未识别的包管理程序，请手动安装 curl/wget/ca-certificates/gnupg/build-essential 等依赖。"
  fi
}

function install_node22() {
  PM="$(pkg_mgr)"
  echo "安装 Node.js 22 (LTS)"
  if command -v node >/dev/null 2>&1; then
    CUR_R=$(node -v | sed 's/v//')
    echo "检测到 node $(node -v)" 
  fi
  if [ "$PM" = "apt" ]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | $SUDO bash -
    $SUDO apt-get install -y nodejs
  elif [ "$PM" = "dnf" ] || [ "$PM" = "yum" ]; then
    curl -fsSL https://rpm.nodesource.com/setup_22.x | $SUDO bash -
    $SUDO ${PM} install -y nodejs
  else
    echo "无法自动安装 Node.js：不支持的包管理器。请手动安装 Node 22 LTS。"
  fi
}

function install_postgres18() {
  PM="$(pkg_mgr)"
  echo "安装 PostgreSQL 18"
  if command -v psql >/dev/null 2>&1; then
    echo "检测到已有 psql：$(psql --version)" 
  fi
  if [ "$PM" = "apt" ]; then
    # Debian/Ubuntu 使用 PGDG
    $SUDO mkdir -p /etc/apt/keyrings
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | $SUDO gpg --dearmor -o /etc/apt/keyrings/pgdg.gpg
    CODENAME=$(lsb_release -cs || echo "$(awk -F= '/^VERSION_CODENAME/{print $2}' /etc/os-release || echo '')")
    if [ -z "$CODENAME" ]; then
      CODENAME="$(grep VERSION_CODENAME /etc/os-release || true | cut -d= -f2)"
    fi
    echo "deb [signed-by=/etc/apt/keyrings/pgdg.gpg] http://apt.postgresql.org/pub/repos/apt/ ${CODENAME}-pgdg main" | $SUDO tee /etc/apt/sources.list.d/pgdg.list
    $SUDO apt-get update
    $SUDO apt-get install -y postgresql-18
    $SUDO systemctl enable --now postgresql
  elif [ "$PM" = "dnf" ] || [ "$PM" = "yum" ]; then
    # RedHat/CentOS/Fedora
    $SUDO ${PM} install -y https://download.postgresql.org/pub/repos/yum/reporpms/EL-$(rpm -E '%{?rhel}0')-$(uname -m)/pgdg-redhat-repo-latest.noarch.rpm || true
    # disable builtin module and install
    $SUDO ${PM} -y module disable postgresql || true
    $SUDO ${PM} install -y postgresql18-server
    $SUDO /usr/pgsql-18/bin/postgresql-18-setup initdb || true
    $SUDO systemctl enable --now postgresql-18
  else
    echo "无法自动安装 PostgreSQL：不支持的包管理器。请手动安装 PostgreSQL 18。"
  fi
}

function ensure_pnpm_corepack() {
  if command -v pnpm >/dev/null 2>&1; then
    echo "pnpm 已存在"
    return 0
  fi

  if command -v corepack >/dev/null 2>&1; then
    echo "启用 corepack 并激活 pnpm"
    # 尝试启用 corepack，并激活 pnpm；若因旧的 /usr/bin/pnpm 冲突导致失败，尝试修复并重试
    $SUDO corepack enable || true
    if ! $SUDO corepack prepare pnpm@latest --activate >/dev/null 2>&1; then
      echo "corepack prepare 失败，尝试移除已存在的 /usr/bin/pnpm 并重试..."
      if [ -e "/usr/bin/pnpm" ]; then
        $SUDO rm -f /usr/bin/pnpm || true
        echo "/usr/bin/pnpm 已移除，重试 corepack prepare"
        $SUDO corepack prepare pnpm@latest --activate || true
      fi
    fi
  else
    echo "尝试通过 npm 全局安装 pnpm"
    if command -v npm >/dev/null 2>&1; then
      $SUDO npm i -g pnpm || true
    else
      echo "未检测到 npm，请先安装 Node.js 或手动安装 pnpm。"
    fi
  fi

  if command -v pnpm >/dev/null 2>&1; then
    echo "pnpm 安装完成"
    return 0
  fi

  # 最后兜底：如果 corepack/全局安装都没有成功，提示用户手动修复并给出建议命令
  echo "pnpm 未能通过 corepack 或 npm 自动安装。请手动检查并执行下列命令之一："
  echo "  sudo rm -f /usr/bin/pnpm" 
  echo "  sudo corepack enable && sudo corepack prepare pnpm@latest --activate"
  echo "或（如有 npm 且允许全局安装）： sudo npm i -g pnpm"
  echo "如果问题仍然存在，请手动修复文件系统权限或旧链接，然后重试。"
}

function check_build_artifacts() {
  echo "检查构建产物和关键文件..."
  missing=0
  if [ ! -f "$ROOT_DIR/pnpm-workspace.yaml" ]; then
    echo "警告：未发现 pnpm-workspace.yaml"
  fi
  if [ ! -d "$API_PKG" ]; then
    echo "ERROR: 未找到 $API_PKG"; missing=1
  else
    if [ ! -f "$API_PKG/package.json" ]; then
      echo "ERROR: $API_PKG/package.json 缺失"; missing=1
    fi
  fi
  if [ ! -d "$CLIENT_PKG" ]; then
    echo "ERROR: 未找到 $CLIENT_PKG"; missing=1
  else
    if [ ! -f "$CLIENT_PKG/package.json" ]; then
      echo "ERROR: $CLIENT_PKG/package.json 缺失"; missing=1
    fi
  fi
  if [ $missing -ne 0 ]; then
    fail "必要文件缺失，请修复后重试。"
  fi
}

function build_all() {
  echo "安装依赖并构建（工作区）..."
  if [ -f "$ROOT_DIR/pnpm-lock.yaml" ]; then
    pnpm install --frozen-lockfile
  else
    pnpm install
  fi

  pnpm -r build
}

function prepare_deploy_dir() {
  echo "准备发布目录： $DEPLOY_DIR"
  rm -rf "$DEPLOY_DIR"
  mkdir -p "$DEPLOY_DIR/api"
  mkdir -p "$DEPLOY_DIR/client"

  # copy client build
  if [ -d "$CLIENT_PKG/dist" ]; then
    cp -r "$CLIENT_PKG/dist" "$DEPLOY_DIR/client/dist"
  else
    fail "client 未构建出 dist（$CLIENT_PKG/dist 不存在）。请先确认构建成功。"
  fi

  # copy api build and runtime files
  if [ -d "$API_PKG/dist" ]; then
    cp -r "$API_PKG/dist" "$DEPLOY_DIR/api/dist"
  else
    fail "api 未构建出 dist（$API_PKG/dist 不存在）。请先确认构建成功。"
  fi

  cp "$API_PKG/package.json" "$DEPLOY_DIR/api/"
  # 包含 prisma runtime/schema（若存在）
  if [ -d "$API_PKG/prisma" ]; then
    cp -r "$API_PKG/prisma" "$DEPLOY_DIR/api/prisma"
  fi
  # 包含上传目录（若存在），生产部署通常需要处理静态上传目录或使用外部文件存储
  if [ -d "$API_PKG/../uploads" ]; then
    mkdir -p "$DEPLOY_DIR/uploads"
    cp -r "$API_PKG/../uploads" "$DEPLOY_DIR/uploads"
  fi

  # workspace lockfiles 有助于在目标机器上安装相同依赖
  if [ -f "$ROOT_DIR/pnpm-lock.yaml" ]; then
    cp "$ROOT_DIR/pnpm-lock.yaml" "$DEPLOY_DIR/"
  fi
  if [ -f "$ROOT_DIR/pnpm-workspace.yaml" ]; then
    cp "$ROOT_DIR/pnpm-workspace.yaml" "$DEPLOY_DIR/"
  fi

  # 生成安装生产依赖脚本（放在包内，目标机器上执行）
  cat > "$DEPLOY_DIR/install_prod_deps.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT/api"
if ! command -v pnpm >/dev/null 2>&1; then
  if command -v corepack >/dev/null 2>&1; then
    corepack enable || true
    corepack prepare pnpm@latest --activate || true
  else
    echo "pnpm 未找到，请先在目标机器上安装 pnpm（例如： sudo npm i -g pnpm）。" >&2
    exit 1
  fi
fi
if [ -f "$ROOT/pnpm-lock.yaml" ]; then
  pnpm install --prod --frozen-lockfile
else
  pnpm install --prod
fi
echo "生产依赖安装完成。"
SH
  chmod +x "$DEPLOY_DIR/install_prod_deps.sh"

  # 将监控脚本与 systemd 单元加入发布包（若仓库中存在 monitor.sh，则包含）
  if [ -f "$ROOT_DIR/monitor.sh" ]; then
    cp "$ROOT_DIR/monitor.sh" "$DEPLOY_DIR/monitor.sh"
    chmod +x "$DEPLOY_DIR/monitor.sh"

    # 生成 systemd unit 与 timer 模板（与 monitor.sh 协同）
    cat > "$DEPLOY_DIR/chat-community-monitor.service" <<'UNIT'
[Unit]
Description=Chat-Community Health Check
After=network.target

[Service]
Type=simple
User=chatcomm
ExecStart=/opt/chat-community/bin/monitor.sh check
Nice=10

[Install]
WantedBy=multi-user.target
UNIT

    cat > "$DEPLOY_DIR/chat-community-monitor.timer" <<'TIMER'
[Unit]
Description=Run Chat-Community health check every 5 minutes

[Timer]
OnBootSec=2m
OnUnitActiveSec=5min
Unit=chat-community-monitor.service

[Install]
WantedBy=timers.target
TIMER
  fi

  # 生成运行脚本示例
  cat > "$DEPLOY_DIR/run_api.sh" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT/api"
export NODE_ENV=production
if [ -f ".env" ]; then
  echo "使用本地 .env 文件（请确保已配置好数据库和 JWT 等）"
fi
node dist/server.js
SH
  chmod +x "$DEPLOY_DIR/run_api.sh"

  # systemd 单元模板
  cat > "$DEPLOY_DIR/chat-community.service" <<'UNIT'
[Unit]
Description=Chat-Community API
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/chat-community/api
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
Environment=NODE_ENV=production
# 环境变量可以放到 /opt/chat-community/api/.env

[Install]
WantedBy=multi-user.target
UNIT

  # 高亮并增加间隔，便于在终端中辨识打包信息
  echo
  echo -e "\033[1;32m============================================================\033[0m"
  echo -e "\033[1;32m 发布包准备完成：\033[0m  \033[1;36m$DEPLOY_DIR\033[0m"
  echo -e "\033[1;33m 可使用 tar 打包：\033[0m"
  echo -e "    \033[1;37m tar -czf chat-community-deploy.tar.gz -C $ROOT_DIR deploy_package\033[0m"
  echo -e "\033[1;32m============================================================\033[0m"
  echo
}

### 主流程
detect_distro
echo "Detected distro: ${DISTRO_NAME:-$DISTRO_ID}"

check_build_artifacts

# 环境安装交互
if [ $AUTO_YES -eq 0 ]; then
  read -r -p "是否自动安装运行环境（Node.js 22, PostgreSQL 18, pnpm 等）? [Y/n]: " resp || true
  resp=${resp:-Y}
  if [[ "$resp" =~ ^[Nn] ]]; then
    INSTALL_ENV=0
  else
    INSTALL_ENV=1
  fi
else
  INSTALL_ENV=1
fi

if [ $INSTALL_ENV -eq 1 ]; then
  install_prereqs
  install_node22
  install_postgres18
  ensure_pnpm_corepack
fi

build_all
prepare_deploy_dir

# 检查 API 入口文件是否存在，防止误部署不存在的入口
function check_api_entry() {
  ENTRY="$API_PKG/dist/server.js"
  if [ ! -f "$ENTRY" ]; then
    echo "ERROR: 未在构建产物中找到 API 入口文件： $ENTRY" >&2
    echo "请先在构建机器上运行： pnpm -r build ，确保生成 $API_PKG/dist/server.js，然后再次运行本脚本。" >&2
    exit 1
  fi
  echo "Detected API entry: $ENTRY"
}

check_api_entry

# 生成或同步 .env 内容（写入 packages/api/.env 和 deploy_package 下的副本）
function generate_env_file() {
  echo "生成或更新 API .env 配置..."
  ENV_PATH="$API_PKG/.env"
  DEPLOY_ENV_PATH="$DEPLOY_DIR/api/.env"
  PG_USER="chat_community"
  PG_DB="chat_community_prod"
  PG_HOST="localhost"
  PG_PORT="5432"

  # 从现有 env 读取 password（如果存在），否则生成一个 10 位的字母数字密码
  # 密码字符集：a-zA-Z0-9（避免需要 URL 编码）
  if [ -f "$ENV_PATH" ]; then
    existing_pw=$(grep -E '^PG_PASSWORD=' "$ENV_PATH" | cut -d= -f2- || true)
  else
    existing_pw=""
  fi

  if [ -n "$existing_pw" ]; then
    PG_PASSWORD="$existing_pw"
  else
    if command -v openssl >/dev/null 2>&1; then
      # 产生更多随机字节然后筛选字母数字，保证长度
      PG_PASSWORD=$(openssl rand -base64 16 | tr -dc 'A-Za-z0-9' | head -c 10)
    else
      PG_PASSWORD=$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 10)
    fi
    # 兜底：如果生成短于 10，则重复处理
    if [ ${#PG_PASSWORD} -lt 10 ]; then
      PG_PASSWORD=$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 10)
    fi
  fi

  # 生成 JWT/SESSION 密钥（32 字节 hex）和 ENCRYPTION_KEY（32 字节 hex -> 64 个 hex 字符）
  JWT_SECRET=${JWT_SECRET:-$(openssl rand -hex 32 2>/dev/null || (tr -dc '0-9a-f' </dev/urandom | head -c 64))}
  SESSION_SECRET=${SESSION_SECRET:-$(openssl rand -hex 32 2>/dev/null || (tr -dc '0-9a-f' </dev/urandom | head -c 64))}
  ENCRYPTION_KEY=${ENCRYPTION_KEY:-$(openssl rand -hex 32 2>/dev/null || (tr -dc '0-9a-f' </dev/urandom | head -c 64))}

  cat > "$ENV_PATH" <<EOF
# Auto-generated by deploy.sh
NODE_ENV=production
PORT=3000
CLIENT_URL=http://localhost
PG_USER=$PG_USER
PG_PASSWORD=$PG_PASSWORD
PG_DB=$PG_DB
PG_HOST=$PG_HOST
PG_PORT=$PG_PORT
DATABASE_URL=postgresql://$PG_USER:$PG_PASSWORD@$PG_HOST:$PG_PORT/$PG_DB
ENCRYPTION_KEY=$ENCRYPTION_KEY
JWT_SECRET=$JWT_SECRET
SESSION_SECRET=$SESSION_SECRET
EOF

  mkdir -p "$(dirname "$DEPLOY_ENV_PATH")"
  cp "$ENV_PATH" "$DEPLOY_ENV_PATH"
  # 限制 .env 权限以减少泄露风险
  chmod 600 "$ENV_PATH" || true
  chmod 600 "$DEPLOY_ENV_PATH" || true
  echo ".env 已生成并设为 600 权限： $ENV_PATH"
}

# 在 Postgres 中创建/同步用户和数据库
function setup_postgres_db_and_user() {
  echo "配置 PostgreSQL 用户和数据库..."
  ENV_PATH="$API_PKG/.env"
  if [ ! -f "$ENV_PATH" ]; then
    fail ".env 文件不存在： $ENV_PATH"
  fi
  PG_USER=$(grep -E '^PG_USER=' "$ENV_PATH" | cut -d= -f2-)
  PG_PASSWORD=$(grep -E '^PG_PASSWORD=' "$ENV_PATH" | cut -d= -f2-)
  PG_DB=$(grep -E '^PG_DB=' "$ENV_PATH" | cut -d= -f2-)
  PG_PORT=$(grep -E '^PG_PORT=' "$ENV_PATH" | cut -d= -f2-)

  # 确保 postgres 服务正在运行
  if ! systemctl is-active --quiet postgresql && ! systemctl is-active --quiet postgresql-18; then
    echo "Postgres 服务未在运行，尝试启动..."
    $SUDO systemctl enable --now postgresql || $SUDO systemctl enable --now postgresql-18 || true
  fi

  # 封装对 postgres 的 psql 调用：兼容有 sudo 的环境与无 sudo（使用 su - postgres）
  function psql_query() {
    # 返回查询结果（-tAc）
    local sql="$1"
    if [ -n "${SUDO:-}" ]; then
      $SUDO -u postgres psql -v ON_ERROR_STOP=1 -tAc "$sql"
    else
      # 在没有 sudo 的环境下，尝试使用 su - postgres -c
      su - postgres -c "psql -v ON_ERROR_STOP=1 -tAc \"$sql\"" 2>/dev/null || psql -v ON_ERROR_STOP=1 -tAc "$sql" 2>/dev/null || echo ""
    fi
  }

  function psql_exec() {
    # 运行 psql -c 并返回退出码
    local sql="$1"
    if [ -n "${SUDO:-}" ]; then
      $SUDO -u postgres psql -v ON_ERROR_STOP=1 -c "$sql"
    else
      su - postgres -c "psql -v ON_ERROR_STOP=1 -c \"$sql\"" 2>/dev/null || psql -v ON_ERROR_STOP=1 -c "$sql"
    fi
  }

  # 创建角色
  exists=$(psql_query "SELECT 1 FROM pg_roles WHERE rolname='$PG_USER'" || echo "")
  if [ "x$exists" = "x1" ]; then
    echo "角色 $PG_USER 已存在，尝试更新密码。"
    psql_exec "ALTER ROLE \"$PG_USER\" WITH LOGIN PASSWORD '$PG_PASSWORD';" || fail "无法更新角色密码"
  else
    echo "创建角色 $PG_USER"
    psql_exec "CREATE ROLE \"$PG_USER\" WITH LOGIN PASSWORD '$PG_PASSWORD';" || fail "无法创建角色"
  fi

  # 创建数据库并设置拥有者
  db_exists=$(psql_query "SELECT 1 FROM pg_database WHERE datname='$PG_DB'" || echo "")
  if [ "x$db_exists" = "x1" ]; then
    echo "数据库 $PG_DB 已存在，确保拥有者为 $PG_USER"
    psql_exec "ALTER DATABASE \"$PG_DB\" OWNER TO \"$PG_USER\";" || true
  else
    echo "创建数据库 $PG_DB"
    psql_exec "CREATE DATABASE \"$PG_DB\" OWNER \"$PG_USER\";" || fail "无法创建数据库"
  fi
}

# 安装并配置 nginx（反向代理 + 静态文件）
function install_nginx_and_config() {
  echo "安装并配置 nginx..."
  PM="$(pkg_mgr)"
  if [ "$PM" = "apt" ]; then
    $SUDO apt-get install -y nginx
  elif [ "$PM" = "dnf" ] || [ "$PM" = "yum" ]; then
    $SUDO ${PM} install -y nginx
  else
    echo "请手动安装 nginx 并配置反向代理。"
    return 0
  fi

  SITE_ROOT="/var/www/chat-community/client"
  $SUDO mkdir -p "$SITE_ROOT"
  $SUDO chown -R "$USER":"$USER" "$SITE_ROOT" 2>/dev/null || true

  # 将 client dist 复制到 site root
  if [ -d "$CLIENT_PKG/dist" ]; then
    $SUDO rm -rf "$SITE_ROOT"/* || true
    cp -r "$CLIENT_PKG/dist/"* "$SITE_ROOT/"
  fi

  # 支持通过环境变量指定域名与证书路径；若未提供，则交互式询问以启用 HTTPS
  NGINX_DOMAIN=${NGINX_DOMAIN:-}
  SSL_CERT=${SSL_CERT:-}
  SSL_KEY=${SSL_KEY:-}

  # 交互式：若未提前设置域名，则询问用户（留空表示跳过 HTTPS 自动配置）
  if [ -z "${NGINX_DOMAIN:-}" ]; then
    read -r -p "请输入要为 nginx 配置的域名（留空以跳过 HTTPS 自动配置）：" user_domain || true
    if [ -n "$user_domain" ]; then
      NGINX_DOMAIN="$user_domain"
    fi
  fi

  # 如果提供了域名但未提供证书路径，则询问证书路径（用户可留空以跳过 HTTPS）
  if [ -n "${NGINX_DOMAIN:-}" ]; then
    if [ -z "${SSL_CERT:-}" ]; then
      read -r -p "请输入 SSL 证书路径（PEM），例如 /etc/ssl/certs/your.pem（留空以跳过 HTTPS）：" user_cert || true
      if [ -n "$user_cert" ]; then
        SSL_CERT="$user_cert"
      fi
    fi
    if [ -z "${SSL_KEY:-}" ] && [ -n "${SSL_CERT:-}" ]; then
      read -r -p "请输入 SSL 私钥路径，例如 /etc/ssl/private/your.key：" user_key || true
      if [ -n "$user_key" ]; then
        SSL_KEY="$user_key"
      fi
    fi
  fi
  PROXY_PORT=${PROXY_PORT:-3000}

  NGINX_HTTP_CONF="/etc/nginx/sites-available/chat-community"
  NGINX_HTTP_LINK="/etc/nginx/sites-enabled/chat-community"

  # 基本 HTTP -> 静态 + /api 代理 配置（始终生成）
  cat > /tmp/chat-community.nginx <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name _;
    root $SITE_ROOT;
    index index.html;
    # 允许最大上传为 2G（与服务器端限制保持一致）
    client_max_body_size 2G;

    location /api/ {
        proxy_pass http://127.0.0.1:$PROXY_PORT/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

  $SUDO mv /tmp/chat-community.nginx "$NGINX_HTTP_CONF"
  if [ ! -e "$NGINX_HTTP_LINK" ]; then
    $SUDO ln -s "$NGINX_HTTP_CONF" "$NGINX_HTTP_LINK" || true
  fi

  # 如果提供了域名与证书路径且证书文件存在，则生成 HTTPS 配置和 80->443 重定向
  if [ -n "${NGINX_DOMAIN:-}" ] && [ -n "${SSL_CERT:-}" ] && [ -n "${SSL_KEY:-}" ] && [ -f "$SSL_CERT" ] && [ -f "$SSL_KEY" ]; then
    echo "检测到域名与证书，生成 HTTPS 配置并启用 80->443 重定向"
    NGINX_SSL_CONF="/etc/nginx/sites-available/chat-community-ssl"
    NGINX_SSL_LINK="/etc/nginx/sites-enabled/chat-community-ssl"

    cat > /tmp/chat-community-redirect.nginx <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $NGINX_DOMAIN;
    return 301 https://\$server_name\$request_uri;
}
EOF

    cat > /tmp/chat-community-ssl.nginx <<EOF
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $NGINX_DOMAIN;

    ssl_certificate $SSL_CERT;
    ssl_certificate_key $SSL_KEY;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;

    # client_max_body_size 0; # 若需要上传大文件，可取消注释
    client_max_body_size 2G;

    root $SITE_ROOT;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:$PROXY_PORT/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

    $SUDO mv /tmp/chat-community-redirect.nginx /etc/nginx/sites-available/chat-community-redirect
    $SUDO mv /tmp/chat-community-ssl.nginx "$NGINX_SSL_CONF"
    if [ ! -e "$NGINX_SSL_LINK" ]; then
      $SUDO ln -s "$NGINX_SSL_CONF" "$NGINX_SSL_LINK" || true
    fi
    if [ ! -e "/etc/nginx/sites-enabled/chat-community-redirect" ]; then
      $SUDO ln -s /etc/nginx/sites-available/chat-community-redirect /etc/nginx/sites-enabled/chat-community-redirect || true
    fi
  else
    # 生成一个示例 HTTPS 配置供用户手动填写证书路径
    EXAMPLE_PATH="/etc/nginx/sites-available/chat-community-ssl.example"
    cat > /tmp/chat-community-ssl.example <<'EX'
# HTTPS (端口 443) 配置示例 — 请替换 your_domain.com、证书路径并保存为 chat-community-ssl
# HTTP -> HTTPS 重定向示例
server {
    listen 80;
    listen [::]:80;
    server_name your_domain.com;
    return 301 https://$server_name$request_uri;
}

# HTTPS 服务
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name your_domain.com;

    ssl_certificate /etc/ssl/certs/your_domain.com.pem;
    ssl_certificate_key /etc/ssl/private/your_domain.com.key;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;

    client_max_body_size 2G;

    root /var/www/chat-community/client;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3000/; # 如需更改端口，请修改为 $PROXY_PORT
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
EX

    $SUDO mv /tmp/chat-community-ssl.example "$EXAMPLE_PATH"
    echo "未检测到完整证书路径，已生成示例配置： $EXAMPLE_PATH"
    echo "如要启用 HTTPS：编辑该文件，替换域名与证书路径，然后移动到 /etc/nginx/sites-available/chat-community-ssl 并在 sites-enabled 建立符号链接。"
    if [ -n "${NGINX_DOMAIN:-}" ]; then
      echo "提示：你输入了域名但缺少有效证书路径，若你已有证书，可用下面命令启用 HTTPS（替换路径）："
      echo "  sudo mv /etc/nginx/sites-available/chat-community-ssl.example /etc/nginx/sites-available/chat-community-ssl"
      echo "  sudo ln -s /etc/nginx/sites-available/chat-community-ssl /etc/nginx/sites-enabled/chat-community-ssl || true"
      echo "  sudo nginx -t && sudo systemctl restart nginx"
    fi
  fi

  $SUDO nginx -t || true
  $SUDO systemctl enable --now nginx || true
  echo "若需手动修改 nginx 配置：编辑 /etc/nginx/sites-available/chat-community 和（如存在）/etc/nginx/sites-available/chat-community-ssl，然后运行："
  echo "  sudo nginx -t"
  echo "  sudo systemctl restart nginx"
}

# 将发布包部署到 /opt/chat-community，并设置 systemd 服务
function deploy_to_system() {
  echo "部署到系统路径 /opt/chat-community ..."
  DEST_ROOT="/opt/chat-community"
  $SUDO mkdir -p "$DEST_ROOT/api" "$DEST_ROOT/client"

  # 备份现有部署（如果存在）
  if [ -d "$DEST_ROOT" ]; then
    TS=$(date +%Y%m%d%H%M%S)
    BACKUP="${DEST_ROOT}.bak.${TS}.tar.gz"
    echo "检测到已存在部署，创建备份： $BACKUP"
    $SUDO tar -czf "$BACKUP" -C "$(dirname "$DEST_ROOT")" "$(basename "$DEST_ROOT")" || true
  fi

  # 清理旧文件并复制新文件
  $SUDO rm -rf "$DEST_ROOT/api/*" "$DEST_ROOT/client/*" || true
  $SUDO cp -r "$DEPLOY_DIR/api/"* "$DEST_ROOT/api/"
  $SUDO cp -r "$DEPLOY_DIR/client/"* "$DEST_ROOT/client/"

  # 复制根级辅助脚本到目标（install/run/service 模板），方便在服务器上直接使用
  if [ -f "$DEPLOY_DIR/install_prod_deps.sh" ]; then
    $SUDO cp "$DEPLOY_DIR/install_prod_deps.sh" "$DEST_ROOT/"
    $SUDO chmod 755 "$DEST_ROOT/install_prod_deps.sh" || true
  fi
  # 安装监控脚本与 systemd 单元（如果发布包包含）
  if [ -f "$DEPLOY_DIR/monitor.sh" ]; then
    echo "部署监控脚本到 $DEST_ROOT/bin"
    $SUDO mkdir -p "$DEST_ROOT/bin"
    $SUDO cp "$DEPLOY_DIR/monitor.sh" "$DEST_ROOT/bin/monitor.sh"
    $SUDO chmod +x "$DEST_ROOT/bin/monitor.sh" || true
  fi
  if [ -f "$DEPLOY_DIR/chat-community-monitor.service" ] && [ -f "$DEPLOY_DIR/chat-community-monitor.timer" ]; then
    echo "安装并启用监控 systemd 单元/定时器"
    $SUDO mv "$DEPLOY_DIR/chat-community-monitor.service" /etc/systemd/system/chat-community-monitor.service || true
    $SUDO mv "$DEPLOY_DIR/chat-community-monitor.timer" /etc/systemd/system/chat-community-monitor.timer || true
    $SUDO systemctl daemon-reload || true
    $SUDO systemctl enable --now chat-community-monitor.timer || true
  fi
  if [ -f "$DEPLOY_DIR/run_api.sh" ]; then
    $SUDO cp "$DEPLOY_DIR/run_api.sh" "$DEST_ROOT/"
    $SUDO chmod 755 "$DEST_ROOT/run_api.sh" || true
  fi
  if [ -f "$DEPLOY_DIR/chat-community.service" ]; then
    $SUDO cp "$DEPLOY_DIR/chat-community.service" "$DEST_ROOT/"
    $SUDO chmod 644 "$DEST_ROOT/chat-community.service" || true
  fi

  # 创建运行用户
  if ! id -u chatcomm >/dev/null 2>&1; then
    $SUDO useradd --system --no-create-home --shell /usr/sbin/nologin chatcomm || true
  fi
  $SUDO chown -R chatcomm:chatcomm "$DEST_ROOT"

  # 确保 API .env 权限属于 chatcomm 并设置为 600
  if [ -f "$DEST_ROOT/api/.env" ]; then
    $SUDO chown chatcomm:chatcomm "$DEST_ROOT/api/.env" || true
    $SUDO chmod 600 "$DEST_ROOT/api/.env" || true
  fi

  # 安装生产依赖
  # 安装生产依赖：优先使用已复制的 install_prod_deps.sh（以 chatcomm 用户执行）
  if [ -f "$DEST_ROOT/install_prod_deps.sh" ]; then
    echo "使用 $DEST_ROOT/install_prod_deps.sh 安装生产依赖（以 chatcomm 用户）"
    $SUDO -u chatcomm bash -c "cd '$DEST_ROOT' && ./install_prod_deps.sh" || true
  else
    if [ -f "$DEST_ROOT/api/package.json" ]; then
      if command -v pnpm >/dev/null 2>&1; then
        $SUDO -u chatcomm pnpm install --prod --dir "$DEST_ROOT/api" || true
      else
        echo "pnpm 未安装，尝试使用 npm 安装生产依赖"
        $SUDO -u chatcomm npm ci --only=production --prefix "$DEST_ROOT/api" || true
      fi
    fi
  fi

  NODE_BIN=$(command -v node || echo "/usr/bin/node")
  SERVICE_FILE="/etc/systemd/system/chat-community.service"
  cat > /tmp/chat-community.service <<SERVICE
[Unit]
Description=Chat-Community API
After=network.target

[Service]
Type=simple
User=chatcomm
WorkingDirectory=$DEST_ROOT/api
ExecStart=$NODE_BIN $DEST_ROOT/api/dist/server.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
SERVICE

  $SUDO mv /tmp/chat-community.service "$SERVICE_FILE"
  $SUDO systemctl daemon-reload
  # 创建 systemd drop-in 以便从部署目录加载 .env（保证 systemd 启动时有环境变量）
  DROPIN_DIR="/etc/systemd/system/chat-community.service.d"
  $SUDO mkdir -p "$DROPIN_DIR"
  # 使用绝对路径指向目标部署下的 .env
  $SUDO bash -lc "cat > $DROPIN_DIR/env.conf <<'UNITENV'\n[Service]\nEnvironmentFile=$DEST_ROOT/api/.env\nUNITENV"
  $SUDO systemctl daemon-reload || true
  $SUDO systemctl enable --now chat-community.service || true

  # 如果我们在目标目录复制了模板 service 文件，也把它同步到 systemd 路径（覆盖默认）
  if [ -f "$DEST_ROOT/chat-community.service" ]; then
    echo "检测到 $DEST_ROOT/chat-community.service，覆盖 systemd unit 并重载"
    $SUDO mv "$DEST_ROOT/chat-community.service" "$SERVICE_FILE" || true
    $SUDO systemctl daemon-reload || true
    $SUDO systemctl enable --now chat-community.service || true
  fi
}

# 主流程：生成 env、配置 postgres、nginx 并部署
generate_env_file
setup_postgres_db_and_user
install_nginx_and_config
deploy_to_system

echo
echo -e "\033[1;32m************************************************************\033[0m"
echo -e "\033[1;32m 完成。后续建议：\033[0m"
echo
echo -e "  \033[1;33m1) 将发布包打包并传到目标 Linux 服务器：\033[0m"
echo -e "      \033[1;37mcd $ROOT_DIR && tar -czf chat-community-deploy.tar.gz deploy_package\033[0m"
echo
echo -e "  \033[1;33m2) 在目标机器解压并进入 deploy_package：\033[0m"
echo -e "      \033[1;37mtar -xzf chat-community-deploy.tar.gz && cd deploy_package && sudo ./install_prod_deps.sh && sudo ./run_api.sh\033[0m"
echo
echo -e "  \033[1;33m3) 将 API 设置为 systemd 服务（可选）：\033[0m"
echo -e "      \033[1;37msudo mv chat-community.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now chat-community.service\033[0m"
echo -e "\033[1;32m************************************************************\033[0m"
echo

exit 0
