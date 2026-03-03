import { useState } from "react";
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
} from "@fluentui/react-components";
import {
  Globe24Regular,
  Person24Regular,
  Key24Regular,
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
});

interface AddTokenDialogProps {
  open: boolean;
  onClose: () => void;
}

export function AddTokenDialog({ open, onClose }: AddTokenDialogProps) {
  const styles = useStyles();
  const { addToken, groups, tokens, sessionHandle, jwt, serverUrl, instanceToken, vaultVersion, setVaultData } =
    useAppStore();
  const [issuer, setIssuer] = useState("");
  const [account, setAccount] = useState("");
  const [secret, setSecret] = useState("");
  const [group, setGroup] = useState("Personal");
  const [busy, setBusy] = useState(false);

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

    // Sync to server if we have an active session
    if (sessionHandle && jwt) {
      setBusy(true);
      try {
        const updatedTokens = [...tokens, newToken];
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
        // Token already added locally; sync will be retried later
      } finally {
        setBusy(false);
      }
    }

    setIssuer("");
    setAccount("");
    setSecret("");
    setGroup("Personal");
    onClose();
  };

  const isValid = issuer.trim() && account.trim() && secret.trim();

  const availableGroups = Array.from(new Set([
    "Personal", "Work",
    ...groups.filter(g => g !== "All"),
  ]));

  return (
    <Dialog open={open} onOpenChange={(_, data) => !data.open && onClose()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Add Token</DialogTitle>
          <DialogContent>
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
          </DialogContent>
          <DialogActions>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary">Cancel</Button>
            </DialogTrigger>
            <Button
              appearance="primary"
              onClick={handleAdd}
              disabled={!isValid || busy}
            >
              {busy ? "Saving..." : "Add"}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
