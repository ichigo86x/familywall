import { useState } from "react";
import { Button, Card, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, Field, Input } from "@fluentui/react-components";
import { OCCASION_ICONS, OCCASION_LABELS, occasionSchema, type Occasion, type OccasionKind } from "@familywall/shared";

import { api } from "@/api/client";
import { CloseableDialogTitle } from "@/components/closeable-dialog-title";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { AddRegular } from "@/lib/fluent-icons";

const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

const errorText = (error: unknown) => (error instanceof Error ? error.message : "Operazione non riuscita.");

/** Birthdays and anniversaries ("Compleanni" on the built-in CalDAV server): they appear in the calendar and on the dashboard. */
export const OccasionsCard = ({ canWrite }: { canWrite: boolean }) => {
  const occasions = useAsyncResource(() => api.getOccasions(), [], "occasions");
  const [editing, setEditing] = useState<Occasion | "new" | null>(null);

  return (
    <Card className="panel-card">
      <div className="panel-card__header">
        <div>
          <p className="eyebrow">Ogni anno</p>
          <h3>Compleanni e ricorrenze</h3>
        </div>
        {canWrite ? (
          <Button appearance="primary" icon={<AddRegular />} onClick={() => setEditing("new")}>
            Aggiungi
          </Button>
        ) : null}
      </div>
      <p className="calendar-detail-hint">
        Compaiono nel calendario e in dashboard. In alternativa, in Admin puoi segnare un calendario (iCloud, Google, CalDAV) come calendario dei
        compleanni.
      </p>
      {(occasions.data?.length ?? 0) === 0 ? (
        <p className="dashboard-empty">
          <span aria-hidden="true">🎂</span>
          Nessuna ricorrenza: aggiungi i compleanni della famiglia e degli amici.
        </p>
      ) : (
        <ul className="occasion-list">
          {occasions.data!.map((occasion) => (
            <li key={occasion.id}>
              <button type="button" disabled={!canWrite} onClick={() => setEditing(occasion)}>
                <span aria-hidden="true">{OCCASION_ICONS[occasion.kind]}</span>
                <strong>{occasion.name}</strong>
                <span>
                  {occasion.day} {MONTHS[occasion.month - 1]}
                  {occasion.year ? ` ${occasion.year}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <OccasionDialog
          occasion={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            occasions.reload();
          }}
        />
      ) : null}
    </Card>
  );
};

const OccasionDialog = ({ occasion, onClose, onSaved }: { occasion: Occasion | null; onClose: () => void; onSaved: () => void }) => {
  const [form, setForm] = useState({
    name: occasion?.name ?? "",
    kind: occasion?.kind ?? ("birthday" as OccasionKind),
    day: String(occasion?.day ?? ""),
    month: String(occasion?.month ?? new Date().getMonth() + 1),
    year: occasion?.year ? String(occasion.year) : ""
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    setBusy(true);
    try {
      await action();
      onSaved();
    } catch (caught) {
      setError(errorText(caught));
      setBusy(false);
    }
  };

  const submit = () => {
    const parsed = occasionSchema.safeParse({
      name: form.name,
      kind: form.kind,
      day: Number(form.day),
      month: Number(form.month),
      year: form.year.trim() ? Number(form.year) : null
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(" · "));
      return;
    }
    void run(() => (occasion ? api.updateOccasion(occasion.id, parsed.data) : api.createOccasion(parsed.data)));
  };

  return (
    <Dialog open onOpenChange={(_, data) => (!data.open ? onClose() : undefined)}>
      <DialogSurface className="event-dialog">
        <DialogBody>
          <CloseableDialogTitle>{occasion ? "Modifica ricorrenza" : "Nuova ricorrenza"}</CloseableDialogTitle>
          <DialogContent className="dialog-form">
            <Field label="Tipo">
              <select className="native-select" value={form.kind} onChange={(change) => setForm({ ...form, kind: change.target.value as OccasionKind })}>
                {(Object.keys(OCCASION_LABELS) as OccasionKind[]).map((kind) => (
                  <option key={kind} value={kind}>
                    {OCCASION_ICONS[kind]} {OCCASION_LABELS[kind]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Nome" hint={form.kind === "birthday" ? "Es. Luca, nonna Maria" : "Es. Matrimonio Mario e Anna"}>
              <Input value={form.name} maxLength={80} onChange={(_, data) => setForm({ ...form, name: data.value })} />
            </Field>
            <div className="occasion-date">
              <Field label="Giorno">
                <Input type="number" min={1} max={31} value={form.day} onChange={(_, data) => setForm({ ...form, day: data.value })} />
              </Field>
              <Field label="Mese">
                <select className="native-select" value={form.month} onChange={(change) => setForm({ ...form, month: change.target.value })}>
                  {MONTHS.map((month, index) => (
                    <option key={month} value={index + 1}>{month}</option>
                  ))}
                </select>
              </Field>
              <Field label="Anno (facoltativo)" hint={form.kind === "birthday" ? "Per mostrare gli anni compiuti" : "Per contare gli anni"}>
                <Input type="number" min={1900} max={2100} value={form.year} onChange={(_, data) => setForm({ ...form, year: data.value })} />
              </Field>
            </div>
            {error ? <p className="form-error">{error}</p> : null}
          </DialogContent>
          <DialogActions>
            {occasion ? (
              <Button appearance="secondary" disabled={busy} onClick={() => (window.confirm("Eliminare la ricorrenza?") ? void run(() => api.deleteOccasion(occasion.id)) : undefined)}>
                Elimina
              </Button>
            ) : null}
            <Button appearance="secondary" onClick={onClose}>Annulla</Button>
            <Button appearance="primary" disabled={busy || !form.name.trim() || !form.day} onClick={submit}>
              Salva
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};
