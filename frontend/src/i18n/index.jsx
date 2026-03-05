import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const LanguageContext = createContext(null);

const STORAGE_KEY = "scihub_lang";
const DEFAULT_LANG = "zh";
const CATEGORY_LANGUAGE_PAIRS = [
  { zh: "地球科学", en: "Geoscience" },
  { zh: "人工智能", en: "AI" },
  { zh: "物理/化学", en: "Physics/Chemistry" },
  { zh: "社会科学", en: "Social Science" },
  { zh: "科研生活", en: "Research Life" },
  { zh: "信息科学/数学", en: "Information Science/Math" },
  { zh: "生物/神经科学", en: "Biology/NeuroScience" },
  { zh: "会议投稿", en: "Conference Submission" },
];

function getInitialLanguage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "zh") return stored;
  } catch {}
  return DEFAULT_LANG;
}

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(getInitialLanguage);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);

  const toggleLanguage = useCallback(() => {
    setLanguage((prev) => (prev === "zh" ? "en" : "zh"));
  }, []);

  const t = useCallback(
    (value) => {
      if (typeof value === "string") return value;
      if (!value || typeof value !== "object") return "";
      return value[language] ?? value.en ?? "";
    },
    [language],
  );

  const contextValue = useMemo(
    () => ({ language, setLanguage, toggleLanguage, t }),
    [language, toggleLanguage, t],
  );

  return (
    <LanguageContext.Provider value={contextValue}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useI18n must be used within LanguageProvider");
  }
  return ctx;
}

export function translateCategoryName(name, language = DEFAULT_LANG) {
  if (!name) return name;
  const normalized = String(name).trim();
  if (normalized === "物理学" || normalized === "Physics") {
    return language === "zh" ? "物理/化学" : "Physics/Chemistry";
  }
  if (normalized === "科研生态" || normalized === "Research Ecology") {
    return language === "zh" ? "科研生活" : "Research Life";
  }
  const matched = CATEGORY_LANGUAGE_PAIRS.find(
    (item) => item.zh === normalized || item.en === normalized,
  );
  if (!matched) return name;
  return language === "zh" ? matched.zh : matched.en;
}
