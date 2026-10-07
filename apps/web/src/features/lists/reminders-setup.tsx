import { useEffect, useState } from "react";
import { Button, Card } from "@fluentui/react-components";

import { api } from "@/api/client";

const errorText = (error: unknown) => (error instanceof Error ? error.message : "Operazione non riuscita.");

/** True inside a web app added to the iPhone Home screen: iOS cannot install profiles from there. */
const isStandalone = () =>
  Boolean((navigator as Navigator & { standalone?: boolean }).standalone) || window.matchMedia?.("(display-mode: standalone)").matches === true;

/**
 * How to see the family lists in iOS Reminders: one-tap configuration profile
 * (only over HTTPS, the address used outside Home Assistant) or manual CalDAV setup.
 */
export const RemindersSetup = () => {
  const [info, setInfo] = useState<{ enabled: boolean; path: string; username: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileUrl, setProfileUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api
      .getDavInfo()
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  if (!info?.enabled) {
    return null;
  }

  const secure = window.location.protocol === "https:";
  const standalone = isStandalone();
  const serverAddress = `${window.location.host}${new URL(info.path.replace(/^\//, ""), document.baseURI).pathname}`;

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
          <p className="eyebrow">iPhone e iPad</p>
          <h3>Liste e calendari sul telefono</h3>
        </div>
        <Button appearance="secondary" onClick={() => setOpen(!open)}>{open ? "Chiudi" : "Come si fa"}</Button>
      </div>
      {open ? (
        <div className="reminders-setup__body">
          <p>
            Le liste con l'etichetta <strong>Promemoria</strong> sono condivise da tutta la famiglia e compaiono anche nell'app Promemoria
            dell'iPhone, dove si possono aggiungere voci anche con Siri. Lo stesso account porta nell'app Calendario i calendari{" "}
            <strong>Menu</strong>, <strong>Compleanni</strong> e <strong>Turni</strong>: quello che modifichi lì compare anche su Familywall.
          </p>
          {!secure ? (
            <p className="calendar-detail-hint">Per l'installazione automatica apri Familywall dall'indirizzo esterno (https) sull'iPhone.</p>
          ) : !profileUrl ? (
            <Button appearance="primary" onClick={() => void prepareLink()}>Prepara il profilo per questo iPhone</Button>
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
                In Safari tocca "Consenti", poi apri Impostazioni → Profilo scaricato → Installa e inserisci la tua password di Familywall. Il
                link vale 10 minuti.
              </p>
            </div>
          )}
          <details>
            <summary>Configurazione manuale</summary>
            <p>Impostazioni → Promemoria → Account → Aggiungi account → Altro → Aggiungi account CalDAV:</p>
            <ul>
              <li>Server: <code>{serverAddress}</code></li>
              <li>Nome utente: <code>{info.username}</code></li>
              <li>Password: la tua password di Familywall</li>
            </ul>
          </details>
          {error ? <p className="form-error">{error}</p> : null}
        </div>
      ) : null}
    </Card>
  );
};
