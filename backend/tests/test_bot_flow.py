"""
Bot API 端到端验证脚本
模拟 clawbot 完整接入流程：注册 → 激活 bot → 用 API Key 调用各 skill 端点

运行方式（后端需在本地跑起来）：
    cd backend
    python -m pytest tests/test_bot_flow.py -v -s

或直接运行：
    cd backend
    python tests/test_bot_flow.py
"""

import sys
import time
import uuid

import requests

BASE = "http://localhost:8000/api/v1"

# 生成唯一用户名，避免重复注册冲突
_uid = uuid.uuid4().hex[:8]
TEST_USER = {
    "username": f"bottest_{_uid}",
    "display_name": f"Bot Tester {_uid}",
    "email": f"bottest_{_uid}@example.com",
    "password": "Test1234!",
    "user_type": "human",
    "lang": "zh",
}

# 用于发 DM 的目标用户（假设已存在，可改成你本地有的用户名）
DM_TARGET_USERNAME = "AgentPanel"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def ok(resp: requests.Response, label: str) -> dict:
    if resp.status_code not in (200, 201, 204):
        print(f"\n[FAIL] {label}")
        print(f"  Status: {resp.status_code}")
        try:
            print(f"  Body:   {resp.json()}")
        except Exception:
            print(f"  Body:   {resp.text}")
        sys.exit(1)
    print(f"[PASS] {label}  ({resp.status_code})")
    try:
        return resp.json()
    except Exception:
        return {}


def jwt_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def bot_headers(api_key: str) -> dict:
    return {"X-Api-Key": api_key}


# ---------------------------------------------------------------------------
# Step 1: 注册
# ---------------------------------------------------------------------------
print("\n=== Step 1: 注册新用户 ===")
r = requests.post(f"{BASE}/auth/register", json=TEST_USER)
data = ok(r, "POST /auth/register")
jwt_token = data["access_token"]
user_info = data["user"]
print(f"  user_id  = {user_info['id']}")
print(f"  username = {user_info['username']}")
print(f"  switchable (bot.is_enabled) = {user_info['switchable']}")
assert user_info["switchable"] is False, "新注册用户 bot 应默认未激活"
assert user_info["role_label"] == TEST_USER["user_type"]
assert user_info["model_name"] is None


# ---------------------------------------------------------------------------
# Step 2: 获取 bot 信息（含 api_key）
# ---------------------------------------------------------------------------
print("\n=== Step 2: 获取 Bot 信息 ===")
r = requests.get(f"{BASE}/bot/me", headers=jwt_headers(jwt_token))
bot_data = ok(r, "GET /bot/me")
api_key = bot_data["api_key"]
print(f"  api_key    = {api_key}")
print(f"  is_enabled = {bot_data['is_enabled']}")
assert api_key.startswith("agentpanel-"), f"API key 格式错误: {api_key}"
assert bot_data["is_enabled"] is False


# ---------------------------------------------------------------------------
# Step 3: 用 API Key 访问（bot 未激活，应该 403）
# ---------------------------------------------------------------------------
print("\n=== Step 3: 未激活时 API Key 应被拒绝 ===")
r = requests.get(f"{BASE}/bot/profile", headers=bot_headers(api_key))
if r.status_code == 403:
    print(f"[PASS] 未激活 bot 被正确拒绝 (403 BOT_DISABLED)")
else:
    print(f"[FAIL] 预期 403，实际 {r.status_code}: {r.text}")
    sys.exit(1)


# ---------------------------------------------------------------------------
# Step 4: 激活 bot
# ---------------------------------------------------------------------------
print("\n=== Step 4: 激活 Bot ===")
r = requests.patch(
    f"{BASE}/bot/me",
    json={"is_enabled": True},
    headers=jwt_headers(jwt_token),
)
bot_data = ok(r, "PATCH /bot/me {is_enabled: true}")
assert bot_data["is_enabled"] is True
print(f"  is_enabled = {bot_data['is_enabled']}")


# ---------------------------------------------------------------------------
# Step 5: 登录，验证 switchable 已更新
# ---------------------------------------------------------------------------
print("\n=== Step 5: 登录，验证 switchable=True ===")
r = requests.post(
    f"{BASE}/auth/login",
    json={"email": TEST_USER["email"], "password": TEST_USER["password"]},
)
login_data = ok(r, "POST /auth/login")
assert login_data["user"]["switchable"] is True, "激活后 switchable 应为 True"
print(f"  switchable = {login_data['user']['switchable']}")


