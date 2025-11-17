#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
SUDO=""
if [ "$EUID" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  else
    echo "需要 root 权限或 sudo 来卸载。" >&2
    exit 1
  fi
fi

# 日志持久化：若卸载过程中出现错误，收集日志并保存到 /opt/chat-community/uninstall_fail_<ts>.log
function persist_uninstall_failure_logs() {
  MERGE_OUT="/tmp/chat-community-uninstall-fail.log"
  : > "$MERGE_OUT" || true
  echo "==== Uninstall failure - $(date +%Y-%m-%dT%H:%M:%S%z) ====" | tee -a "$MERGE_OUT"

  LOGOUT="/tmp/chat-community-service-uninstall.log"
  if [ -n "${SUDO:-}" ]; then
    $SUDO journalctl -u chat-community.service -n 500 --no-pager > "$LOGOUT" 2>/dev/null || true
  else
    journalctl -u chat-community.service -n 500 --no-pager > "$LOGOUT" 2>/dev/null || true
  fi

  echo "--- systemd (last 500 lines) ---" | tee -a "$MERGE_OUT"
  if [ -f "$LOGOUT" ]; then
    tail -n 500 "$LOGOUT" | tee -a "$MERGE_OUT" || true
  fi

  echo "--- /opt/chat-community listing ---" | tee -a "$MERGE_OUT"
  if [ -d "/opt/chat-community" ]; then
    ls -la /opt/chat-community 2>/dev/null | tee -a "$MERGE_OUT" || true
    ls -la /opt/chat-community/api 2>/dev/null | tee -a "$MERGE_OUT" || true
  fi

  TS=$(date +%Y%m%d%H%M%S)
  OUTFILE="/opt/chat-community/uninstall_fail_${TS}.log"
  if [ -n "${SUDO:-}" ]; then
    $SUDO mkdir -p /opt/chat-community || true
    $SUDO cp "$MERGE_OUT" "$OUTFILE" || true
    $SUDO chmod 640 "$OUTFILE" || true
    $SUDO chown root:root "$OUTFILE" || true
  else
    mkdir -p /opt/chat-community || true
    cp "$MERGE_OUT" "$OUTFILE" || true
    chmod 640 "$OUTFILE" || true
  fi
  echo "Uninstall: persisted failure logs to: $OUTFILE" >&2
}

# 捕获错误并持久化日志
trap 'persist_uninstall_failure_logs || true; echo "Uninstall encountered an error." >&2' ERR

# 参数解析：支持 --full|-f 完全清理（包含 PostgreSQL 软件与数据），以及 --yes|-y 跳过交互
FULL=0
AUTO_YES=0
for arg in "$@"; do
  case "$arg" in
    --full|-f)
      FULL=1
      ;;
    --yes|-y)
      AUTO_YES=1
      ;;
  esac
done

echo "WARNING: This will remove the deployed Chat-Community installation and its systemd unit."
if [ "$AUTO_YES" -eq 1 ]; then
  resp=Y
else
  read -r -p "Continue and remove /opt/chat-community and systemd unit? [y/N]: " resp || true
  resp=${resp:-N}
fi
if [[ ! "$resp" =~ ^[Yy] ]]; then
  echo "Aborted. No changes made."
  exit 0
fi

echo "Stopping service chat-community.service if exists..."
$SUDO systemctl stop chat-community.service 2>/dev/null || true
$SUDO systemctl disable chat-community.service 2>/dev/null || true

echo "Removing systemd unit..."
$SUDO rm -f /etc/systemd/system/chat-community.service || true
$SUDO systemctl daemon-reload || true

# Remove systemd drop-in that loads .env (if present)
DROPIN_DIR="/etc/systemd/system/chat-community.service.d"
if [ -d "$DROPIN_DIR" ]; then
  echo "Removing systemd drop-in: $DROPIN_DIR"
  $SUDO rm -rf "$DROPIN_DIR" || true
  $SUDO systemctl daemon-reload || true
fi

echo "Removing deployment directory /opt/chat-community ..."
$SUDO rm -rf /opt/chat-community || true

