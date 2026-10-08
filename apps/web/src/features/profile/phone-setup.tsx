import { useEffect, useState } from "react";
import { Button, Card } from "@fluentui/react-components";

import { api } from "@/api/client";

const errorText = (error: unknown) => (error instanceof Error ? error.message : "Operazione non riuscita.");

/** True inside a web app added to the iPhone Home screen: iOS cannot install profiles from there. */
const isStandalone = () =>
  Boolean((navigator as Navigator & { standalone?: boolean }).standalone) || window.matchMedia?.("(display-mode: standalone)").matches === true;

/**
 * The family data of the built-in CalDAV server on the member's own phone: one-tap configuration
 * profile for iPhone and iPad (only over HTTPS, the address used outside Home Assistant), manual
 * CalDAV setup, and DAVx⁵ for Android.
 */
export const PhoneSetupCard = () => {
  const [info, setInfo] = useState<{ enabled: boolean; path: string; username: string } | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [profileUrl, setProfileUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api
      .getDavInfo()
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  if (info === undefined) {
    return null;
  }
  if (!info?.enabled) {
    return (
      <Card className="panel-card">
        <div className="panel-card__header">
          <div>
            <p className="eyebrow">Telefono e tablet</p>
            <h3>Liste e calendari sul telefono</h3>
          </div>
        </div>
        <p className="calendar-detail-hint">Il server CalDAV di Familywall non è attivo: chiedi all'amministratore.</p>
      </Card>
    );
  }

  const secure = window.location.protocol === "https:";
  const standalone = isStandalone();
  const serverAddress = `${window.location.host}${new URL(info.path.replace(/^\//, ""), document.baseURI).pathname}`;
  const serverUrl = `${window.location.protocol}//${serverAddress}`;

  // The link is prepared first, so the download starts from a real tap on a link:
  // Safari only offers to install a profile for a direct navigation.
  const prepareLink = async () => {
    setError(null);
    setCopied(false);
    try {
      const { token } = await api.createDavProfileLink(new URL(".", document.baseURI).toString());
      setProfileUrl(new URL(`api/dav/profile?t=${encodeURIComponent(token)}`, document.baseURI).toString());
    } catch (caught) {
      setError(errorText(caught));
    }
  };

  const copyLink = async () => {
    if (!profileUrl) {
      return;
    }
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopied(true);
    } catch {
      setError("Copia non riuscita: tieni premuto sul link e scegli Copia.");
    }
  };

  return (
    <Card className="panel-card reminders-setup">
      <div className="panel-card__header">
        <div>
          <p className="eyebrow">Telefono e tablet</p>
          <h3>Liste e calendari sul telefono</h3>
        </div>
      </div>
      <div className="reminders-setup__body">
        <p>
          Con il tuo account Familywall il telefono vede le liste <strong>Promemoria</strong> della famiglia (anche con Siri) e i calendari{" "}
          <strong>Menu</strong>, <strong>Compleanni</strong>, <strong>Turni</strong> e <strong>Routine</strong>. Quello che modifichi lì compare anche
          su Familywall, secondo i permessi del tuo ruolo.
        </p>

        <section className="phone-setup__platform">
          <h4>iPhone e iPad</h4>
          {!secure ? (
            <p className="calendar-detail-hint">Per l'installazione automatica apri questa pagina sull'iPhone dall'indirizzo esterno (https).</p>
          ) : !profileUrl ? (
            <Button appearance="primary" onClick={() => void prepareLink()}>
              Prepara il profilo per questo iPhone
            </Button>
          ) : (
            <div className="reminders-setup__profile">
              {standalone ? (
                <p className="form-error">
                  Sei nell'app aggiunta alla schermata Home: da qui iOS non installa i profili (pagina bianca). Copia il link e aprilo in Safari.
                </p>
              ) : null}
              <div className="reminders-setup__actions">
                {standalone ? null : (
                  <a className="reminders-setup__link" href={profileUrl}>
                    Installa su questo iPhone
                  </a>
                )}
                <Button appearance={standalone ? "primary" : "secondary"} onClick={() => void copyLink()}>
                  {copied ? "Link copiato" : "Copia link"}
                </Button>
              </div>
              <p className="calendar-detail-hint">
                In Safari tocca "Consenti", poi apri Impostazioni → Profilo scaricato → Installa e inserisci la tua password di Familywall. Il link
                vale 10 minuti.
              </p>
            </div>
          )}
          <details>
            <summary>Configurazione manuale</summary>
            <p>Impostazioni → Promemoria (o Calendario) → Account → Aggiungi account → Altro → Aggiungi account CalDAV:</p>
            <ul>
              <li>
                Server: <code>{serverAddress}</code>
              </li>
              <li>
                Nome utente: <code>{info.username}</code>
              </li>
              <li>Password: la tua password di Familywall</li>
            </ul>
          </details>
        </section>

        <section className="phone-setup__platform">
          <h4>Android</h4>
          <ol>
            <li>Installa DAVx⁵ dal Play Store (o da F-Droid).</li>
            <li>
              Aggiungi un account → "Accedi con URL e nome utente": URL <code>{serverUrl}</code>, nome utente <code>{info.username}</code>, la tua
              password di Familywall.
            </li>
            <li>Scegli i calendari e le liste da sincronizzare: i calendari compaiono nell'app Calendario.</li>
            <li>Per le liste e le note serve un'app per le attività: jtx Board (liste e note) oppure Tasks.org (liste).</li>
          </ol>
        </section>
        {error ? <p className="form-error">{error}</p> : null}
      </div>
    </Card>
  );
};
