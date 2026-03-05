import "./ColumnDetail.css";
import { useParams, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { BadgeCheck } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { getColumnById, incrementColumnView } from "../../services/api";
import { resolveRoleLabel } from "../../services/userIdentity";

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

function Avatar({ user, size = 32 }) {
  const label = user?.display_name || user?.username || "?";
  const initial = label.charAt(0).toUpperCase();
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [user?.avatar_url]);

  if (user?.avatar_url && !imageFailed) {
    return (
      <img
        src={user.avatar_url}
        alt={label}
        className="qd-avatar"
        style={{ width: size, height: size }}
        onError={() => setImageFailed(true)}
      />
    );
  }
  return (
    <div
      className="qd-avatar qd-avatar--fallback"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initial}
    </div>
  );
}

export default function ColumnDetail() {
  const { id } = useParams();
  const [column, setColumn] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        await incrementColumnView(id).catch(() => {});
        const data = await getColumnById(id);
        setColumn(data);
      } catch (e) {
        setError(e.message || "Failed to load column.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="qd-page">
        <div className="qd-loading">Loading column…</div>
      </div>
    );
  }

  if (error || !column) {
    return (
      <div className="qd-page">
        <div className="qd-not-found">
          <h1>Column not found</h1>
          <p>{error}</p>
          <Link
            to="/"
            className="qd-back-btn"
          >
            ← Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const author = column.author;
  const authorSlug = author?.username || column.author_id;

  return (
    <div className="qd-page">
      <div className="qd-shell">
        <main className="qd-main">
          <nav
            className="qd-breadcrumb"
            aria-label="Breadcrumb"
          >
            <Link
              to="/"
              className="qd-breadcrumb__link"
            >
              Home
            </Link>
            <span aria-hidden="true">/</span>
            <Link
              to="/?tag=column"
              className="qd-breadcrumb__link"
            >
              Columns
            </Link>
            <span aria-hidden="true">/</span>
            <span className="qd-breadcrumb__current">Article</span>
          </nav>

          <header className="qd-header">
            <p className="category-tag">column</p>
            <h1 className="qd-header__title">{column.title}</h1>

            {column.abstract && (
              <div className="qd-header__abstract qd-markdown">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                >
                  {column.abstract}
                </ReactMarkdown>
              </div>
            )}

            <div className="qd-header__body qd-markdown">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
              >
                {column.body}
              </ReactMarkdown>
            </div>

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
                    `user-${column.author_id}`}
                </Link>
                {author?.is_verified && (
                  <BadgeCheck
                    size={14}
                    fill="#f97316"
                    stroke="#fff"
                    strokeWidth={2}
                    className="qd-verified-icon"
                    aria-label="Verified"
                  />
                )}
              </span>
              <span
                className="qd-meta-dot"
                aria-hidden="true"
              >
                ·
              </span>
              <span>
                {formatTime(column.published_at || column.created_at)}
              </span>
              <span
                className="qd-meta-dot"
                aria-hidden="true"
              >
                ·
              </span>
              <span>{column.view_count ?? 0} views</span>
              <span
                className="qd-meta-dot"
                aria-hidden="true"
              >
                ·
              </span>
              <span>{column.like_count} likes</span>
              <span
                className="qd-meta-dot"
                aria-hidden="true"
              >
                ·
              </span>
              <span>{column.comment_count} comments</span>
            </div>
          </header>
        </main>

        <aside className="qd-sidebar">
          <div className="qd-author-card">
            <p className="qd-author-card__label">Written by</p>
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
                    `user-${column.author_id}`}
                </span>
                {author?.is_verified && (
                  <BadgeCheck
                    size={16}
                    fill="#f97316"
                    stroke="#fff"
                    strokeWidth={2}
                    className="qd-verified-icon"
                    aria-label="Verified"
                  />
                )}
                <span className="qd-author-role">
                  {resolveRoleLabel(author)}
                </span>
              </span>
            </p>
            <p className="qd-author-card__joined">
              Published {formatTime(column.published_at || column.created_at)}
            </p>
            <Link
              to={`/user/${authorSlug}`}
              className="qd-author-card__btn"
            >
              View Profile
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
