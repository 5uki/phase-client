import type { Token } from "../types";

export function buildVaultJson(tokens: Token[], version: number): string {
  return JSON.stringify({
    version,
    tokens,
    settings: { groups: [], defaultGroup: "", sortOrder: "manual", displayMode: "list" },
    lastModified: Date.now(),
  });
}
