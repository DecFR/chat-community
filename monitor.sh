#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_NAME="chat-community"
MONITOR_USER=${MONITOR_USER:-chatcomm}
API_PORT=${PROXY_PORT:-3000}
API_HOST=${API_HOST:-127.0.0.1}
DB_NAME=${DB_NAME:-chat_community}
DB_USER=${DB_USER:-postgres}
LOG_DIR="/var/log/chat-community"
DEPLOY_LOG="$LOG_DIR/deploy.log"

function persist_monitor_failure_logs() {
  # 合并日志到临时文件，然后持久化到 /opt/chat-community
  MERGE_OUT="/tmp/chat-community-monitor-fail.log"
  : > "$MERGE_OUT" || true
  echo "==== Monitor failure - $(date +%Y-%m-%dT%H:%M:%S%z) ====" | tee -a "$MERGE_OUT"

  LOGOUT="/tmp/chat-community-service-monitor.log"
  if command -v sudo >/dev/null 2>&1; then
    sudo journalctl -u chat-community.service -n 500 --no-pager > "$LOGOUT" 2>/dev/null || true
  else
    journalctl -u chat-community.service -n 500 --no-pager > "$LOGOUT" 2>/dev/null || true
  fi

  echo "--- systemd (last 500 lines) ---" | tee -a "$MERGE_OUT"
  if [ -f "$LOGOUT" ]; then
    tail -n 500 "$LOGOUT" | tee -a "$MERGE_OUT" || true
  fi

  echo "--- deploy log (last 200 lines) ---" | tee -a "$MERGE_OUT"
  if [ -f "$DEPLOY_LOG" ]; then
    tail -n 200 "$DEPLOY_LOG" | tee -a "$MERGE_OUT" || true
  fi

  echo "--- /opt/chat-community listing ---" | tee -a "$MERGE_OUT"
  if [ -d "/opt/chat-community" ]; then
    ls -la /opt/chat-community 2>/dev/null | tee -a "$MERGE_OUT" || true
    ls -la /opt/chat-community/api 2>/dev/null | tee -a "$MERGE_OUT" || true
  fi

  TS=$(date +%Y%m%d%H%M%S)
  OUTFILE="/opt/chat-community/monitor_fail_${TS}.log"
  if command -v sudo >/dev/null 2>&1; then
    sudo mkdir -p /opt/chat-community || true
    sudo cp "$MERGE_OUT" "$OUTFILE" || true
    sudo chmod 640 "$OUTFILE" || true
    sudo chown root:root "$OUTFILE" || true
  else
    mkdir -p /opt/chat-community || true
    cp "$MERGE_OUT" "$OUTFILE" || true
    chmod 640 "$OUTFILE" || true
  fi
  echo "Monitor: persisted failure logs to: $OUTFILE" >&2
}

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
  if [ $ret -ne 0 ]; then
    persist_monitor_failure_logs || true
  fi
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
    while true; do
      if ! do_check; then
        # 当检测失败时，persist 已在 do_check 中处理；继续循环以便后续重试
        sleep 30
        continue
      fi
      sleep 30
    done
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
