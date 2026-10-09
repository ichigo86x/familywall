import { useMemo, useState } from "react";
import { Button, Card, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, Field, Input, Textarea } from "@fluentui/react-components";
import {
  MEAL_SLOTS,
  MEAL_SLOT_LABELS,
  MENU_CALENDAR_ID,
  MENU_EVENT_PREFIX,
  ingredientsFromText,
  menuMealSchema,
  type MealSlot,
  type MenuMeal
} from "@familywall/shared";

import { api } from "@/api/client";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth/use-auth";
import { CloseableDialogTitle } from "@/components/closeable-dialog-title";
import { ErrorState, LoadingState } from "@/components/page-states";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { useNewParam } from "@/hooks/use-new-param";
import { AddRegular } from "@/lib/fluent-icons";
import { addDays, dayKey, occursOnDay } from "@/features/calendar/calendar-time";
import { PeriodToolbar, usePeriod } from "@/features/calendar/period-view";
import type { PlannerEvent } from "@/features/calendar/calendar-page";
import { IngredientsDialog, type DishSource } from "./ingredients-dialog";

const errorText = (error: unknown) => (error instanceof Error ? error.message : "Operazione non riuscita.");

/** A dish shown in the week: from the family menu, Cookidoo or a calendar marked as menu. */
interface Dish extends PlannerEvent {
  cookidoo: boolean;
  meal: MenuMeal | null;
}

const toSource = (dish: Dish): DishSource => ({
  id: dish.id,
  title: dish.title,
  ingredients: dish.meal ? dish.meal.ingredients : dish.cookidoo ? null : ingredientsFromText(dish.notes),
  cookidoo: dish.cookidoo
});

