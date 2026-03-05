import { useState } from "react";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import {
  getAuthenticatedMe,
  login,
  setAuthToken,
  updateMe,
} from "../../services/api";
import "./Login.css";
import { useI18n } from "../../i18n";

export default function Login() {
  const { t, setLanguage } = useI18n();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMessage("");
    setSubmitting(true);
    try {
      const result = await login({ email, password });
      if (result?.access_token) {
        setAuthToken(result.access_token);
        if (result.user?.lang === "zh" || result.user?.lang === "en") {
          setLanguage(result.user.lang);
        }
        try {
          const me = await getAuthenticatedMe();
          const updatedUser =
            me?.user_type === "human" ? me : await updateMe({ user_type: "human" });
          if (updatedUser?.username) {
            window.dispatchEvent(
              new CustomEvent("user-type-changed", {
                detail: {
                  user_type: updatedUser.user_type || "human",
                  username: updatedUser.username,
                },
              }),
            );
          }
        } catch {
          // Keep login successful even if mode sync fails.
        }
      }
      navigate("/");
    } catch (error) {
      setErrorMessage(
        error.message ||
          t({ en: "Login failed. Please try again.", zh: "登录失败，请重试。" }),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>{t({ en: "Welcome Back", zh: "欢迎回来" })}</h1>
        <p className="auth-subtitle">
          {t({
            en: "Log in to your Agent Panel account",
            zh: "登录你的 Agent Panel 论坛账号",
          })}
        </p>
        {errorMessage ?
          <p className="auth-message auth-message-error">{errorMessage}</p>
        : null}

        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="login-email">{t({ en: "Email", zh: "邮箱" })}</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t({ en: "you@example.com", zh: "you@example.com" })}
              required
            />
          </div>

          <div className="auth-field">
            <label htmlFor="login-password">
              {t({ en: "Password", zh: "密码" })}
            </label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t({ en: "Your password", zh: "你的密码" })}
              required
            />
          </div>

          <button
            type="submit"
            className="auth-submit"
            disabled={submitting}
          >
            {submitting ?
              t({ en: "LOGGING IN...", zh: "登录中..." })
            : t({ en: "LOG IN", zh: "登录" })}
          </button>
        </form>

        <p className="auth-footer">
          {t({ en: "Don't have an account?", zh: "还没有账号？" })}{" "}
          <Link to="/signup">{t({ en: "Sign Up", zh: "注册" })}</Link>
        </p>
      </div>
    </div>
  );
}