# Remove possible pnpm-created .prisma symlink inside deployed api (hotfix)
if [ -L "/opt/chat-community/api/node_modules/.prisma" ] || [ -d "/opt/chat-community/api/node_modules/.prisma" ]; then
  echo "Removing node_modules/.prisma under deployment (if exists)"
  $SUDO rm -rf /opt/chat-community/api/node_modules/.prisma || true
fi

echo "Removing nginx site configuration (if exists)..."
if [ -f /etc/nginx/sites-available/chat-community ]; then
  $SUDO rm -f /etc/nginx/sites-enabled/chat-community || true
  $SUDO rm -f /etc/nginx/sites-available/chat-community || true
fi
if [ -f /etc/nginx/sites-available/chat-community-ssl ]; then
  $SUDO rm -f /etc/nginx/sites-enabled/chat-community-ssl || true
  $SUDO rm -f /etc/nginx/sites-available/chat-community-ssl || true
fi
if [ -f /etc/nginx/sites-available/chat-community-redirect ]; then
  $SUDO rm -f /etc/nginx/sites-enabled/chat-community-redirect || true
  $SUDO rm -f /etc/nginx/sites-available/chat-community-redirect || true
fi

echo "Reloading nginx if present..."
if command -v nginx >/dev/null 2>&1; then
  $SUDO nginx -t || true
  $SUDO systemctl reload nginx || true
fi


# 移除监控定时器与脚本（如果存在）
echo "Removing monitor systemd timer and script (if exists)..."
$SUDO systemctl disable --now chat-community-monitor.timer chat-community-monitor.service 2>/dev/null || true
$SUDO rm -f /etc/systemd/system/chat-community-monitor.timer /etc/systemd/system/chat-community-monitor.service || true
$SUDO systemctl daemon-reload || true
$SUDO rm -f /opt/chat-community/bin/monitor.sh || true

echo "Optionally remove system user 'chatcomm'."
if [ "$AUTO_YES" -eq 1 ]; then
  resp2=Y
else
  read -r -p "Remove user chatcomm? [y/N]: " resp2 || true
  resp2=${resp2:-N}
fi
if [[ "$resp2" =~ ^[Yy] ]]; then
  $SUDO userdel chatcomm 2>/dev/null || true
  echo "chatcomm removed (if existed)."
fi

# Optionally drop Postgres database and role (destructive)
if [ "$AUTO_YES" -eq 1 ]; then
  dropdb=Y
else
  read -r -p "Drop Postgres database 'chat_community' and role 'postgres'? This is destructive. [y/N]: " dropdb || true
  dropdb=${dropdb:-N}
fi
if [[ "${dropdb}" =~ ^[Yy] ]]; then
  echo "Dropping database 'chat_community'. For safety, the role 'postgres' will NOT be dropped automatically."
  DB_NAME="chat_community"
  ROLE_NAME="postgres"

  # Drop database (safe to drop the application database)
  $SUDO -u postgres psql -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${DB_NAME}\";" || true

  # Do NOT drop the built-in 'postgres' superuser role automatically.
  if [ "${ROLE_NAME}" != "postgres" ]; then
    $SUDO -u postgres psql -v ON_ERROR_STOP=1 -c "DROP ROLE IF EXISTS \"${ROLE_NAME}\";" || true
    echo "Role ${ROLE_NAME} dropped (if existed)."
  else
    echo "Skipped dropping role 'postgres' for safety."
    echo "If you really want to remove the role, run as postgres/root: psql -c \"DROP ROLE IF EXISTS postgres;\""
  fi

  echo "Postgres database and (optionally) role removal completed (if existed)."
fi

