export interface Token {
  id: string;
  issuer: string;
  account: string;
  secret: string;
  algorithm: "SHA1" | "SHA256" | "SHA512";
  digits: 6 | 7 | 8;
  period: number;
  type: "totp";
  icon?: string;
  order?: number;
  favorite?: boolean;
  group?: string;
  createdAt: number;
  updatedAt: number;
}

export interface VaultSettings {
  groups: string[];
  defaultGroup: string;
  sortOrder: "issuer" | "account" | "createdAt" | "manual";
  displayMode: "grid" | "list";
}

export interface Vault {
  version: number;
  tokens: Token[];
  settings: VaultSettings;
  lastModified: number;
}

export type ThemePreference = "system" | "light" | "dark";
export type ConnectionMode = "cloud" | "selfhosted";

export interface AppState {
  // Auth
  isAuthenticated: boolean;
  serverUrl: string;
  connectionMode: ConnectionMode;

  // Session (from Rust — no keys in frontend)
  sessionHandle: string | null;
  jwt: string | null;
  instanceToken: string | null;
  deviceId: string | null;
  vaultVersion: number;

  // UI
  theme: ThemePreference;
  biometricLockEnabled: boolean;

  // Vault data
  tokens: Token[];
  groups: string[];
  activeGroup: string;
  searchQuery: string;

  // Actions
  setAuthenticated: (value: boolean) => void;
  setServerUrl: (url: string) => void;
  setConnectionMode: (mode: ConnectionMode) => void;
  setTheme: (theme: ThemePreference) => void;
  setBiometricLockEnabled: (enabled: boolean) => void;
  setActiveGroup: (group: string) => void;
  setSearchQuery: (query: string) => void;
  addToken: (token: Token) => void;
  updateToken: (id: string, updates: Partial<Token>) => void;
  deleteToken: (id: string) => void;

  // Session lifecycle
  setSession: (
    handle: string,
    jwt: string,
    instanceToken: string | null,
    deviceId: string | null,
    vaultVersion: number
  ) => void;
  setVaultData: (tokens: Token[], version: number) => void;
  clearSession: () => void;
}
