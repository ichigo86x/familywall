import { useEffect, useState } from "react";
import { Button, Card, MessageBar, MessageBarBody } from "@fluentui/react-components";
import { AISLES, OTHER_AISLE, aisleOf, ingredientKey, isShoppingList, type FamilyTaskList, type TaskItem } from "@familywall/shared";

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

/** Per device: shopping lists grouped by supermarket aisle (on by default). */
const BY_AISLE_KEY = "familywall.lists.byAisle";
const readByAisle = (): boolean => {
  try {
    return window.localStorage.getItem(BY_AISLE_KEY) !== "0";
  } catch {
    return true;
  }
};

const AISLE_ORDER = [...AISLES.map((aisle) => aisle.id), OTHER_AISLE.id];

/** Open items grouped by aisle, in the order of a walk through the supermarket. */
const byAisle = (tasks: TaskItem[]) => {
  const groups = new Map<string, { label: string; icon: string; tasks: TaskItem[] }>();
  for (const task of tasks) {
    const aisle = aisleOf(task.title);
    const group = groups.get(aisle.id) ?? { label: aisle.label, icon: aisle.icon, tasks: [] };
    group.tasks.push(task);
    groups.set(aisle.id, group);
  }
  return [...groups.entries()].sort(([left], [right]) => AISLE_ORDER.indexOf(left) - AISLE_ORDER.indexOf(right)).map(([id, group]) => ({ id, ...group }));
};

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
  const shopping = isShoppingList(list.name);
  const [grouped, setGrouped] = useState(readByAisle);
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const hasHistory = list.source !== "google";

  useEffect(() => setTasks(list.tasks), [list.tasks]);

  const toggleGrouped = () => {
    const next = !grouped;
    setGrouped(next);
    try {
      window.localStorage.setItem(BY_AISLE_KEY, next ? "1" : "0");
    } catch {
      // Private mode: the choice lasts until the page is closed.
    }
  };

  const toggleSuggestions = () => {
    const next = !showSuggestions;
    setShowSuggestions(next);
    if (next) {
      setSuggestions(null);
      api
        .getListSuggestions(list.id)
        .then(setSuggestions)
        .catch((caught: unknown) => {
          setSuggestions([]);
          setError(errorText(caught));
        });
    }
  };

  const openKeys = new Set(tasks.filter((task) => !task.completed).map((task) => ingredientKey(task.title)));
  const shownSuggestions = (suggestions ?? []).filter((title) => !openKeys.has(ingredientKey(title)));

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

  const add = (value = draft) => {
    const title = value.trim();
    if (!title) {
      return;
    }
    if (value === draft) {
      setDraft("");
    }
    void act(
      (current) => [{ id: `pending-${Date.now()}`, title, notes: null, completed: false, completedAt: null, due: null }, ...current],
      () => api.createTask(list.id, title)
    );
  };

  const open = tasks.filter((task) => !task.completed);
  const done = tasks.filter((task) => task.completed);

  const renderTask = (task: TaskItem) => (
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
  );

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

      {(canWrite && hasHistory) || shopping ? (
        <div className="task-tools">
          {canWrite && hasHistory ? (
            <Button size="small" appearance={showSuggestions ? "primary" : "secondary"} aria-pressed={showSuggestions} onClick={toggleSuggestions}>
              💡 Comprati spesso
            </Button>
          ) : null}
          {shopping ? (
            <Button size="small" appearance={grouped ? "primary" : "secondary"} aria-pressed={grouped} onClick={toggleGrouped}>
              🛒 Per reparto
            </Button>
          ) : null}
        </div>
      ) : null}

      {showSuggestions ? (
        <div className="task-suggestions" aria-label="Voci suggerite">
          {suggestions === null ? (
            <span className="calendar-detail-hint">Cerco le voci frequenti...</span>
          ) : shownSuggestions.length === 0 ? (
            <span className="calendar-detail-hint">Nessun suggerimento: le voci spuntate nel tempo compariranno qui.</span>
          ) : (
            shownSuggestions.map((title) => (
              <button key={title} type="button" className="task-suggestion" onClick={() => add(title)}>
                + {title}
              </button>
            ))
          )}
        </div>
      ) : null}

      {shopping && grouped
        ? byAisle(open).map((group) => (
            <section key={group.id} className="task-aisle">
              <h4>
                <span aria-hidden="true">{group.icon}</span> {group.label}
              </h4>
              <ul className="task-items">{group.tasks.map(renderTask)}</ul>
            </section>
          ))
        : null}

      <ul className="task-items">
        {(shopping && grouped ? done : [...open, ...done]).map(renderTask)}
        {tasks.length === 0 ? <li className="calendar-detail-hint">Lista vuota.</li> : null}
      </ul>

      {error ? <p className="form-error">{error}</p> : null}
    </Card>
  );
};
