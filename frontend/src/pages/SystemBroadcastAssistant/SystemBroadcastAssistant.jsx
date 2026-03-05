import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  clearAuthToken,
  createSystemBroadcast,
  getAuthenticatedMe,
  getUsers,
  login,
  setAuthToken,
} from "../../services/api";
import "./SystemBroadcastAssistant.css";

const AUDIENCE_OPTIONS = [
  { value: "all", label: "全部用户" },
  { value: "verified", label: "仅认证用户" },
  { value: "human", label: "仅人类用户" },
  { value: "agent", label: "仅智能体用户" },
  { value: "admin", label: "仅管理员" },
];

export default function SystemBroadcastAssistant() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submittingLogin, setSubmittingLogin] = useState(false);
  const [adminUser, setAdminUser] = useState(null);
  const [loginError, setLoginError] = useState("");

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [broadcastId, setBroadcastId] = useState("");
  const [mode, setMode] = useState("audience");
  const [audience, setAudience] = useState("all");

  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userKeyword, setUserKeyword] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState([]);

  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendResult, setSendResult] = useState(null);

  const filteredUsers = useMemo(() => {
    const keyword = userKeyword.trim().toLowerCase();
    if (!keyword) return users;
    return users.filter((item) =>
      `${item.display_name || ""} ${item.username || ""}`
        .toLowerCase()
        .includes(keyword),
    );
  }, [users, userKeyword]);

  async function handleLogin(event) {
    event.preventDefault();
    setLoginError("");
    setSubmittingLogin(true);
    try {
      const result = await login({ email, password });
      if (!result?.access_token) {
        throw new Error("登录失败：未返回访问令牌");
      }
      setAuthToken(result.access_token);
      const me = await getAuthenticatedMe();
      if (me?.user_type !== "admin") {
        clearAuthToken();
        throw new Error("当前账号不是管理员，无法发送系统广播");
      }
      setAdminUser(me);
    } catch (error) {
      setLoginError(error?.message || "登录失败，请检查账号密码");
    } finally {
      setSubmittingLogin(false);
    }
  }

  async function loadAllUsers() {
    if (loadingUsers || users.length > 0) return;
    setLoadingUsers(true);
    try {
      const pageSize = 100;
      const maxPages = 20;
      const collected = [];
      for (let page = 0; page < maxPages; page += 1) {
        const batch = await getUsers({
          include_inactive: false,
          limit: pageSize,
          offset: page * pageSize,
        });
        const list = Array.isArray(batch) ? batch : [];
        if (list.length === 0) break;
        collected.push(...list);
        if (list.length < pageSize) break;
      }
      setUsers(collected);
    } finally {
      setLoadingUsers(false);
    }
  }

  function toggleUser(userId) {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ?
        prev.filter((item) => item !== userId)
      : [...prev, userId],
    );
  }

  async function handleSend(event) {
    event.preventDefault();
    setSendError("");
    setSendResult(null);
    if (!adminUser) {
      setSendError("请先登录管理员账号");
      return;
    }
    if (mode === "users" && selectedUserIds.length === 0) {
      setSendError("批量选择模式下请至少选择一个用户");
      return;
    }

    setSending(true);
    try {
      const result = await createSystemBroadcast({
        title,
        body,
        link: link || null,
        mode,
        audience,
        target_user_ids: mode === "users" ? selectedUserIds : [],
        broadcast_id: broadcastId || null,
      });
      setSendResult(result);
    } catch (error) {
      setSendError(error?.message || "发送失败");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="broadcast-page">
      <div className="broadcast-card">
        <header className="broadcast-head">
          <button
            type="button"
            className="broadcast-back"
            onClick={() => navigate(-1)}
          >
            返回
          </button>
          <div>
            <h1>系统广播助手</h1>
            <p>先登录管理员账号，再发送系统更新通知。</p>
          </div>
        </header>

        {!adminUser ?
          <form
            className="broadcast-form"
            onSubmit={handleLogin}
          >
            <h2>管理员登录</h2>
            <label>
              邮箱
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@example.com"
                required
              />
            </label>
            <label>
              密码
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="请输入密码"
                required
              />
            </label>
            {loginError ?
              <p className="broadcast-error">{loginError}</p>
            : null}
            <button
              type="submit"
              disabled={submittingLogin}
            >
              {submittingLogin ? "登录中..." : "登录管理员"}
            </button>
          </form>
        : <form
            className="broadcast-form"
            onSubmit={handleSend}
          >
            <h2>发送广播</h2>
            <p className="broadcast-identity">
              当前登录：admin / {adminUser.display_name || adminUser.username}
            </p>

            <label>
              标题
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={120}
                required
              />
            </label>

            <label>
              正文
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                maxLength={4000}
                rows={5}
                required
              />
            </label>

            <label>
              跳转链接（可选）
              <input
                type="text"
                value={link}
                onChange={(event) => setLink(event.target.value)}
                placeholder="/messages 或 https://..."
              />
            </label>

            <label>
              广播 ID（可选，幂等）
              <input
                type="text"
                value={broadcastId}
                onChange={(event) => setBroadcastId(event.target.value)}
                placeholder="例如 sys-20260303-001"
              />
            </label>

            <div className="broadcast-mode-row">
              <label>
                <input
                  type="radio"
                  name="mode"
                  value="audience"
                  checked={mode === "audience"}
                  onChange={() => setMode("audience")}
                />
                广播给分组
              </label>
              <label>
                <input
                  type="radio"
                  name="mode"
                  value="users"
                  checked={mode === "users"}
                  onChange={() => {
                    setMode("users");
                    loadAllUsers();
                  }}
                />
                批量选择用户
              </label>
            </div>

            {mode === "audience" ?
              <label>
                发送对象
                <select
                  value={audience}
                  onChange={(event) => setAudience(event.target.value)}
                >
                  {AUDIENCE_OPTIONS.map((item) => (
                    <option
                      key={item.value}
                      value={item.value}
                    >
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            : <div className="broadcast-users-panel">
                <div className="broadcast-users-head">
                  <input
                    type="text"
                    value={userKeyword}
                    onChange={(event) => setUserKeyword(event.target.value)}
                    placeholder="按昵称或用户名搜索"
                  />
                  <span>已选 {selectedUserIds.length} 人</span>
                </div>
                <div className="broadcast-users-list">
                  {loadingUsers ?
                    <p>加载用户中...</p>
                  : filteredUsers.length === 0 ?
                    <p>没有匹配用户</p>
                  : filteredUsers.slice(0, 300).map((user) => (
                      <label
                        key={user.id}
                        className="broadcast-user-item"
                      >
                        <input
                          type="checkbox"
                          checked={selectedUserIds.includes(user.id)}
                          onChange={() => toggleUser(user.id)}
                        />
                        <span>{user.display_name || user.username}</span>
                        <em>@{user.username}</em>
                      </label>
                    ))
                  }
                </div>
              </div>
            }

            {sendError ?
              <p className="broadcast-error">{sendError}</p>
            : null}
            {sendResult ?
              <p className="broadcast-success">
                发送成功：目标 {sendResult.target_users} 人，创建{" "}
                {sendResult.created_notifications} 条通知， broadcast_id=
                {sendResult.broadcast_id}
              </p>
            : null}

            <button
              type="submit"
              disabled={sending}
            >
              {sending ? "发送中..." : "发送系统广播"}
            </button>
          </form>
        }
      </div>
    </section>
  );
}
