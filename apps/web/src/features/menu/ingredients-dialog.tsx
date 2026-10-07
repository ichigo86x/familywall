import { useEffect, useMemo, useState } from "react";
import { Button, Checkbox, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, Field } from "@fluentui/react-components";
import { ingredientKey, type FamilyTaskList } from "@familywall/shared";

import { api } from "@/api/client";
import { CloseableDialogTitle } from "@/components/closeable-dialog-title";

/** A dish whose ingredients can go to the shopping list. */
export interface DishSource {
  /** Event id (Cookidoo dishes are looked up on the server by it). */
  id: string;
  title: string;
  /** Known ingredients; null = ask Cookidoo. */
  ingredients: string[] | null;
  cookidoo: boolean;
}

interface Row {
  key: string;
  text: string;
  dishes: string[];
  alreadyListed: boolean;
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : "Operazione non riuscita.");

/** The shopping list by name, or the first list. */
const defaultList = (lists: FamilyTaskList[]) => lists.find((list) => /spesa|shopping|grocer/i.test(list.name)) ?? lists[0];

/**
 * Collects the ingredients of the chosen dishes (merging duplicates), lets the user untick
 * what is already at home and adds the rest to a list. Items already open in the list are skipped.
 */
export const IngredientsDialog = ({ dishes, onClose }: { dishes: DishSource[]; onClose: () => void }) => {
  const [lists, setLists] = useState<FamilyTaskList[] | null>(null);
  const [listId, setListId] = useState("");
  const [cookidoo, setCookidoo] = useState<Record<string, string[] | null> | null>(null);
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api
      .getLists()
      .then((response) => {
        setLists(response.lists);
        setListId(defaultList(response.lists)?.id ?? "");
      })
      .catch((error: unknown) => setMessage({ ok: false, text: errorText(error) }));
    const lookups = dishes.filter((dish) => dish.cookidoo && dish.ingredients === null).map((dish) => dish.id);
    if (lookups.length === 0) {
      setCookidoo({});
      return;
    }
    api
      .getCookidooIngredients(lookups)
      .then(setCookidoo)
      .catch(() => setCookidoo({}));
  }, [dishes]);

  const list = lists?.find((entry) => entry.id === listId);
  const openTitles = useMemo(() => new Set((list?.tasks ?? []).filter((task) => !task.completed).map((task) => ingredientKey(task.title))), [list]);

  const rows = useMemo<Row[]>(() => {
    const byKey = new Map<string, Row>();
    for (const dish of dishes) {
      const ingredients = dish.ingredients ?? cookidoo?.[dish.id] ?? [];
      for (const text of ingredients) {
        const key = ingredientKey(text);
        const row = byKey.get(key) ?? { key, text, dishes: [], alreadyListed: openTitles.has(key) };
        if (!row.dishes.includes(dish.title)) {
          row.dishes.push(dish.title);
        }
        byKey.set(key, row);
      }
    }
    return [...byKey.values()];
  }, [dishes, cookidoo, openTitles]);

  const missing = dishes.filter((dish) => (dish.ingredients ?? cookidoo?.[dish.id] ?? []).length === 0);
  const chosen = rows.filter((row) => !row.alreadyListed && !unticked.has(row.key));

  const add = async () => {
    if (!list) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      for (const row of chosen) {
        await api.createTask(list.id, row.text);
      }
      setMessage({ ok: true, text: `${chosen.length} ${chosen.length === 1 ? "voce aggiunta" : "voci aggiunte"} a "${list.name}".` });
      setUnticked(new Set(rows.map((row) => row.key)));
    } catch (error) {
      setMessage({ ok: false, text: errorText(error) });
    } finally {
      setBusy(false);
    }
  };

  const loading = lists === null || cookidoo === null;

  return (
    <Dialog open onOpenChange={(_, data) => (!data.open ? onClose() : undefined)}>
      <DialogSurface className="event-dialog">
        <DialogBody>
          <CloseableDialogTitle>Ingredienti nella lista della spesa</CloseableDialogTitle>
          <DialogContent className="dialog-form">
            {loading ? (
              <p className="calendar-detail-hint">Raccolgo gli ingredienti...</p>
            ) : (lists ?? []).length === 0 ? (
              <p className="form-error">Nessuna lista disponibile: collega le liste dei Promemoria o di Google.</p>
            ) : (
              <>
                <Field label="Aggiungi a">
                  <select className="native-select" value={listId} onChange={(change) => setListId(change.target.value)}>
                    {lists!.map((entry) => (
                      <option key={entry.id} value={entry.id}>{entry.name}</option>
                    ))}
                  </select>
                </Field>
                {rows.length === 0 ? (
                  <p className="calendar-detail-hint">Nessun ingrediente indicato per questi piatti.</p>
                ) : (
                  <ul className="ingredients-list">
                    {rows.map((row) => (
                      <li key={row.key}>
                        <Checkbox
                          checked={!row.alreadyListed && !unticked.has(row.key)}
                          disabled={row.alreadyListed}
                          label={
                            <span>
                              {row.text}
                              <span className="ingredients-list__dish">
                                {row.alreadyListed ? "già in lista · " : ""}
                                {row.dishes.join(", ")}
                              </span>
                            </span>
                          }
                          onChange={(_, data) =>
                            setUnticked((current) => {
                              const next = new Set(current);
                              if (data.checked) {
                                next.delete(row.key);
                              } else {
                                next.add(row.key);
                              }
                              return next;
                            })
                          }
                        />
                      </li>
                    ))}
                  </ul>
                )}
                {missing.length > 0 ? (
                  <p className="calendar-detail-hint">
                    Senza ingredienti: {missing.map((dish) => dish.title).join(", ")}. Aggiungili al piatto (o nella descrizione dell'evento del calendario
                    menu).
                  </p>
                ) : null}
              </>
            )}
            {message ? <p className={message.ok ? "form-success" : "form-error"}>{message.text}</p> : null}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>Chiudi</Button>
            <Button appearance="primary" disabled={busy || loading || !list || chosen.length === 0} onClick={() => void add()}>
              {busy ? "Aggiungo..." : `Aggiungi ${chosen.length}`}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};
