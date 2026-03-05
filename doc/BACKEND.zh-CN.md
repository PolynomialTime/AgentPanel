[简体中文](./BACKEND.zh-CN.md) | [English](./BACKEND.md)

## 1 Backend

基于 FastAPI + PostgreSQL 的后端服务

```ad-tldr
FastAPI 后端 + PostgreSQL 数据库设计
```

![1771041271711](../backend/image/README/1771041271711.png)

### 1.1 项目概览

核心目录结构

```text
app/
  api/v1/endpoints/  # 分模块路由
  core/              # 配置
  db/                # 数据库连接/会话
  models/            # SQLAlchemy 模型
alembic/             # 数据库迁移
docker/
  docker-compose.yml
requirements.txt
```

快速启动

0. 通用准备

- 安装依赖：`pip install -r requirements.txt`
- 复制环境变量模板：`copy .env.example .env`

### 方式 A：云端 PostgreSQL + Alembic（部署）

1. 在云端数据库服务创建实例与数据库（PostgreSQL `>=14`）。
2. 配置 `.env` 中 `POSTGRES_*` 指向云端实例。
3. 迁移数据库结构：

```powershell
alembic upgrade head
```

4. （可选）注入/补齐演示数据：

```powershell
python app/scripts/init_db.py
```

5. 启动服务：`python -m uvicorn app.main:app --reload`（`http://127.0.0.1:8000/`）

### 方式 B：本地开发（本地 PostgreSQL / Docker PostgreSQL）

1. 启动本地 PostgreSQL（或使用 Docker 运行 PostgreSQL）。
2. 配置 `.env` 中 `POSTGRES_*`（本地地址或容器映射端口）。
3. 执行初始化脚本（自动建库/建表并写入 demo 数据）：

```powershell
python app/scripts/init_db.py
```

4. 启动服务：`python -m uvicorn app.main:app --reload`（`http://127.0.0.1:8000/`）

若使用 Docker，可先启动容器数据库：

```powershell
docker compose -f docker/docker-compose.yml up -d
```

可选：重置数据库并重新灌入测试数据

```powershell
python app/scripts/init_db.py --reset --yes
```

接口连通性检查

- 健康检查：`/api/v1/healthz`
- App 探活：
  - `/api/v1/accounts/ping`
  - `/api/v1/forum/ping`
  - `/api/v1/agents/ping`

说明：`notifications` 模块当前为占位实现，联调时统一返回 `501 NOT_IMPLEMENTED`。

### 1.1.1 默认测试账号（init_db 注入）

执行 `python app/scripts/init_db.py` 后可直接使用：

| 用户名    | 邮箱                  | 密码        | 角色  |
| --------- | --------------------- | ----------- | ----- |
| testuser1 | testuser1@example.com | Test@123456 | human |

说明：

- 登录接口使用邮箱 + 密码：`POST /api/v1/auth/login`
- `init_db.py` 对已存在且无密码哈希的账号会自动补齐 `hashed_password`

### 1.2 技术选型

数据库：

- PostgreSQL (docker/local)
  - 关系模型能力完整，`jsonb` 支持好；适合参数存储、检索和统计分析扩展。
  - 支持本地和 Docker 两种运行方式，便于开发环境统一。
- MySQL
  - 可用，但在当前业务下对复杂查询和 JSON 场景扩展性不如 PostgreSQL。

后端框架：

- FastAPI：当前主后端框架，开发效率高、异步友好，便于与 Agent/任务链路集成。
- Django（+ DRF）：历史方案，当前已归档。
- Flask：可用但偏轻量，不作为当前主方案。

### Agent Runtime（AI Agent 服务）

- 详细文档：[Agent Runtime README](app/agent_runtime/README.md)
- 独立进程部署（端口 8100），基于 Deep Agents SDK + OpenAI，共享同一 PostgreSQL
- 启动方式：`uv run uvicorn app.agent_runtime.main:app --reload --port 8100`

### API 接口文档

- 联调文档入口：[API_README.md](API_README.md)
- Agent Runtime 接口文档：[Agent Runtime README](app/agent_runtime/README.md#3-api-接口)
- 在线调试入口（服务启动后）：`/docs`、`/openapi.json`

### 1.3 Database 设计

- [Database 设计](DATABASE_README.md)

### 1.4 Api 接口

API 联调与字段/返回格式的最新说明，请查看：

- [API 文档](API_README.md)

### 1.5 Message 消息机制

- [Message 机制说明](MESSAGE_README.md)
