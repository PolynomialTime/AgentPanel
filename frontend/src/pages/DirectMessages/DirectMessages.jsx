import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, CheckCheck, Plus, Send, Smile } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useI18n } from "../../i18n";
import { canSwitchRole } from "../../services/userIdentity";
import {
  createDmConversation,
  DEMO_USER,
  getDmConversations,
  getDmMessages,
  getUsers,
  markDmConversationRead,
  resolveViewerUser,
  sendDmMessage,
} from "../../services/api";

function formatTime(value, locale = "en-US") {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(locale);
}

export default function DirectMessages() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t, language } = useI18n();
  const locale = language === "zh" ? "zh-CN" : "en-US";

  const [dmLoading, setDmLoading] = useState(false);
  const [dmError, setDmError] = useState("");
  const [dmConversations, setDmConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [dmMessages, setDmMessages] = useState([]);
  const [dmMessageDraft, setDmMessageDraft] = useState("");
  const [sendingDm, setSendingDm] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [viewerUserId, setViewerUserId] = useState(null);
  const [userKeyword, setUserKeyword] = useState("");
  const [showNewChatPopover, setShowNewChatPopover] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);

  const dmMessagesContainerRef = useRef(null);
  const newChatInputRef = useRef(null);
  const openingPeerRef = useRef(false);
  const lastConversationIdRef = useRef(null);
  const lastMessageIdRef = useRef(null);

  const targetConversationIdFromUrl = useMemo(() => {
    const raw = Number(searchParams.get("cid") || 0);
    return Number.isInteger(raw) && raw > 0 ? raw : null;
  }, [searchParams]);

  const openNewChatFromUrl = useMemo(() => {
    const raw = String(searchParams.get("new") || "").trim();
    return raw === "1" || raw.toLowerCase() === "true";
  }, [searchParams]);

  const dmKeywordFromUrl = useMemo(
    () => String(searchParams.get("keyword") || "").trim(),
    [searchParams],
  );

  const targetPeerIdFromUrl = useMemo(() => {
    const raw = Number(searchParams.get("peer_id") || 0);
    return Number.isInteger(raw) && raw > 0 ? raw : null;
  }, [searchParams]);

  const targetPeerUsernameFromUrl = useMemo(
    () =>
      String(searchParams.get("peer_username") || "")
        .trim()
        .toLowerCase(),
    [searchParams],
  );

  const quickEmojis = [
    "😀",
    "😂",
    "🤣",
    "😊",
    "😎",
    "😍",
    "😘",
    "🤔",
    "😭",
    "😡",
    "👍",
    "👎",
    "👏",
    "👌",
    "✌️",
    "🔥",
    "🎉",
    "❤️",
    "💙",
    "💯",
    "🙏",
    "👀",
    "🤝",
    "🌟",
    "💡",
    "🚀",
    "🍀",
    "☕",
    "🎵",
    "🎯",
  ];

  function emitDmUnreadUpdated(conversations) {
    const list = Array.isArray(conversations) ? conversations : [];
    const unreadCount = list.reduce(
      (sum, item) => sum + Number(item?.unread_count || 0),
      0,
    );
    window.dispatchEvent(
      new CustomEvent("dm:updated", {
        detail: { unreadCount: Math.max(0, unreadCount) },
      }),
    );
  }

  function renderAvatar(user, sizeClass = "h-8 w-8") {
    const name = user?.display_name || user?.username || "U";
    if (user?.avatar_url) {
      return (
        <img
          src={user.avatar_url}
          alt={name}
          className={`${sizeClass} rounded-full object-cover`}
        />
      );
    }
    return (
      <div
        className={`${sizeClass} flex items-center justify-center rounded-full bg-zinc-100/90 text-xs font-bold text-zinc-700`}
      >
        {name.charAt(0).toUpperCase()}
      </div>
    );
  }

  useEffect(() => {
    let cancelled = false;
    async function loadViewer() {
      try {
        const viewer = await resolveViewerUser();
        if (!cancelled) {
          setViewerUserId(Number(viewer?.id || 0) || null);
        }
      } catch {
        if (!cancelled) {
          setViewerUserId(null);
        }
      }
    }
    loadViewer();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadDmConversations(options = { silent: false }) {
    if (!options.silent) {
      setDmLoading(true);
      setDmError("");
    }
    try {
      const rows = await getDmConversations(
        { limit: 100, offset: 0 },
        DEMO_USER,
      );
      const list = Array.isArray(rows) ? rows : [];
      setDmConversations(list);
      emitDmUnreadUpdated(list);

      if (list.length === 0) {
        setActiveConversationId(null);
        setDmMessages([]);
      } else if (!activeConversationId) {
        setActiveConversationId(list[0].id);
      } else if (!list.some((item) => item.id === activeConversationId)) {
        setActiveConversationId(list[0].id);
      }
    } catch (err) {
      if (!options.silent) {
        setDmError(
          err?.message ||
            t({ en: "Failed to load conversations.", zh: "加载私信会话失败" }),
        );
      }
    } finally {
      if (!options.silent) {
        setDmLoading(false);
      }
    }
  }

  async function loadUsersForDm() {
    const pageSize = 100;
    const maxPages = 20;
    const collected = [];
    try {
      for (let page = 0; page < maxPages; page += 1) {
        const rows = await getUsers({
          include_inactive: false,
          limit: pageSize,
          offset: page * pageSize,
        });
        const batch = Array.isArray(rows) ? rows : [];
        if (batch.length === 0) break;
        collected.push(...batch);
        if (batch.length < pageSize) break;
      }
      setAllUsers(collected);
    } catch {
      setAllUsers([]);
    }
  }

  useEffect(() => {
    loadDmConversations();
    loadUsersForDm();
  }, []);

  useEffect(() => {
    if (!targetConversationIdFromUrl || dmConversations.length === 0) return;
    const exists = dmConversations.some(
      (item) => Number(item.id) === Number(targetConversationIdFromUrl),
    );
    if (!exists) return;
    if (
      Number(activeConversationId || 0) !== Number(targetConversationIdFromUrl)
    ) {
      setActiveConversationId(targetConversationIdFromUrl);
    }
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("cid");
    setSearchParams(nextParams, { replace: true });
  }, [
    targetConversationIdFromUrl,
    dmConversations,
    activeConversationId,
    searchParams,
    setSearchParams,
  ]);

  useEffect(() => {
    if (!targetPeerIdFromUrl && !targetPeerUsernameFromUrl) return;
    if (openingPeerRef.current) return;

    let resolvedPeerUserId = targetPeerIdFromUrl;

    if (!resolvedPeerUserId && targetPeerUsernameFromUrl) {
      const peerFromConversation = dmConversations.find(
        (item) =>
          String(item?.peer_user?.username || "")
            .trim()
            .toLowerCase() === targetPeerUsernameFromUrl,
      );
      if (peerFromConversation?.peer_user?.id) {
        resolvedPeerUserId = Number(peerFromConversation.peer_user.id);
      }
    }

    if (!resolvedPeerUserId && targetPeerUsernameFromUrl) {
      const peerFromUsers = allUsers.find(
        (user) =>
          String(user?.username || "")
            .trim()
            .toLowerCase() === targetPeerUsernameFromUrl,
      );
      if (peerFromUsers?.id) {
        resolvedPeerUserId = Number(peerFromUsers.id);
      }
    }

    if (
      !resolvedPeerUserId &&
      targetPeerUsernameFromUrl &&
      allUsers.length === 0
    ) {
      return;
    }

    openingPeerRef.current = true;
    let cancelled = false;

    async function openPeerConversation() {
      try {
        if (!resolvedPeerUserId) {
          if (cancelled) return;
          setDmError(
            t({
              en: "User not found for direct message.",
              zh: "未找到可私信的目标用户。",
            }),
          );
          return;
        }

        const existingConversation = dmConversations.find(
          (item) =>
            Number(item?.peer_user?.id || 0) === Number(resolvedPeerUserId),
        );

        if (existingConversation?.id) {
          if (cancelled) return;
          setActiveConversationId(existingConversation.id);
        } else {
          const conversation = await createDmConversation(
            { peer_user_id: Number(resolvedPeerUserId) },
            DEMO_USER,
          );
          if (cancelled) return;
          setActiveConversationId(conversation?.id || null);
          await loadDmConversations({ silent: true });
        }

        if (cancelled) return;
        setShowNewChatPopover(false);
        setUserKeyword("");
      } catch (err) {
        if (cancelled) return;
        setDmError(
          err?.message ||
            t({ en: "Failed to open conversation.", zh: "打开私信会话失败" }),
        );
      } finally {
        if (!cancelled) {
          const nextParams = new URLSearchParams(searchParams);
          nextParams.delete("peer_id");
          nextParams.delete("peer_username");
          setSearchParams(nextParams, { replace: true });
        }
        openingPeerRef.current = false;
      }
    }

    openPeerConversation();

    return () => {
      cancelled = true;
    };
  }, [
    targetPeerIdFromUrl,
    targetPeerUsernameFromUrl,
    dmConversations,
    allUsers,
    searchParams,
    setSearchParams,
    t,
  ]);

  useEffect(() => {
    if (!openNewChatFromUrl && !dmKeywordFromUrl) return;
    setShowNewChatPopover(true);
    if (dmKeywordFromUrl) {
      setUserKeyword(dmKeywordFromUrl);
    }
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("new");
    nextParams.delete("keyword");
    setSearchParams(nextParams, { replace: true });
  }, [openNewChatFromUrl, dmKeywordFromUrl, searchParams, setSearchParams]);

  useEffect(() => {
    if (!showNewChatPopover) return;
    const timerId = window.setTimeout(() => {
      newChatInputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timerId);
  }, [showNewChatPopover]);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      loadDmConversations({ silent: true });
    }, 30000);
    return () => window.clearInterval(timerId);
  }, [activeConversationId]);

  useEffect(() => {
    if (!activeConversationId) return;
    let cancelled = false;

    async function loadMessages() {
      setDmError("");
      try {
        const rows = await getDmMessages(
          activeConversationId,
          { limit: 100 },
          DEMO_USER,
        );
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        setDmMessages(list);
        setDmConversations((prev) => {
          const next = prev.map((item) =>
            Number(item?.id) === Number(activeConversationId) ?
              { ...item, unread_count: 0 }
            : item,
          );
          emitDmUnreadUpdated(next);
          return next;
        });
        await markDmConversationRead(activeConversationId, DEMO_USER);
        await loadDmConversations({ silent: true });
      } catch (err) {
        if (cancelled) return;
        setDmError(
          err?.message ||
            t({ en: "Failed to load messages.", zh: "加载私信消息失败" }),
        );
      }
    }

    loadMessages();
    return () => {
      cancelled = true;
    };
  }, [activeConversationId]);

  async function handleCreateConversation(peerUserId) {
    if (!peerUserId) return;
    setDmError("");
    const existingConversation = dmConversations.find(
      (item) => Number(item?.peer_user?.id || 0) === Number(peerUserId),
    );
    if (existingConversation?.id) {
      setActiveConversationId(existingConversation.id);
      setShowNewChatPopover(false);
      setUserKeyword("");
      return;
    }
    try {
      const conversation = await createDmConversation(
        { peer_user_id: Number(peerUserId) },
        DEMO_USER,
      );
      setActiveConversationId(conversation?.id || null);
      await loadDmConversations({ silent: true });
      setShowNewChatPopover(false);
      setUserKeyword("");
    } catch (err) {
      setDmError(
        err?.message ||
          t({ en: "Failed to create conversation.", zh: "创建私信会话失败" }),
      );
    }
  }

  function appendEmoji(emoji) {
    setDmMessageDraft((prev) => `${prev}${emoji}`);
  }

  async function handleSendDm() {
    if (!activeConversationId || sendingDm) return;
    const body = dmMessageDraft.trim();
    if (!body) return;
    setSendingDm(true);
    setDmError("");
    try {
      const message = await sendDmMessage(
        activeConversationId,
        {
          body,
          client_msg_id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        },
        DEMO_USER,
      );
      setDmMessages((prev) => [...prev, message]);
      setDmMessageDraft("");
      await loadDmConversations({ silent: true });
    } catch (err) {
      setDmError(
        err?.message ||
          t({ en: "Failed to send message.", zh: "发送私信失败" }),
      );
    } finally {
      setSendingDm(false);
    }
  }

  async function handleMarkAllDmRead() {
    if (markingAllRead || dmConversations.length === 0) return;
    const unreadList = dmConversations.filter(
      (item) => Number(item?.unread_count || 0) > 0,
    );
    if (unreadList.length === 0) return;

    setMarkingAllRead(true);
    setDmError("");
    try {
      await Promise.all(
        unreadList.map((item) => markDmConversationRead(item.id, DEMO_USER)),
      );
      setDmConversations((prev) => {
        const next = prev.map((item) => ({ ...item, unread_count: 0 }));
        emitDmUnreadUpdated(next);
        return next;
      });
      await loadDmConversations({ silent: true });
    } catch (err) {
      setDmError(
        err?.message ||
          t({ en: "Mark all as read failed.", zh: "全部已读失败" }),
      );
    } finally {
      setMarkingAllRead(false);
    }
  }

  const currentConversation = useMemo(
    () =>
      dmConversations.find((item) => item.id === activeConversationId) || null,
    [dmConversations, activeConversationId],
  );

  const dmCandidateUsers = useMemo(() => {
    const keyword = userKeyword.trim().toLowerCase();

    return allUsers
      .filter((user) => Number(user.id) !== Number(viewerUserId || 0))
      .filter((user) => canSwitchRole(user))
      .filter((user) => {
        if (!keyword) return true;
        return `${user.display_name || ""} ${user.username || ""}`
          .toLowerCase()
          .includes(keyword);
      });
  }, [allUsers, viewerUserId, userKeyword]);

  function scrollMessagesToBottom() {
    const element = dmMessagesContainerRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }

  useEffect(() => {
    const container = dmMessagesContainerRef.current;
    if (!container) return;

    const currentConversationId = Number(activeConversationId || 0) || null;
    const latestMessageId =
      dmMessages.length > 0 ?
        Number(dmMessages[dmMessages.length - 1]?.id || 0) || null
      : null;

    const conversationChanged =
      lastConversationIdRef.current !== currentConversationId;
    if (conversationChanged) {
      scrollMessagesToBottom();
      lastConversationIdRef.current = currentConversationId;
      lastMessageIdRef.current = latestMessageId;
      return;
    }

    const messageChanged = latestMessageId !== lastMessageIdRef.current;
    if (messageChanged) {
      scrollMessagesToBottom();
    }
    lastMessageIdRef.current = latestMessageId;
  }, [activeConversationId, dmMessages]);

  return (
    <section className="mx-auto flex h-[calc(100vh-88px)] w-full max-w-5xl flex-col overflow-hidden px-6 pb-4 pt-24">
      <header className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-zinc-700 shadow-sm hover:bg-white"
            aria-label={t({ en: "Go back", zh: "返回上一页" })}
            title={t({ en: "Back", zh: "返回" })}
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">
              {t({ en: "Direct Messages", zh: "私信" })}
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              {t({
                en: "Connect with minds on your wavelength.",
                zh: "连接同频的人。",
              })}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleMarkAllDmRead}
          disabled={
            markingAllRead ||
            dmConversations.every(
              (item) => Number(item?.unread_count || 0) === 0,
            )
          }
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200/80 bg-white text-zinc-600 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={t({ en: "Mark all as read", zh: "全部已读" })}
          title={t({ en: "Mark all as read", zh: "全部已读" })}
        >
          <CheckCheck size={15} />
        </button>
      </header>

      <div className="grid min-h-0 flex-1 items-stretch gap-4 md:grid-cols-[320px_1fr]">
        <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-zinc-200/70 bg-white/90 p-3 shadow-sm backdrop-blur-sm">
          <div className="relative mb-2 flex items-center justify-between">
            <div className="text-xs font-semibold text-zinc-600">
              {t({ en: "My Conversations", zh: "我的会话" })}
            </div>
            <button
              type="button"
              onClick={() => setShowNewChatPopover((prev) => !prev)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900/90 text-white shadow-sm hover:bg-zinc-900"
              title={t({ en: "Start new chat", zh: "发起新私信" })}
              aria-label={t({ en: "Start new chat", zh: "发起新私信" })}
            >
              <Plus size={14} />
            </button>

            {showNewChatPopover ?
              <div className="absolute right-0 top-9 z-20 w-[280px] rounded-xl border border-zinc-200/70 bg-white p-2.5 shadow-lg shadow-zinc-900/10 backdrop-blur-sm">
                <input
                  autoFocus
                  ref={newChatInputRef}
                  className="mb-2 h-9 w-full rounded-lg border border-zinc-200/70 bg-zinc-100/75 px-3 text-sm outline-none placeholder:text-zinc-500 focus:border-zinc-300 focus:bg-white"
                  placeholder={t({ en: "Search users", zh: "实时搜索用户" })}
                  value={userKeyword}
                  onChange={(e) => setUserKeyword(e.target.value)}
                />
                <div className="max-h-[220px] space-y-1 overflow-y-auto pr-1">
                  {dmCandidateUsers.slice(0, 20).map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => handleCreateConversation(user.id)}
                      className="flex w-full items-center gap-2 rounded-lg border border-zinc-200/60 bg-white px-2 py-1.5 text-left hover:bg-zinc-50/70"
                    >
                      {renderAvatar(user, "h-7 w-7")}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-zinc-900">
                          {user.display_name || user.username}
                        </div>
                        <div className="truncate text-xs text-zinc-500">
                          @{user.username}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                {dmCandidateUsers.length === 0 ?
                  <div className="mt-1 rounded bg-zinc-50 px-2 py-2 text-xs text-zinc-500">
                    {t({
                      en: "No switchable users found.",
                      zh: "没有可私信的可切换用户（或搜索无结果）",
                    })}
                  </div>
                : null}
              </div>
            : null}
          </div>

          <div className="min-h-0 flex-1">
            {dmLoading ?
              <div className="p-3 text-sm text-zinc-500">
                {t({ en: "Loading conversations...", zh: "加载会话中..." })}
              </div>
            : dmConversations.length === 0 ?
              <div className="p-3 text-sm text-zinc-500">
                {t({ en: "No conversations yet", zh: "暂无私信会话" })}
              </div>
            : <div className="h-full min-h-0 space-y-1.5 overflow-y-auto pr-1">
                {dmConversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => setActiveConversationId(conversation.id)}
                    className={`w-full rounded-lg border px-3 py-1.5 text-left ${activeConversationId === conversation.id ? "border-zinc-300/80 bg-white shadow-sm" : "border-transparent bg-white/85 hover:border-zinc-200/70 hover:bg-white"}`}
                  >
                    <div className="flex items-center gap-2">
                      {renderAvatar(conversation.peer_user, "h-7 w-7")}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="truncate font-semibold text-zinc-900">
                            {conversation.peer_user?.display_name ||
                              conversation.peer_user?.username ||
                              conversation.title ||
                              `会话 #${conversation.id}`}
                          </span>
                          {Number(conversation.unread_count || 0) > 0 ?
                            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">
                              {conversation.unread_count}
                            </span>
                          : null}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-zinc-500">
                          {conversation.last_message_preview ||
                            t({ en: "No messages", zh: "暂无消息" })}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            }
          </div>
        </aside>

        <div className="flex h-full min-h-0 flex-col rounded-xl border border-zinc-200/70 bg-white/90 p-3 shadow-sm backdrop-blur-sm">
          {dmError ?
            <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
              {dmError}
            </div>
          : null}

          {!currentConversation ?
            <div className="p-6 text-sm text-zinc-500">
              {t({ en: "Select a conversation", zh: "请选择一个会话" })}
            </div>
          : <>
              <div className="mb-3 rounded-lg bg-zinc-100/80 px-3 py-2 text-sm text-zinc-700">
                {t({ en: "Chat with", zh: "与" })}{" "}
                <span className="font-semibold text-zinc-900">
                  {currentConversation.peer_user?.display_name ||
                    currentConversation.peer_user?.username ||
                    t({ en: "User", zh: "用户" })}
                </span>{" "}
                {t({ en: ":", zh: "的私信:" })}
              </div>

              <div
                ref={dmMessagesContainerRef}
                className="flex-1 space-y-2 overflow-y-auto pr-1"
              >
                {dmMessages.length === 0 ?
                  <div className="flex h-full items-end text-sm text-zinc-500">
                    <span>
                      {t({
                        en: "No messages yet. Say hi!",
                        zh: "还没有消息，发一条试试。",
                      })}
                    </span>
                  </div>
                : dmMessages.map((message) => {
                    const isCurrentUser =
                      Number(message.sender_user_id) ===
                      Number(viewerUserId || 0);
                    const isAssistantMarkdown =
                      Boolean(message?.sender?.is_assistant) ||
                      Boolean(message?.meta?.push_kind);
                    return (
                      <div
                        key={message.id}
                        className={`flex items-start gap-2 ${isCurrentUser ? "justify-end" : "justify-start"}`}
                      >
                        {!isCurrentUser ?
                          renderAvatar(message.sender, "h-7 w-7")
                        : null}
                        <div
                          className={`flex max-w-[78%] flex-col ${isCurrentUser ? "items-end" : "items-start"}`}
                        >
                          <div className="mb-1 text-xs font-bold text-zinc-700">
                            {message.sender?.display_name ||
                              message.sender?.username ||
                              t({ en: "User", zh: "用户" })}
                          </div>
                          <div
                            className={`rounded px-3 py-2 ${isAssistantMarkdown ? "text-xs" : "text-sm"} ${isCurrentUser ? "bg-blue-600 text-white" : "bg-zinc-100 text-zinc-800"}`}
                          >
                            {isAssistantMarkdown ?
                              <div className="whitespace-pre-wrap dm-markdown">
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm]}
                                  components={{
                                    h2: ({ node, ...props }) => (
                                      <h2
                                        className="my-1 text-base font-semibold text-zinc-900"
                                        {...props}
                                      />
                                    ),
                                    p: ({ node, ...props }) => (
                                      <p
                                        className="my-0 leading-4"
                                        {...props}
                                      />
                                    ),
                                    strong: ({ node, ...props }) => (
                                      <strong
                                        className="font-semibold text-zinc-900"
                                        {...props}
                                      />
                                    ),
                                    hr: ({ node, ...props }) => (
                                      <hr
                                        className="my-1 border-zinc-300/80"
                                        {...props}
                                      />
                                    ),
                                    ol: ({ node, ...props }) => (
                                      <ol
                                        className="my-0.5 list-decimal space-y-0.5 pl-4"
                                        {...props}
                                      />
                                    ),
                                    ul: ({ node, ...props }) => (
                                      <ul
                                        className="my-0.5 list-disc space-y-0.5 pl-4"
                                        {...props}
                                      />
                                    ),
                                    li: ({ node, ...props }) => (
                                      <li
                                        className="my-0 leading-4"
                                        {...props}
                                      />
                                    ),
                                    a: ({ node, ...props }) => (
                                      <a
                                        className="font-medium text-slate-600 underline decoration-slate-400 underline-offset-2 transition hover:text-slate-700 hover:decoration-slate-500"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        {...props}
                                      />
                                    ),
                                  }}
                                >
                                  {String(message.body || "")}
                                </ReactMarkdown>
                              </div>
                            : <div className="whitespace-pre-wrap">
                                {message.body}
                              </div>
                            }
                          </div>
                          <div className="mt-1 text-[11px] text-zinc-400">
                            {formatTime(message.created_at, locale)}
                          </div>
                        </div>
                        {isCurrentUser ?
                          renderAvatar(message.sender, "h-7 w-7")
                        : null}
                      </div>
                    );
                  })
                }
              </div>

              <div className="mt-3 pt-3">
                {showEmojiPicker ?
                  <div className="mb-2 flex flex-wrap gap-1 rounded-lg border border-zinc-200/70 bg-white/90 p-2">
                    {quickEmojis.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => appendEmoji(emoji)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-white"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                : null}
                <div className="flex items-center gap-2">
                  <input
                    className="h-10 w-full rounded-lg border border-zinc-200/70 bg-white px-3 text-sm outline-none placeholder:text-zinc-500 focus:border-zinc-300"
                    placeholder={t({
                      en: "Type a message...",
                      zh: "输入私信内容...",
                    })}
                    value={dmMessageDraft}
                    onChange={(e) => setDmMessageDraft(e.target.value)}
                    onKeyDown={(e) => {
                      const composing =
                        e.nativeEvent?.isComposing || e.isComposing || false;
                      if (composing) return;
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendDm();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200/70 bg-white text-zinc-600 hover:bg-zinc-50"
                    onClick={() => setShowEmojiPicker((prev) => !prev)}
                    title={t({ en: "Pick emoji", zh: "选择 Emoji" })}
                    aria-label={t({ en: "Pick emoji", zh: "选择 Emoji" })}
                  >
                    <Smile size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={handleSendDm}
                    disabled={sendingDm || !dmMessageDraft.trim()}
                    className="inline-flex h-10 w-10 items-center justify-center rounded bg-zinc-900 text-white disabled:opacity-50"
                    title={t({ en: "Send", zh: "发送" })}
                    aria-label={t({ en: "Send", zh: "发送" })}
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </>
          }
        </div>
      </div>
    </section>
  );
}
