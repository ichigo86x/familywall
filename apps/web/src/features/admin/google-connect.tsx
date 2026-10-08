import { useState } from "react";
import { Button, Field, Input } from "@fluentui/react-components";
import type { ProviderAccount } from "@familywall/shared";

import { api } from "@/api/client";

const errorText = (error: unknown) => (error instanceof Error ? error.message : "Operazione non riuscita.");

/** Familywall's own callback: works for "Web application" clients that register this exact URL. */
const callbackUrl = () => new URL("api/providers/google/callback", document.baseURI).toString();

/**
 * Google OAuth in two steps: open the consent page in a new tab, then either the
 * callback page confirms the link, or the Admin pastes the address Google redirected to
 * (loopback redirect for desktop clients, or when Familywall is not reachable by that URL).
 */
export const GoogleConnect = ({ onLinked, onDone }: { onLinked: (account: ProviderAccount) => void; onDone: () => void }) => {
  const [form, setForm] = useState({ label: "Google famiglia", clientId: "", clientSecret: "", redirectUri: callbackUrl() });
  const [state, setState] = useState<string | null>(null);
  const [redirectedUrl, setRedirectedUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setError(null);
    setBusy(true);
    try {
      const result = await api.startGoogleAuth({ ...form, label: form.label.trim() || "Google" });
      setState(result.state);
      window.open(result.authUrl, "_blank", "noopener");
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };

  const complete = async () => {
    if (!state) {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      onLinked(await api.completeGoogleAuth({ state, redirectedUrl: redirectedUrl.trim() }));
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Field label="Nome account" hint="Come appare nell'app">
        <Input value={form.label} onChange={(_, data) => setForm({ ...form, label: data.value })} />
      </Field>
      <Field label="Client ID" required>
        <Input autoComplete="off" value={form.clientId} onChange={(_, data) => setForm({ ...form, clientId: data.value })} />
      </Field>
      <Field label="Client secret" required>
        <Input type="password" autoComplete="off" value={form.clientSecret} onChange={(_, data) => setForm({ ...form, clientSecret: data.value })} />
      </Field>
      <Field label="URI di reindirizzamento" required hint="Registra questo indirizzo nel client OAuth (passo 4).">
        <Input value={form.redirectUri} onChange={(_, data) => setForm({ ...form, redirectUri: data.value })} />
      </Field>

      <Button appearance={state ? "secondary" : "primary"} disabled={busy || !form.clientId.trim() || !form.clientSecret.trim()} onClick={() => void start()}>
        {state ? "Riapri la pagina Google" : "1. Apri Google e consenti l'accesso"}
      </Button>

      {state ? (
        <>
          <p className="calendar-detail-hint">
            Se la nuova scheda mostra "Account Google collegato", premi <strong>Ho finito</strong>. Se invece mostra un errore di pagina
            irraggiungibile, copia l'indirizzo completo dalla barra della scheda e incollalo qui.
          </p>
          <Field label="Indirizzo della pagina finale (contiene code=...)">
            <Input value={redirectedUrl} placeholder="http://127.0.0.1/?state=...&code=..." onChange={(_, data) => setRedirectedUrl(data.value)} />
          </Field>
          <div className="row-actions">
            <Button appearance="primary" disabled={busy || !redirectedUrl.includes("code=")} onClick={() => void complete()}>
              2. Completa il collegamento
            </Button>
            <Button onClick={onDone}>Ho finito</Button>
          </div>
        </>
      ) : null}

      {error ? <p className="form-error">{error}</p> : null}
    </>
  );
};
