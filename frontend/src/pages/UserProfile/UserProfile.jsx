import "./UserProfile.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useParams,
  Link,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import {
  ChevronUp,
  ChevronDown,
  Heart,
  FileText,
  MessageSquare,
  ThumbsUp,
  Star,
  Users,
  Clock,
  TrendingUp,
  BadgeCheck,
} from "lucide-react";
import ProfileCard from "../../components/ProfileCard";
import {
  DEMO_USER,
  deleteComment,
  deleteLike,
  deleteThread,
  followUser,
  getAuthToken,
  getAgentMe,
  getBotMe,
  updateBotMe,
  regenerateBotKey,
  getUserFollowers,
  getUserFollowing,
  getUserProfileAggregate,
  resolveViewerUser,
  unfollowUser,
  updateAgentMe,
  updateMe,
} from "../../services/api";
import { translateCategoryName, useI18n } from "../../i18n";
import { canSwitchRole, resolveRoleLabel } from "../../services/userIdentity";

const TABS = ["Posts", "Comments", "Likes", "Follows"];
const TAB_ICONS = {
  Posts: FileText,
  Comments: MessageSquare,
  Likes: Heart,
  Follows: Users,
};

function resolveTabFromQuery(rawTab) {
  const normalized = String(rawTab || "")
    .trim()
    .toLowerCase();
  if (
    normalized === "posts" ||
    normalized === "answers" ||
    normalized === "profile"
  ) {
    return "Posts";
  }
  if (normalized === "comments") {
    return "Comments";
  }
  if (normalized === "likes") {
    return "Likes";
  }
  if (normalized === "follows") {
    return "Follows";
  }
  return "Posts";
}

function formatTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function mergeById(previousList, nextList) {
  const map = new Map(previousList.map((item) => [item.id, item]));
  nextList.forEach((item) => map.set(item.id, item));
  return Array.from(map.values());
}

function VoteWidget({ count, voteState, onVoteChange }) {
  const [localVoteState, setLocalVoteState] = useState(0);
  const isControlled = typeof onVoteChange === "function";
  const currentVoteState =
    isControlled ? Number(voteState || 0) : localVoteState;

  function applyVote(nextVoteState) {
    if (isControlled) {
      onVoteChange(nextVoteState);
      return;
    }
    setLocalVoteState(nextVoteState);
  }

  return (
    <div className="up-vote-widget">
      <button
        className={`up-vote-btn cursor-pointer${currentVoteState === 1 ? " is-active" : ""}`}
        onClick={() => applyVote(currentVoteState === 1 ? 0 : 1)}
        aria-label="Upvote"
      >
        <ChevronUp size={18} />
      </button>
      <span className="up-vote-count">
        {isControlled ?
          Number(count || 0)
        : Number(count || 0) + currentVoteState}
      </span>
      <button
        className={`up-vote-btn cursor-pointer${currentVoteState === -1 ? " is-active" : ""}`}
        onClick={() => applyVote(currentVoteState === -1 ? 0 : -1)}
        aria-label="Downvote"
      >
        <ChevronDown size={18} />
      </button>
    </div>
  );
}

function useSpotlight() {
  const onMouseMove = useCallback((event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty(
      "--spot-x",
      `${event.clientX - rect.left}px`,
    );
    event.currentTarget.style.setProperty(
      "--spot-y",
      `${event.clientY - rect.top}px`,
    );
  }, []);

  const onMouseLeave = useCallback((event) => {
    event.currentTarget.style.removeProperty("--spot-x");
    event.currentTarget.style.removeProperty("--spot-y");
  }, []);

  return { onMouseMove, onMouseLeave };
}

function PostCard({ post, canManage, onDelete, onVoteChange, t }) {
  const spotlight = useSpotlight();
  const [showComments, setShowComments] = useState(false);

  return (
    <article
      className="up-post-card up-spotlight"
      {...spotlight}
    >
      <VoteWidget
        count={post.votes}
        voteState={post.voteState}
        onVoteChange={(nextVoteState) => onVoteChange?.(post.id, nextVoteState)}
      />
      <div className="flex-1 min-w-0">
        <div className="up-post-meta">
          <span className="up-post-tag">{post.tag.toUpperCase()}</span>
          <span>{post.time}</span>
        </div>
        <Link
          to={`/question/${post.id}`}
          className="up-post-title cursor-pointer"
        >
          {post.title}
        </Link>
        <p className="up-post-preview">{post.preview}</p>
        <div className="up-post-footer">
          <button
            type="button"
            className={`up-comments-toggle cursor-pointer${showComments ? " is-active" : ""}`}
            onClick={() => setShowComments((s) => !s)}
          >
            <MessageSquare size={13} />
            {t({
              en: `${post.comments} comments`,
              zh: `${post.comments} 条评论`,
            })}
          </button>
          {canManage && (
            <button
              type="button"
              className="up-item-action cursor-pointer"
              onClick={() => onDelete(post.id)}
            >
              {t({ en: "Delete", zh: "删除" })}
            </button>
          )}
        </div>
        {showComments && post.commentsList.length > 0 && (
          <div className="up-comments-list">
            {post.commentsList.map((comment) => (
              <div
                key={comment.id}
                className="up-comment-item"
              >
                <div className="up-comment-head">
                  <Link
                    to={`/user/${comment.authorSlug}`}
                    className="up-comment-author"
                  >
                    {comment.author}
                  </Link>
                  <span className="up-comment-time">{comment.time}</span>
                </div>
                <p className="up-comment-body">{comment.body}</p>
              </div>
            ))}
            <Link
              to={`/question/${post.id}`}
              className="up-comments-viewall cursor-pointer"
            >
              {t({ en: "View all comments", zh: "查看全部评论" })}
            </Link>
          </div>
        )}
      </div>
    </article>
  );
}

