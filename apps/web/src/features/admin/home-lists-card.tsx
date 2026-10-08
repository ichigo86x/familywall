import { useState, type ReactNode } from "react";
import { Button, Card, Field, MessageBar, MessageBarBody } from "@fluentui/react-components";
import type { HomeCalendar, HomeEntity, HomeList } from "@familywall/shared";

import { api } from "@/api/client";
import { DeleteRegular } from "@/lib/fluent-icons";

const COLORS = ["#0EA5E9", "#F97316", "#14B8A6", "#DB2777", "#8B5CF6", "#65A30D"];

const errorText = (error: unknown) => (error instanceof Error ? error.message : "Operazione non riuscita.");

type HomeChoice = HomeList | HomeCalendar;

/** Home Assistant entities (to-do lists or calendars) chosen by the Admin, with name and color. */
const HomeEntitiesCard = ({
  title,
  intro,
  emptyText,
  pickLabel,
  noneFound,
  describe,
  chosen: current,
  load,
  save
}: {
  title: string;
  intro: ReactNode;
  emptyText: string;
  pickLabel: string;
  noneFound: string;
  describe: (entity: HomeEntity) => string;
  chosen: HomeChoice[];
  load: () => Promise<HomeEntity[]>;
  save: (next: HomeChoice[]) => Promise<void>;
}) => {
  const [entities, setEntities] = useState<HomeEntity[] | null>(null);
  const [picked, setPicked] = useState("");
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(errorText(caught));
    }
  };

  const available = (entities ?? []).filter((entity) => !current.some((entry) => entry.entityId === entity.entityId));

  return (
    <Card className="panel-card">
      <div className="panel-card__header">
        <div>
          <p className="eyebrow">Home Assistant</p>
          <h3>{title}</h3>
        </div>
        {entities === null ? (
          <Button
            onClick={() =>
              void run(async () => {
                const found = await load();
                setEntities(found);
                if (found.length === 0) {
                  setError(noneFound);
                }
              })
            }
          >
            Scegli
          </Button>
        ) : null}
      </div>
      <p>{intro}</p>
      {error ? (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      ) : null}
      {current.length === 0 ? (
        <p className="calendar-detail-hint">{emptyText}</p>
      ) : (
        <div className="stack-list">
          {current.map((entry) => (
            <article key={entry.entityId} className="routine-row">
              <div className="calendar-config-main">
                <input
                  type="color"
                  aria-label={`Colore di ${entry.name}`}
                  value={entry.color}
                  onChange={(change) =>
                    void run(() => save(current.map((item) => (item.entityId === entry.entityId ? { ...item, color: change.target.value.toUpperCase() } : item))))
                  }
                />
                <div>
                  <strong>{entry.name}</strong>
                  <p>{entry.entityId} · Home Assistant</p>
                </div>
              </div>
              <div className="row-actions">
                <Button
                  appearance="subtle"
                  icon={<DeleteRegular />}
                  aria-label={`Rimuovi ${entry.name}`}
                  onClick={() => void run(() => save(current.filter((item) => item.entityId !== entry.entityId)))}
                />
              </div>
            </article>
          ))}
        </div>
      )}
      {entities !== null && available.length > 0 ? (
        <div className="inline-form">
          <Field label={pickLabel}>
            <select className="native-select" value={picked} onChange={(change) => setPicked(change.target.value)}>
              <option value="">Scegli…</option>
              {available.map((entity) => (
                <option key={entity.entityId} value={entity.entityId}>
                  {describe(entity)}
                </option>
              ))}
            </select>
          </Field>
          <Button
            appearance="primary"
            disabled={!picked}
            onClick={() => {
              const entity = available.find((entry) => entry.entityId === picked);
              if (entity) {
                setPicked("");
                void run(() => save([...current, { entityId: entity.entityId, name: entity.name, color: COLORS[current.length % COLORS.length]! }]));
              }
            }}
          >
            Aggiungi
          </Button>
        </div>
      ) : null}
    </Card>
  );
};

/**
 * To-do lists of Home Assistant shown in Liste: Apple Reminders through the official iCloud
 * integration, Bring!, Todoist, local to-do lists... Familywall uses the Home Assistant connection only.
 */
