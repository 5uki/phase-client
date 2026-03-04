import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Card,
  Input,
  Button,
  Title1,
  Title2,
  Body1,
  Body2,
  Caption1,
  makeStyles,
  tokens,
  Divider,
  Spinner,
  MessageBar,
  MessageBarBody,
} from "@fluentui/react-components";
import {
  ShieldKeyhole24Regular,
  Globe24Regular,
  QrCode24Regular,
  ChevronLeft24Regular,
  Mail24Regular,
  LockClosed24Regular,
  ArrowRight24Regular,
  Link24Regular,
  Key24Regular,
} from "@fluentui/react-icons";
import { useAppStore } from "../../store/appStore";
import {
  cmdHealth,
  cmdShSetup,
  cmdShOpen,
  type RestoreResult,
} from "../../lib/tauri";
import type { Token } from "../../types";

type SetupView =
  | "home"
  | "cloud-login"
  | "cloud-register"
  | "selfhosted-url"     // Step 1: URL + Instance Token
  | "selfhosted-init"    // Step 2a: first-time, set master password
  | "selfhosted-login"   // Step 2b: existing vault, enter master password
  | "cached-unlock"      // Session restore: enter password to decrypt local vault
  | "qr";

const useStyles = makeStyles({
  page: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100dvh",
    overflowY: "auto",
    padding: "24px",
    backgroundColor: tokens.colorNeutralBackground2,
  },
  card: {
    width: "100%",
    maxWidth: "440px",
    padding: "40px 36px",
  },

  brand: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "12px",
    marginBottom: "36px",
  },
  brandIcon: {
    width: "56px",
    height: "56px",
    borderRadius: "14px",
    background: `linear-gradient(135deg, ${tokens.colorBrandBackground} 0%, ${tokens.colorBrandBackgroundHover} 100%)`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: tokens.colorNeutralForegroundOnBrand,
    boxShadow: tokens.shadow8,
  },
  tagline: {
    color: tokens.colorNeutralForeground3,
    textAlign: "center" as const,
  },

  backButton: {
    marginBottom: "20px",
    marginLeft: "-8px",
  },

  actions: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  primaryBtn: {
    height: "52px",
    fontSize: "15px",
    fontWeight: 600,
  },
  secondaryBtn: {
    height: "44px",
  },
  qrBtn: {
    height: "40px",
    color: tokens.colorNeutralForeground3,
  },
  orDivider: {
    marginTop: "4px",
    marginBottom: "4px",
  },

  viewTitle: {
    marginBottom: "24px",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  formFooter: {
    textAlign: "center" as const,
    marginTop: "8px",
  },
  switchLink: {
    cursor: "pointer",
    color: tokens.colorBrandForeground1,
    textDecoration: "underline",
    background: "none",
    border: "none",
    padding: 0,
    fontSize: "inherit",
    fontFamily: "inherit",
  },

  qrPlaceholder: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "16px",
    paddingTop: "16px",
    paddingBottom: "8px",
  },
  qrFrame: {
    width: "200px",
    height: "200px",
    border: `2px dashed ${tokens.colorNeutralStroke1}`,
    borderRadius: "12px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  loadingRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "12px",
    height: "52px",
  },
});

