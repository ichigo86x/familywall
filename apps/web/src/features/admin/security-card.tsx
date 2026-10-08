import { useEffect, useState } from "react";
import { Button, Card, Field, Input, MessageBar, MessageBarBody } from "@fluentui/react-components";
import QRCode from "qrcode";
import type { AuditEntry, TotpSetupResponse } from "@familywall/shared";

import { api } from "@/api/client";
import { useAuth } from "@/components/auth/use-auth";

const errorText = (error: unknown) => (error instanceof Error ? error.message : "Operazione non riuscita.");

/** Two-step sign-in of the signed-in Admin: authenticator app, recovery codes, turning it off. */
export const SecurityCard = () => {
  const auth = useAuth();
  const enabled = Boolean(auth.user?.totpEnabled);
  const [setup, setSetup] = useState<TotpSetupResponse | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!setup) {
      setQr(null);
      return;
    }
    QRCode.toDataURL(setup.otpauthUrl, { margin: 1, width: 220 })
      .then(setQr)
      .catch(() => setQr(null));
  }, [setup]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="panel-card">
      <div className="panel-card__header">
        <div>
          <p className="eyebrow">Sicurezza</p>
          <h3>Verifica in due passaggi</h3>
        </div>
        <span className={`status-chip ${enabled ? "status-chip--ok" : ""}`.trim()}>{enabled ? "Attiva" : "Non attiva"}</span>
      </div>
      <p>
        Dopo la password Familywall chiede il codice di 6 cifre di un'app di autenticazione (Password di iPhone, Google Authenticator, Microsoft
        Authenticator, 1Password...). Così una password rubata non basta per entrare come Admin.
      </p>
      {error ? (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      ) : null}

      {recovery ? (
        <div className="totp-recovery">
          <p>
            <strong>Codici di recupero.</strong> Ognuno vale una volta sola, al posto del codice dell'app, se perdi il telefono. Salvali ora in un
            posto sicuro (non verranno più mostrati).
          </p>
          <ul>
            {recovery.map((value) => (
              <li key={value}>
                <code>{value}</code>
              </li>
            ))}
          </ul>
          <Button
            onClick={() => {
              setRecovery(null);
              void auth.retry();
            }}
          >
            Li ho salvati
          </Button>
        </div>
      ) : enabled ? (
        <div className="inline-form">
          <Field label="Password">
            <Input type="password" autoComplete="current-password" value={password} onChange={(_, data) => setPassword(data.value)} />
          </Field>
          <Field label="Codice (o codice di recupero)">
            <Input value={code} autoComplete="one-time-code" onChange={(_, data) => setCode(data.value)} />
          </Field>
          <Button
            disabled={busy || !password || !code.trim()}
            onClick={() =>
              void run(async () => {
                await api.disableTotp(password, code.trim());
                setPassword("");
                setCode("");
                await auth.retry();
              })
            }
          >
            Disattiva
          </Button>
        </div>
      ) : setup ? (
        <div className="totp-setup">
          {qr ? <img src={qr} alt="Codice QR per l'app di autenticazione" width={220} height={220} /> : null}
          <div className="totp-setup__steps">
            <p>1. Inquadra il codice QR con l'app di autenticazione. Sull'iPhone puoi anche toccare il link.</p>
            <p>
              <a href={setup.otpauthUrl}>Aggiungi all'app di autenticazione</a> · chiave: <code>{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</code>
            </p>
            <p>2. Scrivi qui il codice di 6 cifre che mostra l'app.</p>
            <div className="inline-form">
              <Field label="Codice">
                <Input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(_, data) => setCode(data.value)} />
              </Field>
              <Button
                appearance="primary"
                disabled={busy || !/^\d{6}$/.test(code.trim())}
                onClick={() =>
                  void run(async () => {
                    const { recoveryCodes } = await api.enableTotp(code.trim());
                    setRecovery(recoveryCodes);
                    setSetup(null);
                    setCode("");
                  })
                }
              >
                Attiva
              </Button>
              <Button appearance="subtle" onClick={() => setSetup(null)}>
                Annulla
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <Button appearance="primary" disabled={busy} onClick={() => void run(async () => setSetup(await api.setupTotp()))}>
          Attiva la verifica in due passaggi
        </Button>
      )}
      <p className="calendar-detail-hint">
        Vale per l'accesso all'app. Il collegamento CalDAV dei telefoni (Promemoria e Calendario) continua a usare solo la password.
      </p>
    </Card>
  );
};

const statusText = (status: number) => (status < 300 ? "ok" : status === 401 ? "rifiutato" : status === 403 ? "non permesso" : `errore ${status}`);

/** Who changed what: the last changes made through Familywall, newest first. */
export const AuditCard = () => {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (before: number | null) => {
    try {
      const page = await api.getAuditLog(before);
      setEntries((current) => (before === null ? page.entries : [...(current ?? []), ...page.entries]));
      setNextBefore(page.nextBefore);
    } catch (caught) {
      setError(errorText(caught));
    }
  };

  return (
    <Card className="panel-card">
      <div className="panel-card__header">
        <div>
          <p className="eyebrow">Sicurezza</p>
          <h3>Registro attività</h3>
        </div>
        <Button onClick={() => void load(null)}>{entries ? "Aggiorna" : "Mostra"}</Button>
      </div>
      <p>Accessi e modifiche fatte da ognuno (membri, impostazioni, eventi, liste, turni, backup...). Si tengono gli ultimi 6 mesi.</p>
      {error ? <p className="form-error">{error}</p> : null}
      {entries ? (
        entries.length === 0 ? (
          <p className="calendar-detail-hint">Nessuna attività registrata.</p>
        ) : (
          <div className="audit-table" role="table" aria-label="Registro attività">
            {entries.map((entry) => (
              <div key={entry.id} role="row" className={`audit-row ${entry.status >= 400 ? "audit-row--failed" : ""}`.trim()}>
                <span role="cell" className="audit-row__time">
                  {new Date(entry.at).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
                <span role="cell" className="audit-row__who">{entry.username ?? "—"}</span>
                <span role="cell" className="audit-row__action" title={entry.request}>
                  {entry.action}
                </span>
                <span role="cell" className="audit-row__status">{statusText(entry.status)}</span>
              </div>
            ))}
          </div>
        )
      ) : null}
      {entries && nextBefore !== null ? <Button onClick={() => void load(nextBefore)}>Carica altri</Button> : null}
    </Card>
  );
};
