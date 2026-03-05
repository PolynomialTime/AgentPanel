import { useEffect, useRef, useState } from "react";
import { BadgeCheck, MessageSquare, RefreshCw, Share2 } from "lucide-react";
import { useI18n } from "../i18n";

export default function ProfileCard({
  user,
  isFollowing,
  onToggleFollow,
  followDisabled = false,
  showFollowButton = true,
  isSelf = false,
  onAvatarSeedSave,
  onStartDm,
}) {
  const { t } = useI18n();
  const [localFollowing, setLocalFollowing] = useState(false);
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [seed, setSeed] = useState("");
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [shareToast, setShareToast] = useState(null);
  const shareToastTimerRef = useRef(null);

  const previewUrl =
    seed.trim() ?
      `https://api.dicebear.com/9.x/croodles/svg?seed=${encodeURIComponent(seed.trim())}`
    : null;

  const handle =
    user.handle ||
    user.username ||
    (user.name || "").toLowerCase().replace(/[^a-z0-9]/g, "") ||
    "user";

  const rawBio = (user.bio || "").trim();
  const metaTags =
    Array.isArray(user.metaTags) && user.metaTags.length > 0 ?
      user.metaTags
    : [];
  const bioText = rawBio;

  const following =
    typeof isFollowing === "boolean" ? isFollowing : localFollowing;

  useEffect(() => {
    return () => {
      if (shareToastTimerRef.current) {
        clearTimeout(shareToastTimerRef.current);
      }
    };
  }, []);

  function showShareToast(message, isError = false) {
    if (shareToastTimerRef.current) {
      clearTimeout(shareToastTimerRef.current);
    }

    setShareToast({ message, isError });

    shareToastTimerRef.current = setTimeout(() => {
      setShareToast(null);
      shareToastTimerRef.current = null;
    }, 1800);
  }

  function handleToggleFollow() {
    if (onToggleFollow) {
      onToggleFollow();
      return;
    }
    setLocalFollowing((f) => !f);
  }

  async function handleSaveAvatar() {
    if (!previewUrl || !onAvatarSeedSave) return;
    setSavingAvatar(true);
    try {
      await onAvatarSeedSave(previewUrl);
      setEditingAvatar(false);
      setSeed("");
    } finally {
      setSavingAvatar(false);
    }
  }

  function handleRandomizeAvatar() {
    setSeed(
      `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`,
    );
    setAvatarBroken(false);
  }

  function handleCancelAvatarEdit() {
    setEditingAvatar(false);
    setSeed("");
    setAvatarBroken(false);
  }

  async function handleShareProfile() {
    const profileSlug = user.username || handle;
    const profileUrl = `${window.location.origin}/user/${encodeURIComponent(profileSlug)}`;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(profileUrl);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = profileUrl;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }

      showShareToast(t({ en: "Link copied", zh: "链接已复制" }));
    } catch {
      showShareToast(
        t({
          en: "Copy failed. Please copy the URL manually.",
          zh: "复制失败，请手动复制链接。",
        }),
        true,
      );
    }
  }

  return (
    <div className="up-profile-card relative">
      <div className="up-profile-banner" />

      <div className="px-4">
        <div
          className={`up-avatar-ring -mt-10${user.online ? " is-online" : ""}`}
          style={isSelf ? { cursor: "pointer" } : {}}
          onClick={isSelf ? () => setEditingAvatar((v) => !v) : undefined}
          title={
            isSelf ? t({ en: "Change avatar", zh: "更改头像" }) : undefined
          }
        >
          {editingAvatar && previewUrl ?
            <img
              src={previewUrl}
              alt={user.name}
              className="up-avatar-inner"
            />
          : user.avatar_url && !avatarBroken ?
            <img
              src={user.avatar_url}
              alt={user.name}
              className="up-avatar-inner"
              onError={() => setAvatarBroken(true)}
            />
          : <div
              className="up-avatar-inner"
              aria-hidden="true"
            >
              {user.symbol || user.name.charAt(0).toUpperCase()}
            </div>
          }

          {isSelf && editingAvatar && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleRandomizeAvatar();
              }}
              className="cursor-pointer"
              aria-label={t({ en: "Random avatar", zh: "随机头像" })}
              title={t({ en: "Random avatar", zh: "随机头像" })}
              style={{
                position: "absolute",
                right: -6,
                bottom: -6,
                width: 24,
                height: 24,
                borderRadius: "999px",
                border: "1px solid #d4d4d8",
                background: "#fff",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#52525b",
                boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
              }}
            >
              <RefreshCw size={12} />
            </button>
          )}
        </div>

        {isSelf && editingAvatar && (
          <div
            style={{
              marginTop: "8px",
              display: "flex",
              gap: "6px",
            }}
          >
            <div style={{ display: "flex", gap: "8px", width: "100%" }}>
              <button
                onClick={handleSaveAvatar}
                disabled={!previewUrl || savingAvatar}
                style={{
                  flex: 1,
                  minHeight: "34px",
                  padding: "8px 14px",
                  background: "#18181b",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 600,
                  fontFamily: "Exo 2, sans-serif",
                  cursor:
                    previewUrl && !savingAvatar ? "pointer" : "not-allowed",
                  opacity: !previewUrl || savingAvatar ? 0.5 : 1,
                }}
              >
                {savingAvatar ? "…" : t({ en: "Save", zh: "保存" })}
              </button>
              <button
                onClick={handleCancelAvatarEdit}
                style={{
                  minHeight: "34px",
                  padding: "8px 14px",
                  background: "#fff",
                  color: "#71717a",
                  border: "1px solid #d4d4d8",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: 600,
                  fontFamily: "Exo 2, sans-serif",
                  cursor: "pointer",
                }}
              >
                {t({ en: "Cancel", zh: "取消" })}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="px-4 pt-3 pb-5">
        <div className="flex items-center gap-1.5">
          <span className="text-2xl font-bold text-zinc-900 leading-tight">
            {user.name}
          </span>
          {user.isVerified ?
            <BadgeCheck
              size={20}
              fill="#f97316"
              stroke="#fff"
              strokeWidth={2}
              className="shrink-0"
              aria-label={t({ en: "Verified", zh: "已认证" })}
            />
          : null}
          {user.roleLabel && (
            <span className="inline-flex items-center px-2 py-0.5 text-[10px] tracking-[0.08em] border border-zinc-200 text-zinc-600 rounded-sm">
              {user.roleLabel}
            </span>
          )}
        </div>

        <p className="text-sm text-zinc-500 mt-0.5">u/{handle}</p>

        {bioText && (
          <p className="mt-3 text-sm text-zinc-800 leading-relaxed">
            {bioText}
          </p>
        )}

        {metaTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {metaTags.map((tag) => (
              <span
                key={`meta-${tag}`}
                className="text-[10px] tracking-wider text-zinc-600 uppercase"
                style={{
                  border: "1px solid #e4e4e7",
                  padding: "3px 8px",
                  borderRadius: "4px",
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {user.tags && user.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {user.tags.map((tag) => (
              <span
                key={tag}
                className="text-[10px] tracking-wider text-zinc-600 uppercase"
                style={{
                  border: "1px solid #e4e4e7",
                  padding: "3px 8px",
                  borderRadius: "4px",
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <div
          className="grid grid-cols-4 gap-3 mt-4 pt-4"
          style={{ borderTop: "1px solid #f4f4f5" }}
        >
          {[
            [user.karma || "0", t({ en: "Karma", zh: "声望" })],
            [user.followers || "0", t({ en: "Followers", zh: "粉丝" })],
            [user.following || "0", t({ en: "Following", zh: "关注中" })],
            [user.posts || "0", t({ en: "Posts", zh: "帖子" })],
          ].map(([value, label]) => (
            <div
              key={label}
              className="text-center"
            >
              <div className="text-sm font-bold text-zinc-900">{value}</div>
              <div className="text-[10px] text-zinc-500 tracking-wider mt-0.5">
                {label.toUpperCase()}
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mt-5">
          {showFollowButton && (
            <button
              onClick={handleToggleFollow}
              disabled={followDisabled}
              className="flex-1 py-2.5 text-sm font-semibold cursor-pointer transition-all duration-200"
              style={{
                backgroundColor: following ? "#fff" : "#18181b",
                color: following ? "#18181b" : "#fff",
                border: following ? "1px solid #d4d4d8" : "1px solid #18181b",
                borderRadius: "8px",
                opacity: followDisabled ? 0.6 : 1,
              }}
            >
              {following ?
                t({ en: "Following", zh: "已关注" })
              : t({ en: "Follow", zh: "关注" })}
            </button>
          )}

          {typeof onStartDm === "function" && (
            <button
              onClick={onStartDm}
              className="px-4 py-2.5 text-sm border border-zinc-300 bg-white text-zinc-900
                       hover:bg-zinc-50 cursor-pointer transition-all duration-200
                       flex items-center justify-center rounded-lg"
              aria-label={t({ en: "Send private message", zh: "发起私信" })}
              title={t({ en: "Send private message", zh: "发起私信" })}
            >
              <MessageSquare size={16} />
            </button>
          )}

          <button
            onClick={handleShareProfile}
            className="px-4 py-2.5 text-sm border border-zinc-300 bg-white text-zinc-900
                       hover:bg-zinc-50 cursor-pointer transition-all duration-200
                       flex items-center justify-center rounded-lg"
            aria-label={t({ en: "Share profile", zh: "分享主页" })}
          >
            <Share2 size={16} />
          </button>
        </div>
      </div>

      {shareToast && (
        <div className="pointer-events-none absolute right-4 top-4 z-20">
          <div
            className={`text-xs rounded-md px-3 py-2 border shadow-sm backdrop-blur-sm ${
              shareToast.isError ?
                "bg-red-50/95 text-red-700 border-red-200"
              : "bg-white/95 text-zinc-700 border-zinc-200"
            }`}
            role="status"
            aria-live="polite"
          >
            {shareToast.message}
          </div>
        </div>
      )}
    </div>
  );
}
