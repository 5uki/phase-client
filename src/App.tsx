import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  FluentProvider,
  webDarkTheme,
  webLightTheme,
} from "@fluentui/react-components";
import { AppShell } from "./components/layout/AppShell";
import { SetupPage } from "./components/auth/SetupPage";
import { TokenListPage } from "./components/tokens/TokenListPage";
import { SettingsPage } from "./components/settings/SettingsPage";
import { useAppStore } from "./store/appStore";
import { cmdRestoreSession } from "./lib/tauri";
import "./App.css";

function AppRoutes() {
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const navigate = useNavigate();
  const location = useLocation();

  // Session restore: check for cached session on startup
  useEffect(() => {
    if (isAuthenticated) return;
    cmdRestoreSession()
      .then((data) => {
        if (data) {
          navigate("/setup", {
            state: { restoreData: data },
            replace: true,
          });
        }
      })
      .catch(() => {
        // No session or error — normal setup flow
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.16, ease: "easeOut" }}
        style={{ height: "100%", display: "flex", flexDirection: "column" }}
      >
        <Routes location={location}>
          {/* Auth / setup */}
          <Route path="/setup" element={<SetupPage />} />

          {/* App routes — require auth */}
          <Route
            path="/"
            element={
              isAuthenticated ? <AppShell /> : <Navigate to="/setup" replace />
            }
          >
            <Route index element={<TokenListPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/setup" replace />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

function App() {
  const themePreference = useAppStore((s) => s.theme);
  const [isDark, setIsDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  // Listen for OS theme changes
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const resolvedDark =
    themePreference === "dark"
      ? true
      : themePreference === "light"
        ? false
        : isDark;

  const theme = resolvedDark ? webDarkTheme : webLightTheme;

  return (
    <FluentProvider theme={theme} style={{ height: "100dvh" }}>
      <AppRoutes />
    </FluentProvider>
  );
}

export default App;
