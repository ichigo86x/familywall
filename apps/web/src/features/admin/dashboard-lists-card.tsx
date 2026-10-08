import { useState } from "react";
import { Button, Card, Checkbox, Spinner } from "@fluentui/react-components";

import { api } from "@/api/client";
import { useAsyncResource } from "@/hooks/use-async-resource";

const errorText = (error: unknown) => (error instanceof Error ? error.message : "Operazione non riuscita.");

const SOURCE_LABELS = { reminders: "Promemoria", google: "Google", homeassistant: "Home Assistant", icloud: "iCloud" } as const;

/**
 * Lists shown on the dashboard of phones, tablets and of the panels without their own choice
 * (Admin → Dashboard e pannelli → each panel can override it). The pin on the Lists page changes the same setting.
 */
export const DashboardListsCard = ({ listIds, onSaved }: { listIds: string[]; onSaved: () => void }) => {
  const lists = useAsyncResource(() => api.getLists(), [], "lists");
  const [selected, setSelected] = useState<string[]>(listIds);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = selected.join("|") !== listIds.join("|");

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.setDashboardLists(selected);
      onSaved();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };

  const available = lists.data?.lists ?? [];
  // A chosen list that no longer exists stays visible so it can be removed.
  const missing = selected.filter((id) => !available.some((list) => list.id === id));

  return (
    <Card className="panel-card">
      <div className="panel-card__header">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h3>Liste in dashboard</h3>
        </div>
        <Button appearance="primary" disabled={!dirty || busy} onClick={() => void save()}>
          {busy ? "Salvataggio..." : "Salva"}
        </Button>
      </div>
      <p className="calendar-detail-hint">
        Le liste scelte compaiono nella dashboard di tutti; senza nessuna scelta compare la lista della spesa. Un pannello può avere le sue
        liste in "Notte e pannelli". Lo stesso si fa con la puntina 📌 nella pagina Liste.
      </p>
      {lists.status === "loading" && !lists.data ? <Spinner size="small" label="Lettura delle liste..." /> : null}
      {lists.status === "error" ? <p className="form-error">{lists.error.message}</p> : null}
      {lists.data && available.length === 0 ? <p className="calendar-detail-hint">Nessuna lista disponibile.</p> : null}
      <div className="dashboard-lists">
        {available.map((list) => (
          <Checkbox
            key={list.id}
            checked={selected.includes(list.id)}
            onChange={(_, data) => setSelected((current) => (data.checked ? [...current, list.id] : current.filter((id) => id !== list.id)))}
            label={
              <span className="dashboard-lists__label">
                <span className="legend-chip__swatch" style={{ background: list.color }} />
                {list.name}
                <small>{SOURCE_LABELS[list.source]}</small>
              </span>
            }
          />
        ))}
        {missing.map((id) => (
          <Checkbox key={id} checked onChange={() => setSelected((current) => current.filter((entry) => entry !== id))} label="Lista non più disponibile" />
        ))}
      </div>
      {error ? <p className="form-error">{error}</p> : null}
    </Card>
  );
};
