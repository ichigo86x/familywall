import { useEffect, useState } from "react";
import { Button, Card, Field, Input, MessageBar, MessageBarBody, Switch } from "@fluentui/react-components";
import type { RemoteBackupStatus } from "@familywall/shared";

import { api } from "@/api/client";

const errorText = (error: unknown) => (error instanceof Error ? error.message : "Operazione non riuscita.");

/** Daily encrypted copy of the backup on a WebDAV folder outside the house (Nextcloud, Synology, QNAP...). */
export const RemoteBackupCard = () => {
  const [status, setStatus] = useState<RemoteBackupStatus | null>(null);
  const [form, setForm] = useState({ enabled: false, url: "", username: "", keep: 14, password: "", passphrase: "", repeat: "" });
  const [result, setResult] = useState<{ intent: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const apply = (next: RemoteBackupStatus) => {
    setStatus(next);
    setForm({
      enabled: next.settings.enabled,
      url: next.settings.url ?? "",
      username: next.settings.username ?? "",
      keep: next.settings.keep,
      password: "",
      passphrase: "",
      repeat: ""
    });
  };
  useEffect(() => {
    api
      .getRemoteBackup()
      .then(apply)
      .catch((caught: unknown) => setResult({ intent: "error", text: errorText(caught) }));
  }, []);

  const run = async (action: () => Promise<RemoteBackupStatus>, done: string) => {
    setBusy(true);
    setResult(null);
    try {
      apply(await action());
      setResult({ intent: "success", text: done });
    } catch (caught) {
      setResult({ intent: "error", text: errorText(caught) });
    } finally {
      setBusy(false);
    }
  };

  const mismatch = form.passphrase !== "" && form.passphrase !== form.repeat;
  const save = () =>
    run(
      () =>
        api.updateRemoteBackup({
          enabled: form.enabled,
          url: form.url.trim() || null,
          username: form.username.trim() || null,
          keep: form.keep,
          ...(form.password ? { password: form.password } : {}),
          ...(form.passphrase ? { passphrase: form.passphrase } : {})
        }),
      "Salvato."
    );

  return (
    <Card className="panel-card">
      <div className="panel-card__header">
        <div>
          <p className="eyebrow">Sicurezza dei dati</p>
          <h3>Copia remota cifrata</h3>
        </div>
      </div>
      <p className="calendar-detail-hint">
        Ogni giorno Familywall manda una copia del backup in una cartella WebDAV fuori casa: Nextcloud, Synology, QNAP o un altro NAS. La copia
        contiene anche la chiave delle credenziali ed è cifrata con una <strong>frase segreta</strong>: con il file e la frase si ripristina tutto
        su una nuova installazione. Senza la frase il file non si può leggere, nemmeno da te: conservala in un gestore di password.
      </p>
      <Switch label="Copia remota attiva" checked={form.enabled} onChange={(_, data) => setForm({ ...form, enabled: data.checked })} />
      <div className="dialog-form">
        <Field label="Cartella WebDAV" hint="Nextcloud: https://cloud.example.com/remote.php/dav/files/UTENTE/Familywall/ · Synology: https://nas:5006/Familywall/">
          <Input value={form.url} onChange={(_, data) => setForm({ ...form, url: data.value })} />
        </Field>
        <Field label="Utente">
          <Input autoComplete="off" value={form.username} onChange={(_, data) => setForm({ ...form, username: data.value })} />
        </Field>
        <Field label="Password" hint={status?.passwordSet ? "Già salvata: scrivila solo per cambiarla. Meglio una password per app." : "Meglio una password per app."}>
          <Input type="password" autoComplete="off" value={form.password} onChange={(_, data) => setForm({ ...form, password: data.value })} />
        </Field>
        <Field label="Frase segreta" hint={status?.passphraseSet ? "Già salvata: scrivila solo per cambiarla (vale per le copie nuove)." : "Almeno 12 caratteri."}>
          <Input type="password" autoComplete="new-password" value={form.passphrase} onChange={(_, data) => setForm({ ...form, passphrase: data.value })} />
        </Field>
        {form.passphrase ? (
          <Field label="Ripeti la frase segreta" validationMessage={mismatch ? "Le frasi non coincidono." : undefined}>
            <Input type="password" autoComplete="new-password" value={form.repeat} onChange={(_, data) => setForm({ ...form, repeat: data.value })} />
          </Field>
        ) : null}
        <Field label="Copie da tenere">
          <Input
            type="number"
            min={1}
            max={90}
            value={String(form.keep)}
            onChange={(_, data) => setForm({ ...form, keep: Math.min(90, Math.max(1, Number(data.value) || 14)) })}
          />
        </Field>
      </div>
      <p className="calendar-detail-hint">
        {status?.lastSuccess ? `Ultima copia: ${new Date(status.lastSuccess).toLocaleString("it-IT")}.` : "Nessuna copia remota ancora."}
        {status?.lastError ? ` Ultimo errore: ${status.lastError}` : ""}
      </p>
      <div className="row-actions">
        <Button appearance="primary" disabled={busy || mismatch || (form.passphrase !== "" && form.passphrase.length < 12)} onClick={() => void save()}>
          Salva
        </Button>
        <Button disabled={busy || !status?.settings.enabled} onClick={() => void run(() => api.runRemoteBackup(), "Copia remota eseguita.")}>
          {busy ? "In corso..." : "Esegui ora"}
        </Button>
      </div>
      {result ? (
        <MessageBar intent={result.intent}>
          <MessageBarBody>{result.text}</MessageBarBody>
        </MessageBar>
      ) : null}
    </Card>
  );
};
