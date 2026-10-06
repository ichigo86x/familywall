import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Radio,
  RadioGroup,
  Spinner,
  Switch
} from "@fluentui/react-components";
import type { CalendarConfig, CalendarProvider, ProviderAccount, RemoteCalendar } from "@familywall/shared";

import { api } from "@/api/client";
import { CloseableDialogTitle } from "@/components/closeable-dialog-title";
import { AddRegular, CalendarRegular, ClipboardTaskRegular, DeleteRegular } from "@/lib/fluent-icons";
import { GoogleConnect } from "./google-connect";
import { DiscoverListsDialog } from "./task-lists-section";

const PROVIDER_LABELS: Record<CalendarProvider, string> = { icloud: "iCloud", caldav: "CalDAV", cookidoo: "Cookidoo", google: "Google" };

/** Localized Cookidoo sites (country and language come from the URL). */
const COOKIDOO_SITES = [
  { url: "https://cookidoo.it/foundation/it-IT", label: "Italia" },
  { url: "https://cookidoo.ch/foundation/it-CH", label: "Svizzera (italiano)" },
  { url: "https://cookidoo.ch/foundation/de-CH", label: "Svizzera (tedesco)" },
  { url: "https://cookidoo.ch/foundation/fr-CH", label: "Svizzera (francese)" },
  { url: "https://cookidoo.de/foundation/de-DE", label: "Germania" },
  { url: "https://cookidoo.at/foundation/de-AT", label: "Austria" },
  { url: "https://cookidoo.fr/foundation/fr-FR", label: "Francia" },
  { url: "https://cookidoo.es/foundation/es-ES", label: "Spagna" },
  { url: "https://cookidoo.pt/foundation/pt-PT", label: "Portogallo" },
  { url: "https://cookidoo.co.uk/foundation/en-GB", label: "Regno Unito" },
  { url: "https://cookidoo.thermomix.com/foundation/en-US", label: "Stati Uniti" }
];
const DEFAULT_COLOR = "#3A7D6E";

const errorText = (error: unknown) => (error instanceof Error ? error.message : "Operazione non riuscita.");

interface ProvidersSectionProps {
  accounts: ProviderAccount[];
  calendars: CalendarConfig[];
  onChanged: () => void;
}

