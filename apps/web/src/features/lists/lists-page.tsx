import { useEffect, useState } from "react";
import { Button, Card, MessageBar, MessageBarBody } from "@fluentui/react-components";
import type { FamilyTaskList, TaskItem } from "@familywall/shared";

import { api } from "@/api/client";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth/use-auth";
import { EmptyState, ErrorState, LoadingState } from "@/components/page-states";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { AddRegular, ArrowClockwiseRegular, DismissRegular, PinRegular } from "@/lib/fluent-icons";
import { RemindersSetup } from "./reminders-setup";

/** Lists change from phones too: refresh periodically like the calendar. */
const AUTO_REFRESH_MS = 2 * 60 * 1000;

const errorText = (error: unknown) => (error instanceof Error ? error.message : "Operazione non riuscita.");

export const ListsPage = () => {
  const auth = useAuth();
  const canWrite = auth.can("lists:write");
  const lists = useAsyncResource(() => api.getLists(), []);
  const settings = useAsyncResource(() => api.getSettings(), []);
  const dashboardIds = settings.data?.dashboardListIds ?? [];
  const toggleDashboard = async (listId: string) => {
    const next = dashboardIds.includes(listId) ? dashboardIds.filter((id) => id !== listId) : [...dashboardIds, listId];
    await api.setDashboardLists(next);
    settings.reload();
  };

  useEffect(() => {
    const timer = window.setInterval(lists.reload, AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [lists.reload]);

  const openCount = (lists.data?.lists ?? []).reduce((total, list) => total + list.tasks.filter((task) => !task.completed).length, 0);

  return (
    <AppShell
      compact
      currentRoute="/lists"
      eyebrow="Liste"
      title="Liste della famiglia"
      subtitle=""
      summaryChip={`${openCount} da fare`}
      toolbarActions={
        <Button appearance="secondary" icon={<ArrowClockwiseRegular />} onClick={lists.reload}>
          Aggiorna
        </Button>
      }
    >
      {lists.status === "loading" && !lists.data ? (
        <LoadingState title="Caricamento liste" message="Lettura delle liste da Google." />
      ) : lists.status === "error" ? (
        <ErrorState title="Liste non disponibili" message={lists.error.message} actionLabel="Riprova" onAction={lists.reload} />
      ) : (lists.data?.lists.length ?? 0) === 0 ? (
        <EmptyState
          title="Nessuna lista"
          message={auth.can("providers:manage") ? 'Collega un account Google e usa "Scegli liste" nella sezione Admin.' : "Chiedi all'amministratore di aggiungere le liste."}
          actionLabel="Ricarica"
          onAction={lists.reload}
        />
      ) : (
        <>
        {canWrite ? <RemindersSetup /> : null}
        <div className="task-lists-grid">
          {lists.data!.lists.map((list) => (
            <TaskListCard
              key={list.id}
              list={list}
              canWrite={canWrite}
              onChanged={lists.reload}
              onDashboard={dashboardIds.includes(list.id)}
              onToggleDashboard={() => void toggleDashboard(list.id)}
            />
          ))}
        </div>
        </>
      )}
    </AppShell>
  );
};

/** Optimistic updates keep ticking fast on the wall panel; the list is re-read afterwards. */
interface TaskListCardProps {
  list: FamilyTaskList;
  canWrite: boolean;
  onChanged: () => void;
  onDashboard: boolean;
  onToggleDashboard: () => void;
}

const TaskListCard = ({ list, canWrite, onChanged, onDashboard, onToggleDashboard }: TaskListCardProps) => {
  const [tasks, setTasks] = useState<TaskItem[]>(list.tasks);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setTasks(list.tasks), [list.tasks]);

  const act = async (optimistic: (current: TaskItem[]) => TaskItem[], action: () => Promise<unknown>) => {
    setError(null);
    setTasks(optimistic);
    try {
      await action();
    } catch (caught) {
      setError(errorText(caught));
    }
    onChanged();
  };

  const add = () => {
    const title = draft.trim();
    if (!title) {
      return;
    }
    setDraft("");
    void act(
      (current) => [{ id: `pending-${Date.now()}`, title, notes: null, completed: false, completedAt: null, due: null }, ...current],
      () => api.createTask(list.id, title)
    );
  };

  const open = tasks.filter((task) => !task.completed);
  const done = tasks.filter((task) => task.completed);

  return (
    <Card className="panel-card task-list-card" style={{ borderTopColor: list.color }}>
      <div className="task-list-card__header">
        <span className="legend-chip__swatch" style={{ background: list.color }} />
        <h3>{list.name}</h3>
        <span className={`list-source list-source--${list.source}`}>{list.source === "reminders" ? "Promemoria" : list.source === "homeassistant" ? "Home Assistant" : "Google"}</span>
        {canWrite ? (
          <Button
            size="small"
            appearance={onDashboard ? "primary" : "subtle"}
            icon={<PinRegular />}
            aria-pressed={onDashboard}
            title={onDashboard ? "Mostrata in dashboard (tocca per togliere)" : "Mostra in dashboard"}
            aria-label={onDashboard ? "Togli dalla dashboard" : "Mostra in dashboard"}
            onClick={onToggleDashboard}
          />
        ) : null}
        <span className="calendar-detail-hint">{open.length}</span>
      </div>

      {list.lastError ? (
        <MessageBar intent="warning">
          <MessageBarBody>{list.lastError}</MessageBarBody>
        </MessageBar>
      ) : null}

      {canWrite ? (
        <form
          className="task-add"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <input value={draft} placeholder="Aggiungi..." aria-label={`Aggiungi a ${list.name}`} onChange={(change) => setDraft(change.target.value)} />
          <Button type="submit" appearance="primary" icon={<AddRegular />} aria-label="Aggiungi" disabled={!draft.trim()} />
        </form>
      ) : null}

      <ul className="task-items">
        {[...open, ...done].map((task) => (
          <li key={task.id} className={`task-item ${task.completed ? "task-item--done" : ""}`.trim()}>
            <label>
              <input
                type="checkbox"
                checked={task.completed}
                disabled={!canWrite || task.id.startsWith("pending-")}
                onChange={(change) => {
                  const completed = change.target.checked;
                  void act(
                    (current) => current.map((item) => (item.id === task.id ? { ...item, completed } : item)),
                    () => api.updateTask(list.id, task.id, { completed })
                  );
                }}
              />
              <span>{task.title}</span>
            </label>
            {canWrite && !task.id.startsWith("pending-") ? (
              <Button
                size="small"
                appearance="subtle"
                icon={<DismissRegular />}
                aria-label={`Elimina ${task.title}`}
                onClick={() =>
                  void act(
                    (current) => current.filter((item) => item.id !== task.id),
                    () => api.deleteTask(list.id, task.id)
                  )
                }
              />
            ) : null}
          </li>
        ))}
        {tasks.length === 0 ? <li className="calendar-detail-hint">Lista vuota.</li> : null}
      </ul>

      {error ? <p className="form-error">{error}</p> : null}
    </Card>
  );
};
