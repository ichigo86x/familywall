import { useState } from "react";
import { Button, Card, MessageBar, MessageBarBody } from "@fluentui/react-components";
import type { HomePresenceLink, User } from "@familywall/shared";

import { api } from "@/api/client";
import { useAsyncResource } from "@/hooks/use-async-resource";

const errorText = (error: unknown) => (error instanceof Error ? error.message : "Operazione non riuscita.");

/** Links members to the person.* entities of Home Assistant: the dashboard then shows who is at home. */
export const PresenceCard = ({ members, links, onSaved }: { members: User[]; links: HomePresenceLink[]; onSaved: () => void }) => {
  const people = useAsyncResource(() => api.getHomePersonEntities(), []);
  const [chosen, setChosen] = useState<Record<string, string>>(() => Object.fromEntries(links.map((link) => [link.memberId, link.entityId])));
  const [result, setResult] = useState<{ intent: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const family = members.filter((member) => member.role !== "Kiosk" && !member.disabled);

  const save = async () => {
    setBusy(true);
    setResult(null);
    try {
      const homePresence = Object.entries(chosen)
        .filter(([memberId, entityId]) => entityId && family.some((member) => member.id === memberId))
        .map(([memberId, entityId]) => ({ memberId, entityId }));
      await api.updateSettings({ homePresence });
      setResult({ intent: "success", text: "Salvato." });
      onSaved();
    } catch (caught) {
      setResult({ intent: "error", text: errorText(caught) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="panel-card">
      <div className="panel-card__header">
        <div>
          <p className="eyebrow">Home Assistant</p>
          <h3>Chi è a casa</h3>
        </div>
        <Button appearance="primary" disabled={busy} onClick={() => void save()}>
          Salva
        </Button>
      </div>
      <p className="calendar-detail-hint">
        Collega ogni membro alla sua persona di Home Assistant (person.*, di solito con l'app Companion sul telefono): la dashboard mostra chi è a
        casa, chi è fuori e in quale zona.
      </p>
      {people.status === "error" ? <p className="form-error">{people.error.message}</p> : null}
      <div className="presence-links">
        {family.map((member) => (
          <label key={member.id} className="presence-link">
            <span className="legend-chip__swatch" style={{ background: member.color }} />
            <span>{member.displayName}</span>
            <select
              className="native-select"
              value={chosen[member.id] ?? ""}
              onChange={(change) => setChosen({ ...chosen, [member.id]: change.target.value })}
            >
              <option value="">Nessuna</option>
              {(people.data ?? []).map((entity) => (
                <option key={entity.entityId} value={entity.entityId}>
                  {entity.name} ({entity.entityId})
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {result ? (
        <MessageBar intent={result.intent}>
          <MessageBarBody>{result.text}</MessageBarBody>
        </MessageBar>
      ) : null}
    </Card>
  );
};
