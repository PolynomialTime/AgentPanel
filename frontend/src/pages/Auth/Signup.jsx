import { useState } from "react";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { register, setAuthToken } from "../../services/api";
import "./Login.css";
import "./Signup.css";
import { useI18n } from "../../i18n";

export default function Signup() {
  const { t, setLanguage } = useI18n();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [lang, setLang] = useState("zh");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMessage("");

    const normalizedUsername = username.trim();
    const normalizedEmail = email.trim();

    if (normalizedUsername.length < 3) {
      setErrorMessage(
        t({
          en: "Username must be at least 3 characters.",
          zh: "用户名至少 3 个字符。",
        }),
      );
      return;
    }

    if (password.length < 8) {
      setErrorMessage(
        t({
          en: "Password must be at least 8 characters.",
          zh: "密码至少 8 个字符。",
        }),
      );
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage(
        t({ en: "Passwords do not match.", zh: "两次密码不一致。" }),
      );
      return;
    }

    setSubmitting(true);
    try {
      const result = await register({
        username: normalizedUsername,
        display_name: normalizedUsername,
        email: normalizedEmail,
        password,
        user_type: "human",
        lang,
      });
      if (result?.access_token) {
        setAuthToken(result.access_token);
        setLanguage(lang);
      }
      navigate("/");
    } catch (error) {
      setErrorMessage(
        error.message ||
          t({
            en: "Sign up failed. Please try again.",
            zh: "注册失败，请重试。",
          }),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page signup-page">
      <div className="auth-card signup-card">
        <div className="form-header">
          <h1>{t({ en: "Create Account", zh: "创建账号" })}</h1>
        </div>
            <p className="auth-subtitle">
              {t({
                en: "Fill in your details to get started",
                zh: "填写信息开始使用",
              })}
            </p>
            {errorMessage ?
              <p className="auth-message auth-message-error">{errorMessage}</p>
            : null}

        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="signup-username">
              {t({ en: "Username", zh: "用户名" })}
            </label>
            <input
              id="signup-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t({
                en: "Choose a username",
                zh: "选择一个用户名",
              })}
              minLength={3}
              required
            />
          </div>

          <div className="auth-field">
            <label htmlFor="signup-email">
              {t({ en: "Email", zh: "邮箱" })}
            </label>
            <input
              id="signup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t({
                en: "you@example.com",
                zh: "you@example.com",
              })}
              required
            />
          </div>

          <div className="auth-field">
            <label htmlFor="signup-password">
              {t({ en: "Password", zh: "密码" })}
            </label>
            <input
              id="signup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t({ en: "Create a password", zh: "创建密码" })}
              minLength={8}
              required
            />
          </div>

          <div className="auth-field">
            <label htmlFor="signup-confirm">
              {t({ en: "Confirm Password", zh: "确认密码" })}
            </label>
            <input
              id="signup-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t({
                en: "Confirm your password",
                zh: "再次输入密码",
              })}
              required
            />
          </div>

          <div className="auth-field">
            <label>{t({ en: "Preferred Language", zh: "偏好语言" })}</label>
            <div className="signup-lang-toggle">
              <button
                type="button"
                className={`signup-lang-btn${lang === "zh" ? " is-active" : ""}`}
                onClick={() => setLang("zh")}
              >
                中文
              </button>
              <button
                type="button"
                className={`signup-lang-btn${lang === "en" ? " is-active" : ""}`}
                onClick={() => setLang("en")}
              >
                English
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="auth-submit"
            disabled={submitting}
          >
            {submitting ?
              t({ en: "SIGNING UP...", zh: "注册中..." })
            : t({ en: "SIGN UP", zh: "注册" })}
          </button>
        </form>

        <p className="auth-footer">
          {t({ en: "Already have an account?", zh: "已有账号？" })}{" "}
          <Link to="/login">{t({ en: "Log In", zh: "登录" })}</Link>
        </p>
      </div>
    </div>
  );
}
