import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Card,
  Body1,
  Body2,
  Caption1,
  Button,
  makeStyles,
  tokens,
  Tooltip,
} from "@fluentui/react-components";
import { Checkmark16Regular, Copy16Regular, Edit20Regular } from "@fluentui/react-icons";
import type { Token } from "../../types";
import type { TotpCode } from "../../lib/tauri";

const useStyles = makeStyles({
  card: {
    padding: "16px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "16px",
    transition: "background-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease",
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground1Hover,
      boxShadow: tokens.shadow8,
    },
    ":active": {
      backgroundColor: tokens.colorNeutralBackground1Pressed,
    },
  },
  avatar: {
    width: "40px",
    height: "40px",
    borderRadius: "8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 600,
    fontSize: "16px",
    flexShrink: 0,
    color: tokens.colorNeutralForegroundOnBrand,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  issuer: {
    fontWeight: 600,
  },
  account: {
    color: tokens.colorNeutralForeground3,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  otpRow: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    flexShrink: 0,
  },
  otp: {
    fontFamily: "'Cascadia Code', 'Consolas', monospace",
    fontSize: "22px",
    fontWeight: 600,
    letterSpacing: "3px",
    color: tokens.colorBrandForeground1,
  },
  otpPlaceholder: {
    fontFamily: "'Cascadia Code', 'Consolas', monospace",
    fontSize: "22px",
    fontWeight: 600,
    letterSpacing: "3px",
    color: tokens.colorNeutralForeground4,
  },
  countdown: {
    position: "relative" as const,
    width: "32px",
    height: "32px",
    flexShrink: 0,
  },
  countdownSvg: {
    transform: "rotate(-90deg)",
  },
  countdownText: {
    position: "absolute" as const,
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    fontSize: "11px",
    fontWeight: 600,
    color: tokens.colorNeutralForeground2,
  },
  copyIcon: {
    color: tokens.colorNeutralForeground3,
  },
  editButton: {
    minWidth: "unset",
    width: "28px",
    height: "28px",
    padding: "0",
    flexShrink: 0,
  },
});

const issuerColors: Record<string, string> = {
  GitHub: "#6e40c9",
  Google: "#4285f4",
  Discord: "#5865f2",
  Steam: "#1b2838",
  AWS: "#ff9900",
  Coinbase: "#0052ff",
  Slack: "#4a154b",
  Binance: "#f0b90b",
};

interface TokenCardProps {
  token: Token;
  totpData?: TotpCode;
  onEdit?: (token: Token) => void;
}

export function TokenCard({ token, totpData, onEdit }: TokenCardProps) {
  const styles = useStyles();
  const [copied, setCopied] = useState(false);

  const code = totpData?.code ?? "------";
  const secondsLeft = totpData?.secondsRemaining ?? 0;
  const hasData = !!totpData;

  const handleCopy = () => {
    if (!hasData) return;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const progress = hasData ? secondsLeft / token.period : 0;
  const radius = 12;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);
  const bgColor = issuerColors[token.issuer] || tokens.colorBrandBackground;
  const isUrgent = hasData && secondsLeft <= 5;

  return (
    <Tooltip
      content={copied ? "Copied!" : "Click to copy"}
      relationship="label"
    >
      <motion.div
        whileHover={{ y: -1, transition: { duration: 0.15 } }}
        whileTap={{ scale: 0.98, transition: { duration: 0.1 } }}
        style={{ width: "100%" }}
      >
        <Card className={styles.card} onClick={handleCopy}>
          <div className={styles.avatar} style={{ backgroundColor: bgColor }}>
            {token.issuer.charAt(0).toUpperCase()}
          </div>
          <div className={styles.info}>
            <Body2 className={styles.issuer}>{token.issuer}</Body2>
            <Caption1 className={styles.account}>{token.account}</Caption1>
          </div>
          <div className={styles.otpRow}>
            {hasData ? (
              <motion.div
                key={code}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Body1 className={styles.otp}>
                  {code.slice(0, Math.ceil(code.length / 2))}{" "}
                  {code.slice(Math.ceil(code.length / 2))}
                </Body1>
              </motion.div>
            ) : (
              <Body1 className={styles.otpPlaceholder}>------</Body1>
            )}
            <div className={styles.countdown}>
              <svg
                width="32"
                height="32"
                viewBox="0 0 32 32"
                className={styles.countdownSvg}
              >
                <circle
                  cx="16"
                  cy="16"
                  r={radius}
                  fill="none"
                  stroke={tokens.colorNeutralStroke2}
                  strokeWidth="2.5"
                />
                {hasData && (
                  <circle
                    cx="16"
                    cy="16"
                    r={radius}
                    fill="none"
                    stroke={
                      isUrgent
                        ? tokens.colorPaletteRedForeground1
                        : tokens.colorBrandForeground1
                    }
                    strokeWidth="2.5"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    strokeLinecap="round"
                    style={{ transition: "stroke-dashoffset 1s linear, stroke 0.4s ease" }}
                  />
                )}
              </svg>
              <span className={styles.countdownText}>
                {hasData ? secondsLeft : ""}
              </span>
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={copied ? "check" : "copy"}
                className={styles.copyIcon}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 25 }}
              >
                {copied ? <Checkmark16Regular /> : <Copy16Regular />}
              </motion.span>
            </AnimatePresence>
            {onEdit && (
              <Tooltip content="Edit" relationship="label">
                <Button
                  className={styles.editButton}
                  appearance="subtle"
                  size="small"
                  icon={<Edit20Regular />}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(token);
                  }}
                />
              </Tooltip>
            )}
          </div>
        </Card>
      </motion.div>
    </Tooltip>
  );
}
