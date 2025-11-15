#!/bin/bash

# Chat Community 自动部署脚本
# 用于快速部署到Linux服务器

set -e  # 遇到错误立即退出

echo "=================================================="
echo "  Chat Community 自动部署脚本"
echo "=================================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 检查是否以root运行
if [ "$EUID" -eq 0 ]; then 
   echo -e "${RED}请不要以root用户运行此脚本${NC}"
   echo "使用普通用户运行: ./deploy.sh"
   exit 1
fi

# 1. 检查Node.js版本
echo -e "${YELLOW}[1/10] 检查Node.js版本...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js未安装${NC}"
    echo "请先安装Node.js 20 LTS"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Node.js版本过低 (当前: v$(node -v))${NC}"
    echo "请升级到Node.js 20 LTS"
    exit 1
fi
echo -e "${GREEN}✓ Node.js版本: $(node -v)${NC}"

# 2. 检查pnpm
echo -e "${YELLOW}[2/10] 检查pnpm...${NC}"
if ! command -v pnpm &> /dev/null; then
    echo "安装pnpm..."
    corepack enable
    corepack prepare pnpm@latest --activate
fi
echo -e "${GREEN}✓ pnpm版本: $(pnpm -v)${NC}"

# 3. 检查PostgreSQL
echo -e "${YELLOW}[3/10] 检查PostgreSQL...${NC}"
if ! command -v psql &> /dev/null; then
    echo -e "${RED}❌ PostgreSQL未安装${NC}"
    echo "请先安装PostgreSQL 16"
    exit 1
fi
echo -e "${GREEN}✓ PostgreSQL已安装${NC}"

# 4. 检查环境变量文件
echo -e "${YELLOW}[4/10] 检查环境变量...${NC}"
if [ ! -f "packages/api/.env" ]; then
    echo -e "${RED}❌ 未找到 packages/api/.env${NC}"
    echo "请从 .env.example 复制并配置环境变量"
    exit 1
fi
echo -e "${GREEN}✓ 环境变量文件存在${NC}"

# 5. 安装依赖
echo -e "${YELLOW}[5/10] 安装依赖包...${NC}"
pnpm install --frozen-lockfile
echo -e "${GREEN}✓ 依赖安装完成${NC}"

# 6. 数据库迁移
echo -e "${YELLOW}[6/10] 应用数据库迁移...${NC}"
cd packages/api
pnpm prisma migrate deploy
pnpm prisma generate
cd ../..
echo -e "${GREEN}✓ 数据库迁移完成${NC}"

# 7. 编译后端
echo -e "${YELLOW}[7/10] 编译后端代码...${NC}"
cd packages/api
pnpm build
cd ../..
echo -e "${GREEN}✓ 后端编译完成${NC}"

# 8. 编译前端
echo -e "${YELLOW}[8/10] 编译前端代码...${NC}"
cd packages/client
pnpm build
cd ../..
echo -e "${GREEN}✓ 前端编译完成${NC}"

# 9. 创建必要的目录
echo -e "${YELLOW}[9/10] 创建必要目录...${NC}"
mkdir -p packages/api/uploads
mkdir -p packages/api/logs
chmod 755 packages/api/uploads
echo -e "${GREEN}✓ 目录创建完成${NC}"

# 10. 启动服务（使用PM2）
echo -e "${YELLOW}[10/10] 启动服务...${NC}"

# 检查PM2
if ! command -v pm2 &> /dev/null; then
    echo "安装PM2..."
    npm install -g pm2
fi

# 停止旧服务
pm2 delete chat-api 2>/dev/null || true

# 启动新服务
cd packages/api
pm2 start ecosystem.config.js
pm2 save
pm2 startup

cd ../..
echo -e "${GREEN}✓ 服务启动完成${NC}"

echo ""
echo "=================================================="
echo -e "${GREEN}  部署成功！${NC}"
echo "=================================================="
echo ""
echo "服务状态: pm2 status"
echo "查看日志: pm2 logs chat-api"
echo "重启服务: pm2 restart chat-api"
echo "停止服务: pm2 stop chat-api"
echo ""
echo "API地址: http://localhost:3000"
echo "健康检查: curl http://localhost:3000/health"
echo ""
echo "前端部署:"
echo "  1. 将 packages/client/dist 复制到Web服务器"
echo "  2. 配置Nginx指向dist目录"
echo "  3. 或使用: pm2 serve packages/client/dist 5173"
echo ""
echo "下一步:"
echo "  1. 访问 http://your-server-ip:5173 注册第一个用户（自动成为管理员）"
echo "  2. 配置Nginx反向代理"
echo "  3. 启用HTTPS (Let's Encrypt)"
echo "  4. 配置防火墙"
echo "  5. 设置自动备份"
echo ""
echo "详细文档:"
echo "  - DEPLOYMENT.md - 完整部署文档"
echo "  - QUICK_DEPLOY.md - 快速部署指南"
echo "  - PRE_DEPLOYMENT_CHECKLIST.md - 部署检查清单"
echo ""
