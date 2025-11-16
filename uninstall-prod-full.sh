#!/bin/bash
# Chat Community 一键卸载脚本
# 卸载所有服务、依赖、配置与数据（危险操作！请谨慎执行）

set -e

read -p "确定要卸载所有服务并删除所有数据吗？(yes/no): " CONFIRM
if [[ ! "$CONFIRM" =~ ^([Yy][Ee][Ss]|[Yy])$ ]]; then
  echo "已取消卸载。"
  exit 0
fi

# 停止 pm2 服务
if command -v pm2 >/dev/null 2>&1; then
  pm2 delete chat-api || true
  pm2 kill || true
fi

# 卸载 nginx
if command -v nginx >/dev/null 2>&1; then
  sudo systemctl stop nginx
  sudo apt-get remove --purge -y nginx nginx-common nginx-core
  sudo rm -rf /etc/nginx /var/log/nginx
fi

# 卸载 PostgreSQL
if command -v psql >/dev/null 2>&1; then
  sudo systemctl stop postgresql
  sudo apt-get remove --purge -y postgresql-18 postgresql-contrib
  sudo rm -rf /var/lib/postgresql /var/log/postgresql /etc/postgresql /etc/postgresql-common
fi

# 卸载 Node.js、pnpm、pm2
if command -v node >/dev/null 2>&1; then
  sudo apt-get remove --purge -y nodejs
fi
if command -v pnpm >/dev/null 2>&1; then
  npm uninstall -g pnpm || true
fi
if command -v pm2 >/dev/null 2>&1; then
  npm uninstall -g pm2 || true
fi

# 删除项目相关文件
rm -rf packages/api/.env packages/client/.env packages/api/uploads packages/api/uploads/chunks

# 删除 nginx 配置
sudo rm -f /etc/nginx/sites-available/chat-community.conf /etc/nginx/sites-enabled/chat-community.conf

# 删除数据库（危险！如需保留请手动备份）
sudo -u postgres dropdb chat_community || true

# 清理残留依赖
sudo apt-get autoremove -y
sudo apt-get autoclean -y

echo "卸载完成，所有服务与数据已清理。"
