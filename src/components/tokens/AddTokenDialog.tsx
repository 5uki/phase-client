import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogContent,
  Input,
  Button,
  Dropdown,
  Option,
  Label,
  makeStyles,
  tokens,
  Tab,
  TabList,
} from "@fluentui/react-components";
import {
  Globe24Regular,
  Person24Regular,
  Key24Regular,
  QrCode24Regular,
  Camera24Regular,
} from "@fluentui/react-icons";
import { useAppStore } from "../../store/appStore";
import { cmdPutVault } from "../../lib/tauri";
import { buildVaultJson } from "../../lib/vault";
import type { Token } from "../../types";

const useStyles = makeStyles({
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    paddingTop: "8px",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  tabContent: {
    marginTop: "12px",
  },
  scanArea: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "12px",
  },
  videoWrapper: {
    width: "100%",
    aspectRatio: "1",
    maxWidth: "280px",
    borderRadius: "12px",
    overflow: "hidden",
    backgroundColor: tokens.colorNeutralBackground3,
    position: "relative" as const,
    border: `2px solid ${tokens.colorNeutralStroke1}`,
  },
  video: {
    width: "100%",
    height: "100%",
    objectFit: "cover" as const,
  },
  scanOverlay: {
    position: "absolute" as const,
    inset: "0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none" as const,
  },
  scanFrame: {
    width: "60%",
    height: "60%",
    border: `2px solid ${tokens.colorBrandForeground1}`,
    borderRadius: "8px",
    boxSizing: "border-box" as const,
  },
  scanHint: {
    color: tokens.colorNeutralForeground3,
    fontSize: "13px",
    textAlign: "center" as const,
  },
  errorText: {
    color: tokens.colorPaletteRedForeground1,
    fontSize: "13px",
    textAlign: "center" as const,
  },
});

interface AddTokenDialogProps {
  open: boolean;
  onClose: () => void;
}

