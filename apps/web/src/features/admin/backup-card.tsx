import { useRef, useState } from "react";
import { Button, Card, MessageBar, MessageBarBody, Switch } from "@fluentui/react-components";

import { api } from "@/api/client";
import { useAsyncResource } from "@/hooks/use-async-resource";

const errorText = (error: unknown) => (error instanceof Error ? error.message : "Operazione non riuscita.");

const CREDENTIALS_TEXT = {
  kept: "Le credenziali dei calendari funzionano già.",
  "re-encrypted": "Le credenziali dei calendari sono state recuperate con la chiave del backup.",
  unreadable: "Le credenziali dei calendari non sono leggibili: ricollega gli account (o usa un backup con la chiave)."
} as const;

/** Download, daily copies and restore of everything Familywall keeps. */
export const BackupCard = () => {
  const stored = useAsyncResource(() => api.getStoredBackups(), []);
  const [includeKey, setIncludeKey] = useState(false);
  const [result, setResult] = useState<{ intent: "success" | "error" | "warning"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const run = async (action: () => Promise<void>) => {
    setResult(null);
    setBusy(true);
    try {
      await action();
    } catch (error) {
      setResult({ intent: "error", text: errorText(error) });
    } finally {
      setBusy(false);
    }
  };

  const restore = (file: File) =>
    run(async () => {
      if (!window.confirm(`Ripristinare "${file.name}"? Membri, impostazioni, note, turni, ricorrenze e liste attuali verranno sostituiti.`)) {
        return;
      }
      // Remote copies are encrypted ("FWENC1"): the passphrase is asked before uploading.
      const encrypted = (await file.slice(0, 6).text()) === "FWENC1";
      const passphrase = encrypted ? window.prompt("Frase segreta del backup remoto:") : null;
      if (encrypted && !passphrase) {
        return;
      }
      const summary = await api.restoreBackup(file, passphrase ?? undefined);
      setResult({
        intent: summary.credentials === "unreadable" || summary.totpReset > 0 ? "warning" : "success",
        text:
          `Ripristino completato: ${summary.members} membri, ${summary.lists} file delle liste. ${CREDENTIALS_TEXT[summary.credentials]}` +
          (summary.totpReset > 0
            ? ` La verifica in due passaggi è stata disattivata per ${summary.totpReset} membri (il backup non conteneva la chiave): riattivatela dal Profilo.`
            : "") +
          " Se la pagina non risponde, accedi di nuovo."
      });
      stored.reload();
    });

  return (
    <Card className="panel-card">
      <div className="panel-card__header">
        <div>
          <p className="eyebrow">Sicurezza dei dati</p>
          <h3>Backup</h3>
        </div>
      </div>
      <p>
        Il backup contiene membri, impostazioni e account collegati, più i dati del server CalDAV integrato: liste, menu, compleanni, turni,
        routine e note. Ogni giorno
        Familywall ne salva una copia (ultimi 7 giorni); il backup di Home Assistant include anche queste copie.
      </p>
      <Switch
        label="Includi la chiave delle credenziali (serve per ripristinare su un'altra installazione senza ricollegare gli account)"
        checked={includeKey}
        onChange={(_, data) => setIncludeKey(data.checked)}
      />
      {includeKey ? (
        <MessageBar intent="warning">
          <MessageBarBody>Con la chiave, chi ha il file può leggere le password dei calendari: conservalo in un posto sicuro.</MessageBarBody>
        </MessageBar>
      ) : null}
      <div className="inline-form">
        <Button appearance="primary" disabled={busy} onClick={() => void run(() => api.downloadBackup(`backup/download${includeKey ? "?key=1" : ""}`))}>
          Scarica backup
        </Button>
        <Button appearance="secondary" disabled={busy} onClick={() => fileInput.current?.click()}>
          Ripristina da file...
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".fwbackup,application/gzip"
          hidden
          onChange={(change) => {
            const file = change.target.files?.[0];
            change.target.value = "";
            if (file) {
              void restore(file);
            }
          }}
        />
      </div>
      {(stored.data?.length ?? 0) > 0 ? (
        <div className="backup-list">
          <span className="eyebrow">Copie automatiche</span>
          <ul>
            {stored.data!.map((backup) => (
              <li key={backup.name}>
                <span>
                  {new Date(backup.createdAt).toLocaleString("it-IT", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} ·{" "}
                  {(backup.size / 1024).toFixed(0)} KB
                </span>
                <Button size="small" appearance="subtle" disabled={busy} onClick={() => void run(() => api.downloadBackup(`backup/stored/${encodeURIComponent(backup.name)}`))}>
                  Scarica
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {result ? (
        <MessageBar intent={result.intent}>
          <MessageBarBody>{result.text}</MessageBarBody>
        </MessageBar>
      ) : null}
    </Card>
  );
};
