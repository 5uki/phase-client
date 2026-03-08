import { useEffect, useState, useCallback, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
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
  Body1,
  Caption1,
  makeStyles,
  tokens,
} from "@fluentui/react-components";
import {
  ShieldKeyhole24Regular,
  Fingerprint24Regular,
  SignOut24Regular,
} from "@fluentui/react-icons";
import { AppShell } from "./components/layout/AppShell";
import { SetupPage } from "./components/auth/SetupPage";
import { TokenListPage } from "./components/tokens/TokenListPage";
import { SettingsPage } from "./components/settings/SettingsPage";
import { SpotlightSearch } from "./components/SpotlightSearch";
import { useAppStore } from "./store/appStore";
import { cmdClearSession, cmdRestoreSession, cmdSetSpotlightShortcut } from "./lib/tauri";
import { verifyBiometricUnlock, hasBiometricCredential } from "./lib/biometric";
import "./App.css";

// ── Styles for BiometricLockGate ──────────────────────────────────────
const useLockStyles = makeStyles({
  page: {
    display: "grid",
    placeItems: "center",
    minHeight: "100dvh",
    padding: "24px",
    backgroundColor: tokens.colorNeutralBackground2,
  },
  card: {
    width: "100%",
    maxWidth: "420px",
    padding: "36px 32px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "20px",
    textAlign: "center" as const,
  },
  brandIcon: {
    width: "64px",
    height: "64px",
    borderRadius: "16px",
    background: `linear-gradient(135deg, ${tokens.colorBrandBackground} 0%, ${tokens.colorBrandBackgroundHover} 100%)`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: tokens.colorNeutralForegroundOnBrand,
    boxShadow: tokens.shadow8,
  },
  textBlock: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  subtitle: {
    color: tokens.colorNeutralForeground3,
  },
  unlockBtn: {
    width: "100%",
    height: "48px",
    fontSize: "15px",
    fontWeight: 600,
  },
  signOutBtn: {
    color: tokens.colorNeutralForeground3,
  },
  serverCaption: {
    color: tokens.colorNeutralForeground4,
  },
});

function BiometricLockGate({
  onUnlock,
  onSignOut,
  serverUrl,
}: {
  onUnlock: () => Promise<void>;
  onSignOut: () => Promise<void>;
  serverUrl?: string;
}) {
  const styles = useLockStyles();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const attemptedAutoRef = useRef(false);

  const handleUnlock = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      await onUnlock();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }, [onUnlock]);

  // Auto-trigger biometric prompt on first render
  useEffect(() => {
    if (attemptedAutoRef.current) return;
    attemptedAutoRef.current = true;
    handleUnlock();
  }, [handleUnlock]);

  return (
    <div className={styles.page}>
      <Card className={styles.card}>
        <div className={styles.brandIcon}>
          <ShieldKeyhole24Regular fontSize={32} />
        </div>

        <div className={styles.textBlock}>
          <Title2>Vault Locked</Title2>
          <Body1 className={styles.subtitle}>
            Verify your identity to access your 2FA tokens.
          </Body1>
        </div>

        {error ? (
          <MessageBar intent="error" style={{ width: "100%" }}>
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        ) : null}

        <Button
          className={styles.unlockBtn}
          appearance="primary"
          size="large"
          icon={busy ? undefined : <Fingerprint24Regular />}
          onClick={handleUnlock}
          disabled={busy}
        >
          {busy ? <Spinner size="tiny" /> : "Unlock with biometrics"}
        </Button>

        <Button
          className={styles.signOutBtn}
          appearance="subtle"
          size="small"
          icon={<SignOut24Regular />}
          onClick={() => void onSignOut()}
        >
          Sign out
        </Button>

        {serverUrl && (
          <Caption1 className={styles.serverCaption}>
            {serverUrl}
          </Caption1>
        )}
      </Card>
    </div>
  );
}

function AppRoutes() {
  const {
    isAuthenticated,
    biometricLockEnabled,
    clearSession,
    sessionHandle,
    serverUrl,
  } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [privacyLocked, setPrivacyLocked] = useState(false);

  // Set privacy lock when authenticated + biometric enabled
  useEffect(() => {
    if (!isAuthenticated || !biometricLockEnabled || !hasBiometricCredential()) {
      setPrivacyLocked(false);
      return;
    }
    setPrivacyLocked(true);
  }, [isAuthenticated, biometricLockEnabled]);

  // Re-lock when app returns to foreground
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
            serverUrl={serverUrl}
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

  // Initialize spotlight shortcut
  const spotlightShortcut = useAppStore((s) => s.spotlightShortcut);
  useEffect(() => {
    if (getCurrentWindow().label === "main") {
      cmdSetSpotlightShortcut(null, spotlightShortcut).catch(console.error);
    }
  }, [spotlightShortcut]);

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

  if (getCurrentWindow().label === "spotlight") {
    return <SpotlightSearch />;
  }

  return (
    <FluentProvider theme={theme} style={{ height: "100dvh" }}>
      <AppRoutes />
    </FluentProvider>
  );
}

export default App;
