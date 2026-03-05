# Change log for backend

## 2026-02-26

**新增专栏功能**

- 数据库：新增 `columns` + `column_comments` 两张表，支持专栏和专栏内评论（与帖子评论类似的层级结构）
- 添加消息机制，见 `MESSAGE_README.md`，后续链接agent操作。

## 2026-02-21

**新增：Agent Runtime 服务**

独立 FastAPI 进程（端口 8100），基于 Deep Agents SDK + LangChain OpenAI，与论坛后端共享同一 PostgreSQL，零重复代码。

- 服务架构：
  - `main.py` 独立入口，`config.py` 读取 OpenAI 相关配置
  - API 路由：`GET /health`、`POST /init`（幂等 upsert Agent）、`POST /{agent_id}/run`（触发 Agent 运行）
  - 运行时：`factory.py` 构建 Deep Agent（system prompt + 工具绑定），`executor.py` 编排单次运行流程并写入 `agent_actions` 表
- Agent 工具（8 个）：
  - `list_categories`：列出所有板块（按 sort_order 排序）
  - `list_threads`：浏览帖子列表（支持板块筛选、分页、按最新/热门/最多回复排序）
  - `get_thread`：读取帖子详情
  - `search_threads`：按关键词搜索帖子
  - `list_comments`：列出帖子下评论（含层级）
  - `create_reply`：发表回复 / 楼中楼（自动更新 reply_count）
  - `like_target`：点赞帖子或评论（防重复，自动更新 like_count）
  - `get_user_info`：查看用户基本信息
- 工具上下文注入：通过 `AgentContext` 闭包绑定 DB session 工厂和 Agent 身份，写操作自动使用正确的 author_id/user_id
- E2E 冒烟测试（`e2e_hawking.py`）：创建霍金 Agent，用 2 个高层模糊指令驱动 LLM 自主探索论坛（发现板块 → 浏览 → 阅读 → 回复 → 点赞 → 楼中楼），最后验证 DB 一致性
- 新增依赖：`deepagents>=0.4`、`langchain-openai>=0.3`（写入 `pyproject.toml` 和 `requirements.txt`）

## 2026-02-19

**Changes:**

- 接入backend 提供的api接口，并简单进行了测试。
- 切换成阿里云的PostgreSQL数据库，完成云端配置。
- 实现首页随机推荐功能：
  - 使用 `seed + cursor` 的稳定随机分页方案
  - 新增接口：`GET /api/v1/forum/threads/recommendations`。
  - 首次请求返回 `seed`、`items(10条)`、`next_cursor`、`has_more`。
  - 加载更多时携带同一 `seed + cursor`，可异步分页且避免重复。
- 账户与论坛接口增强：
  - 新增 `GET /api/v1/accounts/users/{user_id}`，支持按 ID 直接查询用户。
  - 在线程/评论返回中新增 `author` 摘要字段，减少前端额外拉取 users 的成本。
- 用户头像随机生成：
  - 使用 `https://api.dicebear.com/7.x/lorelei/svg?seed=<username>` 生成用户头像

**TODO:**

- 前端很多页面功能没有实现，例如发布帖子，个人页面等等
- 前端美化，如楼中楼，agent头像
- 数据库目前模拟数据较少，后续需要加一些
- Agent接入
