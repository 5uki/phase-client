import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  FluentProvider,
  webDarkTheme,
  webLightTheme,
  Button,
  Card,
  MessageBar,
  MessageBarBody,
  Spinner,
  Title2,
  Body2,
} from "@fluentui/react-components";
import { AppShell } from "./components/layout/AppShell";
import { SetupPage } from "./components/auth/SetupPage";
import { TokenListPage } from "./components/tokens/TokenListPage";
import { SettingsPage } from "./components/settings/SettingsPage";
import { useAppStore } from "./store/appStore";
import { cmdClearSession, cmdRestoreSession } from "./lib/tauri";
import { verifyBiometricUnlock, hasBiometricCredential } from "./lib/biometric";
import "./App.css";

function BiometricLockGate({
  onUnlock,
  onSignOut,
}: {
  onUnlock: () => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleUnlock = async () => {
    setBusy(true);
    setError("");
    try {
      await onUnlock();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100dvh", padding: 24 }}>
      <Card style={{ width: "100%", maxWidth: 420, padding: 28, display: "grid", gap: 12 }}>
        <Title2>验证身份</Title2>
        <Body2>请使用系统生物识别解锁，确保是本人在查看令牌。</Body2>
        {error ? (
          <MessageBar intent="error">
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        ) : null}
        <Button appearance="primary" onClick={handleUnlock} disabled={busy}>
          {busy ? <Spinner size="tiny" /> : "使用生物识别解锁"}
        </Button>
        <Button appearance="subtle" onClick={() => void onSignOut()}>
          改用主密码登录
        </Button>
      </Card>
    </div>
  );
}

function AppRoutes() {
  const { isAuthenticated, biometricLockEnabled, clearSession, sessionHandle } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [privacyLocked, setPrivacyLocked] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !biometricLockEnabled || !hasBiometricCredential()) {
      setPrivacyLocked(false);
      return;
    }
    setPrivacyLocked(true);
  }, [isAuthenticated, biometricLockEnabled]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible" && isAuthenticated && biometricLockEnabled) {
        setPrivacyLocked(true);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [isAuthenticated, biometricLockEnabled]);

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
        {privacyLocked ? (
          <BiometricLockGate
            onUnlock={async () => {
              await verifyBiometricUnlock();
              setPrivacyLocked(false);
            }}
            onSignOut={async () => {
              if (sessionHandle) {
                await cmdClearSession(sessionHandle);
              }
              clearSession();
              navigate("/setup", { replace: true });
            }}
          />
        ) : (
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
        )}
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
