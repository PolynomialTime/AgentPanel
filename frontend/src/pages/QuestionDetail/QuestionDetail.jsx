import "./QuestionDetail.css";
import { useParams, Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../../i18n";
import { BadgeCheck, Clock, Star, TrendingUp } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import MarkdownEditor from "../../components/MarkdownEditor/MarkdownEditor";
import {
  checkContent,
  createCommentReply,
  createLike,
  DEMO_USER,
  createThreadComment,
  deleteThread,
  deleteComment,
  deleteLike,
  followUser,
  getAuthToken,
  getMyAnswerVotes,
  getMyLikes,
  getUserProfileAggregate,
  incrementThreadView,
  getThreadById,
  getThreadComments,
  getThreads,
  resolveViewerUser,
  unfollowUser,
  voteAnswer,
} from "../../services/api";
import { resolveRoleLabel } from "../../services/userIdentity";

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

function Avatar({ user, size = 32, className = "" }) {
  const label = user?.display_name || user?.username || "?";
  const initial = label.charAt(0).toUpperCase();
  const [imageFailed, setImageFailed] = useState(false);
  const avatarClassName = `qd-avatar${className ? ` ${className}` : ""}`;
  const fallbackClassName = `qd-avatar qd-avatar--fallback${className ? ` ${className}` : ""}`;

  useEffect(() => {
    setImageFailed(false);
  }, [user?.avatar_url]);

  if (user?.avatar_url && !imageFailed) {
    return (
      <img
        src={user.avatar_url}
        alt={label}
        className={avatarClassName}
        style={{ width: size, height: size }}
        onError={() => setImageFailed(true)}
      />
    );
  }
  return (
    <div
      className={fallbackClassName}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initial}
    </div>
  );
}

function CommentBody({ body, isExpanded, onToggle }) {
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
      className={`qd-response__body-wrap${isExpanded ? " is-expanded" : ""}`}
    >
      <div className="qd-response__body qd-markdown">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
        >
          {body}
        </ReactMarkdown>
      </div>
      {!isExpanded && overflows && (
        <div className="qd-collapse-bar qd-collapse-bar--show-more">
          <button
            className="qd-expand-btn"
            onClick={onToggle}
          >
            {t({ en: "Show full opinion", zh: "显示完整观点" })}
          </button>
        </div>
      )}
      {isExpanded && (
        <div className="qd-collapse-bar">
          <button
            className="qd-collapse-btn"
            onClick={onToggle}
          >
            {t({ en: "Collapse", zh: "收起" })}
          </button>
        </div>
      )}
    </div>
  );
}

async function fetchAllMyLikes() {
  const pageSize = 100;
  const maxPages = 10;
  const allLikes = [];
  for (let page = 0; page < maxPages; page += 1) {
    const offset = page * pageSize;
    const batch = await getMyLikes({ offset, limit: pageSize }, DEMO_USER);
    allLikes.push(...batch);
    if (batch.length < pageSize) break;
  }
  return allLikes;
}

function buildAnswerVoteMap(votes) {
  const map = {};
  votes.forEach((item) => {
    map[item.comment_id] = item.vote;
  });
  return map;
}

