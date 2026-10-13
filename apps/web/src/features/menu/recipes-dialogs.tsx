import { useEffect, useState } from "react";
import { Button, Checkbox, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, Field, Input, Spinner, Textarea } from "@fluentui/react-components";
import { MEAL_SLOTS, MEAL_SLOT_LABELS, ingredientsFromText, type MealSlot, type MenuSuggestion, type Recipe } from "@familywall/shared";

import { api } from "@/api/client";
import { CloseableDialogTitle } from "@/components/closeable-dialog-title";

const errorText = (error: unknown) => (error instanceof Error ? error.message : "Operazione non riuscita.");

/** The family's recipes: dishes with ingredients, to put on the menu without writing them again. */
export const RecipesDialog = ({ canWrite, onClose }: { canWrite: boolean; onClose: () => void }) => {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [editing, setEditing] = useState<Recipe | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api
      .getRecipes()
      .then(setRecipes)
      .catch((caught: unknown) => {
        setRecipes([]);
        setError(errorText(caught));
      });
  useEffect(() => void load(), []);

  if (editing) {
    return (
      <RecipeDialog
        recipe={editing === "new" ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void load();
        }}
      />
    );
  }

  return (
    <Dialog open onOpenChange={(_, data) => (!data.open ? onClose() : undefined)}>
      <DialogSurface className="event-dialog">
        <DialogBody>
          <CloseableDialogTitle>Ricette di casa</CloseableDialogTitle>
          <DialogContent className="dialog-form">
            <p className="calendar-detail-hint">
              I piatti che fate spesso, con gli ingredienti: nel nuovo piatto scegli "Da una ricetta" e "💡 Suggerisci" li propone per i giorni
              vuoti. Stanno nel calendario "Ricette" del server CalDAV.
            </p>
            {recipes === null ? <Spinner size="small" label="Lettura delle ricette..." /> : null}
            {recipes?.length === 0 && !error ? <p className="calendar-detail-hint">Nessuna ricetta.</p> : null}
            <ul className="recipe-list">
              {(recipes ?? []).map((recipe) => (
                <li key={recipe.id}>
                  <button type="button" className="recipe-row" disabled={!canWrite} onClick={() => setEditing(recipe)}>
                    <strong>{recipe.title}</strong>
                    <span>
                      {recipe.slot ? MEAL_SLOT_LABELS[recipe.slot] : "Qualsiasi pasto"}
                      {recipe.ingredients.length > 0 ? ` · ${recipe.ingredients.length} ingredienti` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {error ? <p className="form-error">{error}</p> : null}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>Chiudi</Button>
            {canWrite ? (
              <Button appearance="primary" onClick={() => setEditing("new")}>
                Nuova ricetta
              </Button>
            ) : null}
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};

const RecipeDialog = ({ recipe, onClose, onSaved }: { recipe: Recipe | null; onClose: () => void; onSaved: () => void }) => {
  const [form, setForm] = useState({
    title: recipe?.title ?? "",
    slot: recipe?.slot ?? "",
    ingredients: (recipe?.ingredients ?? []).join("\n"),
    note: recipe?.note ?? ""
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onSaved();
    } catch (caught) {
      setError(errorText(caught));
      setBusy(false);
    }
  };
  const input = () => ({
    title: form.title.trim(),
    slot: (form.slot || null) as MealSlot | null,
    ingredients: ingredientsFromText(form.ingredients),
    note: form.note.trim() || null
  });

  return (
    <Dialog open onOpenChange={(_, data) => (!data.open ? onClose() : undefined)}>
      <DialogSurface className="event-dialog">
        <DialogBody>
          <CloseableDialogTitle>{recipe ? "Modifica ricetta" : "Nuova ricetta"}</CloseableDialogTitle>
          <DialogContent className="dialog-form">
            <Field label="Piatto" required>
              <Input value={form.title} maxLength={120} onChange={(_, data) => setForm({ ...form, title: data.value })} />
            </Field>
            <Field label="Pasto abituale">
              <select className="native-select" value={form.slot} onChange={(change) => setForm({ ...form, slot: change.target.value })}>
                <option value="">Qualsiasi</option>
                {MEAL_SLOTS.map((slot) => (
                  <option key={slot} value={slot}>{MEAL_SLOT_LABELS[slot]}</option>
                ))}
              </select>
            </Field>
            <Field label="Ingredienti" hint="Uno per riga, con la quantità se serve.">
              <Textarea resize="vertical" rows={6} value={form.ingredients} onChange={(_, data) => setForm({ ...form, ingredients: data.value })} />
            </Field>
            <Field label="Nota">
              <Input value={form.note} maxLength={500} onChange={(_, data) => setForm({ ...form, note: data.value })} />
            </Field>
            {error ? <p className="form-error">{error}</p> : null}
          </DialogContent>
          <DialogActions>
            {recipe ? (
              <Button appearance="secondary" disabled={busy} onClick={() => (window.confirm("Eliminare la ricetta?") ? void run(() => api.deleteRecipe(recipe.id)) : undefined)}>
                Elimina
              </Button>
            ) : null}
            <Button appearance="secondary" onClick={onClose}>Annulla</Button>
            <Button
              appearance="primary"
              disabled={busy || !form.title.trim()}
              onClick={() => void run(() => (recipe ? api.updateRecipe(recipe.id, input()) : api.createRecipe(input())))}
            >
              Salva
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};

/** Proposes dishes for the empty meals of the period shown, to add with one tap. */
export const SuggestDialog = ({ from, to, onClose, onAdded }: { from: string; to: string; onClose: () => void; onAdded: () => void }) => {
  const [slots, setSlots] = useState<MealSlot[]>(["cena"]);
  const [suggestions, setSuggestions] = useState<MenuSuggestion[] | null>(null);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setSuggestions(null);
    api
      .getMenuSuggestions(from, to, slots)
      .then((result) => {
        if (active) {
          setSuggestions(result);
          setChosen(new Set(result.map((_, index) => index)));
        }
      })
      .catch((caught: unknown) => active && setError(errorText(caught)));
    return () => {
      active = false;
    };
  }, [from, to, slots.join(",")]);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      for (const [index, entry] of (suggestions ?? []).entries()) {
        if (chosen.has(index)) {
          await api.createMenuMeal({ date: entry.date, slot: entry.slot, title: entry.title, ingredients: entry.ingredients, note: null });
        }
      }
      onAdded();
    } catch (caught) {
      setError(errorText(caught));
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(_, data) => (!data.open && !busy ? onClose() : undefined)}>
      <DialogSurface className="event-dialog">
        <DialogBody>
          <CloseableDialogTitle>💡 Menu suggerito</CloseableDialogTitle>
          <DialogContent className="dialog-form">
            <p className="calendar-detail-hint">
              Per i pasti ancora vuoti: i piatti che cucinate più spesso e le ricette, senza ripetere lo stesso piatto nella stessa settimana.
            </p>
            <div className="row-actions" role="group" aria-label="Pasti">
              {(["pranzo", "cena"] as MealSlot[]).map((slot) => (
                <Checkbox
                  key={slot}
                  label={MEAL_SLOT_LABELS[slot]}
                  checked={slots.includes(slot)}
                  onChange={(_, data) => setSlots((current) => (data.checked ? MEAL_SLOTS.filter((entry) => entry === slot || current.includes(entry)) : current.filter((entry) => entry !== slot)))}
                />
              ))}
            </div>
            {suggestions === null && !error ? <Spinner size="small" label="Preparo le proposte..." /> : null}
            {suggestions?.length === 0 ? (
              <p className="calendar-detail-hint">Nessuna proposta: aggiungi qualche ricetta o qualche piatto al menu, poi riprova.</p>
            ) : null}
            <ul className="recipe-list">
              {(suggestions ?? []).map((entry, index) => (
                <li key={`${entry.date}-${entry.slot}`}>
                  <Checkbox
                    checked={chosen.has(index)}
                    onChange={(_, data) =>
                      setChosen((current) => {
                        const next = new Set(current);
                        if (data.checked) {
                          next.add(index);
                        } else {
                          next.delete(index);
                        }
                        return next;
                      })
                    }
                    label={
                      <span>
                        <strong>{new Date(`${entry.date}T12:00:00`).toLocaleDateString("it-IT", { weekday: "short", day: "numeric" })}</strong> ·{" "}
                        {MEAL_SLOT_LABELS[entry.slot]}: {entry.title}
                        {entry.source === "recipe" ? " 📖" : ""}
                      </span>
                    }
                  />
                </li>
              ))}
            </ul>
            {error ? <p className="form-error">{error}</p> : null}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" disabled={busy} onClick={onClose}>Annulla</Button>
            <Button appearance="primary" disabled={busy || chosen.size === 0} onClick={() => void add()}>
              {busy ? "Aggiungo..." : `Aggiungi ${chosen.size} piatti`}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};