/** Parse otpauth://totp/... URI and extract fields */
function parseOtpAuthUri(uri: string) {
  try {
    const url = new URL(uri);
    if (url.protocol !== "otpauth:") return null;
    const params = url.searchParams;
    const label = decodeURIComponent(url.pathname.replace(/^\/\/totp\//, ""));
    const [issuerFromLabel, accountFromLabel] = label.includes(":")
      ? label.split(":").map((s) => s.trim())
      : [params.get("issuer") ?? label, label];
    return {
      issuer: params.get("issuer") ?? issuerFromLabel ?? "",
      account: accountFromLabel ?? "",
      secret: (params.get("secret") ?? "").toUpperCase(),
    };
  } catch {
    return null;
  }
}

export function AddTokenDialog({ open, onClose }: AddTokenDialogProps) {
  const styles = useStyles();
  const {
    addToken,
    groups,
    tokens: tokenList,
    sessionHandle,
    jwt,
    serverUrl,
    instanceToken,
    vaultVersion,
    setVaultData,
  } = useAppStore();
  const [activeTab, setActiveTab] = useState<"manual" | "scan">("manual");
  const [issuer, setIssuer] = useState("");
  const [account, setAccount] = useState("");
  const [secret, setSecret] = useState("");
  const [group, setGroup] = useState("Personal");
  const [busy, setBusy] = useState(false);

  // QR scanner state
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [scanError, setScanError] = useState("");
  const [scanning, setScanning] = useState(false);

  // Start/stop camera when tab changes
  useEffect(() => {
    if (activeTab === "scan" && open) {
      void startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, open]);

  const startCamera = async () => {
    setScanError("");
    setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => { });
      }

      // Dynamically import html5-qrcode to avoid bundling issues
      const { Html5Qrcode } = await import("html5-qrcode");
      // We scan frames manually using the video stream
      const scanner = new Html5Qrcode("qr-scan-canvas-hidden");
      scannerRef.current = scanner;
      void scanLoop(scanner);
    } catch (err) {
      setScanError("Unable to access camera. Please allow camera access.");
      setScanning(false);
    }
  };

  const scanLoop = async (scanner: import("html5-qrcode").Html5Qrcode) => {
    if (!videoRef.current || !streamRef.current) return;

    // Create an off-screen canvas to capture frames
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    const tick = async () => {
      const video = videoRef.current;
      if (!video || !streamRef.current?.active) return;
      if (video.readyState < 2) {
        requestAnimationFrame(tick);
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);

      try {
        const imageData = canvas.toDataURL("image/jpeg", 0.8);
        const result = await scanner.scanFileV2(
          dataUrlToFile(imageData),
          false
        );
        if (result?.decodedText) {
          handleScannedCode(result.decodedText);
          return; // stop loop on success
        }
      } catch {
        // No QR code found in this frame — keep scanning
      }

      if (streamRef.current?.active) {
        requestAnimationFrame(tick);
      }
    };

    requestAnimationFrame(tick);
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (scannerRef.current) {
      try {
        scannerRef.current.clear();
      } catch { }
      scannerRef.current = null;
    }
    setScanning(false);
  };

  const handleScannedCode = (text: string) => {
    stopCamera();
    const parsed = parseOtpAuthUri(text);
    if (parsed) {
      setIssuer(parsed.issuer);
      setAccount(parsed.account);
      setSecret(parsed.secret);
      setActiveTab("manual"); // switch to manual to confirm
    } else {
      setScanError("QR code is not a valid OTP Auth URI.");
      setScanning(false);
    }
  };

  const handleAdd = async () => {
    const newToken: Token = {
      id: crypto.randomUUID(),
      issuer: issuer.trim(),
      account: account.trim(),
      secret: secret.trim().toUpperCase().replace(/\s/g, ""),
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      type: "totp",
      group,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    addToken(newToken);

    if (sessionHandle && jwt) {
      setBusy(true);
      try {
        const updatedTokens = [...tokenList, newToken];
        const vaultJson = buildVaultJson(updatedTokens, vaultVersion + 1);
        const newVersion = await cmdPutVault(
          sessionHandle,
          serverUrl,
          jwt,
          instanceToken,
          vaultJson,
          vaultVersion
        );
        setVaultData(updatedTokens, newVersion);
      } catch (e) {
        console.error("Failed to sync vault:", e);
      } finally {
        setBusy(false);
      }
    }

    resetForm();
    onClose();
  };

  const resetForm = () => {
    setIssuer("");
    setAccount("");
    setSecret("");
    setGroup("Personal");
    setActiveTab("manual");
    setScanError("");
  };

  const handleClose = () => {
    stopCamera();
    resetForm();
    onClose();
  };

  const isValid = issuer.trim() && account.trim() && secret.trim();

  const availableGroups = Array.from(
    new Set(["Personal", "Work", ...groups.filter((g) => g !== "All")])
  );

  return (
    <Dialog open={open} onOpenChange={(_, data) => !data.open && handleClose()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Add Token</DialogTitle>
          <DialogContent>
            <TabList
              selectedValue={activeTab}
              onTabSelect={(_, data) => setActiveTab(data.value as "manual" | "scan")}
            >
              <Tab value="manual" icon={<Key24Regular />}>
                Manual
              </Tab>
              <Tab value="scan" icon={<QrCode24Regular />}>
                Scan QR
              </Tab>
            </TabList>

            <div className={styles.tabContent}>
              {activeTab === "manual" ? (
                <div className={styles.form}>
                  <div className={styles.field}>
                    <Label htmlFor="issuer">Service name</Label>
                    <Input
                      id="issuer"
                      placeholder="e.g. GitHub"
                      value={issuer}
                      onChange={(_, data) => setIssuer(data.value)}
                      contentBefore={<Globe24Regular />}
                    />
                  </div>
                  <div className={styles.field}>
                    <Label htmlFor="account">Account</Label>
                    <Input
                      id="account"
                      placeholder="e.g. user@example.com"
                      value={account}
                      onChange={(_, data) => setAccount(data.value)}
                      contentBefore={<Person24Regular />}
                    />
                  </div>
                  <div className={styles.field}>
                    <Label htmlFor="secret">Secret key</Label>
                    <Input
                      id="secret"
                      placeholder="e.g. JBSWY3DPEHPK3PXP"
                      value={secret}
                      onChange={(_, data) => setSecret(data.value)}
                      contentBefore={<Key24Regular />}
                      // Prevent soft keyboard auto-open on mobile (readonly then unfocused trick)
                      inputMode="none"
                      onFocus={(e) => {
                        // Re-enable normal input mode once focused (user explicitly tapped)
                        e.currentTarget.inputMode = "text";
                      }}
                    />
                  </div>
                  <div className={styles.field}>
                    <Label>Group</Label>
                    <Dropdown
                      value={group}
                      onOptionSelect={(_, data) =>
                        data.optionValue && setGroup(data.optionValue)
                      }
                    >
                      {availableGroups.map((g) => (
                        <Option key={g} value={g}>
                          {g}
                        </Option>
                      ))}
                    </Dropdown>
                  </div>
                </div>
              ) : (
                <div className={styles.scanArea}>
                  <div className={styles.videoWrapper}>
                    <video
                      ref={videoRef}
                      className={styles.video}
                      muted
                      playsInline
                      autoPlay
                    />
                    <div className={styles.scanOverlay}>
                      <div className={styles.scanFrame} />
                    </div>
                  </div>
                  {scanError ? (
                    <span className={styles.errorText}>{scanError}</span>
                  ) : scanning ? (
                    <span className={styles.scanHint}>
                      Point your camera at a TOTP QR code
                    </span>
                  ) : (
                    <Button
                      appearance="subtle"
                      icon={<Camera24Regular />}
                      onClick={() => void startCamera()}
                    >
                      Start camera
                    </Button>
                  )}
                </div>
              )}
            </div>
          </DialogContent>
          <DialogActions>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary" onClick={handleClose}>
                Cancel
              </Button>
            </DialogTrigger>
            {activeTab === "manual" && (
              <Button
                appearance="primary"
                onClick={handleAdd}
                disabled={!isValid || busy}
              >
                {busy ? "Saving..." : "Add"}
              </Button>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

/** Convert a data URL to a File object (required by html5-qrcode scanFileV2) */
function dataUrlToFile(dataUrl: string): File {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] ?? "image/jpeg";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], "frame.jpg", { type: mime });
}
