import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  makeStyles,
  tokens,
  Card,
  Title3,
  Body1,
  Body2,
  Caption1,
  Button,
  Switch,
  Dropdown,
  Option,
  Divider,
  Spinner,
} from "@fluentui/react-components";
import {
  Person24Regular,
  ShieldLock24Regular,
  ArrowDownload24Regular,
  Laptop24Regular,
  Info24Regular,
  SignOut24Regular,
  LockClosed24Regular,
  Fingerprint24Regular,
  Timer24Regular,
  ArrowUpload24Regular,
  Globe24Regular,
  Delete24Regular,
  WeatherSunny24Regular,
  WeatherMoon24Regular,
  Desktop24Regular,
} from "@fluentui/react-icons";
import { useAppStore } from "../../store/appStore";
import type { ThemePreference } from "../../types";
import {
  cmdLogout,
  cmdGetSessions,
  cmdDeleteSession,
  cmdTotpStopTicker,
  type DeviceSession,
} from "../../lib/tauri";
import {
  registerBiometricCredential,
  clearBiometricCredential,
  hasBiometricCredential,
} from "../../lib/biometric";

const useStyles = makeStyles({
  container: {
    padding: "24px",
    maxWidth: "640px",
    display: "flex",
    flexDirection: "column",
    gap: "24px",
    paddingBottom: "40px",
    height: "100%",
    overflowY: "auto",
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  sectionTitle: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "8px",
    color: tokens.colorBrandForeground1,
  },
  card: {
    padding: "4px 0",
  },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    gap: "16px",
  },
  rowLeft: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    flex: 1,
    minWidth: 0,
  },
  rowIcon: {
    color: tokens.colorNeutralForeground3,
    flexShrink: 0,
  },
  rowText: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  rowLabel: {
    fontWeight: 600,
  },
  rowDesc: {
    color: tokens.colorNeutralForeground3,
  },
  deviceList: {
    display: "flex",
    flexDirection: "column",
    gap: "0",
  },
  deviceRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
  },
  deviceInfo: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  currentBadge: {
    fontSize: "11px",
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    padding: "2px 8px",
    borderRadius: "4px",
    marginLeft: "8px",
  },
  dangerButton: {
    color: tokens.colorPaletteRedForeground1,
  },
  version: {
    textAlign: "center" as const,
    color: tokens.colorNeutralForeground3,
    padding: "8px",
  },
  sessionsLoading: {
    display: "flex",
    justifyContent: "center",
    padding: "16px",
  },
});

