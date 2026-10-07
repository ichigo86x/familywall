import { useState } from "react";
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
import { HOME_SERVICES, homeButtonSchema, homeDomain, type HomeButton, type HomeEntity, type UserRole } from "@familywall/shared";

import { api } from "@/api/client";
import { CloseableDialogTitle } from "@/components/closeable-dialog-title";
import { DeleteRegular, EditRegular } from "@/lib/fluent-icons";
import { ROLE_INFO } from "./members-section";

const ROLES: UserRole[] = ["Parent", "Child", "Kiosk"];
const ICON_SUGGESTIONS = ["🚪", "🔔", "🔓", "🏠", "💡", "🅿️", "🚗", "🌡️", "🎵", "📷"];

const errorText = (error: unknown) => (error instanceof Error ? error.message : "Operazione non riuscita.");

/** Dashboard shortcuts to Home Assistant entities (door opener, intercom, lights...). */
export const HomeButtonsCard = ({ buttons, onSaved }: { buttons: HomeButton[]; onSaved: () => void }) => {
  const [editing, setEditing] = useState<HomeButton | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async (next: HomeButton[]) => {
    setError(null);
    try {
      await api.updateSettings({ homeButtons: next });
      setEditing(null);
      onSaved();
    } catch (caught) {
      setError(errorText(caught));
    }
  };

  return (
    <Card className="panel-card">
      <div className="panel-card__header">
        <div>
          <p className="eyebrow">Home Assistant</p>
          <h3>Pulsanti in dashboard</h3>
        </div>
        <Button appearance="primary" onClick={() => setEditing("new")}>Aggiungi pulsante</Button>
      </div>
      <p>
        Pulsanti rotondi in alto nella dashboard per aprire il portone, il cancello, accendere luci o avviare script di Home Assistant. Scegli chi
        può usarli; le porte possono chiedere conferma.
      </p>
      {buttons.length === 0 ? (
        <p className="calendar-detail-hint">Nessun pulsante.</p>
      ) : (
        <ul className="home-buttons-list">
          {buttons.map((button) => (
            <li key={button.id}>
              <span className="home-buttons-list__icon" aria-hidden="true">{button.icon}</span>
              <span>
                <strong>{button.label}</strong>
                <span className="table-subline">
                  {button.entityId} · {HOME_SERVICES[homeDomain(button.entityId)]?.find((entry) => entry.service === button.service)?.label ?? button.service}
                  {button.confirm ? " · con conferma" : ""} · {["Admin", ...button.roles].map((role) => ROLE_INFO[role as UserRole].label).join(", ")}
                </span>
              </span>
              <Button appearance="subtle" icon={<EditRegular />} aria-label="Modifica" onClick={() => setEditing(button)} />
              <Button
                appearance="subtle"
                icon={<DeleteRegular />}
                aria-label="Elimina"
                onClick={() => (window.confirm(`Eliminare "${button.label}"?`) ? void save(buttons.filter((entry) => entry.id !== button.id)) : undefined)}
              />
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      ) : null}
      {editing ? (
        <HomeButtonDialog
          button={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(button) =>
            save(editing === "new" ? [...buttons, button] : buttons.map((entry) => (entry.id === button.id ? button : entry)))
          }
        />
      ) : null}
    </Card>
  );
};

const HomeButtonDialog = ({ button, onClose, onSave }: { button: HomeButton | null; onClose: () => void; onSave: (button: HomeButton) => Promise<void> }) => {
  const [form, setForm] = useState<HomeButton>(
    button ?? { id: crypto.randomUUID(), label: "", icon: "🚪", entityId: "", service: "", confirm: true, roles: ["Parent", "Kiosk"] }
  );
  const [entities, setEntities] = useState<HomeEntity[] | null>(null);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const services = HOME_SERVICES[homeDomain(form.entityId)] ?? [];

  const loadEntities = async () => {
    setError(null);
    try {
      const list = await api.getHomeEntities();
      setEntities(list);
      if (list.length === 0) {
        setError("Home Assistant non è collegato o non ha entità utilizzabili. Puoi scrivere l'entità a mano.");
      }
    } catch (caught) {
      setError(errorText(caught));
    }
  };

  const chooseEntity = (entityId: string, name?: string) => {
    const options = HOME_SERVICES[homeDomain(entityId)] ?? [];
    setForm({
      ...form,
      entityId,
      label: form.label || name || "",
      service: options.some((entry) => entry.service === form.service) ? form.service : (options[0]?.service ?? "")
    });
  };

  const submit = async () => {
    const parsed = homeButtonSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(" · "));
      return;
    }
    try {
      await onSave(parsed.data);
    } catch (caught) {
      setError(errorText(caught));
    }
  };

  const shown = (entities ?? []).filter((entity) => `${entity.name} ${entity.entityId}`.toLowerCase().includes(filter.toLowerCase())).slice(0, 40);

  return (
    <Dialog open onOpenChange={(_, data) => (!data.open ? onClose() : undefined)}>
      <DialogSurface className="event-dialog">
        <DialogBody>
          <CloseableDialogTitle>{button ? "Modifica pulsante" : "Nuovo pulsante"}</CloseableDialogTitle>
          <DialogContent className="dialog-form">
            <Field label="Entità di Home Assistant" hint="Es. lock.portone, button.apri_cancello, switch.citofono">
              <Input value={form.entityId} onChange={(_, data) => chooseEntity(data.value.trim())} />
            </Field>
            {entities === null ? (
              <Button appearance="secondary" onClick={() => void loadEntities()}>Scegli da Home Assistant</Button>
            ) : entities.length > 0 ? (
              <div className="home-entity-picker">
                <Input placeholder="Cerca..." value={filter} onChange={(_, data) => setFilter(data.value)} />
                <ul>
                  {shown.map((entity) => (
                    <li key={entity.entityId}>
                      <button
                        type="button"
                        className={entity.entityId === form.entityId ? "home-entity-picker__selected" : ""}
                        onClick={() => chooseEntity(entity.entityId, entity.name)}
                      >
                        <strong>{entity.name}</strong>
                        <span>
                          {entity.entityId} · {entity.state}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <Field label="Azione">
              <select className="native-select" value={form.service} disabled={services.length === 0} onChange={(change) => setForm({ ...form, service: change.target.value })}>
                {services.length === 0 ? <option value="">Scegli prima un'entità</option> : null}
                {services.map((entry) => (
                  <option key={entry.service} value={entry.service}>{entry.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Nome sul pulsante">
              <Input value={form.label} maxLength={40} onChange={(_, data) => setForm({ ...form, label: data.value })} />
            </Field>
            <Field label="Icona">
              <div className="color-picker">
                {ICON_SUGGESTIONS.map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    className={`icon-swatch ${form.icon === icon ? "icon-swatch--selected" : ""}`.trim()}
                    onClick={() => setForm({ ...form, icon })}
                  >
                    {icon}
                  </button>
                ))}
                <Input className="icon-input" value={form.icon} maxLength={8} aria-label="Icona personalizzata" onChange={(_, data) => setForm({ ...form, icon: data.value })} />
              </div>
            </Field>
            <Switch label="Chiedi conferma prima di eseguire" checked={form.confirm} onChange={(_, data) => setForm({ ...form, confirm: data.checked })} />
            <Field label="Chi può usarlo (l'Admin sempre)">
              <div className="home-roles">
                {ROLES.map((role) => (
                  <Checkbox
                    key={role}
                    label={ROLE_INFO[role].label}
                    checked={form.roles.includes(role)}
                    onChange={(_, data) =>
                      setForm({ ...form, roles: data.checked ? [...form.roles, role] : form.roles.filter((entry) => entry !== role) })
                    }
                  />
                ))}
              </div>
            </Field>
            {error ? <p className="form-error">{error}</p> : null}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>Annulla</Button>
            <Button appearance="primary" onClick={() => void submit()}>Salva</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};
