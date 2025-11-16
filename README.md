# Chat-Community — 部署说明

此仓库为 Chat & Community 应用（全栈）。本文件补充了一键式 Linux 构建、环境安装与打包脚本，方便把仅包含运行时所需文件的发布包生成并传到目标服务器。

**新增文件**
- `deploy.sh`：一键完成如下流程：
	- 可选自动安装运行时环境（Node.js 22 LTS、PostgreSQL 18、pnpm/corepack 以及常用系统依赖），支持常见 Linux 发行版（基于 `apt` 或 `dnf`/`yum`）。
	- 在仓库内构建工作区（`pnpm -r build`）。
	- 生成精简的 `deploy_package`，包含 `api/dist`、`client/dist`、`install_prod_deps.sh`、`run_api.sh`、`chat-community.service` 模板等。

目的：不直接删除源码或仓库文件，而是在本地生成一个精简的发布目录（`deploy_package`），该目录仅包含运行时所需的文件，用于传到 Linux 服务器并快速部署。

环境安装说明
- 脚本支持两类自动安装：Debian/Ubuntu（`apt`）与 RHEL/Fedora/CentOS（`dnf`/`yum`）。
- 安装内容（可选）：
	- Node.js 22 LTS（通过 NodeSource 官方脚本）
	- PostgreSQL 18（通过 PostgreSQL 官方仓库/PGDG）
	- pnpm（尝试通过 `corepack` 或 `npm -g` 安装）
	- 基础工具：`curl`/`wget`/`ca-certificates`/`gnupg`/编译工具
- 脚本会检测当前是否以 root 运行；若非 root，会在需要提权的命令前使用 `sudo`（必须系统中有 sudo）。
- 非交互运行：传入 `--yes` 或 `-y` 可跳过交互确认（适合 CI）。

快速使用
1. 给脚本赋可执行权限并运行（在本地开发机或 CI 上执行）：

```bash
chmod +x ./deploy.sh
./deploy.sh        # 交互式，询问是否安装环境
./deploy.sh --yes  # 非交互式，自动安装环境并构建
```

2. 脚本完成后，会在仓库根生成 `deploy_package`。将它打包并传到目标服务器：

```bash
tar -czf chat-community-deploy.tar.gz -C . deploy_package
scp chat-community-deploy.tar.gz user@server:/tmp/
# 或者使用 rsync/sftp 等
```

3. 在目标服务器上：

```bash
tar -xzf chat-community-deploy.tar.gz -C /opt/
cd /opt/deploy_package
./install_prod_deps.sh    # 在目标机器安装生产依赖（需要 pnpm 或 corepack）
./run_api.sh &            # 或者用 systemd 管理
```

systemd 示例
1. 将 `deploy_package/chat-community.service` 复制到 `/etc/systemd/system/chat-community.service`，编辑 `WorkingDirectory` 为 `/opt/deploy_package/api` 或你选择的路径。
2. 启用并启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now chat-community.service
sudo journalctl -u chat-community.service -f
```

注意事项
- 脚本不会替你在目标机器上创建数据库或执行 `prisma migrate deploy`（生产环境建议在部署前运行或由 CI/CD 负责）。
- 请确保目标机器的 Node ABI 与构建时一致；若要将 `node_modules` 一并打包，请在 CI 中为目标平台安装生产依赖后一起打包。
 - 脚本不会替你在目标机器上创建数据库或执行 `prisma migrate deploy`（生产环境建议在部署前运行或由 CI/CD 负责）。
 - 请确保目标机器的 Node ABI 与构建时一致；若要将 `node_modules` 一并打包，请在 CI 中为目标平台安装生产依赖后一起打包。
 - 脚本在生成 `packages/api/.env` 及发布包副本时，会将该文件权限设置为 `600`（仅所有者可读写），以减少凭据泄露风险。

可选改进（我可以帮你实现）
- 在 CI 中生成包含生产 `node_modules` 的发布包（更快的部署，但需确保平台一致性）。
- 生成 Dockerfile / docker-compose 配置用于容器化部署。

HTTPS / Nginx 配置示例
 - 脚本支持通过环境变量定制 nginx 的域名与证书路径：
   - `NGINX_DOMAIN`：你的域名（例如 `example.com`）
   - `SSL_CERT`：证书文件绝对路径（例如 `/etc/ssl/certs/example.com.pem`）
   - `SSL_KEY`：证书私钥绝对路径（例如 `/etc/ssl/private/example.com.key`）
   - `PROXY_PORT`：后端监听端口（默认 `3000`）

 - 使用方式示例（在运行 `deploy.sh` 前导出变量或者在同一行传入）：

```bash
export NGINX_DOMAIN=your_domain.com
export SSL_CERT=/etc/ssl/certs/your_domain.com.pem
export SSL_KEY=/etc/ssl/private/your_domain.com.key
export PROXY_PORT=3000
./deploy.sh --yes
```

 - 如果未提供证书路径，脚本会生成一个示例配置文件：
   `/etc/nginx/sites-available/chat-community-ssl.example`，你可以编辑该文件、替换 `your_domain.com` 与证书路径，然后移动到：

```bash
sudo mv /etc/nginx/sites-available/chat-community-ssl.example /etc/nginx/sites-available/chat-community-ssl
sudo ln -s /etc/nginx/sites-available/chat-community-ssl /etc/nginx/sites-enabled/chat-community-ssl
sudo nginx -t && sudo systemctl reload nginx
```

 - 示例 HTTPS 配置（脚本生成或示例文件内容）：

```nginx
# HTTP -> HTTPS 重定向
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

	# client_max_body_size 0; # 如需上传大文件可取消注释

	root /var/www/chat-community/client;
	index index.html;

	location /api/ {
		proxy_pass http://127.0.0.1:3000/; # 修改为 $PROXY_PORT 如需
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
```

---
生成时间：自动生成（含构建脚本和部署说明）
