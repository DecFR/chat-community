#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_NAME="chat-community"
MONITOR_USER=${MONITOR_USER:-chatcomm}
API_PORT=${PROXY_PORT:-3000}
API_HOST=${API_HOST:-127.0.0.1}
DB_NAME=${DB_NAME:-chat_community}
DB_USER=${DB_USER:-postgres}

function fail() { echo "ERROR: $*" >&2; exit 2; }

function check_service() {
  local svc="$1"
  if systemctl is-active --quiet "$svc"; then
    echo "OK: systemd $svc active"
    return 0
  else
    echo "FAIL: systemd $svc not active"
    return 1
  fi
}

function check_nginx() {
  if command -v nginx >/dev/null 2>&1 && systemctl is-active --quiet nginx; then
    echo "OK: nginx running"
    return 0
  else
    echo "FAIL: nginx not running"
    return 1
  fi
}

function check_api_http() {
  local ok=1
  local urls=("http://${API_HOST}:${API_PORT}/api/health" "http://${API_HOST}:${API_PORT}/health" "http://${API_HOST}:${API_PORT}/")
  for u in "${urls[@]}"; do
    code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 "$u" || echo 000)
    if [ "$code" -ge 200 ] && [ "$code" -lt 500 ]; then
      echo "OK: api responded $code -> $u"
      ok=0
      break
    fi
  done
  if [ $ok -eq 0 ]; then return 0; else echo "FAIL: api no healthy http response"; return 1; fi
}

function check_db() {
  if command -v psql >/dev/null 2>&1; then
    if sudo -u "$DB_USER" psql -d "$DB_NAME" -c 'SELECT 1' -tA >/dev/null 2>&1; then
      echo "OK: Postgres reachable ($DB_NAME) as $DB_USER"
      return 0
    else
      echo "FAIL: Postgres cannot connect to $DB_NAME as $DB_USER user"
      return 1
    fi
  else
    echo "WARN: psql not installed, skipping DB check"
    return 2
  fi
}

function check_disk() {
  df -h /opt/chat-community 2>/dev/null | awk 'NR==1{next} {print "DISK:", $5, "used on", $1}' || echo "DISK: /opt/chat-community not found"
}

function do_check() {
  ret=0
  check_service "$SERVICE_NAME" || ret=1
  check_nginx || ret=1
  check_api_http || ret=1
  check_db || true
  check_disk
  return $ret
}

function install_systemd() {
  target_dir="/opt/chat-community/bin"
  sudo mkdir -p "$target_dir"
  sudo cp "$ROOT_DIR/monitor.sh" "$target_dir/monitor.sh"
  sudo chmod +x "$target_dir/monitor.sh"

  # unit
  cat > /tmp/chat-community-monitor.service <<'UNIT'
[Unit]
Description=Chat-Community Health Check
After=network.target

[Service]
Type=simple
# 不指定 User，允许 systemd 在 root（或 unit 被哪个用户启动就以哪个用户运行）下执行
ExecStart=/opt/chat-community/bin/monitor.sh check
Nice=10

[Install]
WantedBy=multi-user.target
UNIT

  # timer
  cat > /tmp/chat-community-monitor.timer <<'TIMER'
[Unit]
Description=Run Chat-Community health check every 5 minutes

[Timer]
OnBootSec=2m
OnUnitActiveSec=5min
Unit=chat-community-monitor.service

[Install]
WantedBy=timers.target
TIMER

  sudo mv /tmp/chat-community-monitor.service /etc/systemd/system/chat-community-monitor.service
  sudo mv /tmp/chat-community-monitor.timer /etc/systemd/system/chat-community-monitor.timer
  sudo systemctl daemon-reload
  sudo systemctl enable --now chat-community-monitor.timer
  echo "monitor installed and timer enabled (runs every 5 minutes)."
}

function uninstall_systemd() {
  sudo systemctl disable --now chat-community-monitor.timer chat-community-monitor.service || true
  sudo rm -f /etc/systemd/system/chat-community-monitor.timer /etc/systemd/system/chat-community-monitor.service || true
  sudo systemctl daemon-reload || true
  sudo rm -f /opt/chat-community/bin/monitor.sh || true
  echo "monitor uninstalled"
}

case "${1:-}" in
  check)
    do_check || exit 1
    ;;
  watch)
    while true; do do_check; sleep 30; done
    ;;
  install)
    install_systemd
    ;;
  uninstall)
    uninstall_systemd
    ;;
  *)
    echo "Usage: $0 {check|watch|install|uninstall}"
    exit 2
    ;;
esac
