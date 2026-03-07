import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// ── Response types ─────────────────────────────────────────────────────────

export interface HealthResponse {
  status: string;
  initialized: boolean;
  version: string;
  instanceSalt: string;
}

export interface SessionResult {
  handle: string;
  jwt: string;
  deviceId?: string | null;
  vaultJson: string;
  vaultVersion: number;
}

export interface TotpCode {
  id: string;
  code: string;
  secondsRemaining: number;
}

export interface LocalVaultData {
  encryptedB64: string;
  version: number;
}

export interface DeviceSession {
  id: string;
  deviceName: string;
  ipAddress: string | null;
  createdAt: number;
  lastUsedAt: number;
  isCurrent: boolean;
}

export interface SessionsResponse {
  sessions: DeviceSession[];
}

export interface TotpEntry {
  id: string;
  secret: string;
  algorithm: string;
  digits: number;
  period: number;
}

export interface RestoreResult {
  serverUrl: string;
  connectionMode: string;
  instanceToken: string | null;
  deviceId: string | null;
  vaultVersion: number;
}

export type UnlistenFn = () => void;

// ── Command wrappers ───────────────────────────────────────────────────────

export const cmdHealth = (
  serverUrl: string,
  instanceToken?: string
): Promise<HealthResponse> =>
  invoke<HealthResponse>("cmd_health", { serverUrl, instanceToken });

/// First-time setup: derives key from password+instanceSalt, encrypts empty vault, stores on server.
export const cmdShSetup = (
  serverUrl: string,
  instanceToken: string,
  instanceSalt: string,
  masterPassword: string
): Promise<SessionResult> =>
  invoke<SessionResult>("cmd_sh_setup", {
    serverUrl,
    instanceToken,
    instanceSalt,
    masterPassword,
  });

/// Subsequent unlock: derives key, creates session, fetches + decrypts vault.
export const cmdShOpen = (
  serverUrl: string,
  instanceToken: string,
  instanceSalt: string,
  masterPassword: string,
  deviceId?: string
): Promise<SessionResult> =>
  invoke<SessionResult>("cmd_sh_open", {
    serverUrl,
    instanceToken,
    instanceSalt,
    masterPassword,
    deviceId,
  });

export const cmdEncryptVault = (
  handle: string,
  vaultJson: string
): Promise<string> =>
  invoke<string>("cmd_encrypt_vault", { handle, vaultJson });

export const cmdPutVault = (
  handle: string,
  serverUrl: string,
  jwt: string,
  instanceToken: string | null,
  vaultJson: string,
  expectedVersion: number
): Promise<number> =>
  invoke<number>("cmd_put_vault", {
    handle,
    serverUrl,
    jwt,
    instanceToken,
    vaultJson,
    expectedVersion,
  });

export const cmdLoadLocalVault = (): Promise<LocalVaultData | null> =>
  invoke<LocalVaultData | null>("cmd_load_local_vault", {});

export const cmdDecryptLocalVault = (handle: string): Promise<string> =>
  invoke<string>("cmd_decrypt_local_vault", { handle });

export const cmdClearSession = (handle: string): Promise<void> =>
  invoke<void>("cmd_clear_session", { handle });

export const cmdTotpStartTicker = (entries: TotpEntry[]): Promise<void> =>
  invoke<void>("cmd_totp_start_ticker", { entries });

export const cmdTotpStopTicker = (): Promise<void> =>
  invoke<void>("cmd_totp_stop_ticker", {});

export const onTotpTick = (
  cb: (codes: TotpCode[]) => void
): Promise<UnlistenFn> =>
  listen<TotpCode[]>("totp-tick", (e) => cb(e.payload));

export const cmdGetSessions = (
  serverUrl: string,
  jwt: string,
  instanceToken?: string
): Promise<SessionsResponse> =>
  invoke<SessionsResponse>("cmd_get_sessions", { serverUrl, jwt, instanceToken });

export const cmdDeleteSession = (
  serverUrl: string,
  jwt: string,
  instanceToken: string | undefined,
  sessionId: string
): Promise<void> =>
  invoke<void>("cmd_delete_session", { serverUrl, jwt, instanceToken, sessionId });

export const cmdLogout = (
  serverUrl: string,
  jwt: string,
  instanceToken: string | undefined,
  handle: string
): Promise<void> =>
  invoke<void>("cmd_logout", { serverUrl, jwt, instanceToken, handle });

/// Re-encrypts vault with a new master password (no server-side password change needed).
export const cmdReencryptVault = (
  oldHandle: string,
  serverUrl: string,
  jwt: string,
  instanceToken: string | undefined,
  instanceSalt: string,
  newPassword: string,
  vaultJson: string,
  version: number
): Promise<string> =>
  invoke<string>("cmd_reencrypt_vault", {
    oldHandle,
    serverUrl,
    jwt,
    instanceToken,
    instanceSalt,
    newPassword,
    vaultJson,
    version,
  });

export const cmdRestoreSession = (): Promise<RestoreResult | null> =>
  invoke<RestoreResult | null>("cmd_restore_session", {});
