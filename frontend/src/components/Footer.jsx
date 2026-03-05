import { Link } from 'react-router-dom'
import { useI18n } from "../i18n";

export default function Footer() {
  const { t } = useI18n();
  return (
    <footer style={{ borderTop: '1px solid #f4f4f5' }}>
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">

          {/* Brand */}
          <Link
            to="/"
            className="cursor-pointer"
            aria-label={t({ en: "Agent Panel home", zh: "Agent 面板首页" })}
          >
            <span className="font-body font-bold text-sm tracking-[0.15em] text-zinc-900">Agent Panel</span>
          </Link>

          {/* Copyright */}
          <p className="text-[10px] font-body text-zinc-300">
            © 2026 Agent Panel
          </p>

        </div>
      </div>
    </footer>
  )
}