export function SetupPage() {
  const styles = useStyles();
  const navigate = useNavigate();
  const {
    serverUrl,
    instanceToken: storedInstanceToken,
    setServerUrl,
    setConnectionMode,
    setSession,
    setVaultData,
  } = useAppStore();
  const location = useLocation();

  const [view, setView] = useState<SetupView>("home");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Session restore data passed via navigation state from App.tsx
  const [cachedSession, setCachedSession] = useState<RestoreResult | null>(null);

  // Cloud fields
  const [cloudEmail, setCloudEmail] = useState("");
  const [cloudPassword, setCloudPassword] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");

  // Self-hosted fields
  const [shUrl, setShUrl] = useState(serverUrl === "https://cloud.phase.app" ? "" : serverUrl);
  const [instanceToken, setInstanceToken] = useState(storedInstanceToken ?? "");
  const [instanceSalt, setInstanceSalt] = useState("");
  const [masterPassword, setMasterPassword] = useState("");
  const [masterConfirm, setMasterConfirm] = useState("");

  const goHome = () => {
    setView("home");
    setError("");
    setBusy(false);
    setCachedSession(null);
  };

  // Check if we arrived with a cached session for quick unlock
  useEffect(() => {
    const state = location.state as { restoreData?: RestoreResult } | null;
    if (state?.restoreData) {
      setCachedSession(state.restoreData);
      setShUrl(state.restoreData.serverUrl);
      setInstanceToken(state.restoreData.instanceToken ?? "");
      setView("cached-unlock");
    }
  }, [location.state]); // eslint-disable-line react-hooks/exhaustive-deps

  function parseVaultTokens(vaultJson: string): Token[] {
    try {
      const vault = JSON.parse(vaultJson);
      return Array.isArray(vault?.tokens) ? vault.tokens : [];
    } catch {
      return [];
    }
  }

  // ── Cloud login ────────────────────────────────────────────
  const handleCloudLogin = async () => {
    setError("Phase Cloud is not available in this build.");
  };

  // ── Cloud register ─────────────────────────────────────────
  const handleCloudRegister = async () => {
    setError("Phase Cloud is not available in this build.");
  };

  // ── Self-hosted: verify URL + Instance Token ───────────────
  const handleCheckServer = async () => {
    if (!shUrl.trim() || !instanceToken.trim()) return;
    setBusy(true);
    setError("");
    try {
      const health = await cmdHealth(shUrl, instanceToken);
      setInstanceSalt(health.instanceSalt);
      setBusy(false);
      setView(health.initialized ? "selfhosted-login" : "selfhosted-init");
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  // ── Self-hosted: initialise vault (first time) ─────────────
  const handleSelfHostedInit = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await cmdShSetup(shUrl, instanceToken, instanceSalt, masterPassword);
      setServerUrl(shUrl);
      setConnectionMode("selfhosted");
      setSession(result.handle, result.jwt, instanceToken, result.vaultVersion);
      setVaultData([], result.vaultVersion);
      navigate("/");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  // ── Self-hosted: login to existing vault ───────────────────
  const handleSelfHostedLogin = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await cmdShOpen(shUrl, instanceToken, instanceSalt, masterPassword);
      setServerUrl(shUrl);
      setConnectionMode("selfhosted");
      setSession(result.handle, result.jwt, instanceToken, result.vaultVersion);
      setVaultData(parseVaultTokens(result.vaultJson), result.vaultVersion);
      navigate("/");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  // ── Cached unlock: re-derive keys, decrypt local vault ────
  const handleCachedUnlock = async () => {
    if (!cachedSession) return;
    setBusy(true);
    setError("");
    try {
      // Always need to: fetch instanceSalt → re-derive keys → create new session
      // (crypto keys are zeroized on process exit, so cmdShOpen is always required)
      const health = await cmdHealth(cachedSession.serverUrl, cachedSession.instanceToken ?? undefined);
      const result = await cmdShOpen(
        cachedSession.serverUrl,
        cachedSession.instanceToken ?? "",
        health.instanceSalt,
        masterPassword
      );
      setServerUrl(cachedSession.serverUrl);
      setConnectionMode(cachedSession.connectionMode === "self-hosted" || cachedSession.connectionMode === "selfhosted" ? "selfhosted" : "cloud");
      setSession(result.handle, result.jwt, cachedSession.instanceToken, result.vaultVersion);
      setVaultData(parseVaultTokens(result.vaultJson), result.vaultVersion);
      navigate("/");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const BackButton = () => (
    <Button
      className={styles.backButton}
      appearance="subtle"
      icon={<ChevronLeft24Regular />}
      onClick={goHome}
    >
      Back
    </Button>
  );

  const BrandHeader = () => (
    <div className={styles.brand}>
      <div className={styles.brandIcon}>
        <ShieldKeyhole24Regular fontSize={28} />
      </div>
      <Title1>Phase</Title1>
      <Caption1 className={styles.tagline}>
        End-to-end encrypted 2FA vault
      </Caption1>
    </div>
  );

  const ErrorBar = () =>
    error ? (
      <MessageBar intent="error">
        <MessageBarBody>{error}</MessageBarBody>
      </MessageBar>
    ) : null;

  // ── Home ───────────────────────────────────────────────────
  if (view === "home") {
    return (
      <div className={styles.page}>
        <Card className={styles.card}>
          <BrandHeader />
          <div className={styles.actions}>
            <Button
              className={styles.primaryBtn}
              appearance="primary"
              size="large"
              icon={<ArrowRight24Regular />}
              iconPosition="after"
              onClick={() => setView("cloud-login")}
            >
              Connect to Phase
            </Button>

            <Divider className={styles.orDivider}>or</Divider>

            <Button
              className={styles.secondaryBtn}
              appearance="outline"
              icon={<Link24Regular />}
              onClick={() => setView("selfhosted-url")}
            >
              Connect to other server
            </Button>

            <Button
              className={styles.qrBtn}
              appearance="subtle"
              icon={<QrCode24Regular />}
              onClick={() => setView("qr")}
            >
              Scan QR code
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // ── Cloud: login ───────────────────────────────────────────
  if (view === "cloud-login") {
    const canSubmit = cloudEmail.trim() && cloudPassword;
    return (
      <div className={styles.page}>
        <Card className={styles.card}>
          <BackButton />
          <Title2 className={styles.viewTitle}>Sign in to Phase</Title2>
          <div className={styles.form}>
            <ErrorBar />
            <Input
              placeholder="Email"
              type="email"
              value={cloudEmail}
              onChange={(_, d) => setCloudEmail(d.value)}
              contentBefore={<Mail24Regular />}
              size="large"
            />
            <Input
              placeholder="Password"
              type="password"
              value={cloudPassword}
              onChange={(_, d) => setCloudPassword(d.value)}
              contentBefore={<LockClosed24Regular />}
              size="large"
            />
            {busy ? (
              <div className={styles.loadingRow}>
                <Spinner size="small" label="Signing in..." />
              </div>
            ) : (
              <Button
                appearance="primary"
                size="large"
                onClick={handleCloudLogin}
                disabled={!canSubmit}
              >
                Sign in
              </Button>
            )}
            <Body2 className={styles.formFooter}>
              Don&apos;t have an account?{" "}
              <button
                className={styles.switchLink}
                onClick={() => setView("cloud-register")}
              >
                Create one
              </button>
            </Body2>
          </div>
        </Card>
      </div>
    );
  }

  // ── Cloud: register ────────────────────────────────────────
  if (view === "cloud-register") {
    const canSubmit =
      regEmail.trim() &&
      regPassword.length >= 8 &&
      regPassword === regConfirm;
    return (
      <div className={styles.page}>
        <Card className={styles.card}>
          <BackButton />
          <Title2 className={styles.viewTitle}>Create Phase account</Title2>
          <div className={styles.form}>
            <ErrorBar />
            <Input
              placeholder="Email"
              type="email"
              value={regEmail}
              onChange={(_, d) => setRegEmail(d.value)}
              contentBefore={<Mail24Regular />}
              size="large"
            />
            <Input
              placeholder="Master password (min 8 chars)"
              type="password"
              value={regPassword}
              onChange={(_, d) => setRegPassword(d.value)}
              contentBefore={<LockClosed24Regular />}
              size="large"
            />
            <Input
              placeholder="Confirm master password"
              type="password"
              value={regConfirm}
              onChange={(_, d) => setRegConfirm(d.value)}
              contentBefore={<LockClosed24Regular />}
              size="large"
            />
            {busy ? (
              <div className={styles.loadingRow}>
                <Spinner size="small" label="Creating account..." />
              </div>
            ) : (
              <Button
                appearance="primary"
                size="large"
                onClick={handleCloudRegister}
                disabled={!canSubmit}
              >
                Create account
              </Button>
            )}
            <Body2 className={styles.formFooter}>
              Already have an account?{" "}
              <button
                className={styles.switchLink}
                onClick={() => setView("cloud-login")}
              >
                Sign in
              </button>
            </Body2>
          </div>
        </Card>
      </div>
    );
  }

  // ── Self-hosted: Step 1 — URL + Instance Token ─────────────
  if (view === "selfhosted-url") {
    const canSubmit = shUrl.trim() && instanceToken.trim();
    return (
      <div className={styles.page}>
        <Card className={styles.card}>
          <BackButton />
          <Title2 className={styles.viewTitle}>Connect to server</Title2>
          <div className={styles.form}>
            <ErrorBar />
            <Input
              placeholder="https://phase.yourdomain.com"
              value={shUrl}
              onChange={(_, d) => setShUrl(d.value)}
              contentBefore={<Globe24Regular />}
              size="large"
            />
            <Input
              placeholder="Instance Token (from /api/v1/setup-token)"
              type="password"
              value={instanceToken}
              onChange={(_, d) => setInstanceToken(d.value)}
              contentBefore={<Key24Regular />}
              size="large"
            />
            {busy ? (
              <div className={styles.loadingRow}>
                <Spinner size="small" label="Checking server..." />
              </div>
            ) : (
              <Button
                appearance="primary"
                size="large"
                onClick={handleCheckServer}
                disabled={!canSubmit}
              >
                Continue
              </Button>
            )}
          </div>
        </Card>
      </div>
    );
  }

  // ── Self-hosted: Step 2a — first-time vault setup ──────────
  if (view === "selfhosted-init") {
    const canSubmit =
      masterPassword.length >= 8 && masterPassword === masterConfirm;
    return (
      <div className={styles.page}>
        <Card className={styles.card}>
          <Button
            className={styles.backButton}
            appearance="subtle"
            icon={<ChevronLeft24Regular />}
            onClick={() => setView("selfhosted-url")}
          >
            Back
          </Button>
          <Title2 className={styles.viewTitle}>Set up your vault</Title2>
          <Body1
            style={{
              color: tokens.colorNeutralForeground3,
              marginBottom: "20px",
            }}
          >
            This server has no vault yet. Choose a master password to encrypt
            your data — it never leaves your device.
          </Body1>
          <div className={styles.form}>
            <ErrorBar />
            <Input
              placeholder="Master password (min 8 chars)"
              type="password"
              value={masterPassword}
              onChange={(_, d) => setMasterPassword(d.value)}
              contentBefore={<LockClosed24Regular />}
              size="large"
            />
            <Input
              placeholder="Confirm master password"
              type="password"
              value={masterConfirm}
              onChange={(_, d) => setMasterConfirm(d.value)}
              contentBefore={<LockClosed24Regular />}
              size="large"
            />
            {busy ? (
              <div className={styles.loadingRow}>
                <Spinner size="small" label="Setting up vault..." />
              </div>
            ) : (
              <Button
                appearance="primary"
                size="large"
                onClick={handleSelfHostedInit}
                disabled={!canSubmit}
              >
                Create vault
              </Button>
            )}
          </div>
        </Card>
      </div>
    );
  }

  // ── Self-hosted: Step 2b — login to existing vault ─────────
  if (view === "selfhosted-login") {
    const canSubmit = masterPassword.length > 0;
    return (
      <div className={styles.page}>
        <Card className={styles.card}>
          <Button
            className={styles.backButton}
            appearance="subtle"
            icon={<ChevronLeft24Regular />}
            onClick={() => setView("selfhosted-url")}
          >
            Back
          </Button>
          <Title2 className={styles.viewTitle}>Unlock vault</Title2>
          <Body1
            style={{
              color: tokens.colorNeutralForeground3,
              marginBottom: "20px",
            }}
          >
            {shUrl}
          </Body1>
          <div className={styles.form}>
            <ErrorBar />
            <Input
              placeholder="Master password"
              type="password"
              value={masterPassword}
              onChange={(_, d) => setMasterPassword(d.value)}
              contentBefore={<LockClosed24Regular />}
              size="large"
            />
            {busy ? (
              <div className={styles.loadingRow}>
                <Spinner size="small" label="Unlocking..." />
              </div>
            ) : (
              <Button
                appearance="primary"
                size="large"
                onClick={handleSelfHostedLogin}
                disabled={!canSubmit}
              >
                Unlock
              </Button>
            )}
          </div>
        </Card>
      </div>
    );
  }

  // ── Cached unlock: quick password entry ─────────────────────
  if (view === "cached-unlock" && cachedSession) {
    const canSubmit = masterPassword.length > 0;
    return (
      <div className={styles.page}>
        <Card className={styles.card}>
          <Button
            className={styles.backButton}
            appearance="subtle"
            icon={<ChevronLeft24Regular />}
            onClick={goHome}
          >
            Back
          </Button>
          <Title2 className={styles.viewTitle}>Welcome back</Title2>
          <Body1
            style={{
              color: tokens.colorNeutralForeground3,
              marginBottom: "20px",
            }}
          >
            {cachedSession.serverUrl}
          </Body1>
          <div className={styles.form}>
            <ErrorBar />
            <Input
              placeholder="Master password"
              type="password"
              value={masterPassword}
              onChange={(_, d) => setMasterPassword(d.value)}
              contentBefore={<LockClosed24Regular />}
              size="large"
            />
            {busy ? (
              <div className={styles.loadingRow}>
                <Spinner size="small" label="Unlocking..." />
              </div>
            ) : (
              <Button
                appearance="primary"
                size="large"
                onClick={handleCachedUnlock}
                disabled={!canSubmit}
              >
                Unlock
              </Button>
            )}
            <Body2 className={styles.formFooter}>
              <button
                className={styles.switchLink}
                onClick={goHome}
              >
                Use a different server
              </button>
            </Body2>
          </div>
        </Card>
      </div>
    );
  }

  // ── QR scan ────────────────────────────────────────────────
  if (view === "qr") {
    return (
      <div className={styles.page}>
        <Card className={styles.card}>
          <BackButton />
          <Title2 className={styles.viewTitle}>Scan QR code</Title2>
          <Body1
            style={{ color: tokens.colorNeutralForeground3, marginBottom: "16px" }}
          >
            Scan the QR code shown in your Phase server dashboard or deployment
            page to connect automatically.
          </Body1>
          <div className={styles.qrPlaceholder}>
            <div className={styles.qrFrame}>
              <QrCode24Regular fontSize={48} style={{ opacity: 0.3 }} />
            </div>
            <Body2 style={{ color: tokens.colorNeutralForeground3 }}>
              Camera permission required
            </Body2>
            <Button appearance="primary" disabled>
              Open Camera
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return null;
}
