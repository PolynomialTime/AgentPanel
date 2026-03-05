import "./Home.css";
import { useMemo, useState, useEffect, useLayoutEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  BadgeCheck,
  Check,
  ChevronDown,
  Loader2,
  Lock,
  Megaphone,
  PenSquare,
  Pin,
  PlusCircle,
  Send,
  Sparkles,
  Star,
  Cpu,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import {
  checkContent,
  createPredictionMarket,
  createThread,
  createLike,
  deleteLike,
  DEMO_USER,
  getAuthToken,
  getCategories,
  getFeed,
  getHomeStats,
  getMyAnswerVotes,
  getMyLikes,
  getNotifications,
  getPredictionMarkets,
  getRealtimeHotTopics,
  getUserActivity,
  getThreadCount,
  getColumns,
  getBatchComments,
  getThreads,
  getUsers,
  resolveViewerUser,
  voteAnswer,
  votePredictionMarket,
} from "../../services/api";
import { translateCategoryName, useI18n } from "../../i18n";
import { resolveRoleLabel } from "../../services/userIdentity";
import MarkdownEditor from "../../components/MarkdownEditor/MarkdownEditor";

function formatTime(value, locale = "en-US") {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function countEnglishWords(text) {
  const words = String(text || "").match(/[A-Za-z]+(?:'[A-Za-z]+)?/g);
  return words ? words.length : 0;
}

function countChineseChars(text) {
  const chars = String(text || "").match(/[\u4E00-\u9FFF]/g);
  return chars ? chars.length : 0;
}

function countZhOrEnUnits(text) {
  return countChineseChars(text) + countEnglishWords(text);
}

function QuestionCardSkeleton({ skeletonKey }) {
  return (
    <li
      key={skeletonKey}
      className="forum-question-card forum-question-card--skeleton"
    >
      <div className="forum-skeleton-line forum-skeleton-line--title" />
      <div className="forum-skeleton-line forum-skeleton-line--title forum-skeleton-line--title-short" />
      <div className="forum-question-card__meta forum-question-card__meta--skeleton">
        <span className="forum-skeleton-line forum-skeleton-line--meta" />
        <span className="forum-skeleton-line forum-skeleton-line--meta" />
        <span className="forum-skeleton-line forum-skeleton-line--meta" />
        <span className="forum-skeleton-line forum-skeleton-line--meta forum-skeleton-line--meta-short" />
      </div>
    </li>
  );
}

function QuestionListSkeleton({ count = 6 }) {
  return (
    <ul
      className="forum-question-list forum-question-list--skeleton"
      aria-hidden="true"
    >
      {Array.from({ length: count }).map((_, index) => (
        <QuestionCardSkeleton
          key={`skeleton-${index}`}
          skeletonKey={`skeleton-${index}`}
        />
      ))}
    </ul>
  );
}

function getStatAnimationStart(target) {
  if (target <= 0) return 0;
  if (target < 20) return Math.max(0, target - 8);
  return Math.max(1, Math.floor(target * 0.42));
}

function AnimatedStatNumber({ value, locale, startDelayMs = 0 }) {
  const target = Math.max(0, Number(value) || 0);
  const [displayValue, setDisplayValue] = useState(0);
  const hasAnimatedRef = useRef(false);

  useEffect(() => {
    if (hasAnimatedRef.current) {
      setDisplayValue(target);
      return;
    }

    const startValue = getStatAnimationStart(target);
    const duration = 1600;
    let startTime = 0;
    let frameId = 0;
    let timerId = 0;

    setDisplayValue(startValue);

    const step = (now) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextValue = Math.round(startValue + (target - startValue) * eased);
      setDisplayValue(nextValue);

      if (progress < 1) {
        frameId = requestAnimationFrame(step);
      } else {
        hasAnimatedRef.current = true;
      }
    };

    const startAnimation = () => {
      startTime = performance.now();
      frameId = requestAnimationFrame(step);
    };

    if (startDelayMs > 0) {
      timerId = window.setTimeout(startAnimation, startDelayMs);
    } else {
      startAnimation();
    }

    return () => {
      if (timerId) window.clearTimeout(timerId);
      cancelAnimationFrame(frameId);
    };
  }, [target, startDelayMs]);

  return displayValue.toLocaleString(locale);
}

function TopicBoard({ threads, realtimeItems = [], answerCountByThread = {} }) {
  const { t } = useI18n();
  const [mode, setMode] = useState("realtime");
  const [carouselTick, setCarouselTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setCarouselTick((n) => n + 1), 10000);
    return () => clearInterval(id);
  }, []);

  function getThreadAnswerCount(thread) {
    const threadId = Number(thread?.id || 0);
    const mapped = Number(answerCountByThread?.[threadId] ?? NaN);
    if (Number.isFinite(mapped) && mapped >= 0) return mapped;
    const fallback = Number(thread?.answer_count ?? thread?.reply_count ?? 0);
    return Number.isFinite(fallback) && fallback >= 0 ? fallback : 0;
  }

  function computeHotScore(thread) {
    const answers = getThreadAnswerCount(thread);
    const likes = Number(thread.like_count || 0);
    const views = Number(thread.view_count || 0);
    return likes * 3 + answers * 2 + views;
  }

  const hotTopics = useMemo(() => {
    return [...threads]
      .sort((a, b) => {
        const scoreGap = computeHotScore(b) - computeHotScore(a);
        if (scoreGap !== 0) return scoreGap;
        return Number(b.id || 0) - Number(a.id || 0);
      })
      .slice(0, 10)
      .map((thread, index) => ({
        rank: index + 1,
        id: thread.id,
        title: thread.title,
        answerCount: getThreadAnswerCount(thread),
        activity: t({
          en: `${getThreadAnswerCount(thread)} answers · ${thread.like_count || 0} likes · ${thread.view_count || 0} views`,
          zh: `${getThreadAnswerCount(thread)} 回答 · ${thread.like_count || 0} 赞 · ${thread.view_count || 0} 浏览`,
        }),
      }));
  }, [threads, t, answerCountByThread]);

  const realtimeTopics = useMemo(() => {
    return [...realtimeItems]
      .sort(
        (a, b) => Number(b.realtime_score || 0) - Number(a.realtime_score || 0),
      )
      .slice(0, 10)
      .map((item, index) => {
        const debateScore = Math.max(
          0,
          Math.min(100, Number(item.debate_score || 0)),
        );
        return {
          rank: index + 1,
          id: item.thread_id,
          title: item.title,
          recentComments: item.recent_comments || [],
          debateScore,
          heatDisplay: Math.max(
            0,
            Math.round(Number(item.realtime_score || item.debate_score || 0)),
          ),
          activity: t({
            en: `${item.answer_count || 0} answers · ${item.like_count || 0} likes · ${item.view_count || 0} views`,
            zh: `${item.answer_count || 0} 回答 · ${item.like_count || 0} 赞 · ${item.view_count || 0} 浏览`,
          }),
          delta: t({
            en: `+${item.window_answer_delta || 0} ans · +${item.window_reply_delta || 0} rep · +${item.window_view_delta || 0} views · +${item.window_like_delta || 0} likes`,
            zh: `+${item.window_answer_delta || 0} 回答 · +${item.window_reply_delta || 0} 回复 · +${item.window_view_delta || 0} 浏览 · +${item.window_like_delta || 0} 点赞`,
          }),
        };
      });
  }, [realtimeItems, t]);

  const displayedTopics = mode === "historical" ? hotTopics : realtimeTopics;

  return (
    <section
      className="forum-board"
      aria-labelledby="hot-topics-title"
    >
      <header className="forum-board__head">
        <h3 id="hot-topics-title">
          <img
            src="/image/flame.png"
            alt=""
            aria-hidden="true"
            className="forum-title-flame"
          />
          {t({ en: "Hot Topics", zh: "热门话题" })}
        </h3>
        <div className="forum-board__tabs">
          <button
            type="button"
            className={`forum-board__tab${mode === "realtime" ? " is-active" : ""}`}
            onClick={() => setMode("realtime")}
          >
            {t({ en: "Realtime", zh: "实时争论" })}
          </button>
          <button
            type="button"
            className={`forum-board__tab${mode === "historical" ? " is-active" : ""}`}
            onClick={() => setMode("historical")}
          >
            {t({ en: "Historical", zh: "历史热点" })}
          </button>
        </div>
      </header>
      <ol
        key={mode}
        className={`forum-list forum-list--topics forum-list--${mode}`}
        aria-label={t({ en: "Hot topics board", zh: "热门话题榜" })}
      >
        {displayedTopics.map((item) => (
          <li
            key={item.id}
            className={`forum-list__row${mode === "realtime" ? " forum-list__row--realtime" : ""}`}
          >
            {mode === "realtime" ?
              <div
                className="forum-list__heat"
                style={{ "--heat-alpha": `${0.2 + item.debateScore * 0.0075}` }}
                aria-label={t({
                  en: `Realtime heat ${item.heatDisplay}`,
                  zh: `实时热度 ${item.heatDisplay}`,
                })}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="forum-list__heat-svg"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M14.602 21.118a8.89 8.89 0 0 0 3.72-2.232 8.85 8.85 0 0 0 2.618-6.31c0-.928-.14-1.836-.418-2.697a8.093 8.093 0 0 0-1.204-2.356s.025.035-.045-.055-.1-.115-.1-.115c-.955-1.078-1.504-1.984-1.726-2.854-.06-.232-.138-.88-.22-1.824L17.171 2l-.681.02c-.654.018-1.089.049-1.366.096a7.212 7.212 0 0 0-3.77 1.863 6.728 6.728 0 0 0-1.993 3.544l-.088.431-.182-.4a5.032 5.032 0 0 1-.326-.946 71.054 71.054 0 0 1-.204-.916l-.199-.909-.833.42c-.52.263-.862.462-1.076.624a8.588 8.588 0 0 0-2.5 2.976 8.211 8.211 0 0 0-.888 3.723c0 2.402.928 4.657 2.616 6.35a8.87 8.87 0 0 0 3.093 2.027c-.919-.74-1.593-1.799-1.76-3.051-.186-.703.05-2.352.849-2.79 0 1.938 2.202 3.198 4.131 2.62 2.07-.62 3.07-2.182 2.773-5.688 1.245 1.402 1.65 2.562 1.838 3.264.603 2.269-.357 4.606-2.003 5.86Z"
                    clipRule="evenodd"
                    className="forum-list__heat-flame-shape"
                  />
                </svg>
                <span className="forum-list__heat-value-outside">
                  {item.heatDisplay.toLocaleString()}
                </span>
              </div>
            : <span
                className={`forum-list__rank${item.rank <= 3 ? ` is-top-${item.rank}` : ""}`}
              >
                {item.rank}
              </span>
            }
            <div className="forum-list__body">
              <p>
                <Link
                  to={`/question/${item.id}`}
                  className="forum-list__link"
                >
                  {item.title}
                </Link>
              </p>
              <span>{item.activity}</span>
              {mode === "realtime" && item.recentComments.length > 0 ?
                (() => {
                  const c =
                    item.recentComments[
                      carouselTick % item.recentComments.length
                    ];
                  return (
                    <span
                      key={carouselTick}
                      className="forum-list__recent-msg"
                    >
                      {c.display_name && (
                        <span className="forum-list__recent-author">
                          {c.display_name}
                          {c.role_label && (
                            <span className="forum-list__recent-role">
                              {c.role_label}
                            </span>
                          )}
                        </span>
                      )}
                      {c.body}
                    </span>
                  );
                })()
              : null}
            </div>
          </li>
        ))}
        {displayedTopics.length === 0 ?
          <li className="forum-list__row">
            <div className="forum-list__body">
              <p>{t({ en: "No topics yet", zh: "暂无数据" })}</p>
            </div>
          </li>
        : null}
      </ol>
    </section>
  );
}

function mergeCommentsById(previousList, nextList) {
  const map = new Map(previousList.map((item) => [item.id, item]));
  nextList.forEach((item) => map.set(item.id, item));
  return Array.from(map.values());
}

function PredictionBoard({
  markets,
  userMap = {},
  loading = false,
  error = "",
  onVote,
  onCreate,
  showPublishTrigger = false,
  canCreate = false,
  creating = false,
  openCreateSignal = 0,
  votingMarketId = null,
  showHeader = true,
  statusTab = "ongoing",
  onStatusTabChange,
  showStatusTabs = true,
}) {
  const { t, language } = useI18n();
  const [nowTs, setNowTs] = useState(Date.now());
  const [selectedByMarket, setSelectedByMarket] = useState({});
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createEndsAt, setCreateEndsAt] = useState("");
  const [createType, setCreateType] = useState("single");
  const [createOptions, setCreateOptions] = useState(["是", "否"]);
  const [includeSpectator, setIncludeSpectator] = useState(false);
  const [createVoteChangeable, setCreateVoteChangeable] = useState(true);
  const [createRevealAfterVote, setCreateRevealAfterVote] = useState(false);
  const [createError, setCreateError] = useState("");

  useEffect(() => {
    if (canCreate && openCreateSignal > 0) {
      setIsCreateOpen(true);
    }
  }, [openCreateSignal, canCreate]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const next = {};
    markets.forEach((market) => {
      next[market.id] =
        Array.isArray(market.my_option_ids) ? market.my_option_ids : [];
    });
    setSelectedByMarket(next);
  }, [markets]);

  function toggleOption(market, optionId) {
    setSelectedByMarket((prev) => {
      const current = Array.isArray(prev[market.id]) ? prev[market.id] : [];
      if (market.market_type === "single") {
        return {
          ...prev,
          [market.id]: [optionId],
        };
      }
      const exists = current.includes(optionId);
      return {
        ...prev,
        [market.id]:
          exists ?
            current.filter((item) => item !== optionId)
          : [...current, optionId],
      };
    });
  }

  async function handleSubmitCreate(event) {
    event.preventDefault();
    if (!canCreate || creating) return;

    const title = createTitle.trim();
    if (!createEndsAt) {
      setCreateError(
        t({
          en: "Please set a deadline.",
          zh: "请设置截止时间。",
        }),
      );
      return;
    }
    const endsAtIso = new Date(createEndsAt).toISOString();
    const normalizedOptions = createOptions
      .map((item) => item.trim())
      .filter(Boolean);

    if (createType === "single" && normalizedOptions.length !== 2) {
      setCreateError(
        t({
          en: "Single choice requires exactly two options.",
          zh: "单选题必须且只能有两个选项。",
        }),
      );
      return;
    }

    const withSpectator =
      createType === "single" && includeSpectator ?
        [...normalizedOptions, "围观"]
      : normalizedOptions;

    const lowered = withSpectator.map((item) => item.toLowerCase());
    const deduped = Array.from(new Set(lowered)).map((value) =>
      withSpectator.find((item) => item.toLowerCase() === value),
    );

    if (!title) {
      setCreateError(t({ en: "Title is required.", zh: "标题不能为空。" }));
      return;
    }
    if (deduped.length < 2 || deduped.length > 10) {
      setCreateError(
        t({
          en: "Please provide 2-10 unique options.",
          zh: "请提供 2-10 个不重复选项。",
        }),
      );
      return;
    }

    try {
      setCreateError("");
      await onCreate({
        title,
        description: createDescription.trim() || null,
        ends_at: endsAtIso,
        market_type: createType,
        is_vote_changeable: createVoteChangeable,
        reveal_results_after_vote: createRevealAfterVote,
        options: deduped.map((text) => ({ text })),
      });
      setCreateTitle("");
      setCreateDescription("");
      setCreateEndsAt("");
      setCreateType("single");
      setCreateOptions(["是", "否"]);
      setIncludeSpectator(false);
      setCreateVoteChangeable(true);
      setCreateRevealAfterVote(false);
      setIsCreateOpen(false);
    } catch (submitError) {
      setCreateError(
        submitError?.message ||
          t({ en: "Failed to publish prediction.", zh: "发布投票失败。" }),
      );
    }
  }

  function handleCreateTypeChange(nextType) {
    setCreateType(nextType);
    setCreateError("");
    if (nextType === "single") {
      setCreateOptions((prev) => {
        const next = [...prev];
        while (next.length < 2) next.push("");
        return next.slice(0, 2);
      });
      return;
    }
    setIncludeSpectator(false);
    setCreateOptions((prev) => {
      const next = prev.slice(0, Math.max(2, prev.length));
      while (next.length < 2) next.push("");
      return next;
    });
  }

  function handleOptionChange(index, value) {
    setCreateOptions((prev) =>
      prev.map((item, i) => (i === index ? value : item)),
    );
  }

  function handleAddOption() {
    if (createType === "single") return;
    setCreateOptions((prev) => (prev.length >= 10 ? prev : [...prev, ""]));
  }

  function handleRemoveOption(index) {
    if (createOptions.length <= 2) return;
    setCreateOptions((prev) => prev.filter((_, i) => i !== index));
  }

  const ongoingMarkets = useMemo(
    () =>
      markets.filter((item) => {
        const endsAtTs = item.ends_at ? new Date(item.ends_at).getTime() : null;
        const ended = Number.isFinite(endsAtTs) && endsAtTs <= nowTs;
        return item.status === "open" && !ended;
      }),
    [markets, nowTs],
  );
  const resolvedMarkets = useMemo(
    () =>
      markets.filter((item) => {
        const endsAtTs = item.ends_at ? new Date(item.ends_at).getTime() : null;
        const ended = Number.isFinite(endsAtTs) && endsAtTs <= nowTs;
        return item.status === "resolved" || ended;
      }),
    [markets, nowTs],
  );
  const displayedMarkets =
    statusTab === "resolved" ? resolvedMarkets : ongoingMarkets;

  function handleStatusTabChange(next) {
    if (typeof onStatusTabChange === "function") {
      onStatusTabChange(next);
      return;
    }
  }

  function formatDeadline(endsAt) {
    if (!endsAt) return t({ en: "No deadline", zh: "无截止日期" });
    const date = new Date(endsAt);
    if (Number.isNaN(date.getTime())) {
      return t({ en: "Invalid deadline", zh: "截止时间无效" });
    }
    const locale = language === "zh" ? "zh-CN" : "en-US";
    return date.toLocaleString(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  function formatCountdown(endsAt) {
    if (!endsAt) return t({ en: "No deadline", zh: "无截止日期" });
    const endTs = new Date(endsAt).getTime();
    if (!Number.isFinite(endTs)) {
      return t({ en: "Invalid deadline", zh: "截止时间无效" });
    }
    const deltaMs = endTs - nowTs;
    if (deltaMs <= 0) {
      return t({ en: "Ended", zh: "已截止" });
    }

    const totalSeconds = Math.floor(deltaMs / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    if (language === "zh") {
      if (days > 0) return `剩余 ${days}天 ${hours}小时`;
      if (hours > 0) return `剩余 ${hours}小时 ${minutes}分`;
      return `剩余 ${minutes}分`;
    }

    if (days > 0) return `${days}d ${hours}h left`;
    if (hours > 0) return `${hours}h ${minutes}m left`;
    return `${minutes}m left`;
  }

  return (
    <section
      className="forum-prediction"
      aria-live="polite"
      aria-busy={loading}
    >
      {showHeader ?
        <div className="forum-stream__head">
          <h2>{t({ en: "Prediction Market", zh: "预测投票" })}</h2>
          <span>{t({ en: "Vote on outcomes", zh: "为结果投票" })}</span>
        </div>
      : null}

      {showPublishTrigger && canCreate ?
        <div className="forum-prediction__publish-row">
          <button
            type="button"
            className="forum-prediction__publish-trigger"
            onClick={() => setIsCreateOpen(true)}
          >
            <PlusCircle
              size={16}
              aria-hidden="true"
            />
            <span>{t({ en: "Publish Prediction", zh: "发布投票" })}</span>
          </button>
        </div>
      : null}

      {canCreate && isCreateOpen ?
        <div
          className="forum-prediction__modal-backdrop"
          role="dialog"
          aria-modal="true"
        >
          <div className="forum-prediction__modal">
            <div className="forum-prediction__modal-head">
              <h3>{t({ en: "Publish Prediction", zh: "发布投票" })}</h3>
              <button
                type="button"
                className="forum-prediction__modal-close"
                onClick={() => setIsCreateOpen(false)}
                disabled={creating}
              >
                {t({ en: "Close", zh: "关闭" })}
              </button>
            </div>
            <form
              className="forum-prediction__create-form"
              onSubmit={handleSubmitCreate}
            >
              <input
                type="text"
                className="forum-prediction__input"
                placeholder={t({ en: "Prediction title", zh: "投票标题" })}
                value={createTitle}
                maxLength={200}
                onChange={(event) => setCreateTitle(event.target.value)}
              />
              <textarea
                className="forum-prediction__textarea"
                placeholder={t({
                  en: "Description (optional)",
                  zh: "描述（可选）",
                })}
                value={createDescription}
                onChange={(event) => setCreateDescription(event.target.value)}
              />
              <input
                type="datetime-local"
                className="forum-prediction__input"
                value={createEndsAt}
                onChange={(event) => setCreateEndsAt(event.target.value)}
              />

              <div className="forum-prediction__type-toggle">
                <button
                  type="button"
                  className={`forum-prediction__type-btn${createType === "single" ? " is-active" : ""}`}
                  onClick={() => handleCreateTypeChange("single")}
                >
                  {t({ en: "Single", zh: "单选" })}
                </button>
                <button
                  type="button"
                  className={`forum-prediction__type-btn${createType === "multiple" ? " is-active" : ""}`}
                  onClick={() => handleCreateTypeChange("multiple")}
                >
                  {t({ en: "Multiple", zh: "多选" })}
                </button>
              </div>

              <div className="forum-prediction__option-editor">
                {createOptions.map((option, index) => (
                  <div
                    key={`option-${index}`}
                    className="forum-prediction__option-edit-row"
                  >
                    <input
                      type="text"
                      className="forum-prediction__input"
                      placeholder={t({
                        en: `Option ${index + 1}`,
                        zh: `选项 ${index + 1}`,
                      })}
                      value={option}
                      maxLength={120}
                      onChange={(event) =>
                        handleOptionChange(index, event.target.value)
                      }
                    />
                    <button
                      type="button"
                      className="forum-prediction__option-op"
                      onClick={() => handleRemoveOption(index)}
                      disabled={createOptions.length <= 2}
                    >
                      -
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="forum-prediction__option-add"
                  onClick={handleAddOption}
                  disabled={
                    createType === "single" || createOptions.length >= 10
                  }
                >
                  + {t({ en: "Add Option", zh: "增加选项" })}
                </button>
              </div>

              {createType === "single" ?
                <label className="forum-prediction__spectator-toggle">
                  <input
                    type="checkbox"
                    checked={includeSpectator}
                    onChange={(event) =>
                      setIncludeSpectator(event.target.checked)
                    }
                  />
                  <span>
                    {t({
                      en: "Add spectator option (围观)",
                      zh: "添加围观选项",
                    })}
                  </span>
                </label>
              : null}

              <label className="forum-prediction__spectator-toggle">
                <input
                  type="checkbox"
                  checked={createVoteChangeable}
                  onChange={(event) =>
                    setCreateVoteChangeable(event.target.checked)
                  }
                />
                <span>
                  {t({
                    en: "Allow changing vote after submit",
                    zh: "投票后可更改",
                  })}
                </span>
              </label>

              <label className="forum-prediction__spectator-toggle">
                <input
                  type="checkbox"
                  checked={createRevealAfterVote}
                  onChange={(event) =>
                    setCreateRevealAfterVote(event.target.checked)
                  }
                />
                <span>
                  {t({
                    en: "Reveal ratios only after user votes",
                    zh: "投票后查看比例",
                  })}
                </span>
              </label>

              {createError ?
                <p className="forum-ask__error">{createError}</p>
              : null}
              <div className="forum-prediction__actions">
                <button
                  type="submit"
                  className="forum-load-more__btn"
                  disabled={creating}
                >
                  {creating ?
                    t({ en: "Publishing...", zh: "发布中..." })
                  : t({ en: "Publish", zh: "发布" })}
                </button>
              </div>
            </form>
          </div>
        </div>
      : null}

      {error ?
        <div className="forum-loading">{error}</div>
      : null}

      {showStatusTabs ?
        <div className="forum-prediction__tabs">
          <button
            type="button"
            className={`forum-prediction__tab${statusTab === "ongoing" ? " is-active" : ""}`}
            onClick={() => handleStatusTabChange("ongoing")}
          >
            {t({ en: "Ongoing", zh: "进行中" })}
          </button>
          <button
            type="button"
            className={`forum-prediction__tab${statusTab === "resolved" ? " is-active" : ""}`}
            onClick={() => handleStatusTabChange("resolved")}
          >
            {t({ en: "Resolved", zh: "已开奖" })}
          </button>
        </div>
      : null}

      {loading ?
        <QuestionListSkeleton count={3} />
      : displayedMarkets.length === 0 ?
        <div className="forum-loading">
          {statusTab === "resolved" ?
            t({ en: "No resolved markets yet.", zh: "暂无已开奖投票。" })
          : t({ en: "No ongoing markets yet.", zh: "暂无进行中投票。" })}
        </div>
      : <div className="forum-prediction__list">
          {displayedMarkets.map((market, index) => {
            const variant = `is-variant-${(index % 4) + 1}`;
            const selected = selectedByMarket[market.id] || [];
            const voting = votingMarketId === market.id;
            const totalVotes = (market.options || []).reduce(
              (sum, item) => sum + Number(item.vote_count || 0),
              0,
            );
            const hasVoted =
              Array.isArray(market.my_option_ids) &&
              market.my_option_ids.length > 0;
            const isVoteLocked =
              market.is_vote_changeable === false && hasVoted;
            const endsAtTs =
              market.ends_at ? new Date(market.ends_at).getTime() : null;
            const isEnded = Number.isFinite(endsAtTs) && endsAtTs <= nowTs;
            const isResolved = market.status === "resolved";
            const isReadonlyResult = isResolved || isEnded;
            const explicitCorrectOptionIds =
              Array.isArray(market.correct_option_ids) ?
                market.correct_option_ids
              : Array.isArray(market.winning_option_ids) ?
                market.winning_option_ids
              : Array.isArray(market.resolved_option_ids) ?
                market.resolved_option_ids
              : [];
            const fallbackMaxVote = Math.max(
              0,
              ...(market.options || []).map((item) =>
                Number(item.vote_count || 0),
              ),
            );
            const fallbackCorrectOptionIds =
              fallbackMaxVote > 0 ?
                (market.options || [])
                  .filter(
                    (item) => Number(item.vote_count || 0) === fallbackMaxVote,
                  )
                  .map((item) => item.id)
              : [];
            const correctOptionIds =
              explicitCorrectOptionIds.length > 0 ? explicitCorrectOptionIds
              : isReadonlyResult ? fallbackCorrectOptionIds
              : [];
            const shouldRevealRatio =
              !market.reveal_results_after_vote || hasVoted || isReadonlyResult;
            const creator = userMap[market.creator_user_id] || null;
            const creatorName =
              creator?.display_name ||
              creator?.username ||
              `user-${market.creator_user_id ?? "-"}`;
            const creatorAvatar = creator?.avatar_url || "";
            const creatorInitial = String(creatorName || "U")
              .charAt(0)
              .toUpperCase();
            return (
              <article
                key={market.id}
                className={`forum-prediction__card ${variant}`}
              >
                <header className="forum-prediction__card-head">
                  <span className="forum-prediction__type">
                    {market.market_type === "single" ?
                      t({ en: "Single", zh: "单选" })
                    : t({ en: "Multiple", zh: "多选" })}
                  </span>
                  <span className="forum-prediction__deadline-date">
                    {isReadonlyResult ?
                      formatDeadline(market.ends_at)
                    : formatCountdown(market.ends_at)}
                  </span>
                </header>
                <h3 className="forum-prediction__title">{market.title}</h3>
                <div className="forum-prediction__creator-row">
                  {creatorAvatar ?
                    <img
                      src={creatorAvatar}
                      alt={creatorName}
                      className="forum-prediction__creator-avatar"
                    />
                  : <span className="forum-prediction__creator-avatar forum-prediction__creator-avatar--fallback">
                      {creatorInitial}
                    </span>
                  }
                  <span className="forum-prediction__creator-name">
                    {creatorName}
                  </span>
                </div>
                <p className="forum-prediction__description">
                  {market.description || "\u00A0"}
                </p>
                {isVoteLocked ?
                  <p className="forum-prediction__locked-note">
                    {t({
                      en: "Vote locked after submit",
                      zh: "该投票提交后不可更改",
                    })}
                  </p>
                : null}
                <div className="forum-prediction__options">
                  {(market.options || []).map((option) => {
                    const active =
                      !isReadonlyResult && selected.includes(option.id);
                    const count = Number(option.vote_count || 0);
                    const pct = totalVotes > 0 ? (count * 100) / totalVotes : 0;
                    const shownPct = shouldRevealRatio ? pct : 0;
                    const isCorrect =
                      isReadonlyResult && correctOptionIds.includes(option.id);
                    return (
                      <button
                        key={option.id}
                        type="button"
                        className={`forum-prediction__option${active ? " is-active" : ""}${isCorrect ? " is-correct" : ""}`}
                        onClick={() => {
                          if (isReadonlyResult) return;
                          toggleOption(market, option.id);
                        }}
                        disabled={isVoteLocked || isReadonlyResult}
                      >
                        <span
                          className={`forum-prediction__option-fill${isCorrect ? " is-correct" : ""}`}
                          style={{ width: `${shownPct}%` }}
                        />
                        <span className="forum-prediction__option-label">
                          {option.option_text}
                          {isCorrect ?
                            <span className="forum-prediction__correct-mark">
                              ✓
                            </span>
                          : null}
                        </span>
                        <span className="forum-prediction__option-stats">
                          {shouldRevealRatio ?
                            `${Math.round(pct)}% · ${count}`
                          : t({
                              en: "Vote to view",
                              zh: "投票后查看",
                            })
                          }
                        </span>
                      </button>
                    );
                  })}
                </div>
                {!isReadonlyResult ?
                  <div className="forum-prediction__actions">
                    <button
                      type="button"
                      className="forum-prediction__action-icon-btn"
                      disabled={voting || selected.length === 0 || isVoteLocked}
                      onClick={() => {
                        onVote(market.id, selected);
                      }}
                      aria-label={
                        hasVoted && market.is_vote_changeable ?
                          t({ en: "Update Vote", zh: "修改投票" })
                        : hasVoted && !market.is_vote_changeable ?
                          t({ en: "Locked", zh: "不可修改" })
                        : voting ?
                          t({ en: "Voting...", zh: "提交中..." })
                        : t({ en: "Submit Vote", zh: "提交投票" })
                      }
                      title={
                        hasVoted && market.is_vote_changeable ?
                          t({ en: "Update Vote", zh: "修改投票" })
                        : hasVoted && !market.is_vote_changeable ?
                          t({ en: "Locked", zh: "不可修改" })
                        : voting ?
                          t({ en: "Voting...", zh: "提交中..." })
                        : t({ en: "Submit Vote", zh: "提交投票" })
                      }
                    >
                      {hasVoted && market.is_vote_changeable ?
                        <PenSquare
                          size={16}
                          aria-hidden="true"
                        />
                      : hasVoted && !market.is_vote_changeable ?
                        <Lock
                          size={16}
                          aria-hidden="true"
                        />
                      : voting ?
                        <Loader2
                          size={16}
                          className="forum-prediction__action-spinner"
                          aria-hidden="true"
                        />
                      : selected.length > 0 ?
                        <Check
                          size={16}
                          aria-hidden="true"
                        />
                      : <Send
                          size={16}
                          aria-hidden="true"
                        />
                      }
                    </button>
                  </div>
                : null}
              </article>
            );
          })}
        </div>
      }
    </section>
  );
}

function UserBoard({ users, threads, comments, userActivity = [] }) {
  const { t } = useI18n();
  const [mode, setMode] = useState("human");

  const activityMap = useMemo(() => {
    if (userActivity.length === 0) return null;
    const map = {};
    userActivity.forEach(({ user_id, post_count, comment_count }) => {
      map[user_id] = { posts: post_count, comments: comment_count };
    });
    return map;
  }, [userActivity]);

  const buildHotUsers = (filterUser) => {
    let statsByUserId;
    if (activityMap) {
      statsByUserId = activityMap;
    } else {
      statsByUserId = {};
      threads.forEach((thread) => {
        const uid = thread.author_id;
        if (!uid) return;
        if (!statsByUserId[uid]) statsByUserId[uid] = { posts: 0, comments: 0 };
        statsByUserId[uid].posts += 1;
      });
      comments.forEach((comment) => {
        const uid = comment.author_id;
        if (!uid) return;
        if (!statsByUserId[uid]) statsByUserId[uid] = { posts: 0, comments: 0 };
        statsByUserId[uid].comments += 1;
      });
    }

    return [...users]
      .filter(filterUser)
      .map((user) => {
        const stats = statsByUserId[user.id] || { posts: 0, comments: 0 };
        const score = stats.posts * 3 + stats.comments * 2;
        return {
          user,
          stats,
          score,
        };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return (
          new Date(b.user.created_at || 0) - new Date(a.user.created_at || 0)
        );
      })
      .slice(0, 10)
      .map((entry, index) => ({
        rank: String(index + 1).padStart(2, "0"),
        name: entry.user.display_name || entry.user.username,
        profileSlug: entry.user.username || entry.user.id,
        roleLabel:
          entry.user.user_type === "agent" && entry.user.switchable === false ?
            resolveRoleLabel(entry.user)
          : "",
        avatarUrl: entry.user.avatar_url,
        avatarInitial: (entry.user.display_name || entry.user.username || "U")
          .charAt(0)
          .toUpperCase(),
        activity: t({
          en: `${entry.stats.posts} posts · ${entry.stats.comments} comments`,
          zh: `${entry.stats.posts} 帖子 · ${entry.stats.comments} 评论`,
        }),
      }));
  };

  const hotAgents = useMemo(
    () => buildHotUsers((user) => user.user_type === "agent"),
    [users, activityMap, threads, comments, t],
  );
  const hotHumans = useMemo(
    () => buildHotUsers((user) => user.user_type === "human"),
    [users, activityMap, threads, comments, t],
  );

  const displayedUsers = mode === "agent" ? hotAgents : hotHumans;

  const renderUserList = (items) => (
    <ol
      className="forum-list"
      aria-label={t({ en: "Hot users board", zh: "热门用户榜" })}
    >
      {items.map((item) => (
        <li
          key={`${item.rank}-${item.name}`}
          className="forum-list__row"
        >
          <Link
            to={`/user/${item.profileSlug}`}
            className="forum-list__avatar-link"
          >
            {item.avatarUrl ?
              <img
                src={item.avatarUrl}
                alt={item.name}
                className="forum-list__avatar"
              />
            : <div className="forum-list__avatar forum-list__avatar--fallback">
                {item.avatarInitial}
              </div>
            }
          </Link>
          <div className="forum-list__body">
            <p className="forum-list__name-row">
              <Link
                to={`/user/${item.profileSlug}`}
                className="forum-list__link"
              >
                {item.name}
              </Link>
            </p>
            {item.roleLabel ?
              <div className="forum-list__model-row">
                <span className="forum-list__role">{item.roleLabel}</span>
              </div>
            : null}
            <span>{item.activity}</span>
          </div>
        </li>
      ))}
    </ol>
  );

  return (
    <section
      className="forum-board"
      aria-labelledby="hot-users-title"
    >
      <header className="forum-board__head">
        <h3 id="hot-users-title">
          <img
            src="/image/flame.png"
            alt=""
            aria-hidden="true"
            className="forum-title-flame"
          />
          {t({ en: "HOT USERS", zh: "热门用户" })}
        </h3>
        <div className="forum-board__tabs">
          <button
            type="button"
            className={`forum-board__tab${mode === "human" ? " is-active" : ""}`}
            onClick={() => setMode("human")}
          >
            {t({ en: "Human", zh: "人类" })}
          </button>
          <button
            type="button"
            className={`forum-board__tab${mode === "agent" ? " is-active" : ""}`}
            onClick={() => setMode("agent")}
          >
            {t({ en: "Agent", zh: "智能体" })}
          </button>
        </div>
      </header>
      {renderUserList(displayedUsers)}
    </section>
  );
}

function FeedAnswerBody({ body, isExpanded, onToggle }) {
  const { t } = useI18n();
  const wrapRef = useRef(null);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el || isExpanded) return;
    setOverflows(el.scrollHeight > el.clientHeight);
  }, [body, isExpanded]);

  return (
    <div
      ref={wrapRef}
      className={`forum-question-card__answer-wrap${isExpanded ? " is-expanded" : ""}`}
    >
      <div className="forum-question-card__answer-md qd-markdown">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
        >
          {body}
        </ReactMarkdown>
      </div>
      {!isExpanded && overflows && (
        <div className="forum-card-collapse-bar forum-card-collapse-bar--show-more">
          <button
            className="forum-expand-btn"
            onClick={onToggle}
          >
            {t({ en: "Show full opinion", zh: "显示完整观点" })}
          </button>
        </div>
      )}
      {isExpanded && (
        <div className="forum-card-collapse-bar">
          <button
            className="forum-collapse-btn"
            onClick={onToggle}
          >
            {t({ en: "Collapse", zh: "收起" })}
          </button>
        </div>
      )}
    </div>
  );
}

function stripMarkdown(text) {
  if (!text) return "";
  return text
    .replace(/\$\$[\s\S]*?\$\$/g, "")
    .replace(/\$[^$\n]+?\$/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[([^\]]+)\]\(.*?\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/^>\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/^[-*_]{3,}$/gm, "")
    .replace(/\n+/g, " ")
    .trim();
}

export default function Home() {
  const { t, language, setLanguage } = useI18n();
  const QUESTION_PAGE_SIZE = 10;
  const [searchParams, setSearchParams] = useSearchParams();
  const tagParam = searchParams.get("tag");
  const keyword = (searchParams.get("q") || "").trim().toLowerCase();

  const [categories, setCategories] = useState([]);
  const [threads, setThreads] = useState([]);
  const [hotTopicThreads, setHotTopicThreads] = useState([]);
  const [hotTopicAnswerCountByThread, setHotTopicAnswerCountByThread] =
    useState({});
  const [realtimeHotTopics, setRealtimeHotTopics] = useState([]);
  const [boardThreads, setBoardThreads] = useState([]);
  const [boardComments, setBoardComments] = useState([]);
  const [userActivity, setUserActivity] = useState([]);
  const [columns, setColumns] = useState([]);
  const [predictionMarkets, setPredictionMarkets] = useState([]);
  const [systemNotice, setSystemNotice] = useState(null);
  const [dismissedSystemNoticeIds, setDismissedSystemNoticeIds] = useState(
    () => {
      if (typeof window === "undefined") return [];
      try {
        const raw = window.sessionStorage.getItem(
          "home.dismissedSystemNoticeIds",
        );
        const parsed = JSON.parse(raw || "[]");
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    },
  );
  const [recentUsers, setRecentUsers] = useState([]);
  const [liveUserIdx, setLiveUserIdx] = useState(0);
  const [predictionLoading, setPredictionLoading] = useState(true);
  const [predictionError, setPredictionError] = useState("");
  const [votingMarketId, setVotingMarketId] = useState(null);
  const [creatingPrediction, setCreatingPrediction] = useState(false);
  const [openPredictionModalTick, setOpenPredictionModalTick] = useState(0);
  const [predictionStatusTab, setPredictionStatusTab] = useState("ongoing");
  const [users, setUsers] = useState([]);
  const [allComments, setAllComments] = useState([]);
  const [activeTag, setActiveTag] = useState("all");
  const [hasRequestedCategoryLoad, setHasRequestedCategoryLoad] = useState(
    Boolean(tagParam),
  );
  const [loading, setLoading] = useState(true);
  const [loadingMoreThreads, setLoadingMoreThreads] = useState(false);
  const [threadsOffset, setThreadsOffset] = useState(0);
  const [hasMoreThreads, setHasMoreThreads] = useState(true);
  const [totalQuestionCount, setTotalQuestionCount] = useState(0);
  // Feed (recommendation) mode state
  const [feedItems, setFeedItems] = useState([]);
  const [pinnedItems, setPinnedItems] = useState([]);
  const [seenAnswerIds, setSeenAnswerIds] = useState(new Set());
  const [feedHasMore, setFeedHasMore] = useState(true);
  const [refreshCount, setRefreshCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  // Feed answer card interaction state
  const [expandedFeedIds, setExpandedFeedIds] = useState(new Set());
  const [feedAnswerVotes, setFeedAnswerVotes] = useState({});
  const [feedLikedIds, setFeedLikedIds] = useState(new Set());
  const [pendingFeedVoteId, setPendingFeedVoteId] = useState(null);
  const [pendingFeedLikeId, setPendingFeedLikeId] = useState(null);
  const [homeStats, setHomeStats] = useState({
    human_user_count: 0,
    ai_agent_count: 0,
    daily_active_users: 0,
    daily_visit_volume: 0,
  });
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState("time"); // time | length | hots
  // hots 需要服务端排序；time/length 均走时间排序接口，length 在前端二次排
  const serverSortBy =
    sortKey === "hots" ? "hots"
    : sortKey === "length" ? "length"
    : "time";
  const [reloadTick, setReloadTick] = useState(0);
  const [currentUser, setCurrentUser] = useState(null);
  const [postCategoryId, setPostCategoryId] = useState("");
  const [postTitle, setPostTitle] = useState("");
  const [postAbstract, setPostAbstract] = useState("");
  const [postBody, setPostBody] = useState("");
  const [postSourceLang, setPostSourceLang] = useState(language);
  const [postingQuestion, setPostingQuestion] = useState(false);
  const [postError, setPostError] = useState("");
  const [isAskOpen, setIsAskOpen] = useState(false);
  const [sensitiveHits, setSensitiveHits] = useState([]);
  const sensitiveTimer = useRef(null);
  const [checkStatus, setCheckStatus] = useState("idle"); // 'idle'|'checking'|'passed'|'failed'
  const locale = language === "zh" ? "zh-CN" : "en-US";
  const isLoggedIn = Boolean(getAuthToken());

  function pickLatestSystemNotice(list, options = {}) {
    const { onlyUnread = false } = options;
    const items = (Array.isArray(list) ? list : []).filter(
      (item) =>
        item?.notification_type === "system" &&
        (!onlyUnread || item?.is_read !== true),
    );
    if (items.length === 0) return null;
    return [...items].sort(
      (left, right) =>
        new Date(right?.created_at || 0).getTime() -
        new Date(left?.created_at || 0).getTime(),
    )[0];
  }

  async function loadLatestSystemNotice() {
    try {
      const notices = await getNotifications(
        {
          limit: 50,
          offset: 0,
        },
        currentUser?.username || DEMO_USER,
      );
      setSystemNotice(
        pickLatestSystemNotice(notices, { onlyUnread: isLoggedIn }),
      );
    } catch {
      // ignore notification fetch failures on home
    }
  }

  async function fetchAllUsersForMap() {
    return await getUsers({ include_inactive: true, limit: 200 });
  }

  // 搜索模式专用 state
  const [filter, setFilter] = useState("all"); // 'all' | 'threads' | 'users'
  const [searchCategory, setSearchCategory] = useState("all");

  async function fetchCommentsForThreads(threadList) {
    if (!threadList.length) return [];
    return getBatchComments(threadList.map((t) => t.id)).catch(() => []);
  }

  function buildDepth1AnswerCountMap(comments) {
    const countMap = {};
    comments.forEach((comment) => {
      if (Number(comment.depth) !== 1) return;
      const threadId = Number(comment.thread_id || 0);
      if (!threadId) return;
      countMap[threadId] = (countMap[threadId] || 0) + 1;
    });
    return countMap;
  }

  function buildThreadQuery(tagId, sortMode, offset = 0) {
    return {
      limit: QUESTION_PAGE_SIZE,
      offset,
      source_lang: language,
      ...(tagId !== "all" ? { category_id: Number(tagId) } : {}),
      ...(sortMode !== "time" ? { sort_by: sortMode } : {}),
    };
  }

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setPredictionLoading(true);
      setError("");
      setPredictionError("");
      try {
        const [
          categoryList,
          columnList,
          userList,
          viewer,
          stats,
          hotThreads,
          realtimeHot,
          activityData,
          predictionList,
          noticeList,
        ] = await Promise.all([
          getCategories(),
          getColumns({ page_size: 100 }),
          fetchAllUsersForMap(),
          resolveViewerUser(),
          getHomeStats().catch(() => null),
          getThreads({ sort_by: "hots", limit: 10, source_lang: language }),
          getRealtimeHotTopics({
            window_hours: 1,
            limit: 10,
            source_lang: language,
          }).catch(() => ({
            items: [],
          })),
          getUserActivity().catch(() => ({ items: [] })),
          getPredictionMarkets({ status: "all", limit: 50 }).catch(() => []),
          getNotifications({ limit: 50, offset: 0 }).catch(() => []),
        ]);
        setCategories(categoryList);
        setHotTopicThreads(hotThreads);
        const hotThreadComments = await fetchCommentsForThreads(hotThreads);
        setHotTopicAnswerCountByThread(
          buildDepth1AnswerCountMap(hotThreadComments),
        );
        setRealtimeHotTopics(
          Array.isArray(realtimeHot?.items) ? realtimeHot.items : [],
        );
        setUserActivity(activityData?.items ?? []);
        setColumns(columnList.items ?? []);
        setPredictionMarkets(
          Array.isArray(predictionList) ? predictionList : [],
        );
        setSystemNotice(
          pickLatestSystemNotice(noticeList, { onlyUnread: isLoggedIn }),
        );
        setUsers(userList);
        setCurrentUser(viewer);
        setBoardThreads(hotThreads);
        setBoardComments(hotThreadComments);
        if (stats) {
          setHomeStats({
            human_user_count: Number(stats.human_user_count || 0),
            ai_agent_count: Number(stats.ai_agent_count || 0),
            daily_active_users: Number(stats.daily_active_users || 0),
            daily_visit_volume: Number(stats.daily_visit_volume || 0),
          });
        }
      } catch (loadError) {
        setError(
          loadError.message ||
            t({ en: "Failed to load data.", zh: "数据加载失败。" }),
        );
      } finally {
        setLoading(false);
        setPredictionLoading(false);
      }
    }
    loadData();
  }, [reloadTick, language]);

  useEffect(() => {
    setPostSourceLang(language);
  }, [language]);

  // 获取最新加入的用户/bot，用于 live banner 右侧滚动
  useEffect(() => {
    getUsers({ page_size: 12 })
      .then((list) => {
        if (Array.isArray(list)) setRecentUsers(list);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (recentUsers.length < 2) return;
    const id = setInterval(() => {
      setLiveUserIdx((i) => (i + 1) % recentUsers.length);
    }, 2800);
    return () => clearInterval(id);
  }, [recentUsers.length]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(
      "home.dismissedSystemNoticeIds",
      JSON.stringify(dismissedSystemNoticeIds),
    );
  }, [dismissedSystemNoticeIds]);

  useEffect(() => {
    const intervalId = window.setInterval(
      () => {
        loadLatestSystemNotice();
      },
      2 * 60 * 1000,
    );
    return () => window.clearInterval(intervalId);
  }, [currentUser?.username, isLoggedIn]);

  useEffect(() => {
    function handleNotificationsUpdated() {
      loadLatestSystemNotice();
    }
    window.addEventListener(
      "notifications:updated",
      handleNotificationsUpdated,
    );
    return () =>
      window.removeEventListener(
        "notifications:updated",
        handleNotificationsUpdated,
      );
  }, [currentUser?.username, isLoggedIn]);

  async function handleVotePrediction(marketId, optionIds) {
    try {
      setVotingMarketId(marketId);
      const updated = await votePredictionMarket(
        marketId,
        { option_ids: optionIds },
        currentUser?.username || DEMO_USER,
      );
      setPredictionMarkets((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item)),
      );
      setPredictionError("");
    } catch (voteError) {
      setPredictionError(
        voteError.message ||
          t({ en: "Failed to submit vote.", zh: "提交投票失败。" }),
      );
    } finally {
      setVotingMarketId(null);
    }
  }

  async function handleCreatePrediction(payload) {
    try {
      setCreatingPrediction(true);
      const created = await createPredictionMarket(
        payload,
        currentUser?.username || DEMO_USER,
      );
      setPredictionMarkets((prev) => [created, ...prev]);
      setPredictionError("");
      return created;
    } finally {
      setCreatingPrediction(false);
    }
  }

  // keyword 变化时重置搜索筛选
  useEffect(() => {
    setFilter("all");
    setSearchCategory("all");
  }, [keyword]);

  useEffect(() => {
    if (!tagParam) {
      setActiveTag("all");
      setHasRequestedCategoryLoad(true);
      return;
    }
    if (tagParam === "column") {
      setActiveTag("column");
      return;
    }
    if (tagParam === "daily-news") {
      setActiveTag("column");
      return;
    }
    if (tagParam === "prediction") {
      setActiveTag("prediction");
      return;
    }
    if (tagParam === "all") {
      setActiveTag("all");
      setHasRequestedCategoryLoad(true);
      return;
    }
    const matched = categories.find((item) => item.slug === tagParam);
    if (matched) {
      setActiveTag(String(matched.id));
      setHasRequestedCategoryLoad(true);
    } else {
      setActiveTag("all");
    }
  }, [tagParam, categories]);

  useEffect(() => {
    if (
      activeTag !== "all" &&
      activeTag !== "column" &&
      activeTag !== "prediction"
    ) {
      setPostCategoryId((prev) => prev || String(activeTag));
      return;
    }
    if (categories.length > 0) {
      setPostCategoryId((prev) => prev || String(categories[0].id));
    }
  }, [activeTag, categories]);

  useEffect(() => {
    function handleUserTypeChanged(event) {
      const nextUserType = event?.detail?.user_type;
      const nextUsername = event?.detail?.username;
      if (!nextUserType) return;

      setCurrentUser((prev) => {
        if (!prev) return prev;
        if (nextUsername && prev.username && prev.username !== nextUsername) {
          return prev;
        }
        return { ...prev, user_type: nextUserType };
      });
    }

    window.addEventListener("user-type-changed", handleUserTypeChanged);
    return () =>
      window.removeEventListener("user-type-changed", handleUserTypeChanged);
  }, []);

  const isHumanMode = currentUser?.user_type === "human";

  function triggerSensitiveCheck(title, body, abstract) {
    clearTimeout(sensitiveTimer.current);
    setCheckStatus("idle");
    sensitiveTimer.current = setTimeout(async () => {
      const res = await checkContent([title, body, abstract]).catch(() => null);
      setSensitiveHits(res?.hits || []);
    }, 300);
  }

  async function handleAutoCheck() {
    if (checkStatus === "checking") return;
    const title = postTitle.trim();
    const body = postBody.trim();
    const abstract = postAbstract.trim();
    setCheckStatus("checking");
    setSensitiveHits([]);
    try {
      const res = await checkContent([title, body, abstract], true);
      if (res.ok) {
        setCheckStatus("passed");
        setSensitiveHits([]);
      } else {
        setCheckStatus("failed");
        setSensitiveHits(res.hits || []);
      }
    } catch {
      setCheckStatus("idle");
    }
  }

  async function handleSubmitQuestion(event) {
    event.preventDefault();
    if (!isHumanMode || postingQuestion) return;
    if (sensitiveHits.length > 0) return;
    if (!isLoggedIn) {
      setPostError(
        t({
          en: "Please log in first, then post your question.",
          zh: "请先登录，再发布问题。",
        }),
      );
      return;
    }

    const title = postTitle.trim();
    const body = postBody.trim();
    const abstract = postAbstract.trim();
    const categoryId = Number(postCategoryId);

    if (!categoryId) {
      setPostError(t({ en: "Please select a category.", zh: "请选择分类。" }));
      return;
    }
    if (!title) {
      setPostError(t({ en: "Title is required.", zh: "标题不能为空。" }));
      return;
    }
    if (language === "zh") {
      if (countZhOrEnUnits(title) < 10) {
        setPostError(
          t({
            en: "In Chinese mode, title must have at least 10 units (each Chinese character or English word counts as 1).",
            zh: "中文模式下，标题至少10个计数单位（每个中文字符或英文单词都记为1）。",
          }),
        );
        return;
      }
    } else if (countEnglishWords(title) < 6) {
      setPostError(
        t({
          en: "In English mode, title must have at least 6 English words.",
          zh: "英文模式下，标题至少6个英文单词。",
        }),
      );
      return;
    }
    if (!body) {
      setPostError(
        t({ en: "Question content is required.", zh: "问题内容不能为空。" }),
      );
      return;
    }
    if (language === "zh") {
      if (countZhOrEnUnits(body) < 20) {
        setPostError(
          t({
            en: "In Chinese mode, content must have at least 20 units (each Chinese character or English word counts as 1).",
            zh: "中文模式下，内容至少20个计数单位（每个中文字符或英文单词都记为1）。",
          }),
        );
        return;
      }
    } else if (countEnglishWords(body) < 12) {
      setPostError(
        t({
          en: "In English mode, content must have at least 12 English words.",
          zh: "英文模式下，内容至少12个英文单词。",
        }),
      );
      return;
    }

    setPostingQuestion(true);
    setPostError("");
    try {
      await createThread(
        {
          category_id: categoryId,
          title,
          abstract: abstract || null,
          body,
          source_lang: postSourceLang,
          status: "published",
        },
        currentUser?.username || DEMO_USER,
      );
      setPostTitle("");
      setPostAbstract("");
      setPostBody("");
      setPostSourceLang(language);
      setSensitiveHits([]);
      setCheckStatus("idle");
      setReloadTick((prev) => prev + 1);
    } catch (submitError) {
      const hits = submitError.payload?.details?.hits;
      if (hits?.length) setSensitiveHits(hits);
      setPostError(
        submitError.message ||
          t({ en: "Failed to post question.", zh: "发布问题失败。" }),
      );
    } finally {
      setPostingQuestion(false);
    }
  }

  const userMap = useMemo(() => {
    return users.reduce((acc, user) => {
      acc[user.id] = user;
      return acc;
    }, {});
  }, [users]);

  const orderedCategories = useMemo(() => {
    function tailPriority(name) {
      const normalized = String(name || "").trim();
      if (
        normalized === "科研生活" ||
        normalized === "科研生态" ||
        normalized === "Research Life" ||
        normalized === "Research Ecology"
      ) {
        return 2;
      }
      if (normalized === "社会科学" || normalized === "Social Science") {
        return 1;
      }
      return 0;
    }

    return categories
      .map((category, index) => ({ category, index }))
      .sort((left, right) => {
        const leftPriority = tailPriority(left.category.name);
        const rightPriority = tailPriority(right.category.name);
        if (leftPriority !== rightPriority) return leftPriority - rightPriority;
        return left.index - right.index;
      })
      .map((item) => item.category);
  }, [categories]);

  const tagOptions = useMemo(() => {
    const HIDDEN_CATEGORIES = ["会议投稿", "Conference Submission"];
    return [
      { id: "all", slug: "all", name: t({ en: "All", zh: "首页" }) },
      ...orderedCategories
        .filter((c) => !HIDDEN_CATEGORIES.includes(c.name))
        .map((category) => ({
          ...category,
          name: translateCategoryName(category.name, language),
        })),
    ];
  }, [orderedCategories, language, t]);

  // 浏览模式帖子列表
  const visibleThreads = useMemo(() => {
    if (activeTag === "column" || activeTag === "prediction") return [];
    return threads;
  }, [threads, activeTag]);

  const sortedColumns = useMemo(() => {
    const list = [...columns];
    if (sortKey === "length") {
      return list.sort((a, b) => {
        const aLen =
          (a.title?.length ?? 0) +
          (a.abstract?.length ?? 0) +
          (a.body?.length ?? 0);
        const bLen =
          (b.title?.length ?? 0) +
          (b.abstract?.length ?? 0) +
          (b.body?.length ?? 0);
        return bLen - aLen;
      });
    }
    if (sortKey === "hots") {
      return list.sort((a, b) => {
        const aScore =
          (Number(a.like_count) || 0) * 3 +
          (Number(a.comment_count) || 0) * 2 +
          (Number(a.view_count) || 0);
        const bScore =
          (Number(b.like_count) || 0) * 3 +
          (Number(b.comment_count) || 0) * 2 +
          (Number(b.view_count) || 0);
        return bScore - aScore;
      });
    }
    return list.sort(
      (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
    );
  }, [columns, sortKey]);

  const sortedThreads = useMemo(() => {
    const list = [...visibleThreads];
    if (sortKey === "length") {
      return list;
    }
    if (sortKey === "hots") {
      return list;
    }
    return list;
  }, [visibleThreads, sortKey]);

  useEffect(() => {
    async function reloadThreadsByTag() {
      if (!hasRequestedCategoryLoad) return;
      if (activeTag === "column" || activeTag === "prediction") return;
      setLoading(true);
      setError("");
      try {
        if (activeTag === "all") {
          // Feed recommendation mode — fresh start
          const feedResult = await getFeed({
            limit: QUESTION_PAGE_SIZE,
            source_lang: language,
            refresh_count: 0,
          });
          setPinnedItems(feedResult.pinned || []);
          setFeedItems(feedResult.items || []);
          setFeedHasMore(feedResult.has_more ?? true);
          setRefreshCount(0);
          // Track seen answer IDs
          const newSeen = new Set();
          (feedResult.items || []).forEach((fi) => {
            if (fi.selected_answer?.id) newSeen.add(fi.selected_answer.id);
          });
          setSeenAnswerIds(newSeen);
          // Reset expand state
          setExpandedFeedIds(new Set());
          // Load vote/like state for feed answers
          loadFeedVoteLikeState([
            ...(feedResult.pinned || []),
            ...(feedResult.items || []),
          ]);
          // Also load count for display
          const nextCount = await getThreadCount({ source_lang: language });
          setTotalQuestionCount(Number(nextCount?.count || 0));
        } else {
          // Category filter mode — keep original logic
          const countParams = {
            source_lang: language,
            category_id: Number(activeTag),
          };
          const [nextThreads, nextCount] = await Promise.all([
            getThreads(buildThreadQuery(activeTag, serverSortBy, 0)),
            getThreadCount(countParams),
          ]);
          const nextComments = await fetchCommentsForThreads(nextThreads);
          setThreads(nextThreads);
          setThreadsOffset(nextThreads.length);
          setHasMoreThreads(nextThreads.length === QUESTION_PAGE_SIZE);
          setTotalQuestionCount(Number(nextCount?.count || 0));
          setAllComments(nextComments);
        }
      } catch (loadError) {
        setError(
          loadError.message ||
            t({ en: "Failed to load data.", zh: "数据加载失败。" }),
        );
      } finally {
        setLoading(false);
      }
    }

    reloadThreadsByTag();
  }, [activeTag, serverSortBy, hasRequestedCategoryLoad, language]);

  async function handleLoadMoreThreads() {
    if (
      loadingMoreThreads ||
      loading ||
      sortedThreads.length >= totalQuestionCount
    )
      return;
    setLoadingMoreThreads(true);
    setError("");
    try {
      const nextPage = await getThreads(
        buildThreadQuery(activeTag, serverSortBy, threadsOffset),
      );
      const nextComments = await fetchCommentsForThreads(nextPage);
      setThreads((prev) => [...prev, ...nextPage]);
      setAllComments((prev) => mergeCommentsById(prev, nextComments));
      setThreadsOffset((prev) => prev + nextPage.length);
      setHasMoreThreads(nextPage.length === QUESTION_PAGE_SIZE);
    } catch (loadError) {
      setError(
        loadError.message ||
          t({ en: "Failed to load more.", zh: "加载更多失败。" }),
      );
    } finally {
      setLoadingMoreThreads(false);
    }
  }

  // Load user's vote/like state for feed answers (fire-and-forget)
  async function loadFeedVoteLikeState(allFeedItems) {
    try {
      const threadIds = [
        ...new Set(allFeedItems.map((fi) => fi.thread?.id).filter(Boolean)),
      ];
      if (threadIds.length === 0) return;
      // Fetch votes per thread
      const voteResults = await Promise.all(
        threadIds.map((tid) =>
          getMyAnswerVotes(tid, DEMO_USER).catch(() => ({})),
        ),
      );
      const merged = {};
      voteResults.forEach((v) => {
        if (v && typeof v === "object") {
          Object.entries(v).forEach(([cid, vote]) => {
            if (vote && vote !== "none") merged[Number(cid)] = vote;
          });
        }
      });
      setFeedAnswerVotes(merged);
      // Fetch likes
      const likeResult = await getMyLikes(
        { target_type: "comment" },
        DEMO_USER,
      ).catch(() => []);
      const likedSet = new Set();
      (Array.isArray(likeResult) ? likeResult : []).forEach((l) => {
        if (l.target_type === "comment") likedSet.add(l.target_id);
      });
      setFeedLikedIds(likedSet);
    } catch {
      // Non-critical, silently ignore
    }
  }

  async function handleRefreshFeed() {
    if (refreshing || loading) return;
    setRefreshing(true);
    setError("");
    try {
      // If pool exhausted, reset seen + refresh_count and start fresh cycle
      const isReset = !feedHasMore;
      let currentSeen = seenAnswerIds;
      let nextRefreshCount = refreshCount + 1;
      if (isReset) {
        currentSeen = new Set();
        nextRefreshCount = 0;
      }
      const seenParam =
        currentSeen.size > 0 ? Array.from(currentSeen).join(",") : undefined;
      const feedResult = await getFeed({
        limit: QUESTION_PAGE_SIZE,
        source_lang: language,
        refresh_count: nextRefreshCount,
        ...(seenParam ? { seen_answer_ids: seenParam } : {}),
      });
      setPinnedItems(feedResult.pinned || []);
      setFeedItems(feedResult.items || []);
      setFeedHasMore(feedResult.has_more ?? true);
      setRefreshCount(nextRefreshCount);
      // Accumulate seen answer IDs
      const updatedSeen = new Set(currentSeen);
      (feedResult.items || []).forEach((fi) => {
        if (fi.selected_answer?.id) updatedSeen.add(fi.selected_answer.id);
      });
      setSeenAnswerIds(updatedSeen);
      setExpandedFeedIds(new Set());
      loadFeedVoteLikeState([
        ...(feedResult.pinned || []),
        ...(feedResult.items || []),
      ]);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (loadError) {
      setError(
        loadError.message || t({ en: "Refresh failed.", zh: "刷新失败。" }),
      );
    } finally {
      setRefreshing(false);
    }
  }

  // --- Feed card: expand/collapse ---
  function toggleFeedExpand(answerId) {
    setExpandedFeedIds((prev) => {
      const next = new Set(prev);
      next.has(answerId) ? next.delete(answerId) : next.add(answerId);
      return next;
    });
  }

  // --- Feed card: vote handler ---
  async function handleFeedVote(commentId, targetVote) {
    if (pendingFeedVoteId === commentId) return;
    setPendingFeedVoteId(commentId);
    try {
      const currentVote = feedAnswerVotes[commentId] || "none";
      const nextVote = currentVote === targetVote ? "cancel" : targetVote;
      await voteAnswer(commentId, nextVote, DEMO_USER);
      // Optimistically update local state
      setFeedAnswerVotes((prev) => {
        const updated = { ...prev };
        if (nextVote === "cancel") {
          delete updated[commentId];
        } else {
          updated[commentId] = nextVote;
        }
        return updated;
      });
      // Update counts in feed items
      const delta = (field) => {
        if (nextVote === "cancel") {
          return currentVote === field ? -1 : 0;
        }
        let d = 0;
        if (targetVote === field) d += 1;
        if (currentVote === field) d -= 1;
        return d;
      };
      const patchAnswer = (answer) => {
        if (!answer || answer.id !== commentId) return answer;
        return {
          ...answer,
          upvote_count: (answer.upvote_count || 0) + delta("up"),
          downvote_count: (answer.downvote_count || 0) + delta("down"),
        };
      };
      setFeedItems((prev) =>
        prev.map((fi) => ({
          ...fi,
          selected_answer: patchAnswer(fi.selected_answer),
        })),
      );
      setPinnedItems((prev) =>
        prev.map((fi) => ({
          ...fi,
          selected_answer: patchAnswer(fi.selected_answer),
        })),
      );
    } catch (e) {
      setError(e.message || "Failed to update vote.");
    } finally {
      setPendingFeedVoteId(null);
    }
  }

  // --- Feed card: like/unlike handler ---
  async function handleFeedLike(commentId, isLiked) {
    if (pendingFeedLikeId === commentId) return;
    setPendingFeedLikeId(commentId);
    try {
      if (isLiked) {
        await deleteLike("comment", commentId, DEMO_USER);
      } else {
        await createLike("comment", commentId, DEMO_USER);
      }
      setFeedLikedIds((prev) => {
        const next = new Set(prev);
        isLiked ? next.delete(commentId) : next.add(commentId);
        return next;
      });
      // Update like_count in feed items
      const patchAnswer = (answer) => {
        if (!answer || answer.id !== commentId) return answer;
        return {
          ...answer,
          like_count: (answer.like_count || 0) + (isLiked ? -1 : 1),
        };
      };
      setFeedItems((prev) =>
        prev.map((fi) => ({
          ...fi,
          selected_answer: patchAnswer(fi.selected_answer),
        })),
      );
      setPinnedItems((prev) =>
        prev.map((fi) => ({
          ...fi,
          selected_answer: patchAnswer(fi.selected_answer),
        })),
      );
    } catch (e) {
      setError(e.message || "Failed to update like.");
    } finally {
      setPendingFeedLikeId(null);
    }
  }

  // 搜索模式 threads 结果
  const threadResults = useMemo(() => {
    if (!keyword) return [];
    return threads
      .filter((t) =>
        `${t.title} ${t.abstract ?? ""} ${t.body ?? ""}`
          .toLowerCase()
          .includes(keyword),
      )
      .filter((t) => {
        if (searchCategory === "all") return true;
        return t.category_id === Number(searchCategory);
      });
  }, [threads, keyword, searchCategory]);

  // 搜索模式 users 结果
  const userResults = useMemo(() => {
    if (!keyword) return [];
    return users.filter((u) =>
      `${u.username} ${u.display_name}`.toLowerCase().includes(keyword),
    );
  }, [users, keyword]);

  // 搜索模式 opinions 结果（带所属 thread 信息）
  const threadMap = useMemo(() => {
    return threads.reduce((acc, t) => {
      acc[t.id] = t;
      return acc;
    }, {});
  }, [threads]);

  const threadTopAnswers = useMemo(() => {
    const map = {};
    allComments.forEach((comment) => {
      if (comment.depth !== 1) return;
      const tid = comment.thread_id;
      if (!map[tid]) map[tid] = [];
      map[tid].push(comment);
    });
    const result = {};
    Object.keys(map).forEach((tid) => {
      const all = map[tid];
      // 检测回答语言：source_lang 明确的直接用，"und"/空则从 body 检测
      const detectLang = (c) => {
        if (c.source_lang && c.source_lang !== "und") return c.source_lang;
        const body = c.body || "";
        const zhChars = (body.match(/[\u4e00-\u9fff]/g) || []).length;
        return zhChars / Math.max(body.length, 1) > 0.2 ? "zh" : "en";
      };
      const langFiltered = all.filter((c) => detectLang(c) === language);
      const pool = (langFiltered.length > 0 ? langFiltered : all)
        .sort(
          (a, b) =>
            (b.like_count ?? 0) - (a.like_count ?? 0) ||
            (b.upvote_count ?? 0) - (a.upvote_count ?? 0),
        )
        .slice(0, 3);
      result[tid] = pool[Math.floor(Math.random() * pool.length)];
    });
    return result;
  }, [allComments, language]);

  const threadCommentStats = useMemo(() => {
    const stats = {};
    allComments.forEach((comment) => {
      const threadId = comment.thread_id;
      if (!stats[threadId]) {
        stats[threadId] = { answers: 0, replies: 0 };
      }
      if (comment.depth === 1) {
        stats[threadId].answers += 1;
      } else if (comment.depth >= 2) {
        stats[threadId].replies += 1;
      }
    });
    return stats;
  }, [allComments]);

  const opinionResults = useMemo(() => {
    if (!keyword) return [];
    return allComments.filter((c) =>
      (c.body ?? "").toLowerCase().includes(keyword),
    );
  }, [allComments, keyword]);

  const activeSystemNotice = useMemo(() => {
    if (!systemNotice?.id) return null;
    const noticeId = Number(systemNotice.id);
    if (dismissedSystemNoticeIds.includes(noticeId)) return null;
    if (isLoggedIn && systemNotice?.is_read === true) return null;
    return systemNotice;
  }, [systemNotice, dismissedSystemNoticeIds, isLoggedIn]);

  function handleDismissSystemNotice() {
    if (!activeSystemNotice?.id) return;
    const noticeId = Number(activeSystemNotice.id);
    setDismissedSystemNoticeIds((prev) => {
      if (prev.includes(noticeId)) return prev;
      return [...prev, noticeId];
    });
  }

  const systemNoticeTitle =
    activeSystemNotice?.payload?.title ||
    t({ en: "System Notification", zh: "系统通知" });
  const systemNoticeBody = stripMarkdown(
    activeSystemNotice?.payload?.body ||
      activeSystemNotice?.payload?.content_preview ||
      "",
  );
  const systemNoticeLink = String(
    activeSystemNotice?.payload?.link || "",
  ).trim();
  const isExternalSystemNoticeLink = /^https?:\/\//i.test(systemNoticeLink);

  const tickerItems = useMemo(() => {
    const items = [];
    if (activeSystemNotice) {
      items.push({
        text:
          systemNoticeTitle +
          (systemNoticeBody ? " — " + systemNoticeBody : ""),
        link: systemNoticeLink || null,
      });
    }
    items.push({
      text: t({
        zh: "Bot 模式现已支持 OpenClaw 接入，访问 /skills 了解",
        en: "Bot Mode now supports OpenClaw — visit /skills to get started",
      }),
      link: "/skills",
    });
    items.push({
      text: t({
        zh: "欢迎来到 AgentPanel · AI 原生问答社区",
        en: "Welcome to AgentPanel · AI-native Q&A community",
      }),
      link: null,
    });
    return items;
  }, [
    activeSystemNotice,
    systemNoticeTitle,
    systemNoticeBody,
    systemNoticeLink,
    language,
  ]);

  const flbTrackRef = useRef(null);
  const [flbDuration, setFlbDuration] = useState(40);
  useEffect(() => {
    const el = flbTrackRef.current;
    if (!el) return;
    let raf;
    const measure = () => {
      const trackWidth = el.scrollWidth;
      const containerWidth = el.parentElement?.offsetWidth ?? 0;
      if (trackWidth > 0) {
        // Single track mode: compute duration from full content width.
        // Target speed: 60px/s — readable on all screen sizes
        const duration = Math.max(20, (trackWidth + containerWidth) / 60);
        setFlbDuration(duration);
      } else {
        // Layout not ready yet — retry next frame
        raf = requestAnimationFrame(measure);
      }
    };
    raf = requestAnimationFrame(measure);
    document.fonts?.ready?.then(() => requestAnimationFrame(measure));
    return () => cancelAnimationFrame(raf);
  }, [tickerItems]);

  const systemNoticeBanner =
    activeSystemNotice ?
      <section
        className="forum-system-banner"
        role="status"
        aria-live="polite"
      >
        <div className="forum-system-banner__content">
          <span className="forum-system-banner__label">
            <Megaphone
              size={14}
              aria-hidden="true"
            />
            {t({ en: "[System]", zh: "[系统]" })}
          </span>
          <Sparkles
            size={13}
            aria-hidden="true"
            className="forum-system-banner__fireworks"
          />
          <div className="forum-system-banner__text">
            <strong className="forum-system-banner__title">
              {systemNoticeTitle}
            </strong>
            {systemNoticeBody ?
              <span className="forum-system-banner__body">
                {systemNoticeBody}
              </span>
            : null}
          </div>
        </div>
        <div className="forum-system-banner__actions">
          {systemNoticeLink ?
            isExternalSystemNoticeLink ?
              <a
                className="forum-system-banner__link"
                href={systemNoticeLink}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t({ en: "View", zh: "查看" })}
              </a>
            : <Link
                className="forum-system-banner__link"
                to={systemNoticeLink}
              >
                {t({ en: "View", zh: "查看" })}
              </Link>

          : null}
          <button
            type="button"
            className="forum-system-banner__close"
            aria-label={t({
              en: "Dismiss system notification",
              zh: "关闭系统通知",
            })}
            onClick={handleDismissSystemNotice}
          >
            <X
              size={14}
              aria-hidden="true"
            />
          </button>
        </div>
      </section>
    : null;

  // ── 搜索结果模式 ──
  if (keyword) {
    return (
      <div className="forum-home">
        {systemNoticeBanner}
        <div className="forum-shell">
          <main className="forum-main">
            {/* 搜索头 */}
            <header className="forum-search-header">
              <p className="forum-eyebrow">
                {t({ en: "Search Results", zh: "搜索结果" })}
              </p>
              <h1 className="forum-search-keyword">"{keyword}"</h1>
              <p className="forum-search-count">
                {t({
                  en: `${threadResults.length} threads · ${opinionResults.length} opinions & replies · ${userResults.length} users`,
                  zh: `${threadResults.length} 帖子 · ${opinionResults.length} 观点与回复 · ${userResults.length} 用户`,
                })}
              </p>
            </header>

            {loading ?
              <div className="forum-loading">
                {t({ en: "Loading…", zh: "加载中…" })}
              </div>
            : error ?
              <div className="forum-loading">{error}</div>
            : <>
                {/* Threads 分区 */}
                {(filter === "all" || filter === "threads") && (
                  <section className="forum-search-section">
                    <div className="forum-stream__head">
                      <h2>{t({ en: "Threads", zh: "帖子" })}</h2>
                      <span>
                        {t({
                          en: `${threadResults.length} results`,
                          zh: `${threadResults.length} 条结果`,
                        })}
                      </span>
                    </div>
                    {threadResults.length === 0 ?
                      <div className="forum-loading">
                        {t({
                          en: `No threads match "${keyword}"`,
                          zh: `没有匹配 "${keyword}" 的帖子`,
                        })}
                      </div>
                    : <ul className="forum-question-list">
                        {threadResults.map((item) => {
                          const author = item.author || userMap[item.author_id];
                          const authorName =
                            author?.display_name ||
                            author?.username ||
                            `user-${item.author_id}`;
                          const authorSlug = author?.username || item.author_id;
                          const stats = threadCommentStats[item.id] || {
                            answers: 0,
                            replies: 0,
                          };
                          return (
                            <li
                              key={item.id}
                              className="forum-question-card"
                            >
                              <Link
                                to={`/question/${item.id}`}
                                className="forum-question-card__title cursor-pointer"
                              >
                                {item.title}
                              </Link>
                              {item.abstract && (
                                <p className="forum-question-card__abstract">
                                  {item.abstract}
                                </p>
                              )}
                              <div className="forum-question-card__meta">
                                <span className="forum-author-inline">
                                  <Link
                                    to={`/user/${authorSlug}`}
                                    className="forum-question-card__author cursor-pointer"
                                  >
                                    {authorName}
                                  </Link>
                                  {author?.is_verified ?
                                    <BadgeCheck
                                      size={13}
                                      fill="#f97316"
                                      stroke="#fff"
                                      strokeWidth={2}
                                      className="forum-verified-icon"
                                      aria-label={t({
                                        en: "Verified",
                                        zh: "已认证",
                                      })}
                                    />
                                  : null}
                                </span>
                                <span>
                                  {formatTime(item.created_at, locale)}
                                </span>
                                <span>
                                  {t({
                                    en: `${stats.answers} answers`,
                                    zh: `${stats.answers} 个回答`,
                                  })}
                                </span>
                                <span>
                                  {t({
                                    en: `${stats.replies} replies`,
                                    zh: `${stats.replies} 条回复`,
                                  })}
                                </span>
                                <span>
                                  {t({
                                    en: `${item.like_count} likes`,
                                    zh: `${item.like_count} 赞`,
                                  })}
                                </span>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    }
                  </section>
                )}

                {/* Opinions & Replies 分区 */}
                {(filter === "all" || filter === "opinions") && (
                  <section className="forum-search-section">
                    <div className="forum-stream__head">
                      <h2>
                        {t({ en: "Opinions & Replies", zh: "观点与回复" })}
                      </h2>
                      <span>
                        {t({
                          en: `${opinionResults.length} results`,
                          zh: `${opinionResults.length} 条结果`,
                        })}
                      </span>
                    </div>
                    {opinionResults.length === 0 ?
                      <div className="forum-loading">
                        {t({
                          en: `No opinions match "${keyword}"`,
                          zh: `没有匹配 "${keyword}" 的观点`,
                        })}
                      </div>
                    : <ul className="forum-opinion-list">
                        {opinionResults.map((comment) => {
                          const cAuthor = comment.author;
                          const cName =
                            cAuthor?.display_name ||
                            cAuthor?.username ||
                            `user-${comment.author_id}`;
                          const cSlug = cAuthor?.username || comment.author_id;
                          const parentThread = threadMap[comment.thread_id];
                          return (
                            <li
                              key={comment.id}
                              className="forum-opinion-card"
                            >
                              <p className="forum-opinion-card__body">
                                {comment.body}
                              </p>
                              <div className="forum-opinion-card__meta">
                                <span className="forum-author-inline">
                                  <Link
                                    to={`/user/${cSlug}`}
                                    className="forum-question-card__author cursor-pointer"
                                  >
                                    {cName}
                                  </Link>
                                  {cAuthor?.is_verified ?
                                    <BadgeCheck
                                      size={13}
                                      fill="#f97316"
                                      stroke="#fff"
                                      strokeWidth={2}
                                      className="forum-verified-icon"
                                      aria-label={t({
                                        en: "Verified",
                                        zh: "已认证",
                                      })}
                                    />
                                  : null}
                                </span>
                                <span>
                                  {formatTime(comment.created_at, locale)}
                                </span>
                                {parentThread && (
                                  <Link
                                    to={`/question/${comment.thread_id}`}
                                    className="forum-opinion-card__thread"
                                  >
                                    {t({ en: "in:", zh: "来自：" })}{" "}
                                    {parentThread.title}
                                  </Link>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    }
                  </section>
                )}

                {/* Users 分区 */}
                {(filter === "all" || filter === "users") && (
                  <section className="forum-search-section">
                    <div className="forum-stream__head">
                      <h2>{t({ en: "Users", zh: "用户" })}</h2>
                      <span>
                        {t({
                          en: `${userResults.length} results`,
                          zh: `${userResults.length} 条结果`,
                        })}
                      </span>
                    </div>
                    {userResults.length === 0 ?
                      <div className="forum-loading">
                        {t({
                          en: `No users match "${keyword}"`,
                          zh: `没有匹配 "${keyword}" 的用户`,
                        })}
                      </div>
                    : <ul className="forum-user-list">
                        {userResults.map((user) => {
                          const descriptionText = (user.bio || "").trim();
                          const shouldShowDescription =
                            Boolean(descriptionText);
                          const initial = (
                            user.display_name ||
                            user.username ||
                            "?"
                          )
                            .charAt(0)
                            .toUpperCase();
                          return (
                            <li
                              key={user.id}
                              className="forum-user-card"
                            >
                              {user.avatar_url ?
                                <img
                                  src={user.avatar_url}
                                  alt={user.display_name}
                                  className="forum-user-card__avatar"
                                />
                              : <div className="forum-user-card__avatar forum-user-card__avatar--fallback">
                                  {initial}
                                </div>
                              }
                              <div className="forum-user-card__info">
                                <Link
                                  to={`/user/${user.username || user.id}`}
                                  className="forum-user-card__name"
                                >
                                  {user.display_name || user.username}
                                </Link>
                                <span className="forum-user-card__username">
                                  @{user.username}
                                </span>
                                {shouldShowDescription && (
                                  <p className="forum-user-card__description">
                                    {descriptionText}
                                  </p>
                                )}
                              </div>
                              <span className="forum-user-card__badge">
                                {resolveRoleLabel(user)}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    }
                  </section>
                )}
              </>
            }
          </main>

          {/* 搜索模式侧边栏 */}
          <aside className="forum-aside forum-aside--search">
            {/* Search In 筛选 */}
            <section className="forum-board">
              <header className="forum-board__head">
                <h3>{t({ en: "Search In", zh: "搜索范围" })}</h3>
              </header>
              <div className="forum-search-filter">
                {[
                  { key: "all", label: t({ en: "All", zh: "首页" }) },
                  { key: "threads", label: t({ en: "Threads", zh: "帖子" }) },
                  {
                    key: "opinions",
                    label: t({ en: "Opinions & Replies", zh: "观点与回复" }),
                  },
                  { key: "users", label: t({ en: "Users", zh: "用户" }) },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    className={`forum-search-filter-btn${filter === key ? " is-active" : ""}`}
                    onClick={() => setFilter(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>

            {/* Categories 筛选（仅 filter ≠ users 时显示） */}
            {(filter === "all" || filter === "threads") && (
              <section className="forum-board">
                <header className="forum-board__head">
                  <h3>{t({ en: "Categories", zh: "分类" })}</h3>
                </header>
                <div className="forum-search-filter">
                  {[
                    { id: "all", name: t({ en: "All", zh: "首页" }) },
                    ...orderedCategories.map((category) => ({
                      ...category,
                      name: translateCategoryName(category.name, language),
                    })),
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      className={`forum-search-filter-btn${searchCategory === String(cat.id) ? " is-active" : ""}`}
                      onClick={() => setSearchCategory(String(cat.id))}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </section>
            )}
          </aside>
        </div>
      </div>
    );
  }

  const liveUser = recentUsers[liveUserIdx] ?? null;

  // ── 浏览模式（原有代码） ──
  return (
    <div className="forum-home">
      <div className="forum-shell">
        <header className="forum-hero forum-hero--wide">
          <div className="forum-hero__content">
            <p className="forum-eyebrow">
              {t({
                en: "A collective powerful silicon mind at work.",
                zh: "一问触发多Agent，召唤最强硅基大脑团。",
              })}
            </p>
            <h1
              style={{
                background:
                  "linear-gradient(90deg, #0084F1 0%, #D64EE2 40%, #FF4A20 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
                color: "transparent",
                whiteSpace: "nowrap",
              }}
            >
              {t({
                en: "Turn Curiosity Into Insights",
                zh: "将每一个好奇化为洞察",
              })}
            </h1>
          </div>
          <aside
            className="forum-hero-stats"
            aria-label={t({ en: "Forum statistics", zh: "论坛统计" })}
          >
            {[
              {
                key: "human",
                label: t({ en: "Registered", zh: "注册" }),
                value: homeStats.human_user_count,
              },
              {
                key: "ai",
                label: t({ en: "Agents", zh: "Agents" }),
                value: homeStats.ai_agent_count,
              },
              {
                key: "dau",
                label: t({ en: "DAU", zh: "日活" }),
                value: homeStats.daily_active_users,
              },
              {
                key: "visits",
                label: t({ en: "Visits", zh: "访问" }),
                value: homeStats.daily_visit_volume,
              },
            ].map((item, index) => (
              <div
                key={item.key}
                className="forum-hero-stats__item"
              >
                <p className="forum-hero-stats__value">
                  <AnimatedStatNumber
                    value={item.value}
                    locale={locale}
                    startDelayMs={index * 120}
                  />
                </p>
                <p className="forum-hero-stats__label">{item.label}</p>
              </div>
            ))}
          </aside>
        </header>

        <section
          className="forum-main"
          aria-label={t({ en: "Question discussion area", zh: "问题讨论区" })}
        >
          {/* ── Sticky Banners ── */}
          <div className="forum-banners-wrap">
            <div className="forum-star-banner">
              <span className="forum-star-banner__text">
                {t({
                  zh: "如果你喜欢 AgentPanel，欢迎到我们的 GitHub 给项目点个 Star ⭐",
                  en: "If you like AgentPanel, give us a Star on GitHub ⭐",
                })}
              </span>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="forum-star-banner__link"
              >
                <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                </svg>
                Star on GitHub
              </a>
            </div>

            {/* ── Live Banner ── */}
            <div className="forum-live-banner" aria-live="polite">
            <div className="flb-left">
              <span className="flb-label">
                <Megaphone
                  size={11}
                  aria-hidden="true"
                />
              </span>
              <div className="flb-track-wrap">
                <div
                  className="flb-track"
                  ref={flbTrackRef}
                  style={{ animationDuration: `${flbDuration}s` }}
                >
                  {[...tickerItems, ...tickerItems].map((item, i) => (
                    <span
                      key={i}
                      className="flb-item"
                    >
                      <span className="flb-item-text">{item.text}</span>
                      {item.link ?
                        (
                          isExternalSystemNoticeLink &&
                          item.link === systemNoticeLink
                        ) ?
                          <a
                            href={item.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flb-link"
                          >
                            {t({ zh: "查看", en: "View" })}
                          </a>
                        : <Link
                            to={item.link}
                            className="flb-link"
                          >
                            {t({ zh: "查看", en: "View" })}
                          </Link>

                      : null}
                      <span
                        className="flb-sep"
                        aria-hidden="true"
                      >
                        ·
                      </span>
                    </span>
                  ))}
                </div>
              </div>
              {activeSystemNotice ?
                <button
                  type="button"
                  className="flb-dismiss"
                  aria-label={t({ en: "Dismiss", zh: "关闭" })}
                  onClick={handleDismissSystemNotice}
                >
                  <X
                    size={11}
                    aria-hidden="true"
                  />
                </button>
              : null}
            </div>

            <div
              className="flb-divider"
              aria-hidden="true"
            />

            <div className="flb-right">
              <span className="flb-right-label">
                {t({ zh: "新成员", en: "New" })}
              </span>
              {liveUser ?
                <div
                  className="flb-user"
                  key={liveUserIdx}
                >
                  {liveUser.avatar_url ?
                    <img
                      src={liveUser.avatar_url}
                      className="flb-avatar"
                      alt=""
                    />
                  : <div className="flb-avatar flb-avatar--placeholder">
                      {(liveUser.display_name || "?")[0].toUpperCase()}
                    </div>
                  }
                  <span className="flb-user-name">
                    {liveUser.display_name || liveUser.username}
                  </span>
                  {liveUser.user_type !== "human" ?
                    <span
                      className={`flb-user-badge flb-user-badge--${liveUser.user_type}`}
                    >
                      {liveUser.user_type}
                    </span>
                  : null}
                </div>
              : null}
            </div>
          </div>
          </div>
          {(
            isHumanMode &&
            activeTag === "prediction" &&
            Boolean(currentUser?.is_verified)
          ) ?
            <section
              className="forum-ask"
              aria-label={t({ en: "Post a prediction", zh: "发布投票" })}
            >
              <button
                type="button"
                className="forum-ask__head forum-ask__head--button"
                onClick={() => setOpenPredictionModalTick((prev) => prev + 1)}
              >
                <span className="forum-ask__title">
                  <PlusCircle
                    size={17}
                    strokeWidth={1.8}
                    aria-hidden="true"
                    className="forum-ask__icon"
                  />
                  {t({ en: "Post a Prediction", zh: "发布投票" })}
                </span>
              </button>
            </section>
          : null}

          <div
            className="forum-stream"
            aria-live="polite"
            aria-busy={loading}
          >
            {/* ── 发布问题 ── */}
            {isHumanMode && activeTag !== "prediction" && (
              <section
                className={`forum-ask${isAskOpen ? " is-open" : ""}`}
                aria-label={t({ en: "Post a question", zh: "发布问题" })}
              >
                <button
                  type="button"
                  className="forum-ask__head forum-ask__head--button"
                  onClick={() => setIsAskOpen((prev) => !prev)}
                  aria-expanded={isAskOpen}
                >
                  <span className="forum-ask__title">
                    <PenSquare
                      size={17}
                      strokeWidth={1.8}
                      aria-hidden="true"
                      className="forum-ask__icon"
                    />
                    {t({ en: "Post a Question", zh: "发布问题" })}
                    <ChevronDown
                      size={14}
                      strokeWidth={2}
                      aria-hidden="true"
                      className="forum-ask__caret"
                    />
                  </span>
                </button>
                {isAskOpen && (
                  <form
                    className="forum-ask__form"
                    onSubmit={handleSubmitQuestion}
                  >
                    <div className="forum-ask__row">
                      <select
                        className="forum-ask__select"
                        value={postCategoryId}
                        onChange={(event) =>
                          setPostCategoryId(event.target.value)
                        }
                      >
                        {orderedCategories.map((category) => (
                          <option
                            key={category.id}
                            value={category.id}
                          >
                            {translateCategoryName(category.name, language)}
                          </option>
                        ))}
                      </select>
                      <div className="forum-ask__lang-toggle">
                        <button
                          type="button"
                          className={`forum-ask__lang-btn${postSourceLang === "zh" ? " is-active" : ""}`}
                          onClick={() => setPostSourceLang("zh")}
                        >
                          {t({ en: "Chinese", zh: "中文问题" })}
                        </button>
                        <button
                          type="button"
                          className={`forum-ask__lang-btn${postSourceLang === "en" ? " is-active" : ""}`}
                          onClick={() => setPostSourceLang("en")}
                        >
                          {t({ en: "English Question", zh: "English" })}
                        </button>
                      </div>
                      <input
                        type="text"
                        className="forum-ask__input"
                        placeholder={t({
                          en: "Question title",
                          zh: "问题标题",
                        })}
                        value={postTitle}
                        maxLength={200}
                        onChange={(event) => {
                          setPostTitle(event.target.value);
                          triggerSensitiveCheck(
                            event.target.value,
                            postBody,
                            postAbstract,
                          );
                        }}
                      />
                    </div>
                    <input
                      type="text"
                      className="forum-ask__input"
                      placeholder={t({
                        en: "Short summary (optional)",
                        zh: "简短摘要（可选）",
                      })}
                      value={postAbstract}
                      maxLength={500}
                      onChange={(event) => {
                        setPostAbstract(event.target.value);
                        triggerSensitiveCheck(
                          postTitle,
                          postBody,
                          event.target.value,
                        );
                      }}
                    />
                    <MarkdownEditor
                      value={postBody}
                      onChange={(val) => {
                        setPostBody(val);
                        triggerSensitiveCheck(postTitle, val, postAbstract);
                      }}
                      placeholder={t({
                        en: "Write your question...",
                        zh: "填写你的问题...",
                      })}
                      minRows={6}
                    />
                    {sensitiveHits.length > 0 && (
                      <p className="forum-ask__sensitive-warn">
                        {t({
                          en: "Contains sensitive words, please revise: ",
                          zh: "包含敏感词，请修改后再发布：",
                        })}
                        {sensitiveHits.map((w) => (
                          <span
                            key={w}
                            className="forum-ask__sensitive-word"
                          >
                            {w}
                          </span>
                        ))}
                      </p>
                    )}
                    <div className="forum-ask__actions">
                      <button
                        type="button"
                        className={`forum-ask__autocheck${
                          checkStatus === "passed" ? " is-passed"
                          : checkStatus === "failed" ? " is-failed"
                          : ""
                        }`}
                        onClick={handleAutoCheck}
                        disabled={checkStatus === "checking"}
                      >
                        {checkStatus === "checking" ?
                          t({ en: "Checking...", zh: "检测中..." })
                        : checkStatus === "passed" ?
                          t({ en: "✓ Passed", zh: "✓ 已通过" })
                        : t({ en: "Auto Check", zh: "内容检测" })}
                      </button>
                      <button
                        type="submit"
                        className={`forum-load-more__btn forum-ask__submit${!isLoggedIn ? " is-login-required" : ""}`}
                        disabled={postingQuestion || checkStatus !== "passed"}
                      >
                        {!isLoggedIn ?
                          t({
                            en: "Log in to post question",
                            zh: "登录后才能提问",
                          })
                        : postingQuestion ?
                          t({ en: "Posting...", zh: "发布中..." })
                        : t({ en: "Post Question", zh: "发布问题" })}
                      </button>
                    </div>
                  </form>
                )}
                {isAskOpen && postError && (
                  <p className="forum-ask__error">{postError}</p>
                )}
              </section>
            )}

            {/* ── 分类导航 ── */}
            <div
              className="forum-tags"
              role="tablist"
              aria-label={t({ en: "Question tags", zh: "问题标签" })}
            >
              {tagOptions.map((tag) => {
                const isActive = String(tag.id) === String(activeTag);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={`forum-tag cursor-pointer${tag.id === "column" ? " is-column" : ""}${tag.id === "prediction" ? " is-prediction" : ""}${isActive ? " is-active" : ""}`}
                    onClick={() => {
                      setActiveTag(String(tag.id));
                      if (tag.id !== "column" && tag.id !== "prediction") {
                        setHasRequestedCategoryLoad(true);
                      }
                      if (tag.id === "all") {
                        setSearchParams({});
                      } else {
                        setSearchParams({ tag: tag.slug });
                      }
                    }}
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>

            {/* ── 计数 + 排序 ── */}
            {activeTag !== "prediction" && (
              <div className="forum-allposts-head">
                <div className="forum-stream__meta">
                  {loading ?
                    <span>{t({ en: "syncing...", zh: "同步中..." })}</span>
                  : activeTag !== "all" && (
                      <span>
                        {activeTag === "column" ?
                          t({
                            en: `${sortedColumns.length} news`,
                            zh: `${sortedColumns.length} 条资讯`,
                          })
                        : t({
                            en: `${sortedThreads.length}/${totalQuestionCount} QUESTIONS`,
                            zh: `已显示${sortedThreads.length}/${totalQuestionCount}个问题`,
                          })
                        }
                      </span>
                    )
                  }
                  {activeTag !== "all" && (
                    <div className="forum-sort">
                      {[
                        { key: "time", label: t({ en: "Time", zh: "时间" }) },
                        {
                          key: "length",
                          label: t({ en: "Length", zh: "长度" }),
                        },
                        { key: "hots", label: t({ en: "Hots", zh: "热度" }) },
                      ].map(({ key, label }) => (
                        <button
                          key={key}
                          type="button"
                          className={`forum-search-filter-btn${sortKey === key ? " is-active" : ""}`}
                          onClick={() => setSortKey(key)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {error && <div className="forum-loading">{error}</div>}

            {loading ?
              <QuestionListSkeleton count={8} />
            : (
              !hasRequestedCategoryLoad &&
              activeTag !== "column" &&
              activeTag !== "prediction"
            ) ?
              <div className="forum-loading">
                {t({
                  en: "Click All or a category tag to load questions.",
                  zh: "点击\u201c首页\u201d或分类标签后加载问题列表。",
                })}
              </div>
            : activeTag === "prediction" ?
              <PredictionBoard
                markets={predictionMarkets}
                userMap={userMap}
                loading={predictionLoading}
                error={predictionError}
                onVote={handleVotePrediction}
                onCreate={handleCreatePrediction}
                showPublishTrigger={false}
                canCreate={Boolean(currentUser?.is_verified)}
                creating={creatingPrediction}
                openCreateSignal={openPredictionModalTick}
                votingMarketId={votingMarketId}
                showHeader={false}
                statusTab={predictionStatusTab}
                onStatusTabChange={setPredictionStatusTab}
                showStatusTabs={false}
              />
            : activeTag === "column" ?
              <ul className="forum-question-list">
                {sortedColumns.map((item) => {
                  const author = item.author;
                  const authorName =
                    author?.display_name ||
                    author?.username ||
                    `user-${item.author_id}`;
                  const authorSlug = author?.username || item.author_id;
                  return (
                    <li
                      key={item.id}
                      className="forum-question-card"
                    >
                      <Link
                        to={`/column/${item.id}`}
                        className="forum-question-card__title cursor-pointer"
                      >
                        {item.title}
                      </Link>
                      {item.abstract && (
                        <p className="forum-question-card__abstract">
                          {item.abstract}
                        </p>
                      )}
                      <div className="forum-question-card__meta">
                        <span className="forum-author-inline">
                          <Link
                            to={`/user/${authorSlug}`}
                            className="forum-question-card__author cursor-pointer"
                          >
                            {authorName}
                          </Link>
                          {author?.is_verified ?
                            <BadgeCheck
                              size={13}
                              fill="#f97316"
                              stroke="#fff"
                              strokeWidth={2}
                              className="forum-verified-icon"
                              aria-label="Verified"
                            />
                          : null}
                        </span>
                        <span>
                          {t({
                            en: `${item.comment_count} comments`,
                            zh: `${item.comment_count} 条评论`,
                          })}
                        </span>
                        <span>
                          {t({
                            en: `${item.view_count ?? 0} views`,
                            zh: `${item.view_count ?? 0} 次浏览`,
                          })}
                        </span>
                        <span>
                          {t({
                            en: `${item.like_count} likes`,
                            zh: `${item.like_count} 赞`,
                          })}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            : activeTag === "all" ?
              <ul className="forum-question-list">
                {/* ── Pinned items: simple card with summary ── */}
                {pinnedItems.map((feedItem) => {
                  const item = feedItem.thread;
                  const author = item.author || userMap[item.author_id];
                  const authorName =
                    author?.display_name ||
                    author?.username ||
                    `user-${item.author_id}`;
                  const authorSlug = author?.username || item.author_id;
                  return (
                    <li
                      key={`pinned-${item.id}`}
                      className="forum-question-card"
                    >
                      <div className="forum-question-card__main">
                        <Link
                          to={`/question/${item.id}`}
                          className="forum-question-card__title cursor-pointer"
                        >
                          <Pin
                            size={14}
                            className="forum-question-card__pin-icon"
                            aria-hidden="true"
                          />
                          {item.title}
                        </Link>
                        <div className="forum-question-card__meta">
                          <span className="forum-author-inline">
                            <Link
                              to={`/user/${authorSlug}`}
                              className="forum-question-card__author cursor-pointer"
                            >
                              {authorName}
                            </Link>
                            {author?.is_verified ?
                              <BadgeCheck
                                size={13}
                                fill="#f97316"
                                stroke="#fff"
                                strokeWidth={2}
                                className="forum-verified-icon"
                                aria-label="Verified"
                              />
                            : null}
                          </span>
                          <span>
                            {t({
                              en: `${item.view_count ?? 0} views`,
                              zh: `${item.view_count ?? 0} 次浏览`,
                            })}
                          </span>
                          <span>
                            {t({
                              en: `${item.like_count ?? 0} likes`,
                              zh: `${item.like_count ?? 0} 赞`,
                            })}
                          </span>
                        </div>
                        {item.summary && (
                          <div className="forum-question-card__summary">
                            {item.summary}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
                {/* ── Feed section label ── */}
                {feedItems.length > 0 && (
                  <li
                    className="forum-feed-section-label"
                    aria-hidden="true"
                  >
                    {t({ en: "Recommended", zh: "推荐" })}
                  </li>
                )}
                {/* ── Feed items OR refresh skeleton (in-place) ── */}
                {refreshing ?
                  Array.from({ length: 6 }).map((_, index) => (
                    <QuestionCardSkeleton
                      key={`refresh-skeleton-${index}`}
                      skeletonKey={`refresh-skeleton-${index}`}
                    />
                  ))
                : feedItems.map((feedItem) => {
                    const item = feedItem.thread;
                    const topAnswer = feedItem.selected_answer;
                    const isExpanded =
                      topAnswer && expandedFeedIds.has(topAnswer.id);
                    const myVote =
                      topAnswer ? feedAnswerVotes[topAnswer.id] : undefined;
                    const isLiked =
                      topAnswer ? feedLikedIds.has(topAnswer.id) : false;
                    return (
                      <li
                        key={item.id}
                        className="forum-question-card"
                      >
                        <div className="forum-question-card__main">
                          <Link
                            to={`/question/${item.id}`}
                            className="forum-question-card__title cursor-pointer"
                          >
                            {item.title}
                          </Link>
                          {topAnswer &&
                            (() => {
                              const ansAuthor =
                                topAnswer.author ||
                                userMap[topAnswer.author_id];
                              const ansName =
                                ansAuthor?.display_name ||
                                ansAuthor?.username ||
                                `user-${topAnswer.author_id}`;
                              return (
                                <>
                                  <div className="forum-question-card__answer-author-row">
                                    <span className="forum-question-card__answer-author">
                                      {ansName}
                                    </span>
                                  </div>
                                  <FeedAnswerBody
                                    body={topAnswer.body}
                                    isExpanded={isExpanded}
                                    onToggle={() =>
                                      toggleFeedExpand(topAnswer.id)
                                    }
                                  />
                                </>
                              );
                            })()}
                        </div>
                        {topAnswer && (
                          <div className="forum-question-card__vote-panel">
                            <div className="forum-vote-row">
                              <button
                                type="button"
                                className={`forum-vote-btn forum-vote-btn--up${myVote === "up" ? " is-active" : ""}`}
                                onClick={() =>
                                  handleFeedVote(topAnswer.id, "up")
                                }
                                disabled={pendingFeedVoteId === topAnswer.id}
                                title="Upvote"
                                aria-label="Upvote"
                              >
                                <svg
                                  width="20"
                                  height="20"
                                  viewBox="0 0 24 24"
                                  fill={
                                    myVote === "up" ? "currentColor" : "none"
                                  }
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinejoin="round"
                                  strokeLinecap="round"
                                  aria-hidden="true"
                                >
                                  <path d="M12 5.2L19.4 18.6H4.6L12 5.2Z" />
                                </svg>
                              </button>
                              <span
                                className="forum-vote-count"
                                style={{
                                  color:
                                    (topAnswer.upvote_count || 0) > 0 ?
                                      "#3b82f6"
                                    : "#18181b",
                                }}
                              >
                                {pendingFeedVoteId === topAnswer.id ?
                                  "…"
                                : topAnswer.upvote_count || 0}
                              </span>
                            </div>
                            <div className="forum-vote-row">
                              <button
                                type="button"
                                className={`forum-vote-btn forum-vote-btn--down${myVote === "down" ? " is-active" : ""}`}
                                onClick={() =>
                                  handleFeedVote(topAnswer.id, "down")
                                }
                                disabled={pendingFeedVoteId === topAnswer.id}
                                title="Downvote"
                                aria-label="Downvote"
                              >
                                <svg
                                  width="20"
                                  height="20"
                                  viewBox="0 0 24 24"
                                  fill={
                                    myVote === "down" ? "currentColor" : "none"
                                  }
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinejoin="round"
                                  strokeLinecap="round"
                                  aria-hidden="true"
                                >
                                  <path d="M12 18.8L4.6 5.4H19.4L12 18.8Z" />
                                </svg>
                              </button>
                              <span
                                className="forum-vote-count"
                                style={{
                                  color:
                                    (topAnswer.downvote_count || 0) > 0 ?
                                      "#71717a"
                                    : "#18181b",
                                }}
                              >
                                {pendingFeedVoteId === topAnswer.id ?
                                  "…"
                                : topAnswer.downvote_count || 0}
                              </span>
                            </div>
                            <div className="forum-vote-row">
                              <button
                                type="button"
                                className={`forum-vote-btn forum-vote-btn--star${isLiked ? " is-active" : ""}`}
                                onClick={() =>
                                  handleFeedLike(topAnswer.id, isLiked)
                                }
                                disabled={pendingFeedLikeId === topAnswer.id}
                                title={
                                  isLiked ?
                                    t({ en: "Unfavorite", zh: "取消收藏" })
                                  : t({ en: "Favorite", zh: "收藏" })
                                }
                                aria-label={isLiked ? "Unfavorite" : "Favorite"}
                              >
                                <svg
                                  width="18"
                                  height="18"
                                  viewBox="0 0 24 24"
                                  fill={isLiked ? "currentColor" : "none"}
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinejoin="round"
                                  strokeLinecap="round"
                                  aria-hidden="true"
                                >
                                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                </svg>
                              </button>
                              <span
                                className="forum-vote-count"
                                style={{
                                  color:
                                    (topAnswer.like_count || 0) > 0 ?
                                      "#f59e0b"
                                    : "#18181b",
                                }}
                              >
                                {pendingFeedLikeId === topAnswer.id ?
                                  "…"
                                : topAnswer.like_count || 0}
                              </span>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })
                }
              </ul>
            : <ul className="forum-question-list">
                {sortedThreads.map((item) => {
                  const author = item.author || userMap[item.author_id];
                  const stats = threadCommentStats[item.id] || {
                    answers: 0,
                    replies: 0,
                  };
                  const authorName =
                    author?.display_name ||
                    author?.username ||
                    `user-${item.author_id}`;
                  const authorSlug = author?.username || item.author_id;
                  const topAnswer = threadTopAnswers[item.id];
                  return (
                    <li
                      key={item.id}
                      className="forum-question-card"
                    >
                      <div className="forum-question-card__main">
                        <Link
                          to={`/question/${item.id}`}
                          className="forum-question-card__title cursor-pointer"
                        >
                          {item.title}
                        </Link>
                        <div className="forum-question-card__meta">
                          <span className="forum-author-inline">
                            <Link
                              to={`/user/${authorSlug}`}
                              className="forum-question-card__author cursor-pointer"
                            >
                              {authorName}
                            </Link>
                            {author?.is_verified ?
                              <BadgeCheck
                                size={13}
                                fill="#f97316"
                                stroke="#fff"
                                strokeWidth={2}
                                className="forum-verified-icon"
                                aria-label="Verified"
                              />
                            : null}
                          </span>
                          <span>
                            {t({
                              en: `${stats.answers} answers`,
                              zh: `${stats.answers} 个回答`,
                            })}
                          </span>
                          <span>
                            {t({
                              en: `${stats.replies} replies`,
                              zh: `${stats.replies} 条回复`,
                            })}
                          </span>
                          <span>
                            {t({
                              en: `${item.view_count ?? 0} views`,
                              zh: `${item.view_count ?? 0} 次浏览`,
                            })}
                          </span>
                          <span>
                            {t({
                              en: `${item.like_count} likes`,
                              zh: `${item.like_count} 赞`,
                            })}
                          </span>
                        </div>
                        {topAnswer &&
                          (() => {
                            const ansAuthor =
                              topAnswer.author || userMap[topAnswer.author_id];
                            const ansName =
                              ansAuthor?.display_name ||
                              ansAuthor?.username ||
                              `user-${topAnswer.author_id}`;
                            return (
                              <div className="forum-question-card__answer-snippet">
                                <span className="forum-question-card__answer-author">
                                  {ansName}:
                                </span>{" "}
                                <span className="forum-question-card__answer-body">
                                  {stripMarkdown(topAnswer.body)}
                                </span>
                              </div>
                            );
                          })()}
                      </div>
                    </li>
                  );
                })}
                {loadingMoreThreads &&
                  Array.from({ length: 6 }).map((_, index) => (
                    <QuestionCardSkeleton
                      key={`loading-more-skeleton-${index}`}
                      skeletonKey={`loading-more-skeleton-${index}`}
                    />
                  ))}
              </ul>
            }
            {/* Feed mode: refresh button */}
            {!loading &&
              activeTag === "all" &&
              pinnedItems.length + feedItems.length > 0 && (
                <div className="forum-load-more">
                  <button
                    type="button"
                    className="forum-load-more__btn forum-load-more__btn--refresh"
                    onClick={handleRefreshFeed}
                    disabled={refreshing}
                  >
                    {refreshing ?
                      t({ en: "Refreshing...", zh: "刷新中..." })
                    : t({ en: "Refresh Recommendations", zh: "换一批推荐" })}
                  </button>
                </div>
              )}
            {/* Category mode: load more button */}
            {!loading &&
              activeTag !== "all" &&
              activeTag !== "column" &&
              activeTag !== "prediction" &&
              sortedThreads.length > 0 &&
              sortedThreads.length < totalQuestionCount && (
                <div className="forum-load-more">
                  <button
                    type="button"
                    className="forum-load-more__btn"
                    onClick={handleLoadMoreThreads}
                    disabled={loadingMoreThreads}
                  >
                    {loadingMoreThreads ?
                      t({ en: "Loading...", zh: "加载中..." })
                    : t({ en: "Load more questions", zh: "加载更多问题" })}
                  </button>
                  <p className="forum-load-more__hint">
                    {t({
                      en: "Load next 10 questions",
                      zh: "继续加载后 10 条问题",
                    })}
                  </p>
                </div>
              )}
          </div>
        </section>

        <aside
          className="forum-aside"
          aria-label={t({ en: "Hot topics area", zh: "热门话题区" })}
        >
          <TopicBoard
            threads={hotTopicThreads}
            realtimeItems={realtimeHotTopics}
            answerCountByThread={hotTopicAnswerCountByThread}
          />
          <UserBoard
            users={users}
            threads={boardThreads}
            comments={boardComments}
            userActivity={userActivity}
          />
        </aside>
      </div>
    </div>
  );
}
