#!/usr/bin/env bash
# Uninstall script for Chat-Community (Linux)
# - Stops and disables systemd service `chat-community-api.service` (if exists)
# - Removes nginx site config `chat-community.conf` and reloads nginx
# - Removes front-end static files (default `/var/www/chat-community/client`)
# - Optionally drops Postgres database and user (must have psql access)
# - Removes application directory (default `/opt/chat-community`) and env files
#
# Usage: sudo ./uninstall.sh [--yes] [--no-db-drop] [--backup-db PATH]

set -euo pipefail

SCRIPT_NAME="$(basename "$0")"
FORCE=no
KEEP_DB=no
DB_BACKUP_PATH=""
REMOVE_USER=no

print_help() {
  cat <<EOF
Usage: sudo $SCRIPT_NAME [options]

Options:
  --yes              : skip interactive confirmations (dangerous)
  --no-db-drop       : do not drop the PostgreSQL database/user
  --backup-db PATH   : before dropping DB, run pg_dump to PATH (eg. /root/chat-backup.sql)
  --remove-user      : after removing files, remove system user 'chatuser'
  --dry-run          : show what would be done but don't execute destructive actions
  -h, --help         : show this help

This script attempts to be idempotent and will check for existence of files/services
before taking action. Still — running with --yes will perform destructive deletes.
EOF
}

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --yes) FORCE=yes; shift ;;
    --no-db-drop) KEEP_DB=yes; shift ;;
    --backup-db) DB_BACKUP_PATH="$2"; shift 2 ;;
    --remove-user) REMOVE_USER=yes; shift ;;
    --dry-run) DRY_RUN=yes; shift ;;
    -h|--help) print_help; exit 0 ;;
    *) echo "Unknown option: $1"; print_help; exit 2 ;;
  esac
done

DRY_RUN=${DRY_RUN:-no}

confirm_or_die() {
  local msg="$1"
  if [[ "$FORCE" == "yes" ]]; then
    echo "[FORCE] $msg"
    return 0
  fi
  if [[ "$DRY_RUN" == "yes" ]]; then
    echo "[DRY-RUN] $msg"
    return 0
  fi
  read -r -p "$msg [y/N]: " REPLY
  if [[ ! "$REPLY" =~ ^[Yy]$ ]]; then
    echo "Aborted by user." >&2
    exit 1
  fi
}

run_or_echo() {
  if [[ "$DRY_RUN" == "yes" ]]; then
    echo "DRY-RUN: $*"
  else
    echo "+ $*";
    eval "$*";
  fi
}

echo "== Chat-Community Uninstall Script =="

if [[ $EUID -ne 0 ]]; then
  echo "Warning: it's recommended to run this script as root (sudo)." >&2
fi

APP_DIR="/opt/chat-community"
STATIC_DIR="/var/www/chat-community/client"
SYSTEMD_SERVICE="/etc/systemd/system/chat-community-api.service"
ENV_FILE="/etc/chat-community/api.env"

# 1) Stop & disable systemd service if present
if [[ -f "$SYSTEMD_SERVICE" ]] || systemctl list-units --full -all | grep -q "chat-community-api"; then
  echo "Found systemd unit: $SYSTEMD_SERVICE"
  confirm_or_die "Stop and disable systemd service 'chat-community-api'?"
  run_or_echo "systemctl stop chat-community-api.service || true"
  run_or_echo "systemctl disable chat-community-api.service || true"
  run_or_echo "rm -f '$SYSTEMD_SERVICE' || true"
  run_or_echo "systemctl daemon-reload || true"
else
  echo "No systemd unit found for chat-community-api, skipping service stop." 
fi

# (无需处理 pm2 — 如未使用，脚本不会尝试操作 pm2)

# 3) Nginx site removal
NGINX_AVAILABLE="/etc/nginx/sites-available/chat-community.conf"
NGINX_ENABLED="/etc/nginx/sites-enabled/chat-community.conf"
if [[ -f "$NGINX_AVAILABLE" || -L "$NGINX_ENABLED" ]]; then
  echo "Nginx site configuration detected."
  confirm_or_die "Remove nginx site configuration and reload nginx?"
  run_or_echo "rm -f '$NGINX_ENABLED' || true"
  run_or_echo "rm -f '$NGINX_AVAILABLE' || true"
  run_or_echo "nginx -t >/dev/null 2>&1 || true"
  run_or_echo "systemctl reload nginx || true"
else
  echo "No nginx chat-community site found, skipping nginx cleanup."
fi

# 4) Remove front-end static files
if [[ -d "$STATIC_DIR" ]]; then
  confirm_or_die "Delete front-end static directory '$STATIC_DIR'?"
  run_or_echo "rm -rf '$STATIC_DIR'"
else
  echo "Static dir $STATIC_DIR not found, skipping."
fi

# 5) Remove env file
if [[ -f "$ENV_FILE" ]]; then
  confirm_or_die "Remove environment file '$ENV_FILE'?"
  run_or_echo "rm -f '$ENV_FILE'"
else
  echo "Env file $ENV_FILE not found, skipping."
fi

# 6) Optionally drop postgres DB and user
if [[ "$KEEP_DB" == "no" ]]; then
  # detect psql
  if command -v psql >/dev/null 2>&1; then
    echo "psql detected. About to check for database 'chat_community'."
    # check DB exists
    DB_EXISTS=no
    if psql -Atqc "SELECT 1 FROM pg_database WHERE datname='chat_community'" >/dev/null 2>&1; then
      DB_EXISTS=yes
    fi
    if [[ "$DB_EXISTS" == "yes" ]]; then
      if [[ -n "$DB_BACKUP_PATH" ]]; then
        confirm_or_die "Create DB dump to '$DB_BACKUP_PATH' before dropping database?"
        run_or_echo "pg_dump -Fc -d postgresql://postgres@localhost/chat_community -f '$DB_BACKUP_PATH'"
        echo "Dump saved to $DB_BACKUP_PATH"
      fi
      confirm_or_die "Drop database 'chat_community' and user 'chatuser'? This is irreversible." 
      # Use single-quote outer to keep inner SQL double-quotes intact and avoid bash parsing errors
      run_or_echo 'psql -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS chat_community;"'
      run_or_echo 'psql -v ON_ERROR_STOP=1 -c "DROP ROLE IF EXISTS chatuser;"'
    else
      echo "Database 'chat_community' not found, skipping drop."
    fi
  else
    echo "psql not found; cannot drop DB. Skipping."
  fi
else
  echo "Skipping DB drop because --no-db-drop supplied."
fi

# 7) Remove application directory
if [[ -d "$APP_DIR" ]]; then
  confirm_or_die "Delete application directory '$APP_DIR' (includes logs, dist, uploads)?"
  run_or_echo "rm -rf '$APP_DIR'"
else
  echo "Application directory $APP_DIR not found, skipping."
fi

# 8) Optionally remove system user chatuser
if [[ "$REMOVE_USER" == "yes" ]]; then
  if id -u chatuser >/dev/null 2>&1; then
    confirm_or_die "Delete system user 'chatuser' and remove its home directory?"
    run_or_echo "userdel -r chatuser || true"
  else
    echo "User 'chatuser' not found, skipping."
  fi
fi

echo "Cleanup finished."
if [[ "$DRY_RUN" == "yes" ]]; then
  echo "(Dry run mode — no destructive actions were performed)"
fi

echo "NOTE: This script does not automatically remove certificates in /etc/letsencrypt.
If you used Let's Encrypt and want to remove certs, remove them manually or via certbot.
Also review nginx, firewall, and other system settings that may reference the app."

exit 0
