import { Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  makeStyles,
  tokens,
  Tooltip,
  Button,
} from "@fluentui/react-components";
import {
  ShieldKeyhole24Regular,
  Key24Regular,
  Settings24Regular,
} from "@fluentui/react-icons";
import { AddTokenDialog } from "../tokens/AddTokenDialog";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const SIDEBAR_BREAKPOINT = "640px";

const useStyles = makeStyles({
  shell: {
    display: "flex",
    height: "100dvh",
    overflow: "hidden",
    // Mobile: column layout with bottom bar
    flexDirection: "column",
    [`@media (min-width: ${SIDEBAR_BREAKPOINT})`]: {
      flexDirection: "row",
    },
  },

  // Desktop sidebar
  sidebar: {
    display: "none",
    [`@media (min-width: ${SIDEBAR_BREAKPOINT})`]: {
      display: "flex",
      width: "56px",
      flexDirection: "column",
      alignItems: "center",
      paddingTop: "16px",
      gap: "4px",
      backgroundColor: tokens.colorNeutralBackground3,
      borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
      flexShrink: 0,
    },
  },

  // Mobile bottom bar
  bottomBar: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingBottom: "env(safe-area-inset-bottom, 0px)",
    backgroundColor: tokens.colorNeutralBackground3,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    flexShrink: 0,
    [`@media (min-width: ${SIDEBAR_BREAKPOINT})`]: {
      display: "none",
    },
  },

  logo: {
    width: "36px",
    height: "36px",
    borderRadius: "8px",
    backgroundColor: tokens.colorBrandBackground,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: tokens.colorNeutralForegroundOnBrand,
    marginBottom: "16px",
    flexShrink: 0,
  },

  navButton: {
    minWidth: "unset",
    width: "40px",
    height: "40px",
    borderRadius: "8px",
  },
  navButtonActive: {
    minWidth: "unset",
    width: "40px",
    height: "40px",
    borderRadius: "8px",
    backgroundColor: tokens.colorNeutralBackground1Selected,
  },

  // Mobile nav button — taller tap target
  mobileNavButton: {
    flex: 1,
    height: "52px",
    borderRadius: "0",
    minWidth: "unset",
  },
  mobileNavButtonActive: {
    flex: 1,
    height: "52px",
    borderRadius: "0",
    minWidth: "unset",
    backgroundColor: tokens.colorNeutralBackground1Selected,
  },

  spacer: {
    flex: 1,
  },

  bottomNav: {
    marginBottom: "16px",
  },

  content: {
    flex: 1,
    // Use overlay scrolling so the scrollbar doesn't consume layout space
    overflowY: "auto" as const,
    overflowX: "hidden",
    backgroundColor: tokens.colorNeutralBackground1,
    // Account for safe area on mobile
    paddingBottom: "env(safe-area-inset-bottom, 0px)",
    [`@media (min-width: ${SIDEBAR_BREAKPOINT})`]: {
      paddingBottom: "0",
    },
  },

  // FAB lives here so position:fixed is relative to viewport, not a transformed ancestor
  fab: {
    // Square shape: 56×56
    width: "56px",
    height: "56px",
    minWidth: "unset",
    padding: "0",
    borderRadius: "16px",
    boxShadow: tokens.shadow16,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  // Wrapper that handles responsive bottom position via CSS
  fabWrapper: {
    position: "fixed" as const,
    bottom: "calc(24px + env(safe-area-inset-bottom, 0px))",
    right: "24px",
    zIndex: 100,
    // On mobile, bump above the bottom bar (52px bar + 24px gap)
    "@media (max-width: 639px)": {
      bottom: "calc(76px + env(safe-area-inset-bottom, 0px))",
    },
  },
});

export function AppShell() {
  const styles = useStyles();
  const navigate = useNavigate();
  const location = useLocation();
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const isTokens = location.pathname === "/" || location.pathname === "";
  const isSettings = location.pathname === "/settings";

  return (
    <div className={styles.shell}>
      {/* Desktop sidebar */}
      <nav className={styles.sidebar}>
        <div className={styles.logo}>
          <ShieldKeyhole24Regular />
        </div>

        <Tooltip content="Tokens" relationship="label" positioning="after">
          <Button
            className={isTokens ? styles.navButtonActive : styles.navButton}
            appearance="subtle"
            icon={<Key24Regular />}
            onClick={() => navigate("/")}
          />
        </Tooltip>

        <div className={styles.spacer} />

        <div className={styles.bottomNav}>
          <Tooltip content="Settings" relationship="label" positioning="after">
            <Button
              className={isSettings ? styles.navButtonActive : styles.navButton}
              appearance="subtle"
              icon={<Settings24Regular />}
              onClick={() => navigate("/settings")}
            />
          </Tooltip>
        </div>
      </nav>

      {/* Main content */}
      <main className={styles.content}>
        <Outlet />
      </main>

      {/* Mobile bottom tab bar */}
      <nav className={styles.bottomBar}>
        <Button
          className={isTokens ? styles.mobileNavButtonActive : styles.mobileNavButton}
          appearance="subtle"
          icon={<Key24Regular />}
          onClick={() => navigate("/")}
        >
          Tokens
        </Button>
        <Button
          className={isSettings ? styles.mobileNavButtonActive : styles.mobileNavButton}
          appearance="subtle"
          icon={<Settings24Regular />}
          onClick={() => navigate("/settings")}
        >
          Settings
        </Button>
      </nav>

      {/* FAB — hoisted out of page transition so position:fixed is viewport-anchored */}
      <AnimatePresence>
        {isTokens && (
          <motion.div
            key="fab"
            className={styles.fabWrapper}
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.7, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
          >
            <Tooltip content="Add token" relationship="label">
              <Button
                className={styles.fab}
                appearance="primary"
                onClick={() => setAddDialogOpen(true)}
                aria-label="Add token"
              >
                {/* Square "+" SVG icon — wider than Add24Regular glyph */}
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 22 22"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <rect x="9.5" y="1" width="3" height="20" rx="1.5" fill="currentColor" />
                  <rect x="1" y="9.5" width="20" height="3" rx="1.5" fill="currentColor" />
                </svg>
              </Button>
            </Tooltip>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AddTokenDialog lives here alongside FAB */}
      <AddTokenDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
      />
    </div>
  );
}
