import "./Navbar.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Bell, CheckCheck, MessageSquareMore } from "lucide-react";
import { translateCategoryName, useI18n } from "../i18n";
import {
  clearAuthToken,
  DEMO_USER,
  getAuthenticatedMe,
  getAuthToken,
  getDmConversations,
  getCategories,
  getNotifications,
  getUnreadNotificationCount,
  markDmConversationRead,
  markNotificationRead,
  getThreadComments,
  getThreads,
  getUsers,
  updateMe,
} from "../services/api";
import { canSwitchRole, resolveRoleLabel } from "../services/userIdentity";

const NOTIFICATION_POLL_INTERVAL_MS = 30 * 1000;

export default function Navbar() {
  const { t, language, toggleLanguage } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();

  const [searchVal, setSearchVal] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  const [currentUser, setCurrentUser] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [dmUnreadCount, setDmUnreadCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [switchingRole, setSwitchingRole] = useState(false);
  const [messagePreviewOpen, setMessagePreviewOpen] = useState(false);
  const [messagePreviewItems, setMessagePreviewItems] = useState([]);
  const [messagePreviewLoading, setMessagePreviewLoading] = useState(false);
  const [messagePreviewError, setMessagePreviewError] = useState("");
  const [dmPreviewOpen, setDmPreviewOpen] = useState(false);
  const [dmPreviewItems, setDmPreviewItems] = useState([]);
  const [dmPreviewLoading, setDmPreviewLoading] = useState(false);
  const [dmPreviewError, setDmPreviewError] = useState("");

  const [threads, setThreads] = useState([]);
  const [users, setUsers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [allComments, setAllComments] = useState([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  const blurTimerRef = useRef(null);
  const menuRef = useRef(null);
  const messagePreviewRef = useRef(null);
  const dmPreviewRef = useRef(null);

  function formatMessageTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString(language === "zh" ? "zh-CN" : "en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function compactText(text, maxLength = 64) {
    const normalized = String(text || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!normalized) return "";
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, maxLength)}…`;
  }

  function getPreviewActorName(item) {
    if (item?.notification_type === "system") {
      return item?.payload?.title || t({ en: "System Notice", zh: "系统通知" });
    }
    return (
      item?.payload?.actor_display_name ||
      item?.payload?.actor_username ||
      t({ en: "Someone", zh: "有人" })
    );
  }

  function buildMessagePreviewText(item) {
    if (item?.notification_type === "system") {
      const preview = compactText(
        item?.payload?.body || item?.payload?.content_preview,
        64,
      );
      return preview ? ` ${preview}` : "";
    }

    const preview = compactText(item?.payload?.content_preview, 64);
    const eventType = String(item?.payload?.event_type || "").trim();
    const displayType = resolvePreviewType(item);

    if (item.notification_type === "like") {
      return t({
        en: " liked your content",
        zh: " 点赞了你的内容",
      });
    }

    if (item.notification_type === "mention") {
      return preview ?
          t({
            en: ` mentioned you: ${preview}`,
            zh: ` 提及了你：${preview}`,
          })
        : t({ en: " mentioned you", zh: " 提及了你" });
    }

    if (
      displayType === "answer" ||
      (item.notification_type === "reply" && eventType === "comment.created")
    ) {
      return preview ?
          t({
            en: ` answered your question: ${preview}`,
            zh: ` 回答了你的问题：${preview}`,
          })
        : t({
            en: " answered your question",
            zh: " 回答了你的问题",
          });
    }

    return preview ?
        t({
          en: ` replied: ${preview}`,
          zh: ` 回复了你：${preview}`,
        })
      : t({ en: " replied to you", zh: " 回复了你" });
  }

  function resolvePreviewType(item) {
    if (item?.notification_type !== "reply") {
      return item?.notification_type || "reply";
    }
    const eventType = String(item?.payload?.event_type || "").trim();
    if (eventType === "comment.created") return "answer";
    if (eventType === "comment.replied") return "reply";
    return "reply";
  }

  function previewTypeLabel(type) {
    if (type === "system") return t({ en: "SYSTEM", zh: "系统" });
    if (type === "answer") return t({ en: "NEW ANSWER", zh: "新回答" });
    if (type === "reply") return t({ en: "REPLY", zh: "回复" });
    if (type === "mention") return t({ en: "MENTION", zh: "提及" });
    if (type === "like") return t({ en: "LIKE", zh: "点赞" });
    return t({ en: "MESSAGE", zh: "消息" });
  }

  function buildDmPreviewText(item) {
    const preview = compactText(item?.last_message_preview, 64);
    return preview || t({ en: "No messages", zh: "暂无消息" });
  }

  function getNotificationTargetPath(item) {
    if (item?.notification_type === "system") {
      const link = String(item?.payload?.link || "").trim();
      if (link) return link;
      return "/messages";
    }
    if (item?.thread_id) {
      if (item?.comment_id) {
        return `/question/${item.thread_id}#comment-${item.comment_id}`;
      }
      return `/question/${item.thread_id}`;
    }
    return "/messages";
  }

  async function handlePreviewItemClick(item) {
    const targetPath = getNotificationTargetPath(item);
    setMessagePreviewOpen(false);

    if (!item?.is_read) {
      try {
        await markNotificationRead(item.id, currentUser?.username || DEMO_USER);
      } catch {
        // non-critical
      }

      setMessagePreviewItems((prev) =>
        prev.filter((row) => row.id !== item.id),
      );

      setUnreadCount((prev) => {
        const next = Math.max(0, Number(prev || 0) - 1);
        window.dispatchEvent(
          new CustomEvent("notifications:updated", {
            detail: { unreadCount: next },
          }),
        );
        return next;
      });
    }

    if (/^https?:\/\//i.test(targetPath)) {
      window.open(targetPath, "_blank", "noopener,noreferrer");
      return;
    }

    navigate(targetPath);
  }

  async function loadMessagePreview({ silent = false } = {}) {
    if (!currentUser) return;
    if (!silent) {
      setMessagePreviewLoading(true);
      setMessagePreviewError("");
    }
    try {
      const rows = await getNotifications(
        {
          only_unread: true,
          limit: 5,
          offset: 0,
        },
        currentUser.username || DEMO_USER,
      );
      const list = (Array.isArray(rows) ? rows : []).filter(
        (item) => !item?.is_read,
      );
      setMessagePreviewItems(list);
    } catch {
      if (!silent) {
        setMessagePreviewError(
          t({ en: "Failed to load messages.", zh: "消息加载失败。" }),
        );
      }
    } finally {
      if (!silent) {
        setMessagePreviewLoading(false);
      }
    }
  }

  async function loadDmPreview({ silent = false } = {}) {
    if (!currentUser) return;
    if (!silent) {
      setDmPreviewLoading(true);
      setDmPreviewError("");
    }
    try {
      const rows = await getDmConversations(
        { limit: 5, offset: 0 },
        currentUser.username || DEMO_USER,
      );
      const list = (Array.isArray(rows) ? rows : []).filter(
        (item) => Number(item?.unread_count || 0) > 0,
      );
      list.sort(
        (left, right) =>
          Number(right?.unread_count || 0) - Number(left?.unread_count || 0),
      );
      setDmPreviewItems(list);
    } catch {
      if (!silent) {
        setDmPreviewError(
          t({ en: "Failed to load private messages.", zh: "私信加载失败。" }),
        );
      }
    } finally {
      if (!silent) {
        setDmPreviewLoading(false);
      }
    }
  }

  async function refreshUnreadCount() {
    if (!currentUser) {
      setUnreadCount(0);
      return;
    }
    try {
      const result = await getUnreadNotificationCount(
        currentUser.username || DEMO_USER,
      );
      setUnreadCount(Number(result?.unread_count || 0));
    } catch {
      setUnreadCount(0);
    }
  }

  async function refreshDmUnreadCount() {
    if (!currentUser) {
      setDmUnreadCount(0);
      return;
    }
    try {
      const rows = await getDmConversations(
        { limit: 100, offset: 0 },
        currentUser.username || DEMO_USER,
      );
      const list = Array.isArray(rows) ? rows : [];
      const unread = list.reduce(
        (sum, item) => sum + Number(item?.unread_count || 0),
        0,
      );
      setDmUnreadCount(unread);
    } catch {
      setDmUnreadCount(0);
    }
  }

  async function handleMarkAllDmRead() {
    if (!currentUser || dmPreviewItems.length === 0) return;
    try {
      const unreadList = dmPreviewItems.filter(
        (item) => Number(item?.unread_count || 0) > 0,
      );
      await Promise.all(
        unreadList.map((item) =>
          markDmConversationRead(item.id, currentUser.username || DEMO_USER),
        ),
      );
      setDmPreviewItems([]);
      setDmUnreadCount(0);
    } catch {
      setDmPreviewError(
        t({ en: "Failed to mark all as read.", zh: "全部已读失败。" }),
      );
    }
  }

  function pollMessageAndDm({ silentPreview = true } = {}) {
    refreshUnreadCount();
    refreshDmUnreadCount();
    if (messagePreviewOpen) {
      loadMessagePreview({ silent: silentPreview });
    }
    if (dmPreviewOpen) {
      loadDmPreview({ silent: silentPreview });
    }
  }

  useEffect(() => {
    async function resolveCurrentUser() {
      const token = getAuthToken();
      if (!token) {
        setCurrentUser(null);
        return;
      }
      try {
        const me = await getAuthenticatedMe();
        setCurrentUser(me);
      } catch {
        clearAuthToken();
        setCurrentUser(null);
      }
    }

    resolveCurrentUser();
  }, [location.pathname]);

  useEffect(() => {
    pollMessageAndDm({ silentPreview: true });
  }, [currentUser, location.pathname]);

  useEffect(() => {
    if (!currentUser) return;

    const timerId = window.setInterval(() => {
      pollMessageAndDm({ silentPreview: true });
    }, NOTIFICATION_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(timerId);
    };
  }, [currentUser, messagePreviewOpen, dmPreviewOpen]);

  useEffect(() => {
    function handleNotificationsUpdated(event) {
      const nextUnread = event?.detail?.unreadCount;
      if (typeof nextUnread === "number") {
        setUnreadCount(Math.max(0, nextUnread));
      }
    }

    window.addEventListener(
      "notifications:updated",
      handleNotificationsUpdated,
    );
    return () => {
      window.removeEventListener(
        "notifications:updated",
        handleNotificationsUpdated,
      );
    };
  }, []);

  useEffect(() => {
    function handleDmUpdated(event) {
      const nextUnread = event?.detail?.unreadCount;
      if (typeof nextUnread === "number") {
        setDmUnreadCount(Math.max(0, nextUnread));
      }
    }

    window.addEventListener("dm:updated", handleDmUpdated);
    return () => {
      window.removeEventListener("dm:updated", handleDmUpdated);
    };
  }, []);

  useEffect(() => {
    function handleOutsideClick(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
      if (
        messagePreviewRef.current &&
        !messagePreviewRef.current.contains(event.target)
      ) {
        setMessagePreviewOpen(false);
      }
      if (
        dmPreviewRef.current &&
        !dmPreviewRef.current.contains(event.target)
      ) {
        setDmPreviewOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => {
    setMessagePreviewOpen(false);
    setDmPreviewOpen(false);
  }, [location.pathname]);

  async function loadData() {
    if (dataLoaded) return;
    try {
      const [threadList, userList, categoryList] = await Promise.all([
        getThreads({ limit: 100 }),
        getUsers({ include_inactive: false, limit: 100 }),
        getCategories(),
      ]);
      setThreads(threadList);
      setUsers(userList);
      setCategories(categoryList);
      setDataLoaded(true);

      const batches = await Promise.all(
        threadList.map((thread) =>
          getThreadComments(thread.id).catch(() => []),
        ),
      );
      setAllComments(batches.flat());
    } catch {
      // non-critical
    }
  }

  function handleFocus() {
    clearTimeout(blurTimerRef.current);
    setIsFocused(true);
    loadData();
  }

  function handleBlur() {
    blurTimerRef.current = setTimeout(() => setIsFocused(false), 150);
  }

  function handleSelect(path) {
    navigate(path);
    setSearchVal("");
    setIsFocused(false);
  }

  function handleSearch(e) {
    e.preventDefault();
    const q = searchVal.trim();
    if (q) {
      navigate(`/?q=${encodeURIComponent(q)}`);
      setIsFocused(false);
      return;
    }
    navigate("/");
  }

  function handleKeyDown(e) {
    if (e.key === "Escape") {
      setSearchVal("");
      setIsFocused(false);
      e.target.blur();
    }
  }

  function handleLogout() {
    clearAuthToken();
    window.location.href = "/";
  }

  async function handleSetUserType(nextType) {
    if (!currentUser || switchingRole) return;
    if (!canSwitchRole(currentUser)) return;
    if (currentUser.user_type === nextType) return;
    setSwitchingRole(true);
    try {
      const updated = await updateMe({ user_type: nextType });
      setCurrentUser(updated);
      window.dispatchEvent(
        new CustomEvent("user-type-changed", {
          detail: {
            user_type: updated.user_type,
            username: updated.username,
          },
        }),
      );
    } catch {
      // non-critical
    } finally {
      setSwitchingRole(false);
    }
  }

  function openUserPage(tab) {
    if (!currentUser) return;
    setMenuOpen(false);
    const suffix = tab ? `?tab=${encodeURIComponent(tab)}` : "";
    navigate(`/user/${currentUser.username || currentUser.id}${suffix}`);
  }

  const suggestions = useMemo(() => {
    const q = searchVal.trim().toLowerCase();
    if (!q) return { threads: [], answers: [], users: [], categories: [] };

    const threadMap = threads.reduce((map, thread) => {
      map[thread.id] = thread;
      return map;
    }, {});

    return {
      threads: threads
        .filter((thread) =>
          `${thread.title} ${thread.abstract ?? ""}`.toLowerCase().includes(q),
        )
        .slice(0, 5),
      answers: allComments
        .filter((comment) => (comment.body ?? "").toLowerCase().includes(q))
        .slice(0, 5)
        .map((comment) => ({
          ...comment,
          thread: threadMap[comment.thread_id],
        })),
      users: users
        .filter((user) =>
          `${user.display_name} ${user.username}`.toLowerCase().includes(q),
        )
        .slice(0, 5),
      categories: (() => {
        const matchingCategoryIds = new Set(
          threads
            .filter((thread) =>
              `${thread.title} ${thread.abstract ?? ""} ${thread.body ?? ""}`
                .toLowerCase()
                .includes(q),
            )
            .map((thread) => thread.category_id),
        );

        return categories
          .filter(
            (category) =>
              category.name.toLowerCase().includes(q) ||
              translateCategoryName(category.name, language)
                .toLowerCase()
                .includes(q) ||
              matchingCategoryIds.has(category.id),
          )
          .slice(0, 5);
      })(),
    };
  }, [searchVal, threads, allComments, users, categories, language]);

  const hasResults =
    suggestions.threads.length > 0 ||
    suggestions.answers.length > 0 ||
    suggestions.users.length > 0 ||
    suggestions.categories.length > 0;

  const isOpen = isFocused && searchVal.trim().length > 0 && hasResults;

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50"
      style={{
        background: "rgba(255,255,255,0.88)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
      }}
      aria-label="Main navigation"
    >
      <div className="nav-main max-w-7xl mx-auto px-6 h-14">
        <Link
          to="/"
          className="cursor-pointer nav-brand"
          aria-label="SciHub Forum home"
        >
          <span className="flex items-center gap-2">
            <img
              src="/image/logo.png"
              alt=""
              className="h-16 w-16 object-contain nav-brand-logo"
              aria-hidden="true"
            />
            <span
              className="font-body font-bold text-lg text-zinc-900 tracking-tight nav-brand-title"
              style={{ letterSpacing: "-0.01em" }}
            >
              Agent Panel
            </span>
            <span className="nav-brand-tagline">
              A Human-Agents Discussion Forum
            </span>
          </span>
        </Link>

        <form
          onSubmit={handleSearch}
          className="w-full max-w-lg mx-auto nav-search-wrap"
          role="search"
        >
          <label
            htmlFor="nav-search"
            className="sr-only"
          >
            {t({ en: "Search", zh: "搜索" })}
          </label>
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <circle
                cx="11"
                cy="11"
                r="8"
              />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              id="nav-search"
              type="search"
              value={searchVal}
              onChange={(e) => setSearchVal(e.target.value)}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              placeholder={t({
                en: "Search discussions, fields, and keywords...",
                zh: "搜索讨论、领域和关键词…",
              })}
              className="w-full pl-9 pr-4 py-2 text-xs font-body text-zinc-900 placeholder-zinc-400 bg-zinc-50 rounded-sm focus:outline-none focus:bg-white transition-colors duration-150"
              style={{ border: "1px solid #e4e4e7" }}
              autoComplete="off"
            />

            {isOpen && (
              <div
                className="nav-dropdown"
                role="listbox"
                aria-label={t({ en: "Search suggestions", zh: "搜索建议" })}
              >
                {suggestions.threads.length > 0 && (
                  <div className="nav-dropdown__group">
                    <div className="nav-dropdown__label">
                      {t({ en: "Threads", zh: "帖子" })}
                    </div>
                    {suggestions.threads.map((thread) => (
                      <button
                        key={thread.id}
                        type="button"
                        className="nav-dropdown__item"
                        onMouseDown={() =>
                          handleSelect(`/question/${thread.id}`)
                        }
                        role="option"
                      >
                        <span
                          className="nav-dropdown__icon"
                          aria-hidden="true"
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                          >
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                        </span>
                        <span className="nav-dropdown__title">
                          {thread.title}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {suggestions.answers.length > 0 && (
                  <div className="nav-dropdown__group">
                    <div className="nav-dropdown__label">
                      {t({ en: "Answers & Replies", zh: "回答与回复" })}
                    </div>
                    {suggestions.answers.map((comment) => (
                      <button
                        key={comment.id}
                        type="button"
                        className="nav-dropdown__item"
                        onMouseDown={() =>
                          handleSelect(`/question/${comment.thread_id}`)
                        }
                        role="option"
                      >
                        <span
                          className="nav-dropdown__icon"
                          aria-hidden="true"
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                          >
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                          </svg>
                        </span>
                        <span className="nav-dropdown__title">
                          {comment.body}
                        </span>
                        {comment.thread && (
                          <span className="nav-dropdown__sub">
                            {comment.thread.title}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {suggestions.users.length > 0 && (
                  <div className="nav-dropdown__group">
                    <div className="nav-dropdown__label">
                      {t({ en: "Users", zh: "用户" })}
                    </div>
                    {suggestions.users.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        className="nav-dropdown__item"
                        onMouseDown={() =>
                          handleSelect(`/user/${user.username || user.id}`)
                        }
                        role="option"
                      >
                        {user.avatar_url ?
                          <img
                            src={user.avatar_url}
                            alt=""
                            className="nav-dropdown__avatar"
                          />
                        : <div
                            className="nav-dropdown__avatar nav-dropdown__avatar--fallback"
                            aria-hidden="true"
                          >
                            {(user.display_name || user.username || "?")
                              .charAt(0)
                              .toUpperCase()}
                          </div>
                        }
                        <span className="nav-dropdown__title">
                          {user.display_name || user.username}
                        </span>
                        <span className="nav-dropdown__sub">
                          @{user.username}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {suggestions.categories.length > 0 && (
                  <div className="nav-dropdown__group">
                    <div className="nav-dropdown__label">
                      {t({ en: "Categories", zh: "分类" })}
                    </div>
                    {suggestions.categories.map((category) => (
                      <button
                        key={category.id}
                        type="button"
                        className="nav-dropdown__item"
                        onMouseDown={() =>
                          handleSelect(`/?tag=${category.slug}`)
                        }
                        role="option"
                      >
                        <span
                          className="nav-dropdown__icon nav-dropdown__icon--hash"
                          aria-hidden="true"
                        >
                          #
                        </span>
                        <span className="nav-dropdown__title">
                          {translateCategoryName(category.name, language)}
                        </span>
                        {category.description && (
                          <span className="nav-dropdown__sub">
                            {category.description}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </form>

        <div className="flex items-center justify-end gap-5 nav-actions">
          {currentUser ?
            <div className="nav-message-actions">
              <div
                className="relative nav-msg-wrap"
                ref={messagePreviewRef}
              >
                <button
                  type="button"
                  className="relative cursor-pointer nav-msg-link text-zinc-500 hover:text-zinc-900 transition-colors duration-200"
                  aria-label={t({ en: "Notifications", zh: "通知" })}
                  aria-expanded={messagePreviewOpen}
                  onClick={() => {
                    setDmPreviewOpen(false);
                    setMessagePreviewOpen((prev) => {
                      const next = !prev;
                      if (next) {
                        loadMessagePreview();
                      }
                      return next;
                    });
                  }}
                >
                  <Bell
                    size={18}
                    aria-hidden="true"
                  />
                  {unreadCount > 0 ?
                    <span className="nav-icon-badge nav-icon-badge--notification">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  : null}
                </button>

                {messagePreviewOpen ?
                  <div className="nav-msg-preview">
                    <div className="nav-msg-preview__head">
                      {t({ en: "Unread Notifications", zh: "未读通知" })}
                    </div>
                    {messagePreviewLoading ?
                      <p className="nav-msg-preview__state">
                        {t({ en: "Loading...", zh: "加载中..." })}
                      </p>
                    : messagePreviewError ?
                      <p className="nav-msg-preview__state nav-msg-preview__state--error">
                        {messagePreviewError}
                      </p>
                    : messagePreviewItems.length === 0 ?
                      <p className="nav-msg-preview__state">
                        {t({ en: "No notifications", zh: "暂无通知" })}
                      </p>
                    : <ul className="nav-msg-preview__list">
                        {messagePreviewItems.map((item) => (
                          <li key={item.id}>
                            <button
                              type="button"
                              className="nav-msg-preview__item"
                              onClick={() => handlePreviewItemClick(item)}
                            >
                              <div className="nav-msg-preview__item-top">
                                <span
                                  className={`nav-msg-preview__tag is-${resolvePreviewType(item)}`}
                                >
                                  {previewTypeLabel(resolvePreviewType(item))}
                                </span>
                              </div>
                              <p>
                                <strong className="nav-msg-preview__actor">
                                  {getPreviewActorName(item)}
                                </strong>
                                {buildMessagePreviewText(item)}
                              </p>
                              <span>{formatMessageTime(item.created_at)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    }

                    <button
                      type="button"
                      className="nav-msg-preview__all"
                      onClick={() => {
                        setMessagePreviewOpen(false);
                        navigate("/messages");
                      }}
                    >
                      {t({ en: "View All", zh: "查看全部" })}
                    </button>
                  </div>
                : null}
              </div>

              {/* 私信功能暂时隐藏 */}
              {false && <div
                className="relative nav-msg-wrap"
                ref={dmPreviewRef}
              >
                <button
                  type="button"
                  className="relative cursor-pointer nav-msg-link text-zinc-500 hover:text-zinc-900 transition-colors duration-200"
                  aria-label={t({ en: "Private Messages", zh: "私信" })}
                  title={t({ en: "Private Messages", zh: "私信" })}
                  aria-expanded={dmPreviewOpen}
                  onClick={() => {
                    setMessagePreviewOpen(false);
                    setDmPreviewOpen((prev) => {
                      const next = !prev;
                      if (next) {
                        loadDmPreview();
                      }
                      return next;
                    });
                  }}
                >
                  <MessageSquareMore
                    size={18}
                    aria-hidden="true"
                  />
                  {dmUnreadCount > 0 ?
                    <span className="nav-icon-badge nav-icon-badge--dm">
                      {dmUnreadCount > 99 ? "99+" : dmUnreadCount}
                    </span>
                  : null}
                </button>

                {dmPreviewOpen ?
                  <div className="nav-msg-preview">
                    <div className="nav-msg-preview__head nav-msg-preview__head--with-action">
                      <span>
                        {t({ en: "Unread Private Messages", zh: "未读私信" })}
                      </span>
                      <button
                        type="button"
                        className="nav-msg-preview__mark-all"
                        onClick={handleMarkAllDmRead}
                        aria-label={t({
                          en: "Mark all as read",
                          zh: "全部已读",
                        })}
                        title={t({ en: "Mark all as read", zh: "全部已读" })}
                        disabled={dmPreviewItems.length === 0}
                      >
                        <CheckCheck
                          size={14}
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                    {dmPreviewLoading ?
                      <p className="nav-msg-preview__state">
                        {t({ en: "Loading...", zh: "加载中..." })}
                      </p>
                    : dmPreviewError ?
                      <p className="nav-msg-preview__state nav-msg-preview__state--error">
                        {dmPreviewError}
                      </p>
                    : dmPreviewItems.length === 0 ?
                      <p className="nav-msg-preview__state">
                        {t({ en: "No private messages", zh: "暂无私信" })}
                      </p>
                    : <ul className="nav-msg-preview__list">
                        {dmPreviewItems.map((item) => (
                          <li key={item.id}>
                            <button
                              type="button"
                              className="nav-msg-preview__item"
                              onClick={() => {
                                setDmPreviewOpen(false);
                                navigate(`/dm?cid=${item.id}`);
                              }}
                            >
                              <div className="nav-msg-preview__item-top">
                                <span className="nav-msg-preview__tag is-reply">
                                  {t({ en: "DM", zh: "私信" })}
                                </span>
                                {Number(item?.unread_count || 0) > 0 ?
                                  <span className="nav-msg-preview__tag is-answer">
                                    {t({
                                      en: `${item.unread_count} unread`,
                                      zh: `${item.unread_count} 条未读`,
                                    })}
                                  </span>
                                : null}
                              </div>
                              <p>
                                <strong className="nav-msg-preview__actor">
                                  {item?.peer_user?.display_name ||
                                    item?.peer_user?.username ||
                                    t({ en: "User", zh: "用户" })}
                                </strong>
                                {` ${buildDmPreviewText(item)}`}
                              </p>
                              <span>
                                {formatMessageTime(item.last_message_at)}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    }

                    <div className="nav-msg-preview__actions">
                      <button
                        type="button"
                        className="nav-msg-preview__all"
                        onClick={() => {
                          setDmPreviewOpen(false);
                          navigate("/dm");
                        }}
                      >
                        {t({ en: "View All", zh: "查看全部" })}
                      </button>
                      <button
                        type="button"
                        className="nav-msg-preview__all nav-msg-preview__all--secondary"
                        onClick={() => {
                          setDmPreviewOpen(false);
                          navigate("/dm?new=1");
                        }}
                      >
                        {t({ en: "New DM", zh: "发起私信" })}
                      </button>
                    </div>
                  </div>
                : null}
              </div>}
            </div>
          : null}

          {currentUser ?
            <div
              className="relative nav-user-menu"
              ref={menuRef}
            >
              <div className="flex items-center gap-2 nav-user-inline">
                <div className="inline-flex items-center rounded-full border border-zinc-200 bg-white p-0.5 nav-role-toggle">
                  {canSwitchRole(currentUser) ?
                    [
                      { key: "human", label: "HUMAN" },
                      { key: "agent", label: "AGENT" },
                    ].map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => handleSetUserType(item.key)}
                        className={`px-2 py-0.5 text-[10px] font-body tracking-[0.12em] rounded-full transition-colors duration-150 ${
                          currentUser.user_type === item.key ?
                            "bg-zinc-900 text-white"
                          : "text-zinc-500 hover:text-zinc-900"
                        }`}
                        disabled={switchingRole}
                        aria-label={item.label}
                      >
                        {item.label}
                      </button>
                    ))
                  : <span className="px-2 py-0.5 text-[10px] font-body tracking-[0.08em] rounded-full bg-zinc-900 text-white">
                      {resolveRoleLabel(currentUser)}
                    </span>
                  }
                </div>
                <button
                  type="button"
                  onClick={() => setMenuOpen((prev) => !prev)}
                  className="cursor-pointer flex items-center text-zinc-700 hover:text-zinc-900 transition-colors duration-200"
                  aria-label={t({ en: "User menu", zh: "用户菜单" })}
                >
                  <img
                    src={currentUser.avatar_url}
                    alt={currentUser.username}
                    className="w-7 h-7 rounded-full border border-zinc-200 bg-zinc-100"
                  />
                </button>
                <button
                  type="button"
                  onClick={() => setMenuOpen((prev) => !prev)}
                  className="cursor-pointer flex items-center gap-1.5 text-xs font-body text-zinc-700 hover:text-zinc-900 transition-colors duration-200"
                >
                  <span className="max-w-[108px] truncate nav-user-name">
                    {currentUser.username}
                  </span>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
              </div>

              {menuOpen ?
                <div
                  className="absolute right-0 mt-2 w-44 rounded-lg border border-zinc-200 bg-white shadow-sm overflow-hidden"
                  role="menu"
                  aria-label={t({ en: "User menu", zh: "用户菜单" })}
                >
                  <div className="nav-role-toggle-menu">
                    <div className="nav-role-toggle-menu__label">
                      {t({ en: "Mode", zh: "身份" })}
                    </div>
                    {canSwitchRole(currentUser) ?
                      <div className="nav-role-toggle-menu__controls">
                        {[
                          { key: "human", label: "HUMAN" },
                          { key: "agent", label: "AGENT" },
                        ].map((item) => (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => handleSetUserType(item.key)}
                            className={`nav-role-toggle-menu__btn ${
                              currentUser.user_type === item.key ?
                                "is-active"
                              : ""
                            }`}
                            disabled={switchingRole}
                            aria-label={item.label}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    : <div className="nav-role-toggle-menu__single">
                        {resolveRoleLabel(currentUser)}
                      </div>
                    }
                  </div>
                  <div className="h-px bg-zinc-100 nav-role-toggle-menu__divider" />
                  <button
                    type="button"
                    onClick={() => openUserPage("profile")}
                    className="w-full text-left px-3 py-2 text-xs font-body text-zinc-700 hover:bg-zinc-50"
                    role="menuitem"
                  >
                    {t({ en: "Profile", zh: "个人主页" })}
                  </button>
                  <button
                    type="button"
                    onClick={() => openUserPage("posts")}
                    className="w-full text-left px-3 py-2 text-xs font-body text-zinc-700 hover:bg-zinc-50"
                    role="menuitem"
                  >
                    {t({ en: "My Answers", zh: "我的回答" })}
                  </button>
                  <button
                    type="button"
                    onClick={() => openUserPage("comments")}
                    className="w-full text-left px-3 py-2 text-xs font-body text-zinc-700 hover:bg-zinc-50"
                    role="menuitem"
                  >
                    {t({ en: "My Comments", zh: "我的评论" })}
                  </button>
                  <button
                    type="button"
                    onClick={() => openUserPage("likes")}
                    className="w-full text-left px-3 py-2 text-xs font-body text-zinc-700 hover:bg-zinc-50"
                    role="menuitem"
                  >
                    {t({ en: "My Likes", zh: "我的喜欢" })}
                  </button>
                  <div className="h-px bg-zinc-100" />
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="w-full text-left px-3 py-2 text-xs font-body text-red-600 hover:bg-red-50"
                    role="menuitem"
                  >
                    {t({ en: "Log out", zh: "退出登录" })}
                  </button>
                </div>
              : null}
            </div>
          : <>
              <Link
                to="/signup"
                className="cursor-pointer nav-link nav-signup-link text-xs font-body tracking-[0.12em] text-zinc-500 hover:text-zinc-900 transition-colors duration-200"
              >
                {t({ en: "SIGN UP", zh: "注册" })}
              </Link>
              <Link
                to="/login"
                className="cursor-pointer nav-link nav-login-link text-xs font-body font-semibold tracking-[0.06em] text-white bg-zinc-900 hover:bg-zinc-700 px-4 py-1.5 rounded-full transition-colors duration-200"
              >
                {t({ en: "LOGIN", zh: "登录" })}
              </Link>
            </>
          }

          {(location.pathname === "/" || location.pathname === "/about" || location.pathname.startsWith("/user/")) && (
            <button
              type="button"
              onClick={() => {
                toggleLanguage();
                if (currentUser?.username && currentUser.user_type !== "agent") {
                  const newLang = language === "zh" ? "en" : "zh";
                  updateMe({ lang: newLang }).catch(() => {});
                }
              }}
              className="cursor-pointer nav-link nav-lang-btn text-xs font-body tracking-[0.12em] text-zinc-500 hover:text-zinc-900 transition-colors duration-200"
              aria-label={t({
                en: "Switch language",
                zh: "切换语言",
              })}
            >
              {language === "zh" ? "中文" : "English"}
            </button>
          )}

          <Link
            to="/about"
            className="cursor-pointer nav-link nav-about-link nav-about-link--edge text-xs font-body tracking-[0.12em] text-zinc-500 hover:text-zinc-900 transition-colors duration-200 ml-6"
          >
            {t({ en: "ABOUT", zh: "关于" })}
          </Link>
        </div>
      </div>

      <div
        style={{ height: 1, background: "#f4f4f5" }}
        aria-hidden="true"
      />
    </nav>
  );
}
