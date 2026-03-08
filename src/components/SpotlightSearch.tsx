import { useEffect, useState, useMemo } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
    FluentProvider,
    webDarkTheme,
    webLightTheme,
    Input,
    makeStyles,
    tokens,
    Text,
    Badge,
} from "@fluentui/react-components";
import { Search24Regular, DocumentCopy24Regular } from "@fluentui/react-icons";
import { cmdRestoreSession, cmdOfflineUnlock, type TotpCode } from "../lib/tauri";
import type { Token } from "../types";

const useStyles = makeStyles({
    container: {
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "transparent",
        border: `1px solid ${tokens.colorNeutralStroke1}`,
        borderRadius: "12px",
        overflow: "hidden",
    },
    searchBox: {
        padding: "16px",
        borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
        backgroundColor: "transparent",
    },
    input: {
        width: "100%",
        "& input": {
            fontSize: "20px",
            padding: "12px 8px",
        },
    },
    list: {
        flex: 1,
        overflowY: "auto",
        padding: "8px",
    },
    item: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 16px",
        borderRadius: "8px",
        cursor: "pointer",
        ":hover": {
            backgroundColor: tokens.colorNeutralBackground1Hover,
        },
    },
    itemSelected: {
        backgroundColor: tokens.colorNeutralBackground1Hover,
        ":hover": {
            backgroundColor: tokens.colorNeutralBackground1Hover,
        },
    },
    itemLeft: {
        display: "flex",
        flexDirection: "column",
        gap: "4px",
    },
    itemRight: {
        display: "flex",
        alignItems: "center",
        gap: "12px",
    },
    code: {
        fontSize: "24px",
        fontFamily: "monospace",
        fontWeight: 700,
        color: tokens.colorBrandForeground1,
        letterSpacing: "2px",
    },
    empty: {
        padding: "32px",
        textAlign: "center",
        color: tokens.colorNeutralForeground3,
    },
});

export function SpotlightSearch() {
    const styles = useStyles();
    const [tokensList, setTokensList] = useState<Token[]>([]);
    const [query, setQuery] = useState("");
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [codes, setCodes] = useState<Record<string, TotpCode>>({});
    const [locked, setLocked] = useState(false);

    // Load tokens on mount & when returning to focus
    const loadVault = async () => {
        try {
            const res = await cmdRestoreSession();
            if (!res || !res.instanceToken || !res.instanceSalt) {
                setLocked(true);
                return;
            }
            const unlockRes = await cmdOfflineUnlock(res.instanceToken, res.instanceSalt);
            const vault = JSON.parse(unlockRes.vaultJson);
            setTokensList(vault.tokens || []);
            setLocked(false);
        } catch (e) {
            console.error("Spotlight offline unlock failed:", e);
            setLocked(true);
        }
    };

    useEffect(() => {
        loadVault();
        const unlisteners = [
            getCurrentWindow().onFocusChanged(({ payload: focused }) => {
                if (focused) {
                    loadVault(); // refresh if we gained focus
                    setQuery("");
                    setSelectedIndex(0);
                } else {
                    getCurrentWindow().hide(); // Auto-hide when losing focus
                }
            }),
            listen<TotpCode[]>("totp-tick", (e) => {
                const map: Record<string, TotpCode> = {};
                for (const c of e.payload) map[c.id] = c;
                setCodes(map);
            }),
        ];

        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                getCurrentWindow().hide();
            }
        };
        window.addEventListener("keydown", handleGlobalKeyDown);

        return () => {
            window.removeEventListener("keydown", handleGlobalKeyDown);
            unlisteners.forEach((p) => p.then((unlisten) => unlisten()));
        };
    }, []);

    // Filter tokens
    const filteredTokens = useMemo(() => {
        if (!query) return tokensList;
        const q = query.toLowerCase();
        return tokensList.filter(
            (t) =>
                t.issuer.toLowerCase().includes(q) ||
                t.account.toLowerCase().includes(q)
        );
    }, [tokensList, query]);

    // Handle keyboard
    const handleKeyDown = async (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedIndex((prev) => Math.min(prev + 1, filteredTokens.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIndex((prev) => Math.max(prev - 1, 0));
        } else if (e.key === "Enter") {
            e.preventDefault();
            const selected = filteredTokens[selectedIndex];
            if (selected) {
                const codeData = codes[selected.id];
                if (codeData && codeData.code) {
                    await writeText(codeData.code); // Copy to clipboard
                    getCurrentWindow().hide();      // Hide instantly
                }
            }
        }
    };

    // Reset selection when query changes
    useEffect(() => {
        setSelectedIndex(0);
    }, [query]);

    // Native theme detection
    const [isDark, setIsDark] = useState(
        () => window.matchMedia("(prefers-color-scheme: dark)").matches
    );
    useEffect(() => {
        const mq = window.matchMedia("(prefers-color-scheme: dark)");
        const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
        mq.addEventListener("change", handler);
        return () => mq.removeEventListener("change", handler);
    }, []);

    return (
        <FluentProvider theme={isDark ? webDarkTheme : webLightTheme} style={{ height: "100vh", background: "transparent" }}>
            <div className={styles.container}>
                <div className={styles.searchBox}>
                    <Input
                        className={styles.input}
                        placeholder="Search accounts to copy 2FA..."
                        value={query}
                        onChange={(_, d) => setQuery(d.value)}
                        onKeyDown={handleKeyDown}
                        autoFocus
                        contentBefore={<Search24Regular />}
                        appearance="outline"
                    />
                </div>

                <div className={styles.list}>
                    {locked ? (
                        <div className={styles.empty}>
                            <Text>Vault is locked. Open the main app to unlock.</Text>
                        </div>
                    ) : filteredTokens.length === 0 ? (
                        <div className={styles.empty}>
                            <Text>No accounts found.</Text>
                        </div>
                    ) : (
                        filteredTokens.map((t, idx) => {
                            const codeData = codes[t.id];
                            const isSelected = idx === selectedIndex;
                            return (
                                <div
                                    key={t.id}
                                    className={`${styles.item} ${isSelected ? styles.itemSelected : ""}`}
                                >
                                    <div className={styles.itemLeft}>
                                        <Text weight="semibold" size={400}>
                                            {t.issuer}
                                        </Text>
                                        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                                            {t.account}
                                        </Text>
                                    </div>
                                    <div className={styles.itemRight}>
                                        {codeData ? (
                                            <>
                                                <span className={styles.code}>{codeData.code}</span>
                                                <Badge
                                                    appearance="tint"
                                                    color={codeData.secondsRemaining <= 5 ? "danger" : "brand"}
                                                >
                                                    {codeData.secondsRemaining}s
                                                </Badge>
                                            </>
                                        ) : (
                                            <Text size={200} style={{ color: tokens.colorNeutralForeground4 }}>
                                                Loading...
                                            </Text>
                                        )}
                                        {isSelected && <DocumentCopy24Regular style={{ color: tokens.colorNeutralForeground3 }} />}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </FluentProvider>
    );
}