# 如果传入 --full，则执行彻底清理：卸载 PostgreSQL 包、删除数据目录、移除 nginx/nodejs/pnpm、并尝试删除 postgres 系统用户（非常破坏性）
if [ "$FULL" -eq 1 ]; then
  echo
  echo "FULL purge requested (--full): 将删除 PostgreSQL 包、数据库数据目录、nginx、Node/pnpm，以及 postgres 系统用户（不可逆）。"
  if [ "$AUTO_YES" -eq 0 ]; then
    read -r -p "这是不可逆的操作！请输入大写 DELETE 以确认继续：" CONFIRM || true
  else
    CONFIRM=DELETE
  fi

  if [ "${CONFIRM}" != "DELETE" ]; then
    echo "Full purge 已取消。"
  else
    echo "Proceeding with full purge..."

    # 在尝试停止服务和卸载软件之前，先尝试以 postgres 用户删除角色（若 Postgres 可用）
    if command -v psql >/dev/null 2>&1; then
      echo "尝试删除 PostgreSQL role 'postgres'（若存在）。"
      $SUDO -u postgres psql -v ON_ERROR_STOP=1 -c "DROP ROLE IF EXISTS postgres;" || true
    fi

    # 停止并卸载相关软件（根据包管理器选择）
    if command -v apt-get >/dev/null 2>&1; then
      echo "检测到 apt，停止并卸载 PostgreSQL/nginx/nodejs 类包（apt）。"
      $SUDO systemctl stop postgresql postgresql-18 || true
      $SUDO systemctl disable postgresql postgresql-18 || true
      # 若存在全局 node_modules（如 /usr/lib/node_modules 或 /usr/local/lib/node_modules），在删除 nodejs 前进行清理
      if [ -d /usr/lib/node_modules ] || [ -d /usr/local/lib/node_modules ]; then
        echo "清理全局 node_modules，以避免 dpkg 在删除 nodejs 时提示目录非空..."
        $SUDO rm -rf /usr/lib/node_modules/* 2>/dev/null || true
        $SUDO rm -rf /usr/local/lib/node_modules/* 2>/dev/null || true
        # 尝试移除空目录（如果安全）
        $SUDO rmdir /usr/lib/node_modules 2>/dev/null || true
        $SUDO rmdir /usr/local/lib/node_modules 2>/dev/null || true
      fi
      # 移除 PostgreSQL 相关包（通配符），并清理自动安装的依赖
      $SUDO apt-get remove --purge -y 'postgresql*' postgresql-client-* postgresql-18* || true
      $SUDO apt-get remove --purge -y nginx nginx-common || true
      $SUDO apt-get remove --purge -y nodejs || true
      $SUDO apt-get autoremove -y || true
      $SUDO apt-get purge -y || true

      # 清理 apt 中的 PGDG repository（若已添加）
      $SUDO rm -f /etc/apt/sources.list.d/pgdg.list || true
      $SUDO rm -f /etc/apt/keyrings/pgdg.gpg || true

    elif command -v dnf >/dev/null 2>&1 || command -v yum >/dev/null 2>&1; then
      PKG_MGR=$(command -v dnf >/dev/null 2>&1 && echo dnf || echo yum)
      echo "检测到 $PKG_MGR，尝试停止并移除 PostgreSQL/nginx/nodejs 包。"
      $SUDO systemctl stop postgresql-18 || true
      $SUDO $PKG_MGR remove -y postgresql\\* postgresql18\\* || true
      $SUDO $PKG_MGR remove -y nginx nodejs || true
      $SUDO $PKG_MGR autoremove -y || true
      $SUDO rm -f /etc/yum.repos.d/pgdg* || true
    else
      echo "未识别包管理器，跳过自动卸载软件包步骤。请手动移除 PostgreSQL/nginx/nodejs。"
    fi

    # 删除可能的 Postgres 数据目录与配置
    echo "删除 PostgreSQL 数据目录与配置..."
    $SUDO rm -rf /var/lib/postgresql /var/lib/pgsql /etc/postgresql /var/log/postgresql || true

    # 删除 pnpm 可执行文件（若存在）
    echo "删除全局 pnpm 可执行文件（若存在）..."
    $SUDO rm -f /usr/bin/pnpm /usr/local/bin/pnpm /usr/bin/corepack || true

    # 尝试删除 postgres 系统用户（非常破坏性）
    echo "尝试移除系统用户 'postgres'（如存在）..."
    $SUDO userdel -r postgres 2>/dev/null || true

    echo "Full purge 完成（请检查是否有残留配置或包，根据需要手动清理）。"
  fi
fi

echo "Uninstall complete. Review logs or leftover files if any." 