export const HomeListsCard = ({ lists, onSaved }: { lists: HomeList[]; onSaved: () => void }) => (
  <HomeEntitiesCard
    title="Liste di Home Assistant"
    intro={
      <>
        Le liste <code>todo.*</code> di Home Assistant compaiono in Liste e si possono spuntare e modificare: per esempio i Promemoria di iCloud
        dell'integrazione Apple iCloud, Bring!, Todoist o le liste locali.
      </>
    }
    emptyText="Nessuna lista di Home Assistant."
    pickLabel="Lista di Home Assistant"
    noneFound="Nessuna lista todo.* in Home Assistant."
    describe={(entity) => `${entity.name} (${entity.state} voci)`}
    chosen={lists}
    load={api.getHomeTodoEntities}
    save={async (next) => {
      await api.updateSettings({ homeLists: next });
      onSaved();
    }}
  />
);

/** Calendars of Home Assistant (calendar.*) shown read-only in the calendar and on the dashboard. */
export const HomeCalendarsCard = ({ calendars, onSaved }: { calendars: HomeCalendar[]; onSaved: () => void }) => (
  <HomeEntitiesCard
    title="Calendari di Home Assistant"
    intro={
      <>
        I calendari <code>calendar.*</code> di Home Assistant compaiono, in sola lettura, nel calendario e in dashboard: per esempio quelli delle
        integrazioni iCloud, Google, CalDAV, festività o raccolta rifiuti.
      </>
    }
    emptyText="Nessun calendario di Home Assistant."
    pickLabel="Calendario di Home Assistant"
    noneFound="Nessun calendario calendar.* in Home Assistant."
    describe={(entity) => entity.name}
    chosen={calendars}
    load={api.getHomeCalendarEntities}
    save={async (next) => {
      await api.updateSettings({ homeCalendars: next });
      onSaved();
    }}
  />
);

/** Shown instead of the Home Assistant cards when Familywall cannot reach Home Assistant. */
export const HomeAssistantHintCard = () => (
  <Card className="panel-card">
    <div className="panel-card__header">
      <div>
        <p className="eyebrow">Home Assistant</p>
        <h3>Home Assistant non collegato</h3>
      </div>
    </div>
    <div className="provider-help">
      <section>
        <h4>Cosa si attiva con Home Assistant</h4>
        <ul className="capability-list">
          <li className="capability capability--yes">
            <span className="capability__mark">✓</span>
            <span>Pulsanti di casa sul pannello (luci, scene, script)</span>
          </li>
          <li className="capability capability--yes">
            <span className="capability__mark">✓</span>
            <span>
              Liste "to-do" di Home Assistant
              <small>Per esempio Lista della spesa, Google Tasks, Todoist o Bring! configurate in Home Assistant.</small>
            </span>
          </li>
          <li className="capability capability--yes">
            <span className="capability__mark">✓</span>
            <span>
              Calendari di Home Assistant, in sola lettura
              <small>Per esempio raccolta rifiuti, calendario scolastico, festività.</small>
            </span>
          </li>
        </ul>
      </section>
      <details className="provider-help__steps" open>
        <summary>Come collegarlo</summary>
        <ol>
          <li>
            <strong>Add-on di Home Assistant</strong>: il collegamento è automatico, non serve nessun token.
          </li>
          <li>
            <strong>Fuori dall'add-on</strong>: in Home Assistant apri il tuo <strong>Profilo</strong> (in basso a sinistra) → scheda{" "}
            <strong>Sicurezza</strong> → <strong>Token di accesso a lungo termine</strong> → <strong>Crea token</strong>. Copialo subito: viene
            mostrato una volta sola.
          </li>
          <li>
            Sul server di Familywall imposta <code>HA_URL</code> (es. <code>http://homeassistant.local:8123</code>) e <code>HA_TOKEN</code> con il
            token, poi riavvia Familywall.
          </li>
        </ol>
        <ul className="provider-help__notes">
          <li>Il token dà accesso a Home Assistant come il tuo utente: meglio un utente dedicato, non amministratore. Non salvarlo nel repository.</li>
        </ul>
      </details>
    </div>
  </Card>
);
