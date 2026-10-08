import type { ReactNode } from "react";
import type { CalendarProvider } from "@familywall/shared";

/** What an account type can be used for in Familywall: yes, partly (with a note), or no. */
export interface Capability {
  label: string;
  level: "yes" | "partial" | "no";
  note?: string;
}

export interface ProviderGuide {
  provider: CalendarProvider;
  icon: string;
  title: string;
  tagline: string;
  capabilities: Capability[];
  /** How to obtain the password, app password or OAuth client asked by the form. */
  credentialsTitle: string;
  steps: ReactNode[];
  notes?: ReactNode[];
}

const link = (href: string, text = href.replace(/^https:\/\//, "")) => (
  <a href={href} target="_blank" rel="noreferrer">
    {text}
  </a>
);

export const PROVIDER_GUIDES: ProviderGuide[] = [
  {
    provider: "icloud",
    icon: "📅",
    title: "Calendari iCloud",
    tagline: "Calendari di iPhone, iPad e Mac con la password per app",
    capabilities: [
      { label: "Calendari: lettura", level: "yes" },
      { label: "Calendari: crea, modifica, elimina eventi", level: "yes", note: "Solo sui calendari con permesso di modifica." },
      { label: "Compleanni e menu da un calendario", level: "yes", note: "Scegli l'uso del calendario dopo averlo aggiunto." },
      { label: "Liste dei Promemoria", level: "no", note: "Apple non le espone più con la password per app: usa \"Promemoria iCloud\"." }
    ],
    credentialsTitle: "Come creare la password per app",
    steps: [
      <>L'Apple ID deve avere l'autenticazione a due fattori attiva (iPhone: Impostazioni → [il tuo nome] → Accesso e sicurezza).</>,
      <>Apri {link("https://account.apple.com")} e accedi con l'Apple ID.</>,
      <>Vai in <strong>Accesso e sicurezza</strong> → <strong>Password specifiche per le app</strong> e premi <strong>+</strong>.</>,
      <>Scrivi un nome (per esempio "Familywall") e premi Crea.</>,
      <>Copia la password nel formato <code>xxxx-xxxx-xxxx-xxxx</code> e incollala qui sotto, con l'Apple ID come utente.</>
    ],
    notes: [
      <>Cambiando la password dell'Apple ID, Apple revoca le password per app: in quel caso creane una nuova e ricollega l'account.</>,
      <>Consiglio: un Apple ID dedicato alla famiglia, con cui condividere i calendari di tutti con il permesso "può modificare".</>
    ]
  },
  {
    provider: "icloudweb",
    icon: "✅",
    title: "Promemoria iCloud",
    tagline: "Liste dei Promemoria con Apple ID e codice di verifica",
    capabilities: [
      { label: "Liste dei Promemoria: lettura", level: "yes" },
      { label: "Aggiungi, spunta, elimina voci", level: "yes", note: "Anche dal pannello e dagli ingredienti del menu." },
      { label: "\"Comprati spesso\" nelle liste della spesa", level: "yes" },
      { label: "Sotto-voci, scadenze, allegati", level: "no" },
      { label: "Calendari", level: "no", note: "Per i calendari usa \"Calendari iCloud\"." }
    ],
    credentialsTitle: "Cosa serve",
    steps: [
      <>Apple ID e <strong>password dell'Apple ID</strong> (non la password per app).</>,
      <>Dopo "Verifica e collega" Apple mostra un avviso su iPhone, iPad o Mac: tocca <strong>Consenti</strong> e scrivi in Familywall il codice di 6 cifre.</>,
      <>Poi <strong>Scegli liste</strong>: le liste scelte compaiono in Liste con l'etichetta "iCloud".</>
    ],
    notes: [
      <>La <strong>Protezione avanzata dei dati</strong> deve essere spenta (iPhone: Impostazioni → [il tuo nome] → iCloud): con la protezione attiva i Promemoria non sono leggibili dal web.</>,
      <>Usa le API web di iCloud tramite pyicloud, la libreria dell'integrazione iCloud di Home Assistant. Non sono ufficiali: Apple può chiedere di nuovo il codice (pulsante "Riconnetti") o bloccare l'accesso per un po' dopo troppi tentativi.</>,
      <>La password resta cifrata nel database di Familywall. Nell'add-on pyicloud è incluso; in sviluppo esegui <code>npm run python:setup</code> e riavvia l'API.</>
    ]
  },
  {
    provider: "google",
    icon: "🟦",
    title: "Google",
    tagline: "Google Calendar e Google Tasks con un client OAuth",
    capabilities: [
      { label: "Calendari: lettura", level: "yes" },
      { label: "Calendari: crea, modifica, elimina eventi", level: "yes" },
      { label: "Compleanni e menu da un calendario", level: "yes" },
      { label: "Liste di Google Tasks", level: "yes", note: "Aggiungi, spunta ed elimina voci; usa \"Scegli liste\" sull'account." }
    ],
    credentialsTitle: "Come ottenere Client ID e Client secret",
    steps: [
      <>Apri {link("https://console.cloud.google.com")} e crea un progetto (va bene anche quello già usato per Home Assistant).</>,
      <><strong>API e servizi</strong> → <strong>Libreria</strong>: abilita <strong>Google Calendar API</strong> e <strong>Google Tasks API</strong>.</>,
      <><strong>Schermata consenso OAuth</strong>: tipo "Esterno", aggiungi la tua email; alla fine premi <strong>Pubblica app</strong> (in modalità "Test" l'accesso scade dopo 7 giorni).</>,
      <><strong>Credenziali</strong> → <strong>Crea credenziali</strong> → <strong>ID client OAuth</strong> → "Applicazione web", con l'URI di reindirizzamento mostrato qui sotto. In alternativa "App desktop" e l'URI <code>http://127.0.0.1</code>.</>,
      <>Copia Client ID e Client secret nei campi qui sotto e premi "Apri Google e consenti l'accesso".</>
    ]
  },
  {
    provider: "caldav",
    icon: "🗓️",
    title: "Altro server CalDAV",
    tagline: "Nextcloud, Synology, Fastmail, Radicale e altri",
    capabilities: [
      { label: "Calendari: lettura", level: "yes" },
      { label: "Calendari: crea, modifica, elimina eventi", level: "yes" },
      { label: "Compleanni e menu da un calendario", level: "yes" },
      { label: "Liste (VTODO) del server", level: "no", note: "Le liste della famiglia stanno nel server CalDAV integrato di Familywall." }
    ],
    credentialsTitle: "Indirizzo e password",
    steps: [
      <><strong>Nextcloud</strong>: indirizzo <code>https://tuo-server/remote.php/dav</code>. Crea una password per app in Impostazioni personali → Sicurezza → "Crea nuova password per app".</>,
      <><strong>Synology Calendar</strong>: indirizzo <code>https://tuo-nas:5001/caldav/</code>, con utente e password del NAS (meglio un utente dedicato).</>,
      <><strong>Fastmail</strong>: indirizzo <code>https://caldav.fastmail.com/dav/</code>. Crea una password app in Impostazioni → Privacy e sicurezza, con accesso a Calendari (CalDAV).</>,
      <><strong>Altri server</strong>: usa l'indirizzo CalDAV indicato dal servizio (spesso termina con <code>/dav</code> o <code>/caldav</code>) e, se esiste, una password per app.</>
    ]
  },
  {
    provider: "cookidoo",
    icon: "🍲",
    title: "Cookidoo (Bimby)",
    tagline: "Il piano settimanale delle ricette come menu",
    capabilities: [
      { label: "Menu da \"La mia settimana\"", level: "yes", note: "Ogni ricetta pianificata diventa un piatto del giorno." },
      { label: "Ingredienti della ricetta", level: "yes", note: "Si aggiungono alla lista della spesa dal menu." },
      { label: "Modifica del piano dall'app", level: "no", note: "Sola lettura: pianifica le ricette nell'app Cookidoo." },
      { label: "Calendari e liste", level: "no" }
    ],
    credentialsTitle: "Cosa serve",
    steps: [
      <>Email e password dell'account Cookidoo usato nell'app o sul Bimby, e il paese del sito.</>,
      <>Se accedi a Cookidoo con Google o Apple, crea prima una password: nella pagina di accesso di Cookidoo usa "Password dimenticata?" con la tua email.</>
    ],
    notes: [<>Usa le stesse API non ufficiali dell'app Cookidoo: può smettere di funzionare se Vorwerk le cambia.</>]
  }
];

export const guideFor = (provider: CalendarProvider): ProviderGuide => PROVIDER_GUIDES.find((guide) => guide.provider === provider)!;

/** Short summary of what an account type provides, for the account rows. */
export const capabilitySummary = (provider: CalendarProvider): string =>
  guideFor(provider)
    .capabilities.filter((capability) => capability.level !== "no")
    .map((capability) => capability.label)
    .join(" · ");

export const CapabilityList = ({ capabilities }: { capabilities: Capability[] }) => (
  <ul className="capability-list">
    {capabilities.map((capability) => (
      <li key={capability.label} className={`capability capability--${capability.level}`}>
        <span className="capability__mark" aria-label={capability.level === "yes" ? "Sì" : capability.level === "partial" ? "In parte" : "No"}>
          {capability.level === "yes" ? "✓" : capability.level === "partial" ? "◐" : "✕"}
        </span>
        <span>
          {capability.label}
          {capability.note ? <small>{capability.note}</small> : null}
        </span>
      </li>
    ))}
  </ul>
);

export const ProviderHelp = ({ guide }: { guide: ProviderGuide }) => (
  <div className="provider-help">
    <section>
      <h4>Cosa puoi usare</h4>
      <CapabilityList capabilities={guide.capabilities} />
    </section>
    <details className="provider-help__steps" open>
      <summary>{guide.credentialsTitle}</summary>
      <ol>
        {guide.steps.map((step, index) => (
          <li key={index}>{step}</li>
        ))}
      </ol>
      {guide.notes?.length ? (
        <ul className="provider-help__notes">
          {guide.notes.map((note, index) => (
            <li key={index}>{note}</li>
          ))}
        </ul>
      ) : null}
    </details>
  </div>
);