export function SettingsPage() {
  const styles = useStyles();
  const navigate = useNavigate();
  const {
    theme,
    setTheme,
    biometricLockEnabled,
    setBiometricLockEnabled,
    serverUrl,
    sessionHandle,
    jwt,
    instanceToken,
    clearSession,
  } = useAppStore();

  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);

  // Load device list when page mounts
  useEffect(() => {
    if (!jwt) return;
    setSessionsLoading(true);
    cmdGetSessions(serverUrl, jwt, instanceToken ?? undefined)
      .then((resp) => setSessions(resp.sessions))
      .catch(console.error)
      .finally(() => setSessionsLoading(false));
  }, [jwt, serverUrl, instanceToken]);

  const handleLogout = async () => {
    setLogoutBusy(true);
    try {
      await cmdTotpStopTicker();
      if (sessionHandle && jwt) {
        await cmdLogout(serverUrl, jwt, instanceToken ?? undefined, sessionHandle);
      }
    } catch (e) {
      console.error("Logout error:", e);
    } finally {
      clearSession();
      setLogoutBusy(false);
      navigate("/setup", { replace: true });
    }
  };

  const handleBiometricToggle = async (_ev: unknown, data: { checked: boolean }) => {
    const enabled = Boolean(data.checked);
    setBiometricBusy(true);
    try {
      if (enabled) {
        await registerBiometricCredential();
        setBiometricLockEnabled(true);
      } else {
        clearBiometricCredential();
        setBiometricLockEnabled(false);
      }
    } catch (e) {
      console.error("Biometric setup error:", e);
      if (!enabled) {
        clearBiometricCredential();
      }
      setBiometricLockEnabled(false);
    } finally {
      setBiometricBusy(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    if (!jwt) return;
    try {
      await cmdDeleteSession(serverUrl, jwt, instanceToken ?? undefined, sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (e) {
      console.error("Revoke session error:", e);
    }
  };

  return (
    <div className={styles.container}>
      <Title3>Settings</Title3>

      {/* Account */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          <Person24Regular />
          <Body2>Account</Body2>
        </div>
        <Card className={styles.card}>
          <div className={styles.row}>
            <div className={styles.rowLeft}>
              <Globe24Regular className={styles.rowIcon} />
              <div className={styles.rowText}>
                <Body1 className={styles.rowLabel}>Server</Body1>
                <Caption1 className={styles.rowDesc}>
                  {serverUrl}
                </Caption1>
              </div>
            </div>
          </div>
          <Divider />
          <div className={styles.row}>
            <div className={styles.rowLeft}>
              <LockClosed24Regular className={styles.rowIcon} />
              <div className={styles.rowText}>
                <Body1 className={styles.rowLabel}>Change master password</Body1>
                <Caption1 className={styles.rowDesc}>
                  Update your vault encryption password
                </Caption1>
              </div>
            </div>
            <Button appearance="subtle" size="small">
              Change
            </Button>
          </div>
          <Divider />
          <div className={styles.row}>
            <div className={styles.rowLeft}>
              <SignOut24Regular className={styles.rowIcon} />
              <div className={styles.rowText}>
                <Body1 className={styles.rowLabel}>Sign out</Body1>
                <Caption1 className={styles.rowDesc}>
                  Lock vault and return to setup
                </Caption1>
              </div>
            </div>
            <Button
              appearance="subtle"
              size="small"
              onClick={handleLogout}
              disabled={logoutBusy}
            >
              {logoutBusy ? <Spinner size="tiny" /> : "Sign out"}
            </Button>
          </div>
        </Card>
      </div>

      {/* Appearance */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          <WeatherSunny24Regular />
          <Body2>Appearance</Body2>
        </div>
        <Card className={styles.card}>
          <div className={styles.row}>
            <div className={styles.rowLeft}>
              {theme === "dark" ? (
                <WeatherMoon24Regular className={styles.rowIcon} />
              ) : theme === "light" ? (
                <WeatherSunny24Regular className={styles.rowIcon} />
              ) : (
                <Desktop24Regular className={styles.rowIcon} />
              )}
              <div className={styles.rowText}>
                <Body1 className={styles.rowLabel}>Theme</Body1>
                <Caption1 className={styles.rowDesc}>
                  Choose light, dark, or follow system setting
                </Caption1>
              </div>
            </div>
            <Dropdown
              value={
                theme === "system"
                  ? "Follow system"
                  : theme === "light"
                    ? "Light"
                    : "Dark"
              }
              onOptionSelect={(_, data) =>
                setTheme((data.optionValue as ThemePreference) ?? "system")
              }
              style={{ minWidth: "130px" }}
            >
              <Option value="system">Follow system</Option>
              <Option value="light">Light</Option>
              <Option value="dark">Dark</Option>
            </Dropdown>
          </div>
        </Card>
      </div>

      {/* Security */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          <ShieldLock24Regular />
          <Body2>Security</Body2>
        </div>
        <Card className={styles.card}>
          <div className={styles.row}>
            <div className={styles.rowLeft}>
              <Fingerprint24Regular className={styles.rowIcon} />
              <div className={styles.rowText}>
                <Body1 className={styles.rowLabel}>Biometric unlock</Body1>
                <Caption1 className={styles.rowDesc}>
                  Use device biometrics to unlock when app returns to foreground
                </Caption1>
              </div>
            </div>
            <Switch
              checked={biometricLockEnabled && hasBiometricCredential()}
              onChange={handleBiometricToggle}
              disabled={biometricBusy}
            />
          </div>
          <Divider />
          <div className={styles.row}>
            <div className={styles.rowLeft}>
              <Timer24Regular className={styles.rowIcon} />
              <div className={styles.rowText}>
                <Body1 className={styles.rowLabel}>Auto-lock timeout</Body1>
                <Caption1 className={styles.rowDesc}>
                  Automatically lock vault after inactivity
                </Caption1>
              </div>
            </div>
            <Dropdown
              defaultValue="5 minutes"
              style={{ minWidth: "120px" }}
            >
              <Option>1 minute</Option>
              <Option>5 minutes</Option>
              <Option>15 minutes</Option>
              <Option>30 minutes</Option>
              <Option>Never</Option>
            </Dropdown>
          </div>
        </Card>
      </div>

      {/* Data */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          <ArrowDownload24Regular />
          <Body2>Data</Body2>
        </div>
        <Card className={styles.card}>
          <div className={styles.row}>
            <div className={styles.rowLeft}>
              <ArrowUpload24Regular className={styles.rowIcon} />
              <div className={styles.rowText}>
                <Body1 className={styles.rowLabel}>Import tokens</Body1>
                <Caption1 className={styles.rowDesc}>
                  Import from Google Authenticator, Aegis, 2FAS, or otpauth://
                </Caption1>
              </div>
            </div>
            <Button appearance="subtle" size="small">
              Import
            </Button>
          </div>
          <Divider />
          <div className={styles.row}>
            <div className={styles.rowLeft}>
              <ArrowDownload24Regular className={styles.rowIcon} />
              <div className={styles.rowText}>
                <Body1 className={styles.rowLabel}>Export backup</Body1>
                <Caption1 className={styles.rowDesc}>
                  Export encrypted .phase backup file
                </Caption1>
              </div>
            </div>
            <Button appearance="subtle" size="small">
              Export
            </Button>
          </div>
          <Divider />
          <div className={styles.row}>
            <div className={styles.rowLeft}>
              <Delete24Regular className={styles.rowIcon} />
              <div className={styles.rowText}>
                <Body1 className={styles.rowLabel}>Delete all data</Body1>
                <Caption1 className={styles.rowDesc}>
                  Permanently delete your vault and account
                </Caption1>
              </div>
            </div>
            <Button
              appearance="subtle"
              size="small"
              className={styles.dangerButton}
            >
              Delete
            </Button>
          </div>
        </Card>
      </div>

      {/* Device Management */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          <Laptop24Regular />
          <Body2>Device Management</Body2>
        </div>
        <Card className={styles.card}>
          <div className={styles.row}>
            <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
              Core UX uses device-based security. Session data below is advanced/debug information.
            </Caption1>
          </div>
          <Divider />
          {sessionsLoading ? (
            <div className={styles.sessionsLoading}>
              <Spinner size="small" label="Loading devices..." />
            </div>
          ) : sessions.length === 0 ? (
            <div className={styles.row}>
              <Caption1 style={{ color: tokens.colorNeutralForeground3 }}>
                No devices found
              </Caption1>
            </div>
          ) : (
            <div className={styles.deviceList}>
              {sessions.map((session, idx) => (
                <div key={session.id}>
                  {idx > 0 && <Divider />}
                  <div className={styles.deviceRow}>
                    <div className={styles.deviceInfo}>
                      <Laptop24Regular className={styles.rowIcon} />
                      <div className={styles.rowText}>
                        <Body1 className={styles.rowLabel}>
                          {session.deviceName}
                          {session.isCurrent && (
                            <span className={styles.currentBadge}>Current</span>
                          )}
                        </Body1>
                        <Caption1 className={styles.rowDesc}>
                          {new Date(session.lastUsedAt * 1000).toLocaleString()}
                        </Caption1>
                      </div>
                    </div>
                    {!session.isCurrent && (
                      <Button
                        appearance="subtle"
                        size="small"
                        onClick={() => handleRevokeSession(session.id)}
                      >
                        Revoke
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* About */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          <Info24Regular />
          <Body2>About</Body2>
        </div>
        <Card className={styles.card}>
          <div className={styles.row}>
            <div className={styles.rowLeft}>
              <div className={styles.rowText}>
                <Body1 className={styles.rowLabel}>Phase</Body1>
                <Caption1 className={styles.rowDesc}>
                  Version 0.1.0 &middot; Self-hosted E2E encrypted 2FA manager
                </Caption1>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Caption1 className={styles.version}>Phase v0.1.0</Caption1>
    </div>
  );
}
