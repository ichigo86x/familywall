import { useEffect, useState } from "react";
import {
  Button,
  Card,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Input,
  MessageBar,
  MessageBarBody,
  Spinner,
  Switch
} from "@fluentui/react-components";
import type { ProviderAccount, RemoteTaskList, TaskListConfig } from "@familywall/shared";

import { api } from "@/api/client";
import { DeleteRegular } from "@/lib/fluent-icons";

const LIST_COLORS = ["#F97316", "#2563EB", "#14B8A6", "#DB2777", "#8B5CF6", "#65A30D"];

const errorText = (error: unknown) => (error instanceof Error ? error.message : "Operazione non riuscita.");

/** Google Tasks lists shown in the "Liste" page, with name, color and visibility. */
export const TaskListsSection = ({ lists, onChanged }: { lists: TaskListConfig[]; onChanged: () => void }) => {
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

  return (
    <Card className="panel-card">
      <div className="panel-card__header">
        <div>
          <p className="eyebrow">Liste</p>
          <h3>Liste Google visibili</h3>
        </div>
      </div>
      {feedback ? (
        <MessageBar intent="error">
          <MessageBarBody>{feedback}</MessageBarBody>
        </MessageBar>
      ) : null}
      {lists.length === 0 ? (
        <p className="calendar-detail-hint">Nessuna lista aggiunta. Usa "Scegli liste" su un account Google.</p>
      ) : (
        <div className="stack-list">
          {lists.map((list) => (
            <TaskListRow
              key={list.id}
              list={list}
              onAction={run}
              onRemove={() => {
                if (window.confirm(`Rimuovere ${list.name} da Familywall? La lista su Google non viene toccata.`)) {
                  void run(() => api.deleteTaskList(list.id));
                }
              }}
            />
          ))}
        </div>
      )}
    </Card>
  );
};

const TaskListRow = ({
  list,
  onAction,
  onRemove
}: {
  list: TaskListConfig;
  onAction: (action: () => Promise<unknown>) => Promise<void>;
  onRemove: () => void;
}) => {
  const [name, setName] = useState(list.name);
  return (
    <article className="routine-row">
      <div className="calendar-config-main">
        <input
          type="color"
          value={list.color}
          aria-label="Colore lista"
          onChange={(change) => void onAction(() => api.updateTaskList(list.id, { color: change.target.value.toUpperCase() }))}
        />
        <div>
          <Input
            value={name}
            aria-label="Nome lista"
            onChange={(_, data) => setName(data.value)}
            onBlur={() => (name.trim() && name !== list.name ? void onAction(() => api.updateTaskList(list.id, { name: name.trim() })) : undefined)}
          />
          <p>{list.accountLabel} · Google Tasks</p>
        </div>
      </div>
      <div className="row-actions">
        <Switch
          label={list.enabled ? "Visibile" : "Nascosta"}
          checked={list.enabled}
          onChange={(_, data) => void onAction(() => api.updateTaskList(list.id, { enabled: data.checked }))}
        />
        <Button appearance="subtle" icon={<DeleteRegular />} aria-label="Rimuovi" onClick={onRemove} />
      </div>
    </article>
  );
};

export const DiscoverListsDialog = ({ account, onClose }: { account: ProviderAccount; onClose: () => void }) => {
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; lists: RemoteTaskList[]; error?: string }>({ status: "loading", lists: [] });
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .discoverTaskLists(account.id)
      .then((lists) => active && setState({ status: "ready", lists }))
      .catch((caught: unknown) => active && setState({ status: "error", lists: [], error: errorText(caught) }));
    return () => {
      active = false;
    };
  }, [account.id]);

  const add = async (list: RemoteTaskList, index: number) => {
    setError(null);
    try {
      await api.addTaskList({ accountId: account.id, remoteId: list.remoteId, name: list.name, color: LIST_COLORS[index % LIST_COLORS.length]! });
      setAdded((current) => new Set(current).add(list.remoteId));
    } catch (caught) {
      setError(errorText(caught));
    }
  };

  return (
    <Dialog open onOpenChange={(_, data) => (!data.open ? onClose() : undefined)}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Liste di {account.label}</DialogTitle>
          <DialogContent className="dialog-form">
            {state.status === "loading" ? <Spinner label="Lettura delle liste da Google..." /> : null}
            {state.status === "error" ? <p className="form-error">{state.error}</p> : null}
            {state.status === "ready" && state.lists.length === 0 ? <p className="calendar-detail-hint">Nessuna lista trovata in Google Tasks.</p> : null}
            {state.lists.map((list, index) => {
              const isAdded = list.alreadyAdded || added.has(list.remoteId);
              return (
                <div key={list.remoteId} className="discover-row">
                  <span className="calendar-legend-swatch" style={{ background: LIST_COLORS[index % LIST_COLORS.length] }} />
                  <strong>{list.name}</strong>
                  <Button size="small" appearance={isAdded ? "subtle" : "primary"} disabled={isAdded} onClick={() => void add(list, index)}>
                    {isAdded ? "Aggiunta" : "Aggiungi"}
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
