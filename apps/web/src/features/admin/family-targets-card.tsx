import { useState } from "react";
import { Button, Card, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, MessageBar, MessageBarBody, Spinner } from "@fluentui/react-components";
import { type FamilyDataKind, type FamilyTargetInfo, type FamilyTargetOption } from "@familywall/shared";

import { api } from "@/api/client";
import { CloseableDialogTitle } from "@/components/closeable-dialog-title";
import { useAsyncResource } from "@/hooks/use-async-resource";

const errorText = (error: unknown) => (error instanceof Error ? error.message : "Operazione non riuscita.");

const KIND_LABELS: Record<FamilyDataKind, { title: string; items: string; purpose: string }> = {
  menu: { title: "🍽️ Menu", items: "piatti", purpose: "Menu" },
  occasions: { title: "🎂 Compleanni e ricorrenze", items: "ricorrenze", purpose: "Compleanni" }
};

const PROVIDER_LABELS: Record<FamilyTargetOption["provider"], string> = {
  internal: "server di Familywall",
  icloud: "iCloud",
  caldav: "CalDAV",
  google: "Google",
  cookidoo: "Cookidoo",
  icloudweb: "Promemoria iCloud",
  classeviva: "ClasseViva"
};

const optionLabel = (option: FamilyTargetOption) =>
  option.provider === "internal" ? `${option.name}` : `${option.name} · ${PROVIDER_LABELS[option.provider]}${option.accountLabel ? ` (${option.accountLabel})` : ""}`;

/**
 * Where menu and birthdays are kept: the built-in server, or a calendar of iCloud, Google or a CalDAV
 * server. Changing it can move the existing data to the new calendar.
 */
export const FamilyTargetsCard = ({ onChanged }: { onChanged: () => void }) => {
  const targets = useAsyncResource(() => api.getFamilyTargets(), [], "family-targets");

  return (
    <Card className="panel-card">
      <div className="panel-card__header">
        <div>
          <p className="eyebrow">Menu e compleanni</p>
          <h3>Dove salvarli</h3>
        </div>
      </div>
      <p className="calendar-detail-hint">
        Di solito stanno sul server CalDAV di Familywall. Se un calendario di iCloud, Google o di un altro server è segnato come "🍽️ Menu" o "🎂
        Compleanni", Familywall usa quello in automatico; qui puoi sceglierne un altro e spostare i dati da un calendario all'altro. Sono
        elencati solo i calendari visibili di iCloud, Google e dei server CalDAV.
      </p>
      {targets.status === "loading" && !targets.data ? <Spinner size="small" label="Lettura..." /> : null}
      {targets.status === "error" ? <p className="form-error">{targets.error.message}</p> : null}
      {targets.data ? (
        <div className="family-targets">
          {(["menu", "occasions"] as const).map((kind) => (
            <FamilyTargetRow
              key={kind}
              info={targets.data![kind]}
              onChanged={() => {
                targets.reload();
                onChanged();
              }}
            />
          ))}
        </div>
      ) : null}
    </Card>
  );
};

const FamilyTargetRow = ({ info, onChanged }: { info: FamilyTargetInfo; onChanged: () => void }) => {
  const labels = KIND_LABELS[info.kind];
  const [pending, setPending] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ intent: "success" | "warning" | "error"; text: string } | null>(null);

  const apply = async (target: string | null, move: boolean) => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await api.setFamilyTarget(info.kind, target, move);
      setPending(undefined);
      setMessage(
        move
          ? result.failed > 0
            ? { intent: "warning", text: `Spostati ${result.moved} ${labels.items}; ${result.failed} non spostati (sono rimasti dove erano).` }
            : { intent: "success", text: `Spostati ${result.moved} ${labels.items} in "${result.target.current.name}".` }
          : { intent: "success", text: `Da ora i nuovi ${labels.items} vanno in "${result.target.current.name}".` }
      );
      onChanged();
    } catch (caught) {
      setMessage({ intent: "error", text: errorText(caught) });
    } finally {
      setBusy(false);
    }
  };

  const chosen = pending === undefined ? null : info.options.find((option) => option.id === pending) ?? null;

  return (
    <section className="family-target">
      <div className="family-target__head">
        <strong>{labels.title}</strong>
        <span className="calendar-detail-hint">
          Ora in: <strong>{optionLabel(info.current)}</strong>
        </span>
      </div>
      <select
        className="native-select"
        aria-label={`Dove salvare: ${labels.title}`}
        value={info.setting ?? ""}
        disabled={busy}
        onChange={(change) => setPending(change.target.value === "" ? null : change.target.value)}
      >
        <option value="">Automatico (calendario segnato "{labels.purpose}", altrimenti Familywall)</option>
        {info.options.map((option) => (
          <option key={option.id} value={option.id}>
            {optionLabel(option)}
          </option>
        ))}
      </select>
      {info.leftover > 0 ? (
        <MessageBar intent="warning">
          <MessageBarBody>
            {info.leftover} {labels.items} sono ancora sul server di Familywall: li vedi a parte nel calendario.{" "}
            <Button size="small" appearance="primary" disabled={busy} onClick={() => void apply(info.setting, true)}>
              Spostali in "{info.current.name}"
            </Button>
          </MessageBarBody>
        </MessageBar>
      ) : null}
      {message ? (
        <MessageBar intent={message.intent}>
          <MessageBarBody>{message.text}</MessageBarBody>
        </MessageBar>
      ) : null}

      {pending !== undefined ? (
        <Dialog open onOpenChange={(_, data) => (!data.open && !busy ? setPending(undefined) : undefined)}>
          <DialogSurface>
            <DialogBody>
              <CloseableDialogTitle>{labels.title}</CloseableDialogTitle>
              <DialogContent className="dialog-form">
                <p>
                  I nuovi {labels.items} andranno in{" "}
                  <strong>{chosen ? optionLabel(chosen) : `automatico (calendario segnato "${labels.purpose}", altrimenti Familywall)`}</strong>.
                </p>
                <p>
                  Vuoi spostare anche quelli che ci sono ora in <strong>{optionLabel(info.current)}</strong>
                  {info.leftover > 0 ? ` (e i ${info.leftover} rimasti su Familywall)` : ""}? Vengono copiati nel nuovo calendario e poi tolti dal
                  vecchio; sui telefoni collegati ai due calendari il cambiamento arriva alla prossima sincronizzazione.
                </p>
                {busy ? <Spinner size="small" label="Spostamento in corso..." /> : null}
              </DialogContent>
              <DialogActions>
                <Button appearance="secondary" disabled={busy} onClick={() => setPending(undefined)}>
                  Annulla
                </Button>
                <Button appearance="secondary" disabled={busy} onClick={() => void apply(pending, false)}>
                  Cambia senza spostare
                </Button>
                <Button appearance="primary" disabled={busy} onClick={() => void apply(pending, true)}>
                  Sposta i {labels.items}
                </Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      ) : null}
    </section>
  );
};