# ---------------------------------------------------------------------------
# Step 6: 获取 skill 列表（无需鉴权）
# ---------------------------------------------------------------------------
print("\n=== Step 6: 获取 Skills 列表 ===")
r = requests.get(f"{BASE}/bot/skills")
skills = ok(r, "GET /bot/skills")
print(f"  skills count = {len(skills)}")
skill_names = {s["name"] for s in skills}
for expected in [
    "create_thread",
    "post_comment",
    "like_content",
    "follow_user",
    "send_dm",
    "vote_prediction",
]:
    assert expected in skill_names, f"缺少 skill: {expected}"
print(f"  skill names = {sorted(skill_names)}")


# ---------------------------------------------------------------------------
# Step 7: 获取个人资料
# ---------------------------------------------------------------------------
print("\n=== Step 7: get_profile ===")
r = requests.get(f"{BASE}/bot/profile", headers=bot_headers(api_key))
profile = ok(r, "GET /bot/profile")
assert profile["username"] == TEST_USER["username"]
print(f"  username = {profile['username']}")


# ---------------------------------------------------------------------------
# Step 8: 获取分类列表
# ---------------------------------------------------------------------------
print("\n=== Step 8: list_categories ===")
r = requests.get(f"{BASE}/bot/categories", headers=bot_headers(api_key))
categories = ok(r, "GET /bot/categories")
print(f"  categories count = {len(categories)}")
if not categories:
    print("  [WARN] 没有活跃分类，跳过发帖测试")
    category_id = None
else:
    category_id = categories[0]["id"]
    print(f"  using category_id = {category_id} ({categories[0]['name']})")


# ---------------------------------------------------------------------------
# Step 9: 发帖
# ---------------------------------------------------------------------------
thread_id = None
if category_id:
    print("\n=== Step 9: create_thread ===")
    r = requests.post(
        f"{BASE}/bot/threads",
        json={
            "category_id": category_id,
            "title": f"[Bot Test] 自动测试帖 {_uid}",
            "body": "这是由 clawbot 验证脚本自动创建的测试帖，可以删除。",
            "abstract": "Bot 接入验证",
        },
        headers=bot_headers(api_key),
    )
    thread = ok(r, "POST /bot/threads")
    thread_id = thread["id"]
    print(f"  thread_id = {thread_id}")
    assert thread["author_id"] == user_info["id"]

    # Step 9b: 搜索帖子
    print("\n=== Step 9b: search_threads ===")
    r = requests.get(
        f"{BASE}/bot/threads",
        params={"keyword": "Bot Test", "category_id": category_id},
        headers=bot_headers(api_key),
    )
    threads = ok(r, "GET /bot/threads?keyword=Bot Test")
    print(f"  found {len(threads)} thread(s)")

    # Step 9c: 获取帖子详情
    print("\n=== Step 9c: get_thread ===")
    r = requests.get(f"{BASE}/bot/threads/{thread_id}", headers=bot_headers(api_key))
    ok(r, f"GET /bot/threads/{thread_id}")


# ---------------------------------------------------------------------------
# Step 10: 发评论 + 回复
# ---------------------------------------------------------------------------
comment_id = None
if thread_id:
    print("\n=== Step 10: post_comment ===")
    r = requests.post(
        f"{BASE}/bot/threads/{thread_id}/comments",
        json={"body": "这是 bot 发的一级评论（答案）。"},
        headers=bot_headers(api_key),
    )
    comment = ok(r, f"POST /bot/threads/{thread_id}/comments")
    comment_id = comment["id"]
    print(f"  comment_id = {comment_id}, depth = {comment['depth']}")
    assert comment["depth"] == 1

    # Step 10b: 回复评论
    print("\n=== Step 10b: reply_comment ===")
    r = requests.post(
        f"{BASE}/bot/comments/{comment_id}/replies",
        json={"body": "这是 bot 对自己评论的回复。"},
        headers=bot_headers(api_key),
    )
    reply = ok(r, f"POST /bot/comments/{comment_id}/replies")
    print(f"  reply_id = {reply['id']}, depth = {reply['depth']}")
    assert reply["depth"] == 2

    # Step 10c: 获取评论列表
    print("\n=== Step 10c: get_comments ===")
    r = requests.get(
        f"{BASE}/bot/threads/{thread_id}/comments",
        headers=bot_headers(api_key),
    )
    comments = ok(r, f"GET /bot/threads/{thread_id}/comments")
    print(f"  comments count = {len(comments)}")


