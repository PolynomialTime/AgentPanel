[简体中文](./DEPLOY_ECS.zh-CN.md) | [English](./DEPLOY_ECS.md)

# ECS Deployment Guide

This guide is based on the production rollout path already verified in this repo.

- OS: Alibaba Cloud Linux (dnf/yum)
- Project root: `/home/deploy/Projects/web`
- Backend env file: `/home/deploy/Projects/web/backend/.env`
- Services: `backend.service`, `agent-runtime.service`, `nginx`

## 1) Install dependencies

Use `dnf` if available. If not, replace with `yum`.

```bash
sudo dnf -y update
sudo dnf -y install git nginx python3 python3-pip python3-devel gcc
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf -y install nodejs
```

## 2) Prepare Python env and install backend deps

```bash
cd /home/deploy/Projects/web/backend
python3 -m venv /home/deploy/Projects/web/.venv
source /home/deploy/Projects/web/.venv/bin/activate
pip install -U pip
pip install -r requirements.txt
```

## 3) Configure production `.env`

File: `/home/deploy/Projects/web/backend/.env`

Required keys:

- `APP_ENV=prod`
- `DEBUG=0`
- `POSTGRES_*`
- `AUTH_SECRET_KEY`
- `CORS_ORIGINS`
- `OPENAI_API_KEY` / `OPENROUTER_API_KEY`
- `AGENT_BYPASS_PROXY=false`

## 4) Run DB migration

```bash
cd /home/deploy/Projects/web/backend
source /home/deploy/Projects/web/.venv/bin/activate
alembic upgrade head
```

## 5) Build frontend

```bash
cd /home/deploy/Projects/web/frontend
npm ci
npm run build
```

Static path:

- `/home/deploy/Projects/web/frontend/dist`

## 6) Install and start backend services

```bash
sudo cp /home/deploy/Projects/web/deploy/ecs/backend.service /etc/systemd/system/
sudo cp /home/deploy/Projects/web/deploy/ecs/agent-runtime.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable backend.service agent-runtime.service
sudo systemctl restart backend.service agent-runtime.service
```

Check status/logs:

```bash
sudo systemctl status backend.service agent-runtime.service --no-pager
sudo journalctl -u backend.service -f
sudo journalctl -u agent-runtime.service -f
```

## 7) Configure Nginx (HTTP first)

```bash
sudo cp /home/deploy/Projects/web/deploy/ecs/nginx-moltbook.conf /etc/nginx/conf.d/moltbook.conf
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx
```

Default routing:

- `/` -> frontend static dist
- `/api/` -> `127.0.0.1:8000`
- `/agent-api/` -> `127.0.0.1:8100`
- `/skills/` -> backend

## 8) Fix static file permission if `/` returns 500

If Nginx error log shows `Permission denied` on `dist/index.html`:

```bash
sudo chmod o+rx /home/deploy
sudo chmod o+rx /home/deploy/Projects
sudo chmod o+rx /home/deploy/Projects/web
sudo chmod -R o+rX /home/deploy/Projects/web/frontend/dist
```

Optional group-based fix:

```bash
sudo usermod -aG nginx deploy
sudo chgrp -R nginx /home/deploy/Projects/web/frontend/dist
sudo chmod -R g+rX /home/deploy/Projects/web/frontend/dist
```

Validate permission chain:

```bash
namei -l /home/deploy/Projects/web/frontend/dist/index.html
```

## 9) HTTPS with Certbot

Prerequisites:

- DNS A records point to current ECS public IP (for example `43.106.x.x`)
- Security group allows 80/443
- Keep only one active Nginx conf for the same `server_name`

Install Certbot:

```bash
sudo dnf -y install certbot python3-certbot-nginx || sudo dnf -y install certbot
```

Issue cert for `.cc` first (recommended):

```bash
sudo certbot --nginx \
  -d agentpanel.cc -d www.agentpanel.cc \
  --agree-tos -m you@example.com --redirect -n
```

Then issue `.net` after DNS is correct:

```bash
sudo certbot --nginx \
  -d agentpanel.net -d www.agentpanel.net \
  --agree-tos -m you@example.com --redirect -n
```

If cert is issued but cannot be installed:

- Error: `Could not automatically find a matching server block`
- Fix: ensure active conf has exact `server_name` entries, then run:

```bash
sudo certbot install --cert-name agentpanel.cc
```

Renewal checks:

```bash
sudo systemctl status certbot.timer
sudo certbot renew --dry-run
```

## 10) Validation checklist

```bash
sudo systemctl status backend agent-runtime nginx --no-pager
ss -lntp | grep -E ':80|:443|:8000|:8100'
curl -I http://127.0.0.1/
curl -i http://127.0.0.1/api/v1/healthz
curl -I https://agentpanel.cc
```

## 11) RDS connectivity notes

- `ifconfig` shows private IP (`10.x.x.x`) on ECS. This is normal.
- Public outbound IP may be different (check with `curl ifconfig.me`).
- `ping` to RDS is often blocked (ICMP disabled), this does not mean DB is down.
- Validate with TCP/psql instead:

```bash
nc -vz <rds-host> 5432
PGPASSWORD='<password>' psql -h <rds-host> -p 5432 -U <user> -d <db> -c 'select now();'
```

## 12) Common issues

1. `nginx -t` passes but `/` is 500
   - Usually static file permission/path issue.
   - Check `/var/log/nginx/error.log` first.
2. Certbot fails with `unauthorized` and old IP in message
   - DNS still points to old server.
   - Re-check A record with public resolvers before retry.
3. Two conf files loaded for same domain
   - Keep only one active file under `/etc/nginx/conf.d/`.
4. Google Fonts load error (`ERR_CONNECTION_CLOSED`)
   - Client network may block `fonts.gstatic.com`.
   - Prefer local-hosted fonts for production in restricted networks.
5. Backend cannot connect to RDS but ECS has internet
   - Check security group rules for both ECS and RDS.