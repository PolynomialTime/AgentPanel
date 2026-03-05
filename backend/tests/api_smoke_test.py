import sys
from pathlib import Path

if __package__ in {None, ""}:
    sys.path.append(str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

from app.main import app


def test_accounts(client: TestClient) -> None:
    users_resp = client.get("/api/v1/accounts/users")
    assert users_resp.status_code == 200, users_resp.text
    assert isinstance(users_resp.json(), list)

    me_missing_header_resp = client.get("/api/v1/accounts/me")
    assert me_missing_header_resp.status_code == 400, me_missing_header_resp.text
    assert me_missing_header_resp.json()["code"] == "AUTH_HEADER_MISSING"

    me_resp = client.get("/api/v1/accounts/me", headers={"X-Demo-User": "zhangsan"})
    assert me_resp.status_code == 200, me_resp.text
    assert me_resp.json()["username"] == "zhangsan"

    print("accounts: ok")


def test_agents(client: TestClient) -> None:
    list_resp = client.get("/api/v1/agents")
    assert list_resp.status_code == 200, list_resp.text
    agents = list_resp.json()
    assert len(agents) > 0

    agent_id = agents[0]["id"]
    before_count = client.get("/api/v1/forum/threads/1").json()["reply_count"]

    action_resp = client.post(
        f"/api/v1/agents/{agent_id}/actions/reply",
        headers={"X-Demo-User": "zhangsan"},
        json={"thread_id": 1, "decision_reason": "smoke test"},
    )
    assert action_resp.status_code == 201, action_resp.text
    action_id = action_resp.json()["id"]
    created_comment_id = action_resp.json()["comment_id"]
    assert created_comment_id is not None

    detail_resp = client.get(f"/api/v1/agents/actions/{action_id}")
    assert detail_resp.status_code == 200, detail_resp.text
    assert detail_resp.json()["comment_id"] == created_comment_id

    comments_resp = client.get("/api/v1/forum/threads/1/comments")
    assert comments_resp.status_code == 200, comments_resp.text
    assert any(comment["id"] == created_comment_id for comment in comments_resp.json())

    after_count = client.get("/api/v1/forum/threads/1").json()["reply_count"]
    assert after_count == before_count + 1

    print("agents: ok")


def test_forum(client: TestClient) -> None:
    headers = {"X-Demo-User": "zhangsan"}

    threads_resp = client.get("/api/v1/forum/threads")
    assert threads_resp.status_code == 200, threads_resp.text
    thread_id = threads_resp.json()[0]["id"]

    invalid_comment = client.post(
        f"/api/v1/forum/threads/{thread_id}/comments",
        headers=headers,
        json={"body": "   "},
    )
    assert invalid_comment.status_code == 422, invalid_comment.text
    invalid_payload = invalid_comment.json()
    assert invalid_payload["code"] == "validation_error"
    assert "message" in invalid_payload and "details" in invalid_payload

    root_resp = client.post(
        f"/api/v1/forum/threads/{thread_id}/comments",
        headers=headers,
        json={"body": "depth-test-root"},
    )
    assert root_resp.status_code == 201, root_resp.text
    root_id = root_resp.json()["id"]

    l2_resp = client.post(
        f"/api/v1/forum/comments/{root_id}/replies",
        headers=headers,
        json={"body": "depth-test-l2"},
    )
    assert l2_resp.status_code == 201, l2_resp.text
    l2_id = l2_resp.json()["id"]

    l3_resp = client.post(
        f"/api/v1/forum/comments/{l2_id}/replies",
        headers=headers,
        json={"body": "depth-test-l3"},
    )
    assert l3_resp.status_code == 201, l3_resp.text
    l3_id = l3_resp.json()["id"]

    l4_resp = client.post(
        f"/api/v1/forum/comments/{l3_id}/replies",
        headers=headers,
        json={"body": "depth-test-l4"},
    )
    assert l4_resp.status_code == 400, l4_resp.text

    like1 = client.post(
        "/api/v1/forum/likes",
        headers=headers,
        json={"target_type": "comment", "target_id": root_id},
    )
    assert like1.status_code == 201, like1.text

    like2 = client.post(
        "/api/v1/forum/likes",
        headers=headers,
        json={"target_type": "comment", "target_id": root_id},
    )
    assert like2.status_code == 409, like2.text
    assert like2.json()["code"] == "LIKE_ALREADY_EXISTS"

    unlike = client.request(
        "DELETE",
        "/api/v1/forum/likes",
        headers=headers,
        json={"target_type": "comment", "target_id": root_id},
    )
    assert unlike.status_code == 204, unlike.text

    before = client.get(f"/api/v1/forum/threads/{thread_id}").json()["reply_count"]
    delete_resp = client.request(
        "DELETE",
        f"/api/v1/forum/comments/{root_id}",
        headers=headers,
    )
    assert delete_resp.status_code == 204, delete_resp.text
    after = client.get(f"/api/v1/forum/threads/{thread_id}").json()["reply_count"]
    assert after <= before

    print("forum: ok")


def test_comment_delete_behavior_visibility(client: TestClient) -> None:
    headers = {"X-Demo-User": "zhangsan"}

    threads_resp = client.get("/api/v1/forum/threads")
    assert threads_resp.status_code == 200, threads_resp.text
    thread_id = threads_resp.json()[0]["id"]

    root_resp = client.post(
        f"/api/v1/forum/threads/{thread_id}/comments",
        headers=headers,
        json={"body": "delete-visibility-root"},
    )
    assert root_resp.status_code == 201, root_resp.text
    root_id = root_resp.json()["id"]

    child_resp = client.post(
        f"/api/v1/forum/comments/{root_id}/replies",
        headers=headers,
        json={"body": "delete-visibility-child"},
    )
    assert child_resp.status_code == 201, child_resp.text
    child_id = child_resp.json()["id"]

    delete_resp = client.request(
        "DELETE",
        f"/api/v1/forum/comments/{root_id}",
        headers=headers,
    )
    assert delete_resp.status_code == 204, delete_resp.text

    default_comments_resp = client.get(f"/api/v1/forum/threads/{thread_id}/comments")
    assert default_comments_resp.status_code == 200, default_comments_resp.text
    default_comments = default_comments_resp.json()
    assert all(comment["id"] != root_id for comment in default_comments)
    assert any(comment["id"] == child_id for comment in default_comments)

    include_deleted_resp = client.get(
        f"/api/v1/forum/threads/{thread_id}/comments?include_deleted=true"
    )
    assert include_deleted_resp.status_code == 200, include_deleted_resp.text
    include_deleted_comments = include_deleted_resp.json()
    deleted_root = next(
        (comment for comment in include_deleted_comments if comment["id"] == root_id),
        None,
    )
    assert deleted_root is not None
    assert deleted_root["status"] == "deleted"

    print("comment delete behavior visibility: ok")


def test_locked_thread_comment_behavior(client: TestClient) -> None:
    headers = {"X-Demo-User": "zhangsan"}

    categories_resp = client.get("/api/v1/forum/categories")
    assert categories_resp.status_code == 200, categories_resp.text
    categories = categories_resp.json()
    assert len(categories) > 0
    category_id = categories[0]["id"]

    create_thread_resp = client.post(
        "/api/v1/forum/threads",
        headers=headers,
        json={
            "category_id": category_id,
            "title": "locked-thread-smoke",
            "abstract": "for lock behavior test",
            "body": "body",
            "status": "locked",
            "is_pinned": False,
        },
    )
    assert create_thread_resp.status_code == 201, create_thread_resp.text
    locked_thread_id = create_thread_resp.json()["id"]

    comment_resp = client.post(
        f"/api/v1/forum/threads/{locked_thread_id}/comments",
        headers=headers,
        json={"body": "comment on locked thread"},
    )
    assert comment_resp.status_code == 201, comment_resp.text

    print("locked thread comment behavior: ok (currently allowed)")


def test_notifications_placeholder(client: TestClient) -> None:
    ping_resp = client.get("/api/v1/notifications/ping")
    assert ping_resp.status_code == 501, ping_resp.text
    assert ping_resp.json()["code"] == "NOT_IMPLEMENTED"

    list_resp = client.get("/api/v1/notifications")
    assert list_resp.status_code == 501, list_resp.text
    assert list_resp.json()["code"] == "NOT_IMPLEMENTED"

    print("notifications placeholder: ok")


def main() -> None:
    client = TestClient(app)
    test_accounts(client)
    test_agents(client)
    test_forum(client)
    test_comment_delete_behavior_visibility(client)
    test_locked_thread_comment_behavior(client)
    test_notifications_placeholder(client)
    print("all smoke tests: ok")


if __name__ == "__main__":
    main()
