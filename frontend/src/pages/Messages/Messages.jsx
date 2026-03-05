import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  AtSign,
  Bot,
  CheckCheck,
  Heart,
  Megaphone,
  MessageCircleReply,
  MessageSquarePlus,
} from "lucide-react";
import {
  DEMO_USER,
  getNotifications,
  getThreadById,
  getUsers,
  markAllNotificationsRead,
  markNotificationRead,
} from "../../services/api";

const MESSAGE_POLL_INTERVAL_MS = 5 * 60 * 1000;

function formatTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function toReadablePreview(text, maxLength = 120) {
  const normalized = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}…`;
}

function typeLabel(type) {
  if (type === "answer") return "新回答";
  if (type === "reply") return "回复";
  if (type === "mention") return "提及";
  if (type === "like") return "点赞";
  if (type === "agent_event") return "Agent 事件";
  if (type === "system") return "系统通知";
  return type;
}

function typeIcon(type) {
  if (type === "answer") return <MessageSquarePlus size={14} />;
  if (type === "reply") return <MessageCircleReply size={14} />;
  if (type === "mention") return <AtSign size={14} />;
  if (type === "like") return <Heart size={14} />;
  if (type === "agent_event") return <Bot size={14} />;
  if (type === "system") return <Megaphone size={14} />;
  return <MessageCircleReply size={14} />;
}

function resolveDisplayType(item) {
  if (item?.notification_type !== "reply") {
    return item?.notification_type || "reply";
  }
  const eventType = String(item?.payload?.event_type || "").trim();
  if (eventType === "comment.created") return "answer";
  if (eventType === "comment.replied") return "reply";
  return "reply";
}

export default function Messages() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [items, setItems] = useState([]);
  const [threadTitleMap, setThreadTitleMap] = useState({});
  const [actorNameMap, setActorNameMap] = useState({});

  async function loadData(options = { onlyUnread: false, silent: false }) {
    if (!options.silent) {
      setLoading(true);
      setError("");
    }
    try {
      const data = await getNotifications(
        {
          only_unread: options.onlyUnread,
          limit: 100,
          offset: 0,
        },
        DEMO_USER,
      );
      const nextItems = Array.isArray(data) ? data : [];
      setItems(nextItems);
      const nextUnread = nextItems.filter((item) => !item.is_read).length;
      window.dispatchEvent(
        new CustomEvent("notifications:updated", {
          detail: { unreadCount: nextUnread },
        }),
      );
    } catch (err) {
      if (!options.silent) {
        setError(err?.message || "加载消息失败");
      }
    } finally {
      if (!options.silent) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    loadData({ onlyUnread });
  }, [onlyUnread]);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      loadData({ onlyUnread, silent: true });
    }, MESSAGE_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(timerId);
    };
  }, [onlyUnread]);

  useEffect(() => {
    if (items.length === 0) {
      setThreadTitleMap({});
      setActorNameMap({});
      return;
    }

    let cancelled = false;

    async function enrichMessageContext() {
      const threadIds = [
        ...new Set(items.map((item) => item.thread_id).filter(Boolean)),
      ];
      const actorIds = [
        ...new Set(
          items
            .map((item) => Number(item.actor_id))
            .filter((value) => Number.isInteger(value) && value > 0),
        ),
      ];

      const threadEntries = await Promise.all(
        threadIds.map(async (threadId) => {
          try {
            const thread = await getThreadById(threadId);
            return [threadId, thread];
          } catch {
            return [threadId, null];
          }
        }),
      );

      const actorIdSet = new Set(actorIds);
      const collectedUsers = [];
      const pageSize = 100;
      const maxPages = 20;
      for (let page = 0; page < maxPages; page += 1) {
        let batch = [];
        try {
          batch = await getUsers({
            include_inactive: true,
            limit: pageSize,
            offset: page * pageSize,
          });
        } catch {
          batch = [];
        }
        if (!Array.isArray(batch) || batch.length === 0) break;
        collectedUsers.push(...batch);
        batch.forEach((user) => actorIdSet.delete(Number(user.id)));
        if (actorIdSet.size === 0 || batch.length < pageSize) break;
      }

      if (cancelled) return;

      const nextThreadTitleMap = {};
      threadEntries.forEach(([threadId, thread]) => {
        if (!thread) return;
        nextThreadTitleMap[threadId] =
          thread.title || thread.abstract || `帖子 #${threadId}`;
      });

      const nextActorNameMap = {};
      collectedUsers.forEach((user) => {
        nextActorNameMap[user.id] =
          user.display_name || user.username || `user-${user.id}`;
      });

      setThreadTitleMap(nextThreadTitleMap);
      setActorNameMap(nextActorNameMap);
    }

    enrichMessageContext();

    return () => {
      cancelled = true;
    };
  }, [items]);

  const unreadCount = useMemo(
    () => items.filter((item) => !item.is_read).length,
    [items],
  );

  function getActorName(item) {
    if (item?.notification_type === "system") {
      return item?.payload?.title || "系统通知";
    }
    const payloadActor =
      item?.payload?.actor_display_name || item?.payload?.actor_username;
    if (payloadActor && typeof payloadActor === "string") {
      return payloadActor;
    }
    const actorId = item?.actor_id;
    if (actorId && actorNameMap[actorId]) {
      return actorNameMap[actorId];
    }
    if (actorId) {
      return `用户#${actorId}`;
    }
    return "有人";
  }

  function getThreadText(item) {
    if (item?.notification_type === "system") {
      return item?.payload?.link || "-";
    }
    if (item?.payload?.thread_title) {
      return item.payload.thread_title;
    }
    if (item?.thread_id && threadTitleMap[item.thread_id]) {
      return threadTitleMap[item.thread_id];
    }
    if (item?.thread_id) {
      return `帖子 #${item.thread_id}`;
    }
    return "帖子信息不可用";
  }

  function getMessageText(item) {
    if (item?.notification_type === "system") {
      const body = toReadablePreview(
        item?.payload?.body || item?.payload?.content_preview,
      );
      return {
        actorName: getActorName(item),
        detail: body ? ` ${body}` : "",
      };
    }

    const preview = item?.payload?.content_preview;
    const previewText = toReadablePreview(preview);
    const actorName = getActorName(item);
    const displayType = resolveDisplayType(item);
    if (previewText) {
      if (displayType === "answer") {
        return { actorName, detail: ` 回答了你的问题：${previewText}` };
      }
      if (displayType === "reply") {
        return { actorName, detail: ` 回复了你：${previewText}` };
      }
      if (item.notification_type === "mention") {
        return { actorName, detail: ` @了你：${previewText}` };
      }
      return { actorName, detail: ` ${previewText}` };
    }
    if (displayType === "answer")
      return { actorName, detail: " 回答了你的问题" };
    if (displayType === "reply") return { actorName, detail: " 回复了你" };
    if (item.notification_type === "mention")
      return { actorName, detail: " @了你" };
    if (item.notification_type === "like")
      return { actorName, detail: " 点赞了你的内容" };
    if (item.notification_type === "agent_event")
      return { actorName, detail: " 有新的执行结果" };
    return { actorName, detail: " 有一条新消息" };
  }

  function getTargetPath(item) {
    if (item?.notification_type === "system") {
      const link = String(item?.payload?.link || "").trim();
      return link || null;
    }
    if (item.thread_id) {
      if (item.comment_id) {
        return `/question/${item.thread_id}#comment-${item.comment_id}`;
      }
      return `/question/${item.thread_id}`;
    }
    return null;
  }

  async function handleRead(item) {
    if (item.is_read) return;
    try {
      await markNotificationRead(item.id, DEMO_USER);
      const nextItems = items.map((row) =>
        row.id === item.id ? { ...row, is_read: true } : row,
      );
      setItems((prev) =>
        prev.map((row) =>
          row.id === item.id ? { ...row, is_read: true } : row,
        ),
      );
      const nextUnread = nextItems.filter((row) => !row.is_read).length;
      window.dispatchEvent(
        new CustomEvent("notifications:updated", {
          detail: { unreadCount: nextUnread },
        }),
      );
    } catch (err) {
      setError(err?.message || "标记已读失败");
    }
  }

  async function handleOpen(item) {
    await handleRead(item);
    const target = getTargetPath(item);
    if (target && /^https?:\/\//i.test(target)) {
      window.open(target, "_blank", "noopener,noreferrer");
      return;
    }
    if (target) {
      navigate(target);
    }
  }

  async function handleReadAll() {
    try {
      await markAllNotificationsRead(DEMO_USER);
      setItems((prev) => prev.map((item) => ({ ...item, is_read: true })));
      window.dispatchEvent(
        new CustomEvent("notifications:updated", {
          detail: { unreadCount: 0 },
        }),
      );
    } catch (err) {
      setError(err?.message || "全部已读失败");
    }
  }

  return (
    <section className="mx-auto w-full max-w-5xl px-6 pb-8 pt-24">
      <header className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-300 text-zinc-700 hover:bg-zinc-50"
            aria-label="返回上一页"
            title="返回"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">通知中心</h1>
            <p className="mt-1 text-sm text-zinc-500">未读 {unreadCount} 条</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-zinc-600">
            <input
              type="checkbox"
              checked={onlyUnread}
              onChange={(e) => setOnlyUnread(e.target.checked)}
              className="mr-1 align-middle"
            />
            仅看未读
          </label>
          <button
            type="button"
            onClick={handleReadAll}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-300 text-zinc-700 hover:bg-zinc-50"
            aria-label="全部已读"
            title="全部已读"
          >
            <CheckCheck size={16} />
          </button>
        </div>
      </header>

      {error ?
        <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </div>
      : null}

      {loading ?
        <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
          加载中...
        </div>
      : items.length === 0 ?
        <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
          暂无通知
        </div>
      : <div className="space-y-3">
          {items.map((item) => {
            const messageText = getMessageText(item);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleOpen(item)}
                className={`w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left hover:bg-zinc-50 ${item.is_read ? "opacity-70" : ""}`}
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                    {typeIcon(resolveDisplayType(item))}
                    {typeLabel(resolveDisplayType(item))}
                  </span>
                  {!item.is_read ?
                    <span className="text-xs text-blue-600">未读</span>
                  : null}
                </div>
                <div className="text-sm text-zinc-800">
                  <strong className="font-semibold text-zinc-900">
                    {messageText.actorName}
                  </strong>
                  {messageText.detail}
                </div>
                {item.notification_type !== "system" ?
                  <div className="mt-1 text-xs text-zinc-500">
                    帖子：{getThreadText(item)}
                  </div>
                : null}
                <div className="mt-1 text-xs text-zinc-500">
                  {formatTime(item.created_at)}
                </div>
              </button>
            );
          })}
        </div>
      }
    </section>
  );
}