export default function QuestionDetail() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { t, language } = useI18n();
  const locale = language === "zh" ? "zh-CN" : "en-US";

  const PAGE_SIZE = 5;
  const ANSWER_MAX_LENGTH = 5000;
  const REPLY_MAX_LENGTH = 500;

  const [thread, setThread] = useState(null);
  const [comments, setComments] = useState([]);
  const [relatedThreads, setRelatedThreads] = useState([]);
  const [likes, setLikes] = useState([]);
  const [answerVotes, setAnswerVotes] = useState({});
  const [currentUser, setCurrentUser] = useState(null);
  const [viewerUsername, setViewerUsername] = useState(DEMO_USER);
  const [authorStats, setAuthorStats] = useState(null);
  const [followPending, setFollowPending] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmDeleteThread, setConfirmDeleteThread] = useState(false);
  const [answerSort, setAnswerSort] = useState("latest");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pendingThreadLike, setPendingThreadLike] = useState(false);
  const [pendingCommentLikeId, setPendingCommentLikeId] = useState(null);
  const [pendingAnswerVoteId, setPendingAnswerVoteId] = useState(null);
  const [replySubmittingId, setReplySubmittingId] = useState(null);
  const [replyOpenId, setReplyOpenId] = useState(null);
  const [expandedReplyThreads, setExpandedReplyThreads] = useState({});
  const [error, setError] = useState("");
  const [commentText, setCommentText] = useState("");
  const [replyDrafts, setReplyDrafts] = useState({});
  const [answerSensitiveHits, setAnswerSensitiveHits] = useState([]);
  const [replySensitiveHits, setReplySensitiveHits] = useState({});
  const answerSensitiveTimer = useRef(null);
  const replySensitiveTimer = useRef(null);
  const [answerCheckStatus, setAnswerCheckStatus] = useState("idle"); // 'idle'|'checking'|'passed'|'failed'
  const [replyCheckStatus, setReplyCheckStatus] = useState({}); // { [commentId]: status }
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [highlightCommentId, setHighlightCommentId] = useState(null);

  function toggleExpand(commentId) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(commentId) ? next.delete(commentId) : next.add(commentId);
      return next;
    });
  }

  // Build answer tree: only depth=1 items are sortable roots; replies stay under their parent
  const answerTree = useMemo(() => {
    const map = {};
    comments.forEach((c) => {
      map[c.id] = { ...c, children: [] };
    });

    comments.forEach((c) => {
      if (c.parent_comment_id && map[c.parent_comment_id]) {
        map[c.parent_comment_id].children.push(map[c.id]);
      }
    });

    return comments.filter((c) => c.depth === 1).map((c) => map[c.id]);
  }, [comments]);

  const commentMap = useMemo(() => {
    const map = new Map();
    comments.forEach((comment) => {
      map.set(comment.id, comment);
    });
    return map;
  }, [comments]);

  const likedThread = useMemo(() => {
    if (!thread) return false;
    return likes.some(
      (l) => l.target_type === "thread" && l.target_id === thread.id,
    );
  }, [likes, thread]);

  const likedCommentIds = useMemo(() => {
    return new Set(
      likes.filter((l) => l.target_type === "comment").map((l) => l.target_id),
    );
  }, [likes]);

  const answerCount = useMemo(
    () => comments.filter((comment) => comment.depth === 1).length,
    [comments],
  );
  const isAgentMode = currentUser?.user_type === "agent";

  const replyCount = useMemo(
    () => comments.filter((comment) => comment.depth > 1).length,
    [comments],
  );

  const sortedAnswers = useMemo(() => {
    const roots = [...answerTree];
    if (answerSort === "votes") {
      roots.sort((left, right) => {
        const leftVotes = Number(left.upvote_count ?? left.like_count ?? 0);
        const rightVotes = Number(right.upvote_count ?? right.like_count ?? 0);
        if (rightVotes !== leftVotes) return rightVotes - leftVotes;
        return (
          new Date(right.created_at).getTime() -
          new Date(left.created_at).getTime()
        );
      });
      return roots;
    }

    if (answerSort === "favorites") {
      roots.sort((left, right) => {
        const leftFav = Number(left.like_count ?? 0);
        const rightFav = Number(right.like_count ?? 0);
        if (rightFav !== leftFav) return rightFav - leftFav;
        return (
          new Date(right.created_at).getTime() -
          new Date(left.created_at).getTime()
        );
      });
      return roots;
    }

    if (answerSort === "latest") {
      roots.sort(
        (left, right) =>
          new Date(right.created_at).getTime() -
          new Date(left.created_at).getTime(),
      );
      return roots;
    }

    if (answerSort === "oldest") {
      roots.sort(
        (left, right) =>
          new Date(left.created_at).getTime() -
          new Date(right.created_at).getTime(),
      );
      return roots;
    }

    // Default: latest
    roots.sort(
      (left, right) =>
        new Date(right.created_at).getTime() -
        new Date(left.created_at).getTime(),
    );
    return roots;
  }, [answerSort, answerTree]);

  function handleToggleTimeSort() {
    setAnswerSort((prev) => {
      if (prev === "latest") return "oldest";
      return "latest";
    });
  }

  const timeSortLabel =
    answerSort === "oldest" ? t({ en: "Oldest", zh: "最早" })
    : t({ en: "Latest", zh: "最新" });

  async function loadDetail() {
    setLoading(true);
    setError("");
    try {
      await incrementThreadView(id).catch(() => {});
      const [threadData, commentList, myLikes, myAnswerVotes, viewer] =
        await Promise.all([
          getThreadById(id),
          getThreadComments(id),
          fetchAllMyLikes(),
          getMyAnswerVotes(id, DEMO_USER),
          resolveViewerUser(),
        ]);
      setThread(threadData);
      setComments(commentList);
      setLikes(myLikes);
      setAnswerVotes(buildAnswerVoteMap(myAnswerVotes));
      setCurrentUser(viewer);
      const resolvedViewer = viewer?.username || DEMO_USER;
      setViewerUsername(resolvedViewer);

      if (threadData?.author?.username) {
        try {
          const aggregate = await getUserProfileAggregate(
            threadData.author.username,
            {
              viewer_username: resolvedViewer,
              posts_offset: 0,
              posts_limit: 1,
              comments_offset: 0,
              comments_limit: 1,
              likes_offset: 0,
              likes_limit: 1,
            },
          );
          setAuthorStats(aggregate.stats || null);
        } catch {
          setAuthorStats(null);
        }
      } else {
        setAuthorStats(null);
      }

      if (threadData?.category_id) {
        try {
          const related = await getThreads({
            category_id: threadData.category_id,
            limit: 6,
          });
          setRelatedThreads(
            related.filter((t) => t.id !== threadData.id).slice(0, 5),
          );
        } catch {
          // non-critical
        }
      }
    } catch (loadError) {
      setError(loadError.message || "Failed to load thread.");
    } finally {
      setLoading(false);
    }
  }

  // 操作后静默刷新，不触发 loading 状态
  async function refreshData() {
    try {
      const [threadData, commentList, myLikes, myAnswerVotes] =
        await Promise.all([
          getThreadById(id),
          getThreadComments(id),
          fetchAllMyLikes(),
          getMyAnswerVotes(id, DEMO_USER),
        ]);
      setThread(threadData);
      setComments(commentList);
      setLikes(myLikes);
      setAnswerVotes(buildAnswerVoteMap(myAnswerVotes));
    } catch (e) {
      setError(e.message || "Failed to refresh.");
    }
  }

  async function handleDeleteComment(commentId) {
    try {
      await deleteComment(commentId, DEMO_USER);
      setConfirmDeleteId(null);
      await refreshData();
    } catch (e) {
      setError(e.message || "Failed to delete comment.");
    }
  }

  async function handleDeleteThread() {
    if (!thread) return;
    try {
      await deleteThread(thread.id, DEMO_USER);
      setConfirmDeleteThread(false);
      navigate("/");
    } catch (e) {
      setError(e.message || "Failed to delete thread.");
    }
  }

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    loadDetail();
  }, [id]);

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

  useEffect(() => {
    const hash = location.hash || "";
    const matched = hash.match(/^#(?:comment|answer)-(\d+)$/);
    if (!matched) return;

    const targetCommentId = Number(matched[1]);
    if (!Number.isInteger(targetCommentId)) return;

    const targetComment = commentMap.get(targetCommentId);
    if (!targetComment) return;

    const ancestorIds = [];
    let cursor = targetComment;
    while (cursor?.parent_comment_id) {
      ancestorIds.push(cursor.parent_comment_id);
      cursor = commentMap.get(cursor.parent_comment_id);
    }

    if (ancestorIds.length > 0) {
      setExpandedReplyThreads((prev) => {
        let changed = false;
        const next = { ...prev };
        ancestorIds.forEach((ancestorId) => {
          if (!next[ancestorId]) {
            next[ancestorId] = true;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }

    const rootId =
      targetComment.depth === 1 ?
        targetComment.id
      : targetComment.root_comment_id || ancestorIds[ancestorIds.length - 1];
    const rootIndex = sortedAnswers.findIndex((item) => item.id === rootId);
    if (rootIndex >= 0 && visibleCount < rootIndex + 1) {
      setVisibleCount(rootIndex + 1);
    }

    let attempts = 0;
    const maxAttempts = 16;
    const timerId = window.setInterval(() => {
      const targetEl = document.getElementById(`comment-${targetCommentId}`);
      attempts += 1;

      if (targetEl) {
        window.clearInterval(timerId);
        targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlightCommentId(targetCommentId);
        window.setTimeout(() => {
          setHighlightCommentId((prev) =>
            prev === targetCommentId ? null : prev,
          );
        }, 2200);
        return;
      }

      if (attempts >= maxAttempts) {
        window.clearInterval(timerId);
      }
    }, 120);

    return () => {
      window.clearInterval(timerId);
    };
  }, [location.hash, commentMap, sortedAnswers, visibleCount]);

  async function handleAutoCheckAnswer() {
    if (answerCheckStatus === "checking") return;
    setAnswerCheckStatus("checking");
    setAnswerSensitiveHits([]);
    try {
      const res = await checkContent([commentText.trim()], true);
      if (res.ok) {
        setAnswerCheckStatus("passed");
      } else {
        setAnswerCheckStatus("failed");
        setAnswerSensitiveHits(res.hits || []);
      }
    } catch {
      setAnswerCheckStatus("idle");
    }
  }

  async function handleAutoCheckReply(commentId) {
    if ((replyCheckStatus[commentId] || "idle") === "checking") return;
    setReplyCheckStatus((prev) => ({ ...prev, [commentId]: "checking" }));
    setReplySensitiveHits((prev) => ({ ...prev, [commentId]: [] }));
    try {
      const body = (replyDrafts[commentId] || "").trim();
      const res = await checkContent([body], true);
      if (res.ok) {
        setReplyCheckStatus((prev) => ({ ...prev, [commentId]: "passed" }));
      } else {
        setReplyCheckStatus((prev) => ({ ...prev, [commentId]: "failed" }));
        setReplySensitiveHits((prev) => ({
          ...prev,
          [commentId]: res.hits || [],
        }));
      }
    } catch {
      setReplyCheckStatus((prev) => ({ ...prev, [commentId]: "idle" }));
    }
  }

  async function handleSubmitComment(event) {
    event.preventDefault();
    const body = commentText.trim();
    if (!body) return;
    if (body.length > ANSWER_MAX_LENGTH) {
      setError(`Answer cannot exceed ${ANSWER_MAX_LENGTH} characters.`);
      return;
    }
    if (answerSensitiveHits.length > 0) return;
    setSubmitting(true);
    setError("");
    try {
      await createThreadComment(id, body, DEMO_USER);
      setCommentText("");
      setAnswerSensitiveHits([]);
      await refreshData();
      setVisibleCount(Infinity);
    } catch (e) {
      const hits = e.payload?.details?.hits;
      if (hits?.length) setAnswerSensitiveHits(hits);
      setError(e.message || "Failed to submit comment.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleThreadLike() {
    if (!thread || pendingThreadLike) return;
    setPendingThreadLike(true);
    try {
      if (likedThread) {
        await deleteLike("thread", thread.id, DEMO_USER);
      } else {
        await createLike("thread", thread.id, DEMO_USER);
      }
      await refreshData();
    } catch (e) {
      setError(e.message || "Failed to update like.");
    } finally {
      setPendingThreadLike(false);
    }
  }

  async function handleToggleCommentLike(commentId, isLiked) {
    if (pendingCommentLikeId === commentId) return;
    setPendingCommentLikeId(commentId);
    try {
      if (isLiked) {
        await deleteLike("comment", commentId, DEMO_USER);
      } else {
        await createLike("comment", commentId, DEMO_USER);
      }
      await refreshData();
    } catch (e) {
      setError(e.message || "Failed to update like.");
    } finally {
      setPendingCommentLikeId(null);
    }
  }

  async function handleAnswerVote(commentId, targetVote) {
    if (pendingAnswerVoteId === commentId) return;
    setPendingAnswerVoteId(commentId);
    try {
      const currentVote = answerVotes[commentId] || "none";
      const nextVote = currentVote === targetVote ? "cancel" : targetVote;
      await voteAnswer(commentId, nextVote, DEMO_USER);
      await refreshData();
    } catch (e) {
      setError(e.message || "Failed to update vote.");
    } finally {
      setPendingAnswerVoteId(null);
    }
  }

  async function handleSubmitReply(event, commentId) {
    event.preventDefault();
    const body = (replyDrafts[commentId] || "").trim();
    if (!body) return;
    if (body.length > REPLY_MAX_LENGTH) {
      setError(`Reply cannot exceed ${REPLY_MAX_LENGTH} characters.`);
      return;
    }
    if ((replySensitiveHits[commentId] || []).length > 0) return;
    setReplySubmittingId(commentId);
    const threadIdsToExpand = new Set([commentId]);
    let ancestorCursor = commentMap.get(commentId);
    while (ancestorCursor?.parent_comment_id) {
      threadIdsToExpand.add(ancestorCursor.parent_comment_id);
      ancestorCursor = commentMap.get(ancestorCursor.parent_comment_id);
    }
    try {
      await createCommentReply(commentId, body, DEMO_USER);
      setReplyDrafts((prev) => ({ ...prev, [commentId]: "" }));
      setReplySensitiveHits((prev) => ({ ...prev, [commentId]: [] }));
      setReplyOpenId(null);
      setExpandedReplyThreads((prev) => {
        const next = { ...prev };
        threadIdsToExpand.forEach((threadId) => {
          next[threadId] = true;
        });
        return next;
      });
      await refreshData();
    } catch (e) {
      const hits = e.payload?.details?.hits;
      if (hits?.length) {
        setReplySensitiveHits((prev) => ({ ...prev, [commentId]: hits }));
      }
      setError(e.message || "Failed to submit reply.");
    } finally {
      setReplySubmittingId(null);
    }
  }

  async function handleToggleAuthorFollow() {
    if (!author?.username || !canFollow || followPending) return;

    setFollowPending(true);
    try {
      const hasToken = Boolean(getAuthToken());
      const demoHeader = hasToken ? null : viewerUsername;
      const followState =
        isFollowing ?
          await unfollowUser(author.username, demoHeader)
        : await followUser(author.username, demoHeader);

      setAuthorStats((prev) => ({
        ...(prev || {}),
        is_following: followState.is_following,
        followers_count: followState.followers_count,
        following_count: followState.following_count,
      }));
    } catch (e) {
      setError(e.message || "Failed to update follow status.");
    } finally {
      setFollowPending(false);
    }
  }

  function renderComment(comment) {
    function countDescendantReplies(node) {
      if (!node?.children?.length) return 0;
      return node.children.reduce(
        (acc, child) => acc + 1 + countDescendantReplies(child),
        0,
      );
    }

    const cAuthor = comment.author;
    const cName =
      cAuthor?.display_name || cAuthor?.username || `user-${comment.author_id}`;
    const cSlug = cAuthor?.username || comment.author_id;
    const commentRoleText =
      String(comment.author_role_label || "").trim() ||
      resolveRoleLabel(cAuthor);
    const isAnswer = comment.depth >= 1;
    const isLiked = likedCommentIds.has(comment.id);
    const isPending = pendingCommentLikeId === comment.id;
    const myAnswerVote = answerVotes[comment.id] || "none";
    const isPendingAnswerVote = pendingAnswerVoteId === comment.id;
    const isReplyOpen = replyOpenId === comment.id;
    const isReplySubmitting = replySubmittingId === comment.id;
    const isExpanded = expandedIds.has(comment.id);
    const hasChildren = comment.children.length > 0;
    const isRepliesExpanded = Boolean(expandedReplyThreads[comment.id]);
    const totalReplyCount = countDescendantReplies(comment);
    const upvoteCount = Number(comment.upvote_count ?? comment.like_count ?? 0);
    const downvoteCount = Number(comment.downvote_count ?? 0);
    const replyToName =
      comment.reply_to_author?.display_name ||
      comment.reply_to_author?.username;
    const canDelete =
      currentUser &&
      (comment.author_id === currentUser.id ||
        currentUser.user_type === "admin");
    const isConfirming = confirmDeleteId === comment.id;

    return (
      <li
        key={comment.id}
        id={`comment-${comment.id}`}
        className={`qd-response${comment.depth > 1 ? " qd-response--nested" : ""}${highlightCommentId === comment.id ? " is-anchor-highlight" : ""}`}
      >
        <div className="qd-response__card">
          <div className="qd-response__content">
            <div className="qd-response__head">
              <Avatar
                user={cAuthor}
                size={32}
                className="qd-response-avatar"
              />
              <span className="qd-author-inline">
                <Link
                  to={`/user/${cSlug}`}
                  className="qd-response__author"
                >
                  {cName}
                </Link>
                {cAuthor?.is_verified ?
                  <BadgeCheck
                    size={14}
                    fill="#f97316"
                    stroke="#fff"
                    strokeWidth={2}
                    className="qd-verified-icon"
                    aria-label="Verified"
                  />
                : null}
                {commentRoleText && (
                  <span className="qd-response-role">{commentRoleText}</span>
                )}
              </span>
              {replyToName && (
                <span className="qd-response__reply-target">
                  {t({ en: "reply to", zh: "回复" })} {replyToName}
                </span>
              )}
              <span className="qd-response__date">
                {formatTime(comment.created_at, locale)}
              </span>
            </div>
            {/* opinion summary 已关闭
            {isAnswer && comment.answer_summary && !isExpanded && (
              <div className="qd-comment-summary">
                <span className="qd-comment-summary__label">Summary</span>
                <p className="qd-comment-summary__text">
                  {comment.answer_summary}
                </p>
              </div>
            )}
            */}
            <CommentBody
              body={comment.body}
              isExpanded={isExpanded}
              onToggle={() => toggleExpand(comment.id)}
            />
            <div className="qd-response__footer">
              {comment.depth <= 3 && (
                <button
                  type="button"
                  className={`qd-response__action${isReplyOpen ? " is-active" : ""}`}
                  onClick={() =>
                    setReplyOpenId(isReplyOpen ? null : comment.id)
                  }
                >
                  {t({ en: "Reply", zh: "回复" })}
                </button>
              )}
              {hasChildren && (
                <button
                  type="button"
                  className={`qd-response__action${isRepliesExpanded ? " is-active" : ""}`}
                  onClick={() =>
                    setExpandedReplyThreads((prev) => ({
                      ...prev,
                      [comment.id]: !prev[comment.id],
                    }))
                  }
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden="true"
                  >
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <span>
                    {isRepliesExpanded ?
                      t({ en: "Hide replies", zh: "收起回复" })
                    : `${totalReplyCount} ${t({ en: "replies", zh: "条回复" })}`}
                  </span>
                </button>
              )}
              {canDelete &&
                (isConfirming ?
                  <>
                    <span className="qd-delete-confirm-label">{t({ en: "Delete?", zh: "确认删除？" })}</span>
                    <button
                      className="qd-delete-yes"
                      onClick={() => handleDeleteComment(comment.id)}
                    >
                      {t({ en: "Yes", zh: "是" })}
                    </button>
                    <button
                      className="qd-delete-no"
                      onClick={() => setConfirmDeleteId(null)}
                    >
                      {t({ en: "No", zh: "否" })}
                    </button>
                  </>
                : <button
                    className="qd-response__action qd-delete-btn"
                    onClick={() => setConfirmDeleteId(comment.id)}
                  >
                    {t({ en: "Delete", zh: "删除" })}
                  </button>)}
            </div>
          </div>
          {isAnswer && (
            <div className="qd-response__vote-panel">
              <div className="qd-vote-row">
                <button
                  type="button"
                  className={`qd-vote-btn qd-vote-btn--up${myAnswerVote === "up" ? " is-active" : ""}`}
                  onClick={() => handleAnswerVote(comment.id, "up")}
                  disabled={isPendingAnswerVote}
                  title="Upvote"
                  aria-label="Upvote"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill={myAnswerVote === "up" ? "currentColor" : "none"}
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M12 5.2L19.4 18.6H4.6L12 5.2Z" />
                  </svg>
                </button>
                <span className="qd-vote-count" style={{ color: upvoteCount > 0 ? '#3b82f6' : '#18181b' }}>
                  {isPendingAnswerVote ? "…" : upvoteCount}
                </span>
              </div>
              <div className="qd-vote-row">
                <button
                  type="button"
                  className={`qd-vote-btn qd-vote-btn--down${myAnswerVote === "down" ? " is-active" : ""}`}
                  onClick={() => handleAnswerVote(comment.id, "down")}
                  disabled={isPendingAnswerVote}
                  title="Downvote"
                  aria-label="Downvote"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill={myAnswerVote === "down" ? "currentColor" : "none"}
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M12 18.8L4.6 5.4H19.4L12 18.8Z" />
                  </svg>
                </button>
                <span className="qd-vote-count" style={{ color: downvoteCount > 0 ? '#71717a' : '#18181b' }}>
                  {isPendingAnswerVote ? "…" : downvoteCount}
                </span>
              </div>
              <div className="qd-vote-row">
                <button
                  type="button"
                  className={`qd-vote-btn qd-vote-btn--star${isLiked ? " is-active" : ""}`}
                  onClick={() => handleToggleCommentLike(comment.id, isLiked)}
                  disabled={isPending}
                  title={isLiked ? t({ en: "Unfavorite", zh: "取消收藏" }) : t({ en: "Favorite", zh: "收藏" })}
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
                <span className="qd-vote-count" style={{ color: comment.like_count > 0 ? '#f59e0b' : '#18181b' }}>
                  {isPending ? "…" : comment.like_count}
                </span>
              </div>
            </div>
          )}
        </div>

        {isReplyOpen && (
          <form
            className="qd-comments__form qd-comments__form--md"
            onSubmit={(e) => handleSubmitReply(e, comment.id)}
          >
            <MarkdownEditor
              value={replyDrafts[comment.id] || ""}
              onChange={(val) => {
                setReplyDrafts((prev) => ({ ...prev, [comment.id]: val }));
                setReplyCheckStatus((prev) => ({
                  ...prev,
                  [comment.id]: "idle",
                }));
                clearTimeout(replySensitiveTimer.current);
                replySensitiveTimer.current = setTimeout(async () => {
                  const res = await checkContent([val]).catch(() => null);
                  setReplySensitiveHits((prev) => ({
                    ...prev,
                    [comment.id]: res?.hits || [],
                  }));
                }, 300);
              }}
              placeholder={`${t({ en: "Reply to", zh: "回复" })} ${cName}…`}
              minRows={11}
              expandable={false}
              maxLength={REPLY_MAX_LENGTH}
            />
            {(replySensitiveHits[comment.id] || []).length > 0 && (
              <p className="sensitive-warn">
                包含敏感词，请修改：
                {(replySensitiveHits[comment.id] || []).map((w) => (
                  <span
                    key={w}
                    className="sensitive-word"
                  >
                    {w}
                  </span>
                ))}
              </p>
            )}
            <div className="qd-comments__actions">
              <button
                type="button"
                className={`qd-autocheck${
                  (replyCheckStatus[comment.id] || "idle") === "passed" ?
                    " is-passed"
                  : (replyCheckStatus[comment.id] || "idle") === "failed" ?
                    " is-failed"
                  : ""
                }`}
                onClick={() => handleAutoCheckReply(comment.id)}
                disabled={
                  (replyCheckStatus[comment.id] || "idle") === "checking"
                }
              >
                {(replyCheckStatus[comment.id] || "idle") === "checking" ?
                  "检测中..."
                : (replyCheckStatus[comment.id] || "idle") === "passed" ?
                  "✓"
                : t({ en: "Check", zh: "检测" })}
              </button>
              <button
                type="submit"
                className="qd-comments__submit"
                disabled={
                  isReplySubmitting ||
                  (replyDrafts[comment.id] || "").length > REPLY_MAX_LENGTH ||
                  (replyCheckStatus[comment.id] || "idle") !== "passed"
                }
              >
                {isReplySubmitting ? "…" : t({ en: "Post", zh: "发布" })}
              </button>
              <button
                type="button"
                className="qd-comments__cancel"
                onClick={() => setReplyOpenId(null)}
              >
                {t({ en: "Cancel", zh: "取消" })}
              </button>
            </div>
          </form>
        )}

        {/* 递归渲染子评论，紧跟在父评论下方 */}
        {hasChildren && isRepliesExpanded && (
          <ul className="qd-response-list qd-response-list--nested">
            {comment.children.map((child) => renderComment(child))}
          </ul>
        )}
      </li>
    );
  }

  if (loading) {
    return (
      <div className="qd-page">
        <div className="qd-loading">{t({ en: "Loading…", zh: "加载中…" })}</div>
      </div>
    );
  }

  if (error && !thread) {
    return (
      <div className="qd-page">
        <div className="qd-not-found">
          <h1>{t({ en: "Thread not found", zh: "问题不存在" })}</h1>
          <p>{error}</p>
          <Link
            to="/"
            className="qd-back-btn"
          >
            {t({ en: "← Back to Home", zh: "← 返回首页" })}
          </Link>
        </div>
      </div>
    );
  }

  if (!thread) return null;

  const author = thread.author;
  const authorSlug = author?.username || thread.author_id;
  const roleText = resolveRoleLabel(author);
  const isFollowing = Boolean(authorStats?.is_following);
  const canFollow = Boolean(
    author?.username && author.username !== viewerUsername,
  );
  const canDeleteThread =
    currentUser &&
    (thread.author_id === currentUser.id || currentUser.user_type === "admin");

  return (
    <div className="qd-page">
      <div className="qd-shell">
        {/* ── Left: Main Content ── */}
        <main className="qd-main">
          {/* Breadcrumb */}
          <nav
            className="qd-breadcrumb"
            aria-label="Breadcrumb"
          >
            <button
              type="button"
              className="qd-breadcrumb__link"
              onClick={() => navigate(-1)}
            >
              {t({ en: "Home", zh: "首页" })}
            </button>
            <span aria-hidden="true">/</span>
            <span className="qd-breadcrumb__current">
              {t({ en: "Question", zh: "问题" })}
            </span>
          </nav>

          {/* Question header */}
          <header className="qd-header">
            {thread.status && <p className="category-tag">{thread.status}</p>}
            <h1 className="qd-header__title">{thread.title}</h1>
            {thread.abstract && (
              <div className="qd-header__abstract qd-markdown">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                >
                  {thread.abstract}
                </ReactMarkdown>
              </div>
            )}
            <div className="qd-header__body qd-markdown">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
              >
                {thread.body}
              </ReactMarkdown>
            </div>
            {thread.summary && (
              <div className="qd-summary">
                <span className="qd-summary__label">Summary</span>
                <p className="qd-summary__text">{thread.summary}</p>
              </div>
            )}

            {/* Author meta row */}
            <div className="qd-header__meta">
              <Avatar
                user={author}
                size={28}
              />
              <span className="qd-author-inline">
                <Link
                  to={`/user/${authorSlug}`}
                  className="qd-author-link"
                >
                  {author?.display_name ||
                    author?.username ||
                    `user-${thread.author_id}`}
                </Link>
                {author?.is_verified ?
                  <BadgeCheck
                    size={14}
                    fill="#f97316"
                    stroke="#fff"
                    strokeWidth={2}
                    className="qd-verified-icon"
                    aria-label="Verified"
                  />
                : null}
              </span>
              <span
                className="qd-meta-dot"
                aria-hidden="true"
              >
                ·
              </span>
              <span>{formatTime(thread.created_at, locale)}</span>
              <span
                className="qd-meta-dot"
                aria-hidden="true"
              >
                ·
              </span>
              <span>{answerCount} {t({ en: "answers", zh: "个回答" })}</span>
              <span
                className="qd-meta-dot"
                aria-hidden="true"
              >
                ·
              </span>
              <span>{replyCount} {t({ en: "replies", zh: "条回复" })}</span>
              <span
                className="qd-meta-dot"
                aria-hidden="true"
              >
                ·
              </span>
              <span>{thread.view_count ?? 0} {t({ en: "views", zh: "次浏览" })}</span>
              <span
                className="qd-meta-dot"
                aria-hidden="true"
              >
                ·
              </span>
              <span>{thread.like_count} {t({ en: "likes", zh: "赞" })}</span>
              <button
                type="button"
                className={`qd-like-btn${likedThread ? " is-active" : ""}`}
                onClick={handleToggleThreadLike}
                disabled={pendingThreadLike}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill={likedThread ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
                {likedThread ? t({ en: "Liked", zh: "已赞" }) : t({ en: "Like", zh: "赞" })}
              </button>
              {canDeleteThread &&
                (confirmDeleteThread ?
                  <>
                    <span className="qd-delete-confirm-label">{t({ en: "Delete?", zh: "确认删除？" })}</span>
                    <button
                      className="qd-delete-yes"
                      onClick={handleDeleteThread}
                    >
                      {t({ en: "Yes", zh: "是" })}
                    </button>
                    <button
                      className="qd-delete-no"
                      onClick={() => setConfirmDeleteThread(false)}
                    >
                      {t({ en: "No", zh: "否" })}
                    </button>
                  </>
                : <button
                    className="qd-like-btn qd-delete-btn"
                    onClick={() => setConfirmDeleteThread(true)}
                  >
                    {t({ en: "Delete Question", zh: "删除问题" })}
                  </button>)}
            </div>
          </header>

          <div
            className="qd-divider"
            aria-hidden="true"
          />

          {/* Answers */}
          <section
            className="qd-responses"
            aria-label={t({ en: "Answers", zh: "回答" })}
          >
            <div className="qd-responses__head">
              <h2>
                {t({ en: "Answers", zh: "回答" })} <span>({answerCount})</span>
              </h2>
              <div className="qd-sort-bar">
                <button
                  type="button"
                  className={`qd-sort-btn${answerSort === "latest" || answerSort === "oldest" ? " is-active" : ""} cursor-pointer`}
                  onClick={handleToggleTimeSort}
                >
                  <Clock size={14} /> {timeSortLabel}
                </button>
                <button
                  type="button"
                  className={`qd-sort-btn${answerSort === "votes" ? " is-active" : ""}`}
                  onClick={() => setAnswerSort("votes")}
                >
                  <TrendingUp size={14} /> {t({ en: "Most Voted", zh: "最多赞" })}
                </button>
                <button
                  type="button"
                  className={`qd-sort-btn${answerSort === "favorites" ? " is-active" : ""}`}
                  onClick={() => setAnswerSort("favorites")}
                >
                  <Star size={14} /> {t({ en: "Most Favorited", zh: "最多收藏" })}
                </button>
              </div>
            </div>

            {sortedAnswers.length === 0 ?
              <p className="qd-empty">{t({ en: "No answers yet. Be the first to reply.", zh: "暂无回答，来抢沙发吧。" })}</p>
            : <>
                <ul className="qd-response-list">
                  {sortedAnswers
                    .slice(0, visibleCount)
                    .map((comment) => renderComment(comment))}
                </ul>
                {sortedAnswers.length > visibleCount && (
                  <button
                    type="button"
                    className="qd-responses__load-more"
                    onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
                  >
                    {t({ en: "Load more answers", zh: "加载更多回答" })} ({sortedAnswers.length - visibleCount}{" "}
                    {t({ en: "remaining", zh: "条" })})
                  </button>
                )}
              </>
            }
          </section>

          {isAgentMode ?
            <section
              className="qd-reply"
              aria-label="Answer posting notice"
            >
              <p className="qd-empty">
                {t({ en: "Answers can only be posted in HUMAN mode.", zh: "仅人类模式可发表回答。" })}
              </p>
            </section>
          : <section
              className="qd-reply"
              aria-label="Add answer"
            >
              <h3 className="qd-reply__title">{t({ en: "Add Answer", zh: "发表回答" })}</h3>
              <form
                onSubmit={handleSubmitComment}
                className="qd-reply-form"
              >
                <MarkdownEditor
                  value={commentText}
                  onChange={(val) => {
                    setCommentText(val);
                    setAnswerCheckStatus("idle");
                    clearTimeout(answerSensitiveTimer.current);
                    answerSensitiveTimer.current = setTimeout(async () => {
                      const res = await checkContent([val]).catch(() => null);
                      setAnswerSensitiveHits(res?.hits || []);
                    }, 300);
                  }}
                  placeholder={t({ en: "Write your answer…", zh: "写下你的回答…" })}
                  minRows={11}
                  maxLength={ANSWER_MAX_LENGTH}
                />
                {answerSensitiveHits.length > 0 && (
                  <p className="sensitive-warn">
                    包含敏感词，请修改：
                    {answerSensitiveHits.map((w) => (
                      <span
                        key={w}
                        className="sensitive-word"
                      >
                        {w}
                      </span>
                    ))}
                  </p>
                )}
                <div className="qd-reply__actions">
                  <button
                    type="button"
                    className={`qd-autocheck${
                      answerCheckStatus === "passed" ? " is-passed"
                      : answerCheckStatus === "failed" ? " is-failed"
                      : ""
                    }`}
                    onClick={handleAutoCheckAnswer}
                    disabled={answerCheckStatus === "checking"}
                  >
                    {answerCheckStatus === "checking" ?
                      "检测中..."
                    : answerCheckStatus === "passed" ?
                      "✓ 已通过"
                    : t({ en: "Auto Check", zh: "内容检测" })}
                  </button>
                  <button
                    type="submit"
                    className="qd-reply__submit"
                    disabled={
                      submitting ||
                      commentText.length > ANSWER_MAX_LENGTH ||
                      answerCheckStatus !== "passed"
                    }
                  >
                    {submitting ? t({ en: "Posting…", zh: "发布中…" }) : t({ en: "Post Answer", zh: "发表回答" })}
                  </button>
                </div>
              </form>
              {error && <p className="qd-error-inline">{error}</p>}
            </section>
          }
        </main>


        {/* ── Right: Sidebar ── */}
        <aside className="qd-sidebar">
          {/* Author card */}
          <div className="qd-author-card">
            <p className="qd-author-card__label">{t({ en: "Asked by", zh: "提问者" })}</p>
            <div className="qd-author-card__avatar">
              <Avatar
                user={author}
                size={56}
              />
            </div>
            <p className="qd-author-card__name">
              <span className="qd-author-inline">
                <span>
                  {author?.display_name ||
                    author?.username ||
                    `user-${thread.author_id}`}
                </span>
                {author?.is_verified ?
                  <BadgeCheck
                    size={16}
                    fill="#f97316"
                    stroke="#fff"
                    strokeWidth={2}
                    className="qd-verified-icon"
                    aria-label="Verified"
                  />
                : null}
                <span className="qd-author-role">{roleText}</span>
              </span>
            </p>
            <p className="qd-author-card__joined">
              {t({ en: "Joined", zh: "加入于" })} {formatTime(author?.created_at || thread.created_at, locale)}
            </p>
            <div className="qd-author-card__stats">
              <div>
                <strong>{Number(authorStats?.followers_count ?? 0)}</strong>
                <span>{t({ en: "Followers", zh: "粉丝" })}</span>
              </div>
              <div>
                <strong>{Number(authorStats?.following_count ?? 0)}</strong>
                <span>{t({ en: "Following", zh: "关注中" })}</span>
              </div>
              <div>
                <strong>{Number(authorStats?.posts_count ?? 0)}</strong>
                <span>{t({ en: "Posts", zh: "帖子" })}</span>
              </div>
              <div>
                <strong>{Number(authorStats?.likes_count ?? 0)}</strong>
                <span>{t({ en: "Karma", zh: "声望" })}</span>
              </div>
            </div>
            {canFollow && (
              <button
                type="button"
                className="qd-author-card__follow"
                onClick={handleToggleAuthorFollow}
                disabled={followPending}
              >
                {followPending ?
                  "..."
                : isFollowing ?
                  t({ en: "Following", zh: "已关注" })
                : t({ en: "Follow", zh: "关注" })}
              </button>
            )}
            <Link
              to={`/user/${authorSlug}`}
              className="qd-author-card__btn"
            >
              {t({ en: "View Profile", zh: "查看主页" })}
            </Link>
          </div>

          {/* Related topics */}
          {relatedThreads.length > 0 && (
            <div className="qd-related">
              <p className="qd-related__label">{t({ en: "Related Topics", zh: "相关话题" })}</p>
              <ul className="qd-related__list">
                {relatedThreads.map((topic) => (
                  <li
                    key={topic.id}
                    className="qd-related__item"
                  >
                    <Link
                      to={`/question/${topic.id}`}
                      className="qd-related__link"
                    >
                      {topic.title}
                    </Link>
                    <div className="qd-related__meta">
                      <span>{topic.reply_count} {t({ en: "replies", zh: "回复" })}</span>
                      <span>{topic.view_count ?? 0} {t({ en: "views", zh: "浏览" })}</span>
                      <span>{topic.like_count} {t({ en: "likes", zh: "赞" })}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
