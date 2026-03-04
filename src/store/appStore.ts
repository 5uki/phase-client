import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AppState, Token } from "../types";
import { normalizeServerUrl } from "../lib/url";

function deriveGroups(tokens: Token[]): string[] {
  const groupSet = new Set<string>();
  tokens.forEach((t) => {
    if (t.group) groupSet.add(t.group);
  });
  return ["All", ...Array.from(groupSet).sort()];
}

export const useAppStore = create<AppState>()(persist((set, get) => ({
  isAuthenticated: false,
  serverUrl: "https://cloud.phase.app",
  connectionMode: "cloud",

  sessionHandle: null,
  jwt: null,
  instanceToken: null,
  vaultVersion: 0,

  theme: "system",
  biometricLockEnabled: false,

  tokens: [],
  groups: ["All"],
  activeGroup: "All",
  searchQuery: "",

  setAuthenticated: (value) => set({ isAuthenticated: value }),
  setServerUrl: (url) => set({ serverUrl: normalizeServerUrl(url) }),
  setConnectionMode: (mode) => set({ connectionMode: mode }),
  setTheme: (theme) => set({ theme }),
  setBiometricLockEnabled: (enabled) => set({ biometricLockEnabled: enabled }),
  setActiveGroup: (group) => set({ activeGroup: group }),
  setSearchQuery: (query) => set({ searchQuery: query }),

  addToken: (token) =>
    set((state) => {
      const tokens = [...state.tokens, token];
      return { tokens, groups: deriveGroups(tokens) };
    }),

  updateToken: (id, updates) =>
    set((state) => {
      const tokens = state.tokens.map((t) =>
        t.id === id ? { ...t, ...updates, updatedAt: Date.now() } : t
      );
      return { tokens, groups: deriveGroups(tokens) };
    }),

  deleteToken: (id) =>
    set((state) => {
      const tokens = state.tokens.filter((t) => t.id !== id);
      return { tokens, groups: deriveGroups(tokens) };
    }),

  setSession: (handle, jwt, instanceToken, vaultVersion) =>
    set({ sessionHandle: handle, jwt, instanceToken, vaultVersion, isAuthenticated: true }),

  setVaultData: (tokens, version) =>
    set({ tokens, groups: deriveGroups(tokens), vaultVersion: version }),

  clearSession: () => {
    const state = get();
    // Stop TOTP ticker if running (best-effort — no async in actions)
    set({
      isAuthenticated: false,
      sessionHandle: null,
      jwt: null,
      instanceToken: null,
      vaultVersion: 0,
      tokens: [],
      groups: ["All"],
      activeGroup: "All",
      searchQuery: state.searchQuery,
    });
  },
}), {
  name: "phase-client-app",
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({
    serverUrl: state.serverUrl,
    connectionMode: state.connectionMode,
    theme: state.theme,
    biometricLockEnabled: state.biometricLockEnabled,
    instanceToken: state.instanceToken,
  }),
}));
