import { useEffect, useRef } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import Home from "./pages/Home/Home";
import QuestionDetail from "./pages/QuestionDetail/QuestionDetail";
import UserProfile from "./pages/UserProfile/UserProfile";
import AboutUs from "./pages/AboutUs/AboutUs";
import Login from "./pages/Auth/Login";
import Signup from "./pages/Auth/Signup";
import ColumnDetail from "./pages/ColumnDetail/ColumnDetail";
import DirectMessages from "./pages/DirectMessages/DirectMessages";
import Messages from "./pages/Messages/Messages";
import SystemBroadcastAssistant from "./pages/SystemBroadcastAssistant/SystemBroadcastAssistant";
import Skills from "./pages/Skills/Skills";
import { trackPageView } from "./services/api";

const PAGE_VIEW_DEDUPE_WINDOW_MS = 10000;

function PageViewTracker() {
  const location = useLocation();
  const lastTrackedRef = useRef({ key: "", at: 0 });

  useEffect(() => {
    const key = `${location.pathname}${location.search}`;
    const now = Date.now();
    if (
      lastTrackedRef.current.key === key &&
      now - lastTrackedRef.current.at < PAGE_VIEW_DEDUPE_WINDOW_MS
    ) {
      return;
    }
    lastTrackedRef.current = { key, at: now };
    trackPageView({ path: key }).catch(() => {});
  }, [location.pathname, location.search]);

  return null;
}

function AppFrame() {
  const location = useLocation();
  const isStandalonePage =
    location.pathname === "/system-broadcast-assistant" ||
    location.pathname === "/skills" ||
    location.pathname.startsWith("/skills/");

  return (
    <div className="min-h-screen bg-white text-zinc-900 flex flex-col">
      {!isStandalonePage ?
        <Navbar />
      : null}
      <main className="flex-1">
        <Routes>
          <Route
            path="/"
            element={<Home />}
          />
          <Route
            path="/question/:id"
            element={<QuestionDetail />}
          />
          <Route
            path="/user/:username"
            element={<UserProfile />}
          />
          <Route
            path="/about"
            element={<AboutUs />}
          />
          <Route
            path="/column/:id"
            element={<ColumnDetail />}
          />
          <Route
            path="/login"
            element={<Login />}
          />
          <Route
            path="/signup"
            element={<Signup />}
          />
          <Route
            path="/messages"
            element={<Messages />}
          />
          <Route
            path="/dm"
            element={<DirectMessages />}
          />
          <Route
            path="/system-broadcast-assistant"
            element={<SystemBroadcastAssistant />}
          />
          <Route
            path="/skills"
            element={<Skills />}
          />
        </Routes>
      </main>
      {!isStandalonePage ?
        <Footer />
      : null}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <PageViewTracker />
      <AppFrame />
    </BrowserRouter>
  );
}
