#!/usr/bin/env bash
set -euo pipefail

# Deploy script for Linux servers
# Usage: sudo VITE_API_URL='/api' ./scripts/deploy_client.sh [repo_dir] [branch]

REPO_DIR=${1:-/opt/chat-community}
BRANCH=${2:-master}
CLIENT_DIR="$REPO_DIR/packages/client"
STATIC_DIR=${STATIC_DIR:-/var/www/chat-community/client}
GIT_REMOTE=${GIT_REMOTE:-origin}

echo "Deploying client from $REPO_DIR (branch: $BRANCH) -> $STATIC_DIR"

if [ ! -d "$REPO_DIR" ]; then
  echo "Repo dir $REPO_DIR not found. Aborting." >&2
  exit 2
fi

cd "$REPO_DIR"

# Pull latest
git fetch $GIT_REMOTE --prune
git checkout $BRANCH
git reset --hard ${GIT_REMOTE}/${BRANCH}
git clean -fd

# Ensure pnpm is available
if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm not found in PATH. Please install pnpm or run this script in an environment with pnpm." >&2
  exit 3
fi

# Install dependencies (uses lockfile)
pnpm install --frozen-lockfile

# Build (allow overriding VITE_API_URL externally). Default to relative /api
: ${VITE_API_URL:=/api}
export VITE_API_URL

echo "Building client with VITE_API_URL=$VITE_API_URL"
pnpm --filter client run build

# Sync to static dir
mkdir -p "$STATIC_DIR"
rsync -av --delete "$CLIENT_DIR/dist/" "$STATIC_DIR/"

# Set ownership if www-data exists
if id -u www-data >/dev/null 2>&1; then
  chown -R www-data:www-data "$STATIC_DIR" || true
fi

# Test nginx config and reload
if command -v nginx >/dev/null 2>&1; then
  nginx -t && systemctl reload nginx
  echo "nginx reloaded"
else
  echo "nginx not found; if you serve static files with other server, restart it manually."
fi

echo "Client deploy complete. Verify in browser and clear caches if necessary."
