import {
  makeStyles,
  tokens,
  TabList,
  Tab,
  Input,
  Body1,
  Title3,
} from "@fluentui/react-components";
import { Search24Regular } from "@fluentui/react-icons";
import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useAppStore } from "../../store/appStore";
import { TokenCard } from "./TokenCard";
import { EditTokenDialog } from "./EditTokenDialog";
import {
  cmdTotpStartTicker,
  cmdTotpStopTicker,
  onTotpTick,
  type TotpCode,
  type UnlistenFn,
} from "../../lib/tauri";

import type { Token } from "../../types";

const useStyles = makeStyles({
  container: {
    display: "flex",
    flexDirection: "column",
    minHeight: "100%",
    padding: "24px",
    gap: "20px",
    position: "relative" as const,
  },
  header: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    flexShrink: 0,
  },
  titleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  searchRow: {
    display: "flex",
    gap: "12px",
  },
  searchInput: {
    flex: 1,
  },
  tokenList: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: "8px",
    // Extra bottom padding so last card isn't hidden by FAB
    paddingBottom: "88px",
    "@media (min-width: 640px)": {
      gridTemplateColumns: "repeat(2, 1fr)",
    },
    "@media (min-width: 1100px)": {
      gridTemplateColumns: "repeat(3, 1fr)",
    },
  },
  emptyState: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: "48px",
    color: tokens.colorNeutralForeground3,
  },
});

export function TokenListPage() {
  const styles = useStyles();
  const { tokens: tokenList, groups, activeGroup, searchQuery, setActiveGroup, setSearchQuery } =
    useAppStore();
  const [editingToken, setEditingToken] = useState<Token | null>(null);
  const [totpMap, setTotpMap] = useState<Map<string, TotpCode>>(new Map());
  const unlistenRef = useRef<UnlistenFn | null>(null);

  // Start TOTP ticker and listen to events whenever the token list changes
  useEffect(() => {
    if (tokenList.length === 0) {
      cmdTotpStopTicker().catch(() => { });
      return;
    }

    const entries = tokenList.map((t) => ({
      id: t.id,
      secret: t.secret,
      algorithm: t.algorithm,
      digits: t.digits,
      period: t.period,
    }));

    // Set up event listener first, then start ticker
    onTotpTick((codes) => {
      setTotpMap((prev) => {
        const next = new Map(prev);
        codes.forEach((c) => next.set(c.id, c));
        return next;
      });
    }).then((unlisten) => {
      // Clean up previous listener if any
      if (unlistenRef.current) {
        unlistenRef.current();
      }
      unlistenRef.current = unlisten;
    });

    cmdTotpStartTicker(entries).catch(console.error);

    return () => {
      cmdTotpStopTicker().catch(() => { });
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, [tokenList]);

  const filtered = tokenList.filter((t) => {
    const matchesGroup = activeGroup === "All" || t.group === activeGroup;
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      t.issuer.toLowerCase().includes(q) ||
      t.account.toLowerCase().includes(q);
    return matchesGroup && matchesSearch;
  });

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <Title3>Tokens</Title3>
        </div>
        <div className={styles.searchRow}>
          <Input
            className={styles.searchInput}
            placeholder="Search tokens..."
            value={searchQuery}
            onChange={(_, data) => setSearchQuery(data.value)}
            contentBefore={<Search24Regular />}
          />
        </div>
        <TabList
          selectedValue={activeGroup}
          onTabSelect={(_, data) => setActiveGroup(data.value as string)}
        >
          {groups.map((g) => (
            <Tab key={g} value={g}>
              {g}
            </Tab>
          ))}
        </TabList>
      </div>

      <motion.div
        className={styles.tokenList}
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.04 } } }}
      >
        {filtered.length > 0 ? (
          filtered.map((token) => (
            <motion.div
              key={token.id}
              variants={{
                hidden: { opacity: 0, y: 10 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.18 } },
              }}
            >
              <TokenCard token={token} totpData={totpMap.get(token.id)} onEdit={setEditingToken} />
            </motion.div>
          ))
        ) : (
          <motion.div
            className={styles.emptyState}
            variants={{
              hidden: { opacity: 0 },
              visible: { opacity: 1, transition: { duration: 0.2 } },
            }}
          >
            <Body1>
              {searchQuery ? "No tokens match your search" : "No tokens yet"}
            </Body1>
          </motion.div>
        )}
      </motion.div>

      <EditTokenDialog
        token={editingToken}
        open={editingToken !== null}
        onClose={() => setEditingToken(null)}
      />
    </div>
  );
}
