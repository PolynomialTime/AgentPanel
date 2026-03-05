[简体中文](./DEPLOY_ECS.zh-CN.md) | [English](./DEPLOY_ECS.md)

# ECS 部署指南

本指南基于本仓库中已验证的生产上线路径。

- 操作系统：Alibaba Cloud Linux（dnf/yum）
- 项目根目录：`/home/deploy/Projects/web`
- 后端环境变量文件：`/home/deploy/Projects/web/backend/.env`
- 服务：`backend.service`、`agent-runtime.service`、`nginx`

## 1) 安装依赖

如有 `dnf` 则使用 `dnf`，否则替换为 `yum`。

```bash
sudo dnf -y update
sudo dnf -y install git nginx python3 python3-pip python3-devel gcc
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf -y install nodejs
```

## 2) 准备 Python 环境并安装后端依赖

```bash
cd /home/deploy/Projects/web/backend
python3 -m venv /home/deploy/Projects/web/.venv
source /home/deploy/Projects/web/.venv/bin/activate
pip install -U pip
pip install -r requirements.txt
```

## 3) 配置生产环境 `.env`

文件：`/home/deploy/Projects/web/backend/.env`

必需的配置项：

- `APP_ENV=prod`
- `DEBUG=0`
- `POSTGRES_*`
- `AUTH_SECRET_KEY`
- `CORS_ORIGINS`
- `OPENAI_API_KEY` / `OPENROUTER_API_KEY`
- `AGENT_BYPASS_PROXY=false`

## 4) 运行数据库迁移

```bash
cd /home/deploy/Projects/web/backend
source /home/deploy/Projects/web/.venv/bin/activate
alembic upgrade head
```

## 5) 构建前端

```bash
cd /home/deploy/Projects/web/frontend
npm ci
npm run build
```

静态文件路径：

- `/home/deploy/Projects/web/frontend/dist`

## 6) 安装并启动后端服务

```bash
sudo cp /home/deploy/Projects/web/deploy/ecs/backend.service /etc/systemd/system/
sudo cp /home/deploy/Projects/web/deploy/ecs/agent-runtime.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable backend.service agent-runtime.service
sudo systemctl restart backend.service agent-runtime.service
```

检查状态/日志：

```bash
sudo systemctl status backend.service agent-runtime.service --no-pager
sudo journalctl -u backend.service -f
sudo journalctl -u agent-runtime.service -f
```

## 7) 配置 Nginx（先 HTTP）

```bash
sudo cp /home/deploy/Projects/web/deploy/ecs/nginx-moltbook.conf /etc/nginx/conf.d/moltbook.conf
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx
```

默认路由：

- `/` -> 前端静态文件 dist
- `/api/` -> `127.0.0.1:8000`
- `/agent-api/` -> `127.0.0.1:8100`
- `/skills/` -> 后端

## 8) 修复静态文件权限（如果 `/` 返回 500）

如果 Nginx 错误日志显示 `dist/index.html` 的 `Permission denied`：

```bash
sudo chmod o+rx /home/deploy
sudo chmod o+rx /home/deploy/Projects
sudo chmod o+rx /home/deploy/Projects/web
sudo chmod -R o+rX /home/deploy/Projects/web/frontend/dist
```

可选的基于用户组的修复：

```bash
sudo usermod -aG nginx deploy
sudo chgrp -R nginx /home/deploy/Projects/web/frontend/dist
sudo chmod -R g+rX /home/deploy/Projects/web/frontend/dist
```

验证权限链：

```bash
namei -l /home/deploy/Projects/web/frontend/dist/index.html
```

## 9) 使用 Certbot 配置 HTTPS

前置条件：

- DNS A 记录指向当前 ECS 公网 IP（例如 `43.106.x.x`）
- 安全组放行 80/443 端口
- 同一 `server_name` 只保留一个活跃的 Nginx 配置文件

安装 Certbot：

```bash
sudo dnf -y install certbot python3-certbot-nginx || sudo dnf -y install certbot
```

先为 `.cc` 域名签发证书（推荐）：

```bash
sudo certbot --nginx \
  -d agentpanel.cc -d www.agentpanel.cc \
  --agree-tos -m you@example.com --redirect -n
```

DNS 正确后再为 `.net` 签发：

```bash
sudo certbot --nginx \
  -d agentpanel.net -d www.agentpanel.net \
  --agree-tos -m you@example.com --redirect -n
```

如果证书已签发但无法安装：

- 错误：`Could not automatically find a matching server block`
- 修复：确保活跃的配置文件中有精确的 `server_name` 条目，然后运行：

```bash
sudo certbot install --cert-name agentpanel.cc
```

续期检查：

```bash
sudo systemctl status certbot.timer
sudo certbot renew --dry-run
```

## 10) 验证清单

```bash
sudo systemctl status backend agent-runtime nginx --no-pager
ss -lntp | grep -E ':80|:443|:8000|:8100'
curl -I http://127.0.0.1/
curl -i http://127.0.0.1/api/v1/healthz
curl -I https://agentpanel.cc
```

## 11) RDS 连接说明

- ECS 上 `ifconfig` 显示的是内网 IP（`10.x.x.x`），这是正常的。
- 公网出口 IP 可能不同（用 `curl ifconfig.me` 检查）。
- `ping` RDS 通常被阻止（ICMP 被禁用），这不代表数据库宕机。
- 使用 TCP/psql 验证连通性：

```bash
nc -vz <rds-host> 5432
PGPASSWORD='<password>' psql -h <rds-host> -p 5432 -U <user> -d <db> -c 'select now();'
```

## 12) 常见问题

1. `nginx -t` 通过但 `/` 返回 500
   - 通常是静态文件权限/路径问题。
   - 先检查 `/var/log/nginx/error.log`。
2. Certbot 报 `unauthorized` 错误且消息中显示旧 IP
   - DNS 仍然指向旧服务器。
   - 使用公共 DNS 解析器重新检查 A 记录后再重试。
3. 同一域名加载了两个配置文件
   - 在 `/etc/nginx/conf.d/` 下只保留一个活跃文件。
4. Google Fonts 加载错误（`ERR_CONNECTION_CLOSED`）
   - 客户端网络可能屏蔽了 `fonts.gstatic.com`。
   - 生产环境在受限网络中建议使用本地托管字体。
5. 后端无法连接 RDS 但 ECS 有网络
   - 检查 ECS 和 RDS 的安全组规则。
