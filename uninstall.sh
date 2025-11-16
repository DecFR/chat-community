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

echo "WARNING: This will remove the deployed Chat-Community installation and its systemd unit."
read -r -p "Continue and remove /opt/chat-community and systemd unit? [y/N]: " resp || true
resp=${resp:-N}
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

echo "Removing deployment directory /opt/chat-community ..."
$SUDO rm -rf /opt/chat-community || true

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

echo "Optionally remove system user 'chatcomm'."
read -r -p "Remove user chatcomm? [y/N]: " resp2 || true
resp2=${resp2:-N}
if [[ "$resp2" =~ ^[Yy] ]]; then
  $SUDO userdel chatcomm 2>/dev/null || true
  echo "chatcomm removed (if existed)."
fi

echo "Uninstall complete. Review logs or leftover files if any." 
