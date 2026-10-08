import { useEffect, useState } from "react";
import {
  Button,
  Card,
  Checkbox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Switch
} from "@fluentui/react-components";
import { DEFAULT_SCREENSAVER_MINUTES, type FamilyTaskList, type HomeButton, type PanelNight, type PanelProfile, type User } from "@familywall/shared";

import { api } from "@/api/client";
import { CloseableDialogTitle } from "@/components/closeable-dialog-title";

const EMPTY_PROFILE: PanelProfile = { room: "", dashboardListIds: null, homeButtonIds: null, night: null, screensaverMinutes: null };

const profileSummary = (profile: PanelProfile | undefined, buttons: HomeButton[]): string => {
  if (!profile) {
    return "Come la famiglia";
  }
  const parts = [
    profile.dashboardListIds ? `${profile.dashboardListIds.length} liste` : null,
    profile.homeButtonIds ? `${profile.homeButtonIds.filter((id) => buttons.some((button) => button.id === id)).length} pulsanti` : null,
    profile.night ? (profile.night.enabled ? `notte ${profile.night.start}–${profile.night.end}` : "notte spenta") : null,
    profile.screensaverMinutes === null ? null : profile.screensaverMinutes === 0 ? "senza screensaver" : `screensaver dopo ${profile.screensaverMinutes} min`
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Come la famiglia";
};

/** Night mode of the wall panels (Kiosk accounts), and what each panel shows differently. */
export const PanelSettingsCard = ({
  night,
  panels,
  profiles,
  buttons,
  onSaved
}: {
  night: PanelNight;
  panels: User[];
  profiles: Record<string, PanelProfile>;
  buttons: HomeButton[];
  onSaved: () => void;
}) => {
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState<PanelNight>(night);
  const [result, setResult] = useState<{ intent: "success" | "error"; text: string } | null>(null);
  const changed = form.enabled !== night.enabled || form.start !== night.start || form.end !== night.end;

  const save = async () => {
    try {
      await api.updateSettings({ panelNight: form });
      setResult({ intent: "success", text: "Impostazioni del pannello salvate. I pannelli le leggono entro 15 minuti." });
      onSaved();
    } catch (error) {
      setResult({ intent: "error", text: error instanceof Error ? error.message : "Salvataggio non riuscito." });
    }
  };

  return (
    <Card className="panel-card">
      <div className="panel-card__header">
        <div>
          <p className="eyebrow">Pannello a muro</p>
          <h3>Notte e pannelli</h3>
        </div>
      </div>
      <p>
        Negli orari scelti i pannelli mostrano solo un orologio tenue su sfondo nero. Un tocco li riattiva per 2 minuti. Con Fully Kiosk e
        l'interfaccia JavaScript attiva, anche la luminosità dello schermo si abbassa.
      </p>
      <Switch label="Modalità notte attiva" checked={form.enabled} onChange={(_, data) => setForm({ ...form, enabled: data.checked })} />
      <div className="inline-form">
        <Field label="Dalle">
          <Input type="time" value={form.start} disabled={!form.enabled} onChange={(_, data) => setForm({ ...form, start: data.value })} />
        </Field>
        <Field label="Alle">
          <Input type="time" value={form.end} disabled={!form.enabled} onChange={(_, data) => setForm({ ...form, end: data.value })} />
        </Field>
        <Button appearance="primary" disabled={!changed} onClick={() => void save()}>
          Salva
        </Button>
      </div>
      {result ? (
        <MessageBar intent={result.intent}>
          <MessageBarBody>{result.text}</MessageBarBody>
        </MessageBar>
      ) : null}

      <div className="panel-profiles">
        <p className="eyebrow">Ogni pannello</p>
        {panels.length === 0 ? (
          <p className="calendar-detail-hint">Nessun pannello: crea un membro con ruolo Pannello per ogni schermo a muro.</p>
        ) : (
          <div className="stack-list">
            {panels.map((panel) => (
              <article key={panel.id} className="routine-row">
                <div>
                  <strong>
                    {panel.displayName}
                    {profiles[panel.id]?.room ? ` · ${profiles[panel.id]!.room}` : ""}
                  </strong>
                  <p className="calendar-detail-hint">{profileSummary(profiles[panel.id], buttons)}</p>
                </div>
                <div className="row-actions">
                  <Button onClick={() => setEditing(panel)}>Personalizza</Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {editing ? (
        <PanelProfileDialog
          panel={editing}
          profile={profiles[editing.id] ?? EMPTY_PROFILE}
          familyNight={night}
          buttons={buttons}
          onClose={() => setEditing(null)}
          onSave={async (profile) => {
            const next = { ...profiles };
            if (profile) {
              next[editing.id] = profile;
            } else {
              delete next[editing.id];
            }
            await api.updateSettings({ panelProfiles: next });
            setEditing(null);
            onSaved();
          }}
        />
      ) : null}
    </Card>
  );
};

/** One panel's own lists, buttons, night hours and screensaver delay ("come la famiglia" = inherit). */
const PanelProfileDialog = ({
  panel,
  profile,
  familyNight,
  buttons,
  onClose,
  onSave
}: {
  panel: User;
  profile: PanelProfile;
  familyNight: PanelNight;
  buttons: HomeButton[];
  onClose: () => void;
  onSave: (profile: PanelProfile | null) => Promise<void>;
}) => {
  const [form, setForm] = useState<PanelProfile>(profile);
  const [lists, setLists] = useState<FamilyTaskList[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const panelButtons = buttons.filter((button) => button.roles.includes("Kiosk"));

  useEffect(() => {
    api
      .getLists()
      .then((response) => setLists(response.lists))
      .catch(() => setLists([]));
  }, []);

  const toggle = (values: string[] | null, id: string, checked: boolean) => {
    const current = values ?? [];
    return checked ? [...current, id] : current.filter((value) => value !== id);
  };

  const save = async (value: PanelProfile | null) => {
    setError(null);
    try {
      await onSave(value);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Salvataggio non riuscito.");
    }
  };

  return (
    <Dialog open onOpenChange={(_, data) => (!data.open ? onClose() : undefined)}>
      <DialogSurface className="event-dialog">
        <DialogBody>
          <CloseableDialogTitle>Pannello {panel.displayName}</CloseableDialogTitle>
          <DialogContent className="dialog-form">
            <Field label="Stanza" hint="Per riconoscerlo, per esempio Cucina o Ingresso.">
              <Input value={form.room} onChange={(_, data) => setForm({ ...form, room: data.value })} />
            </Field>

            <Field label="Liste in dashboard">
              <Switch
                label="Come la famiglia"
                checked={form.dashboardListIds === null}
                onChange={(_, data) => setForm({ ...form, dashboardListIds: data.checked ? null : [] })}
              />
              {form.dashboardListIds !== null ? (
                lists === null ? (
                  <span className="calendar-detail-hint">Caricamento liste...</span>
                ) : (
                  <div className="panel-profile__choices">
                    {lists.map((list) => (
                      <Checkbox
                        key={list.id}
                        label={list.name}
                        checked={form.dashboardListIds!.includes(list.id)}
                        onChange={(_, data) => setForm({ ...form, dashboardListIds: toggle(form.dashboardListIds, list.id, Boolean(data.checked)) })}
                      />
                    ))}
                  </div>
                )
              ) : null}
            </Field>

            <Field label="Pulsanti Home Assistant">
              <Switch
                label="Tutti quelli dei pannelli"
                checked={form.homeButtonIds === null}
                onChange={(_, data) => setForm({ ...form, homeButtonIds: data.checked ? null : panelButtons.map((button) => button.id) })}
              />
              {form.homeButtonIds !== null ? (
                panelButtons.length === 0 ? (
                  <span className="calendar-detail-hint">Nessun pulsante abilitato per i pannelli.</span>
                ) : (
                  <div className="panel-profile__choices">
                    {panelButtons.map((button) => (
                      <Checkbox
                        key={button.id}
                        label={`${button.icon} ${button.label}`}
                        checked={form.homeButtonIds!.includes(button.id)}
                        onChange={(_, data) => setForm({ ...form, homeButtonIds: toggle(form.homeButtonIds, button.id, Boolean(data.checked)) })}
                      />
                    ))}
                  </div>
                )
              ) : null}
            </Field>

            <Field label="Notte">
              <Switch
                label={`Come la famiglia (${familyNight.enabled ? `${familyNight.start}–${familyNight.end}` : "spenta"})`}
                checked={form.night === null}
                onChange={(_, data) => setForm({ ...form, night: data.checked ? null : { ...familyNight } })}
              />
              {form.night ? (
                <div className="inline-form">
                  <Switch label="Attiva" checked={form.night.enabled} onChange={(_, data) => setForm({ ...form, night: { ...form.night!, enabled: data.checked } })} />
                  <Input type="time" aria-label="Dalle" value={form.night.start} disabled={!form.night.enabled} onChange={(_, data) => setForm({ ...form, night: { ...form.night!, start: data.value } })} />
                  <Input type="time" aria-label="Alle" value={form.night.end} disabled={!form.night.enabled} onChange={(_, data) => setForm({ ...form, night: { ...form.night!, end: data.value } })} />
                </div>
              ) : null}
            </Field>

            <Field label="Screensaver dopo">
              <select
                className="native-select"
                value={form.screensaverMinutes === null ? "" : String(form.screensaverMinutes)}
                onChange={(change) => setForm({ ...form, screensaverMinutes: change.target.value === "" ? null : Number(change.target.value) })}
              >
                <option value="">Come la famiglia ({DEFAULT_SCREENSAVER_MINUTES} minuti)</option>
                {[1, 2, 5, 10, 15, 30].map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} {minutes === 1 ? "minuto" : "minuti"}
                  </option>
                ))}
                <option value="0">Mai</option>
              </select>
            </Field>
            {error ? <p className="form-error">{error}</p> : null}
          </DialogContent>
          <DialogActions>
            <Button appearance="subtle" onClick={() => void save(null)}>
              Ripristina
            </Button>
            <Button appearance="secondary" onClick={onClose}>
              Annulla
            </Button>
            <Button appearance="primary" onClick={() => void save({ ...form, room: form.room.trim() })}>
              Salva
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};