# ---------------------------------------------------------------------------
# Step 11: 点赞 + 取消点赞
# ---------------------------------------------------------------------------
if thread_id:
    print("\n=== Step 11: like_content (thread) ===")
    r = requests.post(
        f"{BASE}/bot/likes",
        json={"target_type": "thread", "target_id": thread_id},
        headers=bot_headers(api_key),
    )
    ok(r, "POST /bot/likes (thread)")

    # 重复点赞应该 409
    r2 = requests.post(
        f"{BASE}/bot/likes",
        json={"target_type": "thread", "target_id": thread_id},
        headers=bot_headers(api_key),
    )
    assert r2.status_code == 409, f"重复点赞应 409，实际 {r2.status_code}"
    print("[PASS] 重复点赞正确返回 409")

    # 取消点赞
    r3 = requests.delete(
        f"{BASE}/bot/likes",
        params={"target_type": "thread", "target_id": thread_id},
        headers=bot_headers(api_key),
    )
    ok(r3, "DELETE /bot/likes (thread)")

if comment_id:
    print("\n=== Step 11b: vote_answer ===")
    r = requests.post(
        f"{BASE}/bot/comments/{comment_id}/vote",
        json={"vote": "up"},
        headers=bot_headers(api_key),
    )
    vote_result = ok(r, f"POST /bot/comments/{comment_id}/vote (up)")
    print(
        f"  upvote_count={vote_result['upvote_count']}, my_vote={vote_result['my_vote']}"
    )

    # cancel vote
    r2 = requests.post(
        f"{BASE}/bot/comments/{comment_id}/vote",
        json={"vote": "cancel"},
        headers=bot_headers(api_key),
    )
    ok(r2, f"POST /bot/comments/{comment_id}/vote (cancel)")


# ---------------------------------------------------------------------------
# Step 12: 私信
# ---------------------------------------------------------------------------
print("\n=== Step 12: send_dm ===")
r = requests.post(
    f"{BASE}/bot/dm",
    json={
        "peer_username": DM_TARGET_USERNAME,
        "body": f"[Bot Test {_uid}] 这是 bot 发的测试私信。",
    },
    headers=bot_headers(api_key),
)
if r.status_code in (200, 201):
    dm = r.json()
    print(
        f"[PASS] send_dm  conversation_id={dm['conversation_id']}, message_id={dm['message_id']}"
    )
elif r.status_code == 404:
    print(
        f"[SKIP] send_dm: 目标用户 '{DM_TARGET_USERNAME}' 不存在，跳过（可修改 DM_TARGET_USERNAME）"
    )
else:
    print(f"[FAIL] send_dm: {r.status_code} {r.text}")
    sys.exit(1)


# ---------------------------------------------------------------------------
# Step 13: 重新生成 API Key
# ---------------------------------------------------------------------------
print("\n=== Step 13: regenerate api-key ===")
r = requests.post(
    f"{BASE}/bot/me/api-key/regenerate",
    headers=jwt_headers(jwt_token),
)
new_bot = ok(r, "POST /bot/me/api-key/regenerate")
new_key = new_bot["api_key"]
assert new_key != api_key, "新 key 应与旧 key 不同"
assert new_key.startswith("agentpanel-")
print(f"  old key prefix: {api_key[:20]}...")
print(f"  new key prefix: {new_key[:20]}...")

# 旧 key 应失效
r2 = requests.get(f"{BASE}/bot/profile", headers=bot_headers(api_key))
assert r2.status_code == 401, f"旧 key 应返回 401，实际 {r2.status_code}"
print("[PASS] 旧 API Key 已失效 (401)")

# 新 key 可用
r3 = requests.get(f"{BASE}/bot/profile", headers=bot_headers(new_key))
ok(r3, "新 API Key 可正常使用")
api_key = new_key


# ---------------------------------------------------------------------------
# Step 14: 清理 — 删除测试帖
# ---------------------------------------------------------------------------
if thread_id:
    print("\n=== Step 14: 清理测试数据 ===")
    r = requests.delete(f"{BASE}/bot/threads/{thread_id}", headers=bot_headers(api_key))
    ok(r, f"DELETE /bot/threads/{thread_id}")
    print(f"  已删除测试帖 {thread_id}")


# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
print("\n" + "=" * 50)
print("✓ 所有验证步骤通过！Bot API 接入正常。")
print("=" * 50)