export const ProvidersSection = ({ accounts, calendars, onChanged }: ProvidersSectionProps) => {
  const [addingAccount, setAddingAccount] = useState(false);
  const [discoverAccount, setDiscoverAccount] = useState<ProviderAccount | null>(null);
  const [listsAccount, setListsAccount] = useState<ProviderAccount | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    setFeedback(null);
    try {
      await action();
      onChanged();
    } catch (error) {
      setFeedback(errorText(error));
    }
  };

  const removeAccount = (account: ProviderAccount) => {
    const linked = calendars.filter((calendar) => calendar.accountId === account.id).length;
    if (window.confirm(`Scollegare ${account.label}?${linked ? ` Verranno rimossi anche ${linked} calendari e i dati degli eventi creati nell'app.` : ""}`)) {
      void run(() => api.deleteProviderAccount(account.id));
    }
  };

  const removeCalendar = (calendar: CalendarConfig) => {
    if (window.confirm(`Rimuovere ${calendar.name}? Gli eventi sul provider non vengono toccati.`)) {
      void run(() => api.deleteCalendar(calendar.id));
    }
  };

  return (
    <>
      <Card className="panel-card">
        <div className="panel-card__header">
          <div>
            <p className="eyebrow">Connessioni</p>
            <h3>Account calendario</h3>
          </div>
          <Button appearance="primary" icon={<AddRegular />} onClick={() => setAddingAccount(true)}>
            Collega account
          </Button>
        </div>

        {feedback ? (
          <MessageBar intent="error">
            <MessageBarBody>{feedback}</MessageBarBody>
          </MessageBar>
        ) : null}

        {accounts.length === 0 ? (
          <p className="calendar-detail-hint">Nessun account collegato. Collega un account iCloud per importare i calendari della famiglia.</p>
        ) : (
          <div className="stack-list">
            {accounts.map((account) => (
              <article key={account.id} className="routine-row">
                <div>
                  <h4>
                    {account.label} <Badge appearance="outline">{PROVIDER_LABELS[account.provider]}</Badge>{" "}
                    {account.status === "error" ? <Badge color="danger">errore</Badge> : null}
                  </h4>
                  <p>{account.username}{account.serverUrl ? ` · ${account.serverUrl}` : ""}</p>
                  {account.lastError ? <p className="form-error">{account.lastError}</p> : null}
                </div>
                <div className="row-actions">
                  <Button icon={<CalendarRegular />} onClick={() => setDiscoverAccount(account)}>Scegli calendari</Button>
                  {account.provider === "google" ? (
                    <Button icon={<ClipboardTaskRegular />} onClick={() => setListsAccount(account)}>Scegli liste</Button>
                  ) : null}
                  <Button appearance="subtle" icon={<DeleteRegular />} aria-label="Scollega" onClick={() => removeAccount(account)} />
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>

      <Card className="panel-card">
        <div className="panel-card__header">
          <div>
            <p className="eyebrow">Calendari</p>
            <h3>Calendari visibili nel family wall</h3>
          </div>
        </div>
        {calendars.length === 0 ? (
          <p className="calendar-detail-hint">Nessun calendario aggiunto. Usa "Scegli calendari" su un account.</p>
        ) : (
          <div className="stack-list">
            {calendars.map((calendar) => (
              <CalendarRow key={calendar.id} calendar={calendar} onAction={run} onRemove={() => removeCalendar(calendar)} />
            ))}
          </div>
        )}
      </Card>

      {addingAccount ? (
        <AddAccountDialog
          onClose={() => {
            setAddingAccount(false);
            onChanged();
          }}
          onCreated={(account) => {
            setAddingAccount(false);
            onChanged();
            setDiscoverAccount(account);
          }}
        />
      ) : null}
      {listsAccount ? (
        <DiscoverListsDialog
          account={listsAccount}
          onClose={() => {
            setListsAccount(null);
            onChanged();
          }}
        />
      ) : null}
      {discoverAccount ? (
        <DiscoverDialog
          account={discoverAccount}
          onClose={() => {
            setDiscoverAccount(null);
            onChanged();
          }}
        />
      ) : null}
    </>
  );
};

const CalendarRow = ({
  calendar,
  onAction,
  onRemove
}: {
  calendar: CalendarConfig;
  onAction: (action: () => Promise<unknown>) => Promise<void>;
  onRemove: () => void;
}) => {
  const [name, setName] = useState(calendar.name);

  return (
    <article className="routine-row">
      <div className="calendar-config-main">
        <input
          type="color"
          value={calendar.color}
          aria-label="Colore calendario"
          onChange={(change) => void onAction(() => api.updateCalendar(calendar.id, { color: change.target.value.toUpperCase() }))}
        />
        <div>
          <Input
            value={name}
            aria-label="Nome calendario"
            onChange={(_, data) => setName(data.value)}
            onBlur={() => (name.trim() && name !== calendar.name ? void onAction(() => api.updateCalendar(calendar.id, { name: name.trim() })) : undefined)}
          />
          <p>
            {calendar.accountLabel} · {PROVIDER_LABELS[calendar.provider]}
            {calendar.lastSyncedAt ? ` · letto ${new Date(calendar.lastSyncedAt).toLocaleString("it-IT")}` : ""}
          </p>
          {calendar.lastError ? <p className="form-error">{calendar.lastError}</p> : null}
        </div>
      </div>
      <div className="row-actions">
        <Switch
          label={calendar.enabled ? "Visibile" : "Nascosto"}
          checked={calendar.enabled}
          onChange={(_, data) => void onAction(() => api.updateCalendar(calendar.id, { enabled: data.checked }))}
        />
        <Button appearance="subtle" icon={<DeleteRegular />} aria-label="Rimuovi" onClick={onRemove} />
      </div>
    </article>
  );
};

const AddAccountDialog = ({ onClose, onCreated }: { onClose: () => void; onCreated: (account: ProviderAccount) => void }) => {
  const [form, setForm] = useState({
    provider: "icloud" as CalendarProvider,
    label: "",
    username: "",
    password: "",
    serverUrl: "",
    cookidooSite: COOKIDOO_SITES[0]!.url
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (form.provider === "google") {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const account = await api.createProviderAccount({
        provider: form.provider,
        label: form.label.trim() || form.username.trim(),
        username: form.username.trim(),
        password: form.password,
        serverUrl: form.provider === "caldav" ? form.serverUrl.trim() : form.provider === "cookidoo" ? form.cookidooSite : undefined
      });
      onCreated(account);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(_, data) => (!data.open ? onClose() : undefined)}>
      <DialogSurface>
        <DialogBody>
          <CloseableDialogTitle>Collega account calendario</CloseableDialogTitle>
          <DialogContent className="dialog-form">
            <RadioGroup layout="horizontal" value={form.provider} onChange={(_, data) => setForm({ ...form, provider: data.value as CalendarProvider })}>
              <Radio value="icloud" label="iCloud" />
              <Radio value="caldav" label="Altro server CalDAV" />
              <Radio value="cookidoo" label="Cookidoo (Bimby)" />
              <Radio value="google" label="Google" />
            </RadioGroup>

            {form.provider === "google" ? <GoogleConnect onLinked={onCreated} onDone={onClose} /> : null}

            {form.provider === "google" ? null : form.provider === "icloud" ? (
              <MessageBar intent="info">
                <MessageBarBody>
                  iCloud richiede una <strong>password specifica per app</strong>, non la password dell'Apple ID: generala su
                  account.apple.com → Accesso e sicurezza → Password specifiche per le app. Si consiglia un Apple ID dedicato alla famiglia, con cui
                  condividere i calendari (permesso "può modificare").
                </MessageBarBody>
              </MessageBar>
            ) : form.provider === "cookidoo" ? (
              <>
                <MessageBar intent="info">
                  <MessageBarBody>
                    Mostra in sola lettura il piano settimanale ("La mia settimana") di Cookidoo: ogni ricetta pianificata diventa un evento di tutto
                    il giorno. Usa email e password dell'account Cookidoo; l'accesso usa le stesse API non ufficiali dell'app Cookidoo, quindi
                    potrebbe smettere di funzionare se Vorwerk le cambia.
                  </MessageBarBody>
                </MessageBar>
                <Field label="Paese dell'account Cookidoo" required>
                  <select className="native-select" value={form.cookidooSite} onChange={(change) => setForm({ ...form, cookidooSite: change.target.value })}>
                    {COOKIDOO_SITES.map((site) => (
                      <option key={site.url} value={site.url}>{site.label}</option>
                    ))}
                  </select>
                </Field>
              </>
            ) : (
              <Field label="URL server CalDAV" required hint="Es. https://cloud.example.com/remote.php/dav">
                <Input value={form.serverUrl} onChange={(_, data) => setForm({ ...form, serverUrl: data.value })} />
              </Field>
            )}

            {form.provider === "google" ? null : (
              <>
                <Field label="Nome account" hint="Come appare nell'app, es. 'iCloud famiglia'">
                  <Input value={form.label} onChange={(_, data) => setForm({ ...form, label: data.value })} />
                </Field>
                <Field label={form.provider === "icloud" ? "Apple ID (email)" : form.provider === "cookidoo" ? "Email Cookidoo" : "Utente"} required>
                  <Input autoCapitalize="none" autoComplete="off" value={form.username} onChange={(_, data) => setForm({ ...form, username: data.value })} />
                </Field>
                <Field label={form.provider === "icloud" ? "Password specifica per app" : "Password"} required>
                  <Input type="password" autoComplete="off" placeholder={form.provider === "icloud" ? "xxxx-xxxx-xxxx-xxxx" : ""} value={form.password} onChange={(_, data) => setForm({ ...form, password: data.value })} />
                </Field>
                  </>
            )}
            {error ? <p className="form-error">{error}</p> : null}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>Annulla</Button>
            {form.provider === "google" ? null : (
            <Button appearance="primary" disabled={busy || !form.username || !form.password} onClick={() => void submit()}>
              {busy ? "Verifica in corso..." : "Verifica e collega"}
            </Button>
            )}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};

const DiscoverDialog = ({ account, onClose }: { account: ProviderAccount; onClose: () => void }) => {
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; calendars: RemoteCalendar[]; error?: string }>({ status: "loading", calendars: [] });
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .discoverCalendars(account.id)
      .then((calendars) => active && setState({ status: "ready", calendars }))
      .catch((caught: unknown) => active && setState({ status: "error", calendars: [], error: errorText(caught) }));
    return () => {
      active = false;
    };
  }, [account.id]);

  const add = async (calendar: RemoteCalendar) => {
    setError(null);
    try {
      await api.addCalendar({ accountId: account.id, remoteUrl: calendar.remoteUrl, name: calendar.name, color: (calendar.color ?? DEFAULT_COLOR).toUpperCase() });
      setAdded((current) => new Set(current).add(calendar.remoteUrl));
    } catch (caught) {
      setError(errorText(caught));
    }
  };

  return (
    <Dialog open onOpenChange={(_, data) => (!data.open ? onClose() : undefined)}>
      <DialogSurface>
        <DialogBody>
          <CloseableDialogTitle>Calendari di {account.label}</CloseableDialogTitle>
          <DialogContent className="dialog-form">
            {state.status === "loading" ? <Spinner label="Lettura dei calendari dal provider..." /> : null}
            {state.status === "error" ? <p className="form-error">{state.error}</p> : null}
            {state.status === "ready" && state.calendars.length === 0 ? (
              <p className="calendar-detail-hint">Nessun calendario trovato. Verifica che i calendari siano condivisi con questo account.</p>
            ) : null}
            {state.calendars.map((calendar) => {
              const isAdded = calendar.alreadyAdded || added.has(calendar.remoteUrl);
              return (
                <div key={calendar.remoteUrl} className="discover-row">
                  <span className="calendar-legend-swatch" style={{ background: calendar.color ?? DEFAULT_COLOR }} />
                  <strong>{calendar.name}</strong>
                  <Button size="small" appearance={isAdded ? "subtle" : "primary"} disabled={isAdded} onClick={() => void add(calendar)}>
                    {isAdded ? "Aggiunto" : "Aggiungi"}
                  </Button>
                </div>
              );
            })}
            {error ? <p className="form-error">{error}</p> : null}
          </DialogContent>
          <DialogActions>
            <Button appearance="primary" onClick={onClose}>Fatto</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};
