import { useState } from "react";
import { Button, Card, Field, MessageBar, MessageBarBody } from "@fluentui/react-components";
import type { HomeEntity, HomeList } from "@familywall/shared";

import { api } from "@/api/client";
import { DeleteRegular } from "@/lib/fluent-icons";

const LIST_COLORS = ["#0EA5E9", "#F97316", "#14B8A6", "#DB2777", "#8B5CF6", "#65A30D"];

const errorText = (error: unknown) => (error instanceof Error ? error.message : "Operazione non riuscita.");

/**
 * To-do lists of Home Assistant shown in Liste: Apple Reminders through the official iCloud
 * integration, Bring!, Todoist, local to-do lists... Familywall uses the Home Assistant connection only.
 */
export const HomeListsCard = ({ lists, onSaved }: { lists: HomeList[]; onSaved: () => void }) => {
  const [entities, setEntities] = useState<HomeEntity[] | null>(null);
  const [chosen, setChosen] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = async (next: HomeList[]) => {
    setError(null);
    try {
      await api.updateSettings({ homeLists: next });
      onSaved();
    } catch (caught) {
      setError(errorText(caught));
    }
  };

  const load = async () => {
    setError(null);
    try {
      const found = await api.getHomeTodoEntities();
      setEntities(found);
      if (found.length === 0) {
        setError("Nessuna lista todo.* in Home Assistant, oppure Home Assistant non è collegato.");
      }
    } catch (caught) {
      setError(errorText(caught));
    }
  };

  const available = (entities ?? []).filter((entity) => !lists.some((list) => list.entityId === entity.entityId));

  const add = () => {
    const entity = available.find((entry) => entry.entityId === chosen);
    if (entity) {
      void save([...lists, { entityId: entity.entityId, name: entity.name, color: LIST_COLORS[lists.length % LIST_COLORS.length]! }]);
      setChosen("");
    }
  };

  return (
    <Card className="panel-card">
      <div className="panel-card__header">
        <div>
          <p className="eyebrow">Home Assistant</p>
          <h3>Liste di Home Assistant</h3>
        </div>
        {entities === null ? <Button onClick={() => void load()}>Scegli liste</Button> : null}
      </div>
      <p>
        Le liste <code>todo.*</code> di Home Assistant compaiono in Liste e si possono spuntare e modificare. Con l'integrazione ufficiale{" "}
        <strong>Apple iCloud</strong> di Home Assistant arrivano anche i Promemoria di iCloud; vanno bene anche Bring!, Todoist o le liste locali.
      </p>
      {error ? (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      ) : null}
      {lists.length === 0 ? (
        <p className="calendar-detail-hint">Nessuna lista di Home Assistant.</p>
      ) : (
        <div className="stack-list">
          {lists.map((list) => (
            <article key={list.entityId} className="routine-row">
              <div className="calendar-config-main">
                <input
                  type="color"
                  aria-label={`Colore di ${list.name}`}
                  value={list.color}
                  onChange={(change) => void save(lists.map((entry) => (entry.entityId === list.entityId ? { ...entry, color: change.target.value.toUpperCase() } : entry)))}
                />
                <div>
                  <strong>{list.name}</strong>
                  <p>{list.entityId} · Home Assistant</p>
                </div>
              </div>
              <div className="row-actions">
                <Button
                  appearance="subtle"
                  icon={<DeleteRegular />}
                  aria-label={`Rimuovi ${list.name}`}
                  onClick={() => void save(lists.filter((entry) => entry.entityId !== list.entityId))}
                />
              </div>
            </article>
          ))}
        </div>
      )}
      {entities !== null && available.length > 0 ? (
        <div className="inline-form">
          <Field label="Lista di Home Assistant">
            <select className="native-select" value={chosen} onChange={(change) => setChosen(change.target.value)}>
              <option value="">Scegli…</option>
              {available.map((entity) => (
                <option key={entity.entityId} value={entity.entityId}>
                  {entity.name} ({entity.state} voci)
                </option>
              ))}
            </select>
          </Field>
          <Button appearance="primary" disabled={!chosen} onClick={add}>
            Aggiungi
          </Button>
        </div>
      ) : null}
    </Card>
  );
};