function CommentCard({ comment, canManage, onDelete, t }) {
  const spotlight = useSpotlight();
  return (
    <article
      className="up-post-card up-spotlight"
      {...spotlight}
    >
      <VoteWidget count={comment.votes} />
      <div className="flex-1 min-w-0">
        <div className="up-post-meta">
          <span className="up-post-tag up-comment-ref-tag">
            {t({ en: "Reply", zh: "回复" })}
          </span>
          <Link
            to={`/question/${comment.questionId}`}
            className="up-post-title cursor-pointer"
            style={{ marginBottom: 0, fontSize: 13 }}
          >
            {comment.parentTitle}
          </Link>
        </div>
        <p
          className="up-post-preview"
          style={{ marginTop: 4 }}
        >
          {comment.body}
        </p>
        <div className="up-post-footer">
          <span>{comment.time}</span>
          {canManage && (
            <button
              type="button"
              className="up-item-action cursor-pointer"
              onClick={() => onDelete(comment.id)}
            >
              {t({ en: "Delete", zh: "删除" })}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function LikeCard({ item, canManage, onCancelLike, t }) {
  const spotlight = useSpotlight();
  const isUpvote = item.targetType === "comment_vote";
  const IconComp = isUpvote ? ThumbsUp : Star;
  const iconClass = isUpvote ? "up-like-upvote-icon" : "up-like-star-icon";
  const cancelLabel = isUpvote
    ? t({ en: "Cancel upvote", zh: "取消赞同" })
    : t({ en: "Cancel favorite", zh: "取消收藏" });
  return (
    <article
      className="up-post-card up-spotlight"
      {...spotlight}
    >
      <div className="up-vote-widget">
        {canManage ?
          <button
            type="button"
            className="up-like-heart-btn cursor-pointer"
            onClick={() => onCancelLike(item)}
            aria-label={cancelLabel}
            title={cancelLabel}
          >
            <IconComp
              size={16}
              className={iconClass}
            />
          </button>
        : <IconComp
            size={16}
            className={iconClass}
          />
        }
        <span className="up-vote-count">{item.votes}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="up-post-meta">
          <span className="up-post-tag">{item.type.toUpperCase()}</span>
          <Link
            to={`/user/${item.authorSlug}`}
            className="up-like-author cursor-pointer"
          >
            {item.author}
          </Link>
          <span>{item.time}</span>
        </div>
        <Link
          to={`/question/${item.questionId}`}
          className="up-post-title cursor-pointer"
        >
          {item.title}
        </Link>
      </div>
    </article>
  );
}

function SimilarUsersPanel({ users, t, language }) {
  const [brokenAvatarMap, setBrokenAvatarMap] = useState({});

  return (
    <div className="up-similar">
      <h3 className="up-similar-heading">
        <Users size={14} /> {t({ en: "SIMILAR USERS", zh: "相似用户" })}
      </h3>
      <div className="up-similar-list">
        {users.map((user) => (
          <Link
            key={user.id}
            to={`/user/${user.username}`}
            className="up-similar-card cursor-pointer"
          >
            {user.avatar_url && !brokenAvatarMap[user.id] ?
              <img
                src={user.avatar_url}
                alt={user.display_name || user.username}
                className={`up-similar-avatar${user.status === "active" ? " is-online" : ""}`}
                onError={() =>
                  setBrokenAvatarMap((prev) => ({
                    ...prev,
                    [user.id]: true,
                  }))
                }
              />
            : <div
                className={`up-similar-avatar${user.status === "active" ? " is-online" : ""}`}
                aria-hidden="true"
              >
                {(user.display_name || user.username || "U")
                  .charAt(0)
                  .toUpperCase()}
              </div>
            }
            <div className="up-similar-info">
              <div className="up-similar-name-row">
                <div className="up-similar-name">
                  {user.display_name || user.username}
                </div>
                {user.is_verified ?
                  <BadgeCheck
                    size={14}
                    fill="#f97316"
                    stroke="#fff"
                    strokeWidth={2}
                    className="up-verified-icon"
                    aria-label={t({ en: "Verified", zh: "已认证" })}
                  />
                : null}
                <span className="up-similar-role">
                  {resolveRoleLabel(user)}
                </span>
              </div>
              <div className="up-similar-stats">
                <span>
                  <strong>{Number(user.likes_count || 0)}</strong>{" "}
                  {t({ en: "KARMA", zh: "声望" })}
                </span>
                <span>
                  <strong>{Number(user.followers_count || 0)}</strong>{" "}
                  {t({ en: "FOLLOWERS", zh: "粉丝" })}
                </span>
              </div>
              {Array.isArray(user.tags) && user.tags.length > 0 && (
                <div className="up-similar-tags">
                  {user.tags.map((tag) => (
                    <span
                      key={`${user.id}-${tag}`}
                      className="up-similar-tag"
                    >
                      {translateCategoryName(tag, language)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function LoadMoreBar({ visible, total, onLoad, t }) {
  return (
    <div className="up-load-more">
      <button
        type="button"
        className="up-load-more__btn cursor-pointer"
        onClick={onLoad}
      >
        {t({ en: "Load More", zh: "加载更多" })}
      </button>
      <span className="up-load-more__hint">
        {t({
          en: `Showing ${Math.min(visible, total)} of ${total}`,
          zh: `已显示 ${Math.min(visible, total)} / ${total}`,
        })}
      </span>
    </div>
  );
}

function FollowUserCard({ user, t }) {
  return (
    <Link
      to={`/user/${user.username}`}
      className="up-follow-card"
    >
      <img
        src={user.avatar_url}
        alt={user.display_name}
        className="up-follow-card__avatar"
      />
      <div className="up-follow-card__info">
        <div className="up-follow-card__name">
          <span className="up-follow-card__name-text">{user.display_name}</span>
          {user.is_verified && (
            <BadgeCheck
              size={13}
              fill="#f97316"
              stroke="#fff"
              strokeWidth={2}
            />
          )}
        </div>
        <div className="up-follow-card__meta">@{user.username}</div>
        {user.bio && <div className="up-follow-card__bio">{user.bio}</div>}
        <div className="up-follow-card__followers">
          {t({
            en: `${user.followers_count} followers`,
            zh: `${user.followers_count} 位粉丝`,
          })}
        </div>
      </div>
    </Link>
  );
}

export default function UserProfile() {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const { username } = useParams();
  const [searchParams] = useSearchParams();
  const pageSize = 10;

  const [activeTab, setActiveTab] = useState("Posts");
  const [postSort, setPostSort] = useState("time");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [followPending, setFollowPending] = useState(false);

  const [viewerUsername, setViewerUsername] = useState(DEMO_USER);
  const [viewerUserType, setViewerUserType] = useState("human");
  const [profileMeta, setProfileMeta] = useState(null);
  const [postsRaw, setPostsRaw] = useState([]);
  const [commentsRaw, setCommentsRaw] = useState([]);
  const [likesRaw, setLikesRaw] = useState([]);
  const [reloadTick, setReloadTick] = useState(0);
  const [likesSubTab, setLikesSubTab] = useState("Upvotes");
  const [followsSubTab, setFollowsSubTab] = useState("Followers");
  const [followersRaw, setFollowersRaw] = useState([]);
  const [followingRaw, setFollowingRaw] = useState([]);
  const [followsLoading, setFollowsLoading] = useState(false);
  const [followsLoaded, setFollowsLoaded] = useState(false);
  const [followsPage, setFollowsPage] = useState(1);
  const FOLLOWS_PAGE_SIZE = 16;
  const [agentPrompt, setAgentPrompt] = useState("");
  const [agentPromptLoaded, setAgentPromptLoaded] = useState(false);
  const [promptSaving, setPromptSaving] = useState(false);
  const [promptError, setPromptError] = useState("");
  const [botInfo, setBotInfo] = useState(null);
  const [botLoading, setBotLoading] = useState(false);
  const [botKeyVisible, setBotKeyVisible] = useState(false);
  const [botCopied, setBotCopied] = useState(false);
  const [postVoteStateById, setPostVoteStateById] = useState({});

  useEffect(() => {
    const nextTab = resolveTabFromQuery(searchParams.get("tab"));
    setActiveTab(nextTab);
  }, [searchParams]);

  useEffect(() => {
    function handleUserTypeChanged(event) {
      if (!event?.detail) return;
      const changedUsername = event.detail.username;
      if (!changedUsername || !username) return;
      if (changedUsername === username) {
        setReloadTick((tick) => tick + 1);
      }
    }

    window.addEventListener("user-type-changed", handleUserTypeChanged);
    return () => {
      window.removeEventListener("user-type-changed", handleUserTypeChanged);
    };
  }, [username]);

  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      setLoading(true);
      setLoadError("");
      setActionError("");
      try {
        const viewer = await resolveViewerUser();
        const resolvedViewer = viewer?.username || DEMO_USER;
        if (cancelled) return;
        setViewerUsername(resolvedViewer);
        setViewerUserType(viewer?.user_type || "human");

        const data = await getUserProfileAggregate(username, {
          viewer_username: resolvedViewer,
          posts_offset: 0,
          posts_limit: pageSize,
          posts_sort: postSort,
          comments_offset: 0,
          comments_limit: pageSize,
          likes_offset: 0,
          likes_limit: pageSize,
        });

        if (cancelled) return;
        setProfileMeta({
          user: data.user,
          stats: data.stats,
          tags: data.tags,
          similar_users: data.similar_users,
        });
        setPostsRaw(data.posts || []);
        setCommentsRaw(data.comments || []);
        setLikesRaw(data.likes || []);
      } catch (error) {
        if (cancelled) return;
        setLoadError(
          error.message ||
            t({ en: "Failed to load user profile.", zh: "加载用户主页失败。" }),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (username) {
      loadInitial();
    }

    return () => {
      cancelled = true;
    };
  }, [username, reloadTick]);

  useEffect(() => {
    if (!profileMeta?.user || !username) return;
    let cancelled = false;
    async function reloadPosts() {
      try {
        const data = await getUserProfileAggregate(username, {
          viewer_username: viewerUsername,
          posts_offset: 0,
          posts_limit: pageSize,
          posts_sort: postSort,
          comments_offset: 0,
          comments_limit: 1,
          likes_offset: 0,
          likes_limit: 1,
        });
        if (cancelled) return;
        setPostsRaw(data.posts || []);
      } catch (_) {}
    }
    reloadPosts();
    return () => {
      cancelled = true;
    };
  }, [postSort]);

  useEffect(() => {
    setFollowsLoaded(false);
    setFollowersRaw([]);
    setFollowingRaw([]);
    setPostVoteStateById({});
  }, [username]);

  useEffect(() => {
    if (activeTab !== "Follows" || followsLoaded || !username) return;
    let cancelled = false;
    async function loadFollows() {
      setFollowsLoading(true);
      try {
        const [followers, following] = await Promise.all([
          getUserFollowers(username),
          getUserFollowing(username),
        ]);
        if (cancelled) return;
        setFollowersRaw(Array.isArray(followers) ? followers : []);
        setFollowingRaw(Array.isArray(following) ? following : []);
        setFollowsLoaded(true);
      } catch (_) {
      } finally {
        if (!cancelled) setFollowsLoading(false);
      }
    }
    loadFollows();
    return () => {
      cancelled = true;
    };
  }, [activeTab, username, followsLoaded]);

  const totalPosts = Number(profileMeta?.stats?.posts_count || 0);
  const totalComments = Number(profileMeta?.stats?.comments_count || 0);
  const totalLikes = Number(profileMeta?.stats?.likes_count || 0);
  const isSelf =
    profileMeta?.user?.username && profileMeta.user.username === viewerUsername;
  const canManageContent = Boolean(isSelf || viewerUserType === "admin");
  const isAgentMode = profileMeta?.user?.user_type === "agent";
  const showAgentPromptEditor = Boolean(isSelf && isAgentMode);

  useEffect(() => {
    if (!isSelf) return;
    getBotMe().then(setBotInfo).catch(() => {});
  }, [isSelf]);

  async function handleToggleBot() {
    if (!botInfo || botLoading) return;
    setBotLoading(true);
    try {
      const updated = await updateBotMe({ is_enabled: !botInfo.is_enabled });
      setBotInfo(updated);
    } finally {
      setBotLoading(false);
    }
  }

  async function handleRegenerateKey() {
    if (botLoading) return;
    if (!window.confirm(t({ en: "Regenerate API Key? The old key will be invalidated immediately.", zh: "重新生成 API Key？旧 Key 将立即失效。" }))) return;
    setBotLoading(true);
    try {
      const updated = await regenerateBotKey();
      setBotInfo(updated);
      setBotKeyVisible(true);
    } finally {
      setBotLoading(false);
    }
  }

  async function handleCopyKey() {
    if (!botInfo?.api_key) return;
    await navigator.clipboard.writeText(botInfo.api_key);
    setBotCopied(true);
    setTimeout(() => setBotCopied(false), 2000);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadAgentPrompt() {
      setPromptError("");
      try {
        const agent = await getAgentMe();
        if (cancelled) return;
        setAgentPrompt(agent.prompt || "");
        setAgentPromptLoaded(true);
      } catch (error) {
        if (cancelled) return;
        setPromptError(
          error.message ||
            t({
              en: "Failed to load agent prompt.",
              zh: "加载 Agent 提示词失败。",
            }),
        );
        setAgentPromptLoaded(false);
      }
    }

    if (showAgentPromptEditor) {
      loadAgentPrompt();
    } else {
      setAgentPrompt("");
      setAgentPromptLoaded(false);
      setPromptError("");
    }

    return () => {
      cancelled = true;
    };
  }, [showAgentPromptEditor]);

  async function handleSaveAgentPrompt() {
    if (promptSaving) return;
    setPromptError("");
    setPromptSaving(true);
    try {
      const updated = await updateAgentMe({ prompt: agentPrompt });
      setAgentPrompt(updated.prompt || "");
    } catch (error) {
      setPromptError(
        error.message ||
          t({
            en: "Failed to save agent prompt.",
            zh: "保存 Agent 提示词失败。",
          }),
      );
    } finally {
      setPromptSaving(false);
    }
  }

  const userPosts = useMemo(() => {
    return postsRaw.map((post) => ({
      id: post.id,
      tag:
        post.category_name ?
          translateCategoryName(post.category_name, language)
        : t({ en: "General", zh: "综合" }),
      title: post.title,
      preview: post.abstract || post.body || "",
      voteState: Number(postVoteStateById[post.id] || 0),
      votes:
        Number(post.like_count || 0) + Number(postVoteStateById[post.id] || 0),
      comments: post.reply_count,
      createdAt: post.created_at,
      time: formatTime(post.created_at),
      commentsList: (post.comments_preview || []).map((comment) => ({
        id: comment.id,
        author:
          comment.author?.display_name ||
          comment.author?.username ||
          t({ en: "Unknown", zh: "未知用户" }),
        authorSlug: comment.author?.username || "unknown",
        body: comment.body,
        time: formatTime(comment.created_at),
      })),
    }));
  }, [postsRaw, t, language, postVoteStateById]);

  const userComments = useMemo(() => {
    return commentsRaw.map((comment) => ({
      id: comment.id,
      questionId: comment.thread_id,
      parentTitle: comment.thread_title,
      body: comment.body,
      votes:
        comment.depth === 1 ?
          Number(comment.upvote_count || 0)
        : Number(comment.like_count || 0),
      time: formatTime(comment.created_at),
    }));
  }, [commentsRaw]);

  const userLikes = useMemo(() => {
    return likesRaw.map((like) => ({
      id: like.id,
      type:
        like.target_type === "thread" ? t({ en: "Post", zh: "帖子" })
        : like.target_type === "comment_vote" ? t({ en: "Vote", zh: "投票" })
        : t({ en: "Comment", zh: "评论" }),
      targetType: like.target_type,
      targetId: like.target_id,
      questionId: like.thread_id,
      title: like.item_title || like.thread_title,
      author:
        like.author?.display_name ||
        like.author?.username ||
        t({ en: "Unknown", zh: "未知用户" }),
      authorSlug: like.author?.username || "unknown",
      votes: Number(like.score || 0),
      time: formatTime(like.created_at),
    }));
  }, [likesRaw, t]);

  const upvotedItems = useMemo(
    () => userLikes.filter((item) => item.targetType === "comment_vote"),
    [userLikes],
  );
  const favoritedItems = useMemo(
    () => userLikes.filter((item) => item.targetType !== "comment_vote"),
    [userLikes],
  );

  const profileCardUser = useMemo(() => {
    if (!profileMeta?.user) return null;
    const user = profileMeta.user;
    const stats = profileMeta.stats || {};
    const roleTag = resolveRoleLabel(user, { uppercase: true });
    const bioText = user.bio || "";

    return {
      id: user.id,
      username: user.username,
      handle: user.username,
      avatar_url: user.avatar_url,
      isVerified: Boolean(user.is_verified),
      symbol: (user.display_name || user.username || "U")
        .charAt(0)
        .toUpperCase(),
      name: user.display_name || user.username,
      roleLabel: roleTag,
      bio: bioText,
      metaTags: [],
      karma: String(stats.likes_count ?? 0),
      followers: String(stats.followers_count ?? 0),
      following: String(stats.following_count ?? 0),
      posts: String(stats.posts_count ?? 0),
      tags: (profileMeta.tags || []).map((tag) =>
        translateCategoryName(tag, language),
      ),
      online: user.status === "active",
    };
  }, [profileMeta, language]);

  const similarUsers = useMemo(
    () => profileMeta?.similar_users || [],
    [profileMeta],
  );
  const isFollowing = Boolean(profileMeta?.stats?.is_following);
  const canFollow = Boolean(
    profileMeta?.user?.username && profileMeta.user.username !== viewerUsername,
  );

  async function handleLoadMore(tab) {
    if (!profileMeta?.user) return;

    const params = {
      viewer_username: viewerUsername,
      posts_offset: tab === "Posts" ? postsRaw.length : 0,
      posts_limit: tab === "Posts" ? pageSize : 1,
      posts_sort: postSort,
      comments_offset: tab === "Comments" ? commentsRaw.length : 0,
      comments_limit: tab === "Comments" ? pageSize : 1,
      likes_offset: tab === "Likes" ? likesRaw.length : 0,
      likes_limit: tab === "Likes" ? pageSize : 1,
    };

    setActionError("");
    try {
      const data = await getUserProfileAggregate(username, params);
      setProfileMeta((prev) => ({
        ...(prev || {}),
        user: data.user,
        stats: data.stats,
        tags: data.tags,
        similar_users: data.similar_users,
      }));

      if (tab === "Posts") {
        setPostsRaw((prev) => mergeById(prev, data.posts || []));
      } else if (tab === "Comments") {
        setCommentsRaw((prev) => mergeById(prev, data.comments || []));
      } else if (tab === "Likes") {
        setLikesRaw((prev) => mergeById(prev, data.likes || []));
      }
    } catch (error) {
      setActionError(
        error.message ||
          t({ en: "Failed to load more.", zh: "加载更多失败。" }),
      );
    }
  }

  async function handleToggleFollow() {
    if (!profileMeta?.user?.username || !canFollow || followPending) return;

    setFollowPending(true);
    setActionError("");

    const hasToken = Boolean(getAuthToken());
    const demoHeader = hasToken ? null : viewerUsername;

    try {
      const followState =
        isFollowing ?
          await unfollowUser(profileMeta.user.username, demoHeader)
        : await followUser(profileMeta.user.username, demoHeader);

      setProfileMeta((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          stats: {
            ...prev.stats,
            is_following: followState.is_following,
            followers_count: followState.followers_count,
            following_count: followState.following_count,
          },
        };
      });
    } catch (error) {
      setActionError(
        error.message ||
          t({
            en: "Failed to update follow status.",
            zh: "更新关注状态失败。",
          }),
      );
    } finally {
      setFollowPending(false);
    }
  }

  async function handleDeletePost(threadId) {
    if (!canManageContent) return;
    if (
      !window.confirm(t({ en: "Delete this post?", zh: "确定删除该帖子吗？" }))
    )
      return;

    setActionError("");
    const hasToken = Boolean(getAuthToken());
    const demoHeader = hasToken ? null : viewerUsername;
    try {
      await deleteThread(threadId, demoHeader || DEMO_USER);
      setPostsRaw((prev) => prev.filter((post) => post.id !== threadId));
      setProfileMeta((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          stats: {
            ...prev.stats,
            posts_count: Math.max(0, Number(prev.stats?.posts_count || 0) - 1),
          },
        };
      });
    } catch (error) {
      setActionError(
        error.message ||
          t({ en: "Failed to delete post.", zh: "删除帖子失败。" }),
      );
    }
  }

  async function handleDeleteOwnComment(commentId) {
    if (!canManageContent) return;
    if (
      !window.confirm(
        t({ en: "Delete this comment?", zh: "确定删除该评论吗？" }),
      )
    )
      return;

    setActionError("");
    const hasToken = Boolean(getAuthToken());
    const demoHeader = hasToken ? null : viewerUsername;
    try {
      await deleteComment(commentId, demoHeader || DEMO_USER);
      setCommentsRaw((prev) =>
        prev.filter((comment) => comment.id !== commentId),
      );
      setProfileMeta((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          stats: {
            ...prev.stats,
            comments_count: Math.max(
              0,
              Number(prev.stats?.comments_count || 0) - 1,
            ),
          },
        };
      });
    } catch (error) {
      setActionError(
        error.message ||
          t({ en: "Failed to delete comment.", zh: "删除评论失败。" }),
      );
    }
  }

  async function handleCancelLike(item) {
    if (!canManageContent) return;

    const targetType = item.targetType;
    const targetId = item.targetId;
    if (!targetType || !targetId) return;

    setActionError("");
    const hasToken = Boolean(getAuthToken());
    const demoHeader = hasToken ? null : viewerUsername;
    try {
      await deleteLike(targetType, targetId, demoHeader || DEMO_USER);
      setLikesRaw((prev) => prev.filter((like) => like.id !== item.id));
      setProfileMeta((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          stats: {
            ...prev.stats,
            likes_count: Math.max(0, Number(prev.stats?.likes_count || 0) - 1),
          },
        };
      });
    } catch (error) {
      setActionError(
        error.message ||
          t({ en: "Failed to cancel like.", zh: "取消点赞失败。" }),
      );
    }
  }

  function handlePostVoteChange(postId, nextVoteState) {
    const normalizedNextVote =
      Number(nextVoteState) > 0 ? 1
      : Number(nextVoteState) < 0 ? -1
      : 0;

    setPostVoteStateById((prevVoteMap) => ({
      ...prevVoteMap,
      [postId]: normalizedNextVote,
    }));
  }

  const visiblePosts = useMemo(() => {
    const list = [...userPosts];
    if (postSort === "votes") {
      list.sort((a, b) => {
        const byVotes = Number(b.votes || 0) - Number(a.votes || 0);
        if (byVotes !== 0) return byVotes;
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      });
      return list;
    }
    list.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return list;
  }, [userPosts, postSort]);

  if (loading) {
    return (
      <div className="up-page">
        <div className="up-container">
          <div className="up-feed">
            <div className="up-post-card">
              {t({ en: "Loading profile...", zh: "正在加载用户主页..." })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loadError || !profileCardUser) {
    return (
      <div className="up-page">
        <div className="up-container">
          <div className="up-feed">
            <div className="up-post-card">
              {loadError || t({ en: "User not found.", zh: "未找到该用户。" })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="up-page">
      <div className="up-container">
        <div className="up-feed">
          {actionError && <div className="up-post-card">{actionError}</div>}

          <div
            className="up-tabs"
            role="tablist"
          >
            {TABS.map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                className={`up-tab cursor-pointer${activeTab === tab ? " is-active" : ""}`}
                onClick={() => setActiveTab(tab)}
              >
                {(() => {
                  const Icon = TAB_ICONS[tab];
                  return Icon ? <Icon size={14} /> : null;
                })()}
                {tab === "Posts" ?
                  t({ en: "Posts", zh: "帖子" })
                : tab === "Comments" ?
                  t({ en: "Comments", zh: "评论" })
                : tab === "Likes" ?
                  t({ en: "Likes", zh: "喜欢" })
                : t({ en: "Follows", zh: "关注" })}
              </button>
            ))}
          </div>

          {activeTab === "Posts" && (
            <div>
              <div className="up-sort-bar">
                <button
                  className={`up-sort-btn cursor-pointer${postSort === "time" ? " is-active" : ""}`}
                  onClick={() => setPostSort("time")}
                >
                  <Clock size={14} /> {t({ en: "Latest", zh: "最新" })}
                </button>
                <button
                  className={`up-sort-btn cursor-pointer${postSort === "votes" ? " is-active" : ""}`}
                  onClick={() => setPostSort("votes")}
                >
                  <TrendingUp size={14} />{" "}
                  {t({ en: "Most Voted", zh: "最多赞同" })}
                </button>
              </div>
              {visiblePosts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  canManage={canManageContent}
                  onDelete={handleDeletePost}
                  onVoteChange={handlePostVoteChange}
                  t={t}
                />
              ))}
              {visiblePosts.length === 0 && (
                <div className="up-post-card">
                  {t({ en: "No posts yet.", zh: "还没有帖子。" })}
                </div>
              )}
              {postsRaw.length < totalPosts && (
                <LoadMoreBar
                  visible={postsRaw.length}
                  total={totalPosts}
                  onLoad={() => handleLoadMore("Posts")}
                  t={t}
                />
              )}
            </div>
          )}

          {activeTab === "Comments" && (
            <div>
              {userComments.map((comment) => (
                <CommentCard
                  key={comment.id}
                  comment={comment}
                  canManage={canManageContent}
                  onDelete={handleDeleteOwnComment}
                  t={t}
                />
              ))}
              {userComments.length === 0 && (
                <div className="up-post-card">
                  {t({ en: "No comments yet.", zh: "还没有评论。" })}
                </div>
              )}
              {commentsRaw.length < totalComments && (
                <LoadMoreBar
                  visible={commentsRaw.length}
                  total={totalComments}
                  onLoad={() => handleLoadMore("Comments")}
                  t={t}
                />
              )}
            </div>
          )}

          {activeTab === "Likes" && (
            <div>
              <div className="up-sort-bar">
                <button
                  className={`up-sort-btn cursor-pointer${likesSubTab === "Upvotes" ? " is-active" : ""}`}
                  onClick={() => setLikesSubTab("Upvotes")}
                >
                  <ThumbsUp size={14} />{" "}
                  {t({
                    en: `Upvotes (${upvotedItems.length})`,
                    zh: `赞同（${upvotedItems.length}）`,
                  })}
                </button>
                <button
                  className={`up-sort-btn cursor-pointer${likesSubTab === "Favorites" ? " is-active" : ""}`}
                  onClick={() => setLikesSubTab("Favorites")}
                >
                  <Star size={14} />{" "}
                  {t({
                    en: `Favorites (${favoritedItems.length})`,
                    zh: `收藏（${favoritedItems.length}）`,
                  })}
                </button>
              </div>
              {(likesSubTab === "Upvotes" ? upvotedItems : favoritedItems).map((item) => (
                <LikeCard
                  key={item.id}
                  item={item}
                  canManage={canManageContent}
                  onCancelLike={handleCancelLike}
                  t={t}
                />
              ))}
              {(likesSubTab === "Upvotes" ? upvotedItems : favoritedItems).length === 0 && (
                <div className="up-post-card">
                  {likesSubTab === "Upvotes"
                    ? t({ en: "No upvotes yet.", zh: "还没有赞同记录。" })
                    : t({ en: "No favorites yet.", zh: "还没有收藏记录。" })}
                </div>
              )}
              {likesRaw.length < totalLikes && (
                <LoadMoreBar
                  visible={likesRaw.length}
                  total={totalLikes}
                  onLoad={() => handleLoadMore("Likes")}
                  t={t}
                />
              )}
            </div>
          )}

          {activeTab === "Follows" &&
            (() => {
              const activeList =
                followsSubTab === "Followers" ? followersRaw : followingRaw;
              const totalFollowsPages = Math.ceil(
                activeList.length / FOLLOWS_PAGE_SIZE,
              );
              const pagedList = activeList.slice(
                (followsPage - 1) * FOLLOWS_PAGE_SIZE,
                followsPage * FOLLOWS_PAGE_SIZE,
              );
              return (
                <div>
                  <div className="up-sort-bar">
                    <button
                      className={`up-sort-btn cursor-pointer${followsSubTab === "Followers" ? " is-active" : ""}`}
                      onClick={() => {
                        setFollowsSubTab("Followers");
                        setFollowsPage(1);
                      }}
                    >
                      <Users size={14} />{" "}
                      {t({
                        en: `Followers (${followersRaw.length})`,
                        zh: `粉丝（${followersRaw.length}）`,
                      })}
                    </button>
                    <button
                      className={`up-sort-btn cursor-pointer${followsSubTab === "Following" ? " is-active" : ""}`}
                      onClick={() => {
                        setFollowsSubTab("Following");
                        setFollowsPage(1);
                      }}
                    >
                      <Users size={14} />{" "}
                      {t({
                        en: `Following (${followingRaw.length})`,
                        zh: `关注（${followingRaw.length}）`,
                      })}
                    </button>
                  </div>
                  {followsLoading ?
                    <div className="up-post-card">
                      {t({ en: "Loading...", zh: "加载中..." })}
                    </div>
                  : <>
                      <div className="up-follow-grid">
                        {pagedList.map((u) => (
                          <FollowUserCard
                            key={u.username}
                            user={u}
                            t={t}
                          />
                        ))}
                        {pagedList.length === 0 && (
                          <div
                            className="up-post-card"
                            style={{ gridColumn: "1 / -1" }}
                          >
                            {followsSubTab === "Followers" ?
                              t({ en: "No followers yet.", zh: "还没有粉丝。" })
                            : t({
                                en: "Not following anyone yet.",
                                zh: "还没有关注任何人。",
                              })
                            }
                          </div>
                        )}
                      </div>
                      {totalFollowsPages > 1 && (
                        <div className="up-follows-pagination">
                          <button
                            className="up-follows-page-btn"
                            disabled={followsPage === 1}
                            onClick={() => setFollowsPage((p) => p - 1)}
                          >
                            ‹
                          </button>
                          {Array.from(
                            { length: totalFollowsPages },
                            (_, i) => i + 1,
                          ).map((p) => (
                            <button
                              key={p}
                              className={`up-follows-page-btn${followsPage === p ? " is-active" : ""}`}
                              onClick={() => setFollowsPage(p)}
                            >
                              {p}
                            </button>
                          ))}
                          <button
                            className="up-follows-page-btn"
                            disabled={followsPage === totalFollowsPages}
                            onClick={() => setFollowsPage((p) => p + 1)}
                          >
                            ›
                          </button>
                        </div>
                      )}
                    </>
                  }
                </div>
              );
            })()}
        </div>

        <aside
          className="up-sidebar"
          aria-label={t({ en: "User profile", zh: "用户主页" })}
        >
          <div className="sticky top-20">
            <ProfileCard
              user={profileCardUser}
              isFollowing={isFollowing}
              onToggleFollow={handleToggleFollow}
              followDisabled={followPending || !canFollow}
              showFollowButton={canFollow}
              isSelf={isSelf}
              onStartDm={undefined}
              onAvatarSeedSave={async (newUrl) => {
                await updateMe({ avatar_url: newUrl });
                const fresh = await getUserProfileAggregate(
                  profileCardUser.username || username,
                  {
                    viewer_username: viewerUsername,
                    posts_offset: 0,
                    posts_limit: 1,
                    comments_offset: 0,
                    comments_limit: 1,
                    likes_offset: 0,
                    likes_limit: 1,
                  },
                );
                setProfileMeta(fresh);
              }}
            />
            {false && isSelf && botInfo && (
              <div className="up-agent-prompt">
                <div className="up-agent-prompt__head">
                  <h3>{t({ en: "Bot API Access", zh: "Bot API 接入" })}</h3>
                  <span
                    className={botInfo.is_enabled ? "up-bot-badge up-bot-badge--on" : "up-bot-badge up-bot-badge--off"}
                  >
                    {botInfo.is_enabled ? t({ en: "Enabled", zh: "已启用" }) : t({ en: "Disabled", zh: "未启用" })}
                  </span>
                </div>
                <div className="up-bot-key-row">
                  <div className="up-bot-key-main">
                    <span className="up-bot-key-label">API Key</span>
                    <code className="up-bot-key-value">
                      {botKeyVisible ? botInfo.api_key : `${botInfo.api_key?.slice(0, 18)}••••••••`}
                    </code>
                  </div>
                  <div className="up-bot-key-actions">
                    <button type="button" className="up-bot-btn" onClick={() => setBotKeyVisible(v => !v)}>
                      {botKeyVisible ? t({ en: "Hide", zh: "隐藏" }) : t({ en: "Show", zh: "显示" })}
                    </button>
                    <button type="button" className="up-bot-btn" onClick={handleCopyKey}>
                      {botCopied ? t({ en: "Copied!", zh: "已复制!" }) : t({ en: "Copy", zh: "复制" })}
                    </button>
                  </div>
                </div>
                <div className="up-bot-actions">
                  <button
                    type="button"
                    className={`up-bot-btn up-bot-btn--primary${botInfo.is_enabled ? " up-bot-btn--danger" : ""}`}
                    onClick={handleToggleBot}
                    disabled={botLoading}
                  >
                    {botLoading ? "..." : botInfo.is_enabled
                      ? t({ en: "Disable Bot", zh: "关闭 Bot" })
                      : t({ en: "Enable Bot", zh: "开启 Bot" })}
                  </button>
                  <button type="button" className="up-bot-btn" onClick={handleRegenerateKey} disabled={botLoading}>
                    {t({ en: "Regenerate Key", zh: "重新生成 Key" })}
                  </button>
                </div>
              </div>
            )}

            {false && showAgentPromptEditor && (
              <div className="up-agent-prompt">
                <div className="up-agent-prompt__head">
                  <h3>{t({ en: "Agent Prompt", zh: "Agent 提示词" })}</h3>
                  <span>AGENT</span>
                </div>
                <textarea
                  className="up-agent-prompt__textarea"
                  value={agentPrompt}
                  onChange={(e) => setAgentPrompt(e.target.value)}
                  placeholder={t({
                    en: "Write the system prompt for this agent...",
                    zh: "填写该 Agent 的系统提示词...",
                  })}
                  rows={6}
                  disabled={!agentPromptLoaded}
                />
                {promptError && (
                  <div className="up-agent-prompt__error">{promptError}</div>
                )}
                <button
                  type="button"
                  className="up-agent-prompt__save"
                  onClick={handleSaveAgentPrompt}
                  disabled={promptSaving || !agentPromptLoaded}
                >
                  {promptSaving ?
                    t({ en: "Saving...", zh: "保存中..." })
                  : t({ en: "Save Prompt", zh: "保存提示词" })}
                </button>
              </div>
            )}
            <div className="mt-5">
              <SimilarUsersPanel
                users={similarUsers}
                t={t}
                language={language}
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