export const MenuPage = () => {
  const auth = useAuth();
  const canWrite = auth.can("events:write");
  const canShop = auth.can("lists:write");
  const period = usePeriod("familywall.menu.view");
  const [editing, setEditing] = useState<{ meal: MenuMeal | null; date: string } | null>(null);
  const [viewing, setViewing] = useState<Dish | null>(null);
  const [shopping, setShopping] = useState<DishSource[] | null>(null);
  useNewParam(canWrite, () => setEditing({ meal: null, date: dayKey(new Date()) }));

  const days = period.days;
  const from = dayKey(period.start);
  const to = dayKey(addDays(period.end, -1));
  const data = useAsyncResource(
    async () => {
      const [calendar, meals] = await Promise.all([api.getCalendar(period.start.toISOString(), period.end.toISOString()), api.getMenu(from, to)]);
      return { calendar, meals };
    },
    [from, to],
    `menu:${from}:${to}`
  );

  const dishes = useMemo<Dish[]>(() => {
    const mealsById = new Map((data.data?.meals ?? []).map((meal) => [MENU_EVENT_PREFIX + meal.id, meal]));
    return (data.data?.calendar.calendars ?? [])
      .filter((calendar) => calendar.kind === "meals")
      .flatMap((calendar) =>
        calendar.events.map((event) => ({
          ...event,
          calendarColor: calendar.color,
          calendarName: calendar.name,
          cookidoo: calendar.id !== MENU_CALENDAR_ID && calendar.readOnly,
          meal: mealsById.get(event.id) ?? null
        }))
      );
  }, [data.data]);

  const sources = (data.data?.calendar.calendars ?? []).filter((calendar) => calendar.kind === "meals");
  const todayKey = dayKey(new Date());
  const weekDishes = dishes.filter((dish) => days.some((day) => occursOnDay(dish, day)));

  return (
    <AppShell
      compact
      currentRoute="/menu"
      eyebrow={period.label}
      title="Menu"
      subtitle=""
      summaryChip={`${weekDishes.length} piatti`}
      toolbarActions={
        <div className="calendar-toolbar">
          <PeriodToolbar period={period} />
          {canShop ? (
            <Button appearance="secondary" disabled={weekDishes.length === 0} onClick={() => setShopping(weekDishes.map(toSource))}>
              🛒 Ingredienti → spesa
            </Button>
          ) : null}
          {canWrite ? (
            <Button appearance="primary" icon={<AddRegular />} onClick={() => setEditing({ meal: null, date: dayKey(new Date()) })}>
              Nuovo piatto
            </Button>
          ) : null}
        </div>
      }
    >
      {data.status === "loading" && !data.data ? (
        <LoadingState title="Caricamento menu" message="Lettura dei menu." />
      ) : data.status === "error" ? (
        <ErrorState title="Menu non disponibile" message={data.error.message} actionLabel="Riprova" onAction={data.reload} />
      ) : (
        <Card className="panel-card">
          <div className="calendar-legend">
            {sources.length === 0 ? (
              <p className="calendar-detail-hint">
                Nessun piatto. Aggiungi i piatti qui, collega Cookidoo o segna un calendario come "Menu" in Admin (gli ingredienti vanno nella descrizione
                dell'evento, uno per riga).
              </p>
            ) : (
              sources.map((source) => (
                <span key={source.id} className="legend-chip legend-chip--calendar">
                  <span className="legend-chip__swatch legend-chip__swatch--square" style={{ background: source.color }} />
                  {source.name}
                </span>
              ))
            )}
          </div>
          <div className={`schedule-week schedule-week--${period.mode}`}>
            {days.map((day) => {
              const key = dayKey(day);
              const dayDishes = dishes.filter((dish) => occursOnDay(dish, day));
              const isToday = key === todayKey;
              return (
                <section
                  key={key}
                  className={`schedule-day ${isToday ? "schedule-day--today" : ""} ${key < todayKey ? "planner-day--past" : ""} ${period.outside(day) ? "schedule-day--outside" : ""}`.trim()}
                >
                  <header>
                    <strong>{day.toLocaleDateString("it-IT", { weekday: period.mode === "week" ? "long" : "short" })}</strong>
                    {isToday ? <span className="today-pill">Oggi</span> : <span>{day.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}</span>}
                  </header>
                  {dayDishes.map((dish) => (
                    <button
                      key={dish.id}
                      type="button"
                      className="menu-dish"
                      style={{ borderLeftColor: dish.calendarColor }}
                      onClick={() => (dish.meal && canWrite ? setEditing({ meal: dish.meal, date: dish.meal.date }) : setViewing(dish))}
                    >
                      <strong>{dish.title}</strong>
                      <span>{dish.calendarName}</span>
                    </button>
                  ))}
                  {canWrite ? (
                    <button type="button" className="menu-add" onClick={() => setEditing({ meal: null, date: key })} aria-label={`Aggiungi un piatto a ${day.toLocaleDateString("it-IT", { weekday: "long" })}`}>
                      + piatto
                    </button>
                  ) : dayDishes.length === 0 ? (
                    <p className="calendar-detail-hint">—</p>
                  ) : null}
                  {canShop && dayDishes.length > 0 ? (
                    <button type="button" className="menu-add" onClick={() => setShopping(dayDishes.map(toSource))}>
                      🛒 spesa del giorno
                    </button>
                  ) : null}
                </section>
              );
            })}
          </div>
        </Card>
      )}

      {editing ? (
        <MealDialog
          meal={editing.meal}
          date={editing.date}
          onClose={() => setEditing(null)}
          onShop={canShop ? (source) => setShopping([source]) : undefined}
          onSaved={() => {
            setEditing(null);
            data.reload();
          }}
        />
      ) : null}
      {viewing ? (
        <DishDialog
          dish={viewing}
          onClose={() => setViewing(null)}
          onShop={canShop ? () => {
            setShopping([toSource(viewing)]);
            setViewing(null);
          } : undefined}
        />
      ) : null}
      {shopping ? <IngredientsDialog dishes={shopping} onClose={() => setShopping(null)} /> : null}
    </AppShell>
  );
};

/** Cookidoo or menu-calendar dish: read only, with its ingredients. */
const DishDialog = ({ dish, onClose, onShop }: { dish: Dish; onClose: () => void; onShop?: () => void }) => {
  const ingredients = dish.meal?.ingredients ?? (dish.cookidoo ? null : ingredientsFromText(dish.notes));
  return (
    <Dialog open onOpenChange={(_, data) => (!data.open ? onClose() : undefined)}>
      <DialogSurface className="event-dialog">
        <DialogBody>
          <CloseableDialogTitle>{dish.title}</CloseableDialogTitle>
          <DialogContent className="dialog-form">
            <p className="calendar-detail-hint">{dish.calendarName}</p>
            {ingredients === null ? (
              <p>Gli ingredienti delle ricette Cookidoo si leggono quando li mandi nella lista della spesa.</p>
            ) : ingredients.length === 0 ? (
              <p className="calendar-detail-hint">Nessun ingrediente nella descrizione dell'evento.</p>
            ) : (
              <ul className="ingredients-plain">
                {ingredients.map((ingredient) => (
                  <li key={ingredient}>{ingredient}</li>
                ))}
              </ul>
            )}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>Chiudi</Button>
            {onShop ? (
              <Button appearance="primary" onClick={onShop}>
                🛒 Ingredienti → spesa
              </Button>
            ) : null}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};

interface MealDialogProps {
  meal: MenuMeal | null;
  date: string;
  onClose: () => void;
  onSaved: () => void;
  onShop?: (source: DishSource) => void;
}

const MealDialog = ({ meal, date, onClose, onSaved, onShop }: MealDialogProps) => {
  const [form, setForm] = useState({
    date: meal?.date ?? date,
    slot: meal?.slot ?? ("cena" as MealSlot),
    title: meal?.title ?? "",
    ingredients: (meal?.ingredients ?? []).join("\n"),
    note: meal?.note ?? ""
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const parsed = () =>
    menuMealSchema.safeParse({
      date: form.date,
      slot: form.slot,
      title: form.title,
      ingredients: ingredientsFromText(form.ingredients),
      note: form.note.trim() || null
    });

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

  const save = () => {
    const result = parsed();
    if (!result.success) {
      setError(result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(" · "));
      return;
    }
    void run(() => (meal ? api.updateMenuMeal(meal.id, result.data) : api.createMenuMeal(result.data)));
  };

  return (
    <Dialog open onOpenChange={(_, data) => (!data.open ? onClose() : undefined)}>
      <DialogSurface className="event-dialog">
        <DialogBody>
          <CloseableDialogTitle>{meal ? "Modifica piatto" : "Nuovo piatto"}</CloseableDialogTitle>
          <DialogContent className="dialog-form">
            <div className="menu-form-row">
              <Field label="Giorno">
                <Input type="date" value={form.date} onChange={(_, data) => setForm({ ...form, date: data.value })} />
              </Field>
              <Field label="Pasto">
                <select className="native-select" value={form.slot} onChange={(change) => setForm({ ...form, slot: change.target.value as MealSlot })}>
                  {MEAL_SLOTS.map((slot) => (
                    <option key={slot} value={slot}>{MEAL_SLOT_LABELS[slot]}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Piatto" required>
              <Input value={form.title} maxLength={120} placeholder="Es. Lasagne, minestrone, pizza" onChange={(_, data) => setForm({ ...form, title: data.value })} />
            </Field>
            <Field label="Ingredienti" hint="Uno per riga, con la quantità se serve (es. 500 g di ragù).">
              <Textarea resize="vertical" rows={6} value={form.ingredients} onChange={(_, data) => setForm({ ...form, ingredients: data.value })} />
            </Field>
            <Field label="Nota">
              <Input value={form.note} maxLength={500} onChange={(_, data) => setForm({ ...form, note: data.value })} />
            </Field>
            {error ? <p className="form-error">{error}</p> : null}
          </DialogContent>
          <DialogActions>
            {meal ? (
              <Button appearance="secondary" disabled={busy} onClick={() => (window.confirm("Eliminare il piatto?") ? void run(() => api.deleteMenuMeal(meal.id)) : undefined)}>
                Elimina
              </Button>
            ) : null}
            {meal && onShop ? (
              <Button
                appearance="secondary"
                disabled={busy}
                onClick={() => onShop({ id: MENU_EVENT_PREFIX + meal.id, title: meal.title, ingredients: ingredientsFromText(form.ingredients), cookidoo: false })}
              >
                🛒 Spesa
              </Button>
            ) : null}
            <Button appearance="secondary" onClick={onClose}>Annulla</Button>
            <Button appearance="primary" disabled={busy || !form.title.trim()} onClick={save}>
              Salva
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};
