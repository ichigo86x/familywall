import { useEffect, useState } from "react";
import { Button, Card } from "@fluentui/react-components";

import { api } from "@/api/client";

const errorText = (error: unknown) => (error instanceof Error ? error.message : "Operazione non riuscita.");

/**
 * How to see the family lists in iOS Reminders: one-tap configuration profile
 * (only over HTTPS, the address used outside Home Assistant) or manual CalDAV setup.
 */
export const RemindersSetup = () => {
  const [info, setInfo] = useState<{ enabled: boolean; path: string; username: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const serverAddress = `${window.location.host}${new URL(info.path.replace(/^\//, ""), document.baseURI).pathname}`;

  const installProfile = async () => {
    setError(null);
    try {
      const { token } = await api.createDavProfileLink(new URL(".", document.baseURI).toString());
      window.location.href = new URL(`api/dav/profile?t=${encodeURIComponent(token)}`, document.baseURI).toString();
    } catch (caught) {
      setError(errorText(caught));
    }
  };

  return (
    <Card className="panel-card reminders-setup">
      <div className="panel-card__header">
        <div>
          <p className="eyebrow">iPhone e iPad</p>
          <h3>Le liste nei Promemoria</h3>
        </div>
        <Button appearance="subtle" onClick={() => setOpen(!open)}>{open ? "Chiudi" : "Come si fa"}</Button>
      </div>
      {open ? (
        <div className="reminders-setup__body">
          <p>
            Le liste con l'etichetta <strong>Promemoria</strong> sono condivise da tutta la famiglia e compaiono anche nell'app Promemoria
            dell'iPhone, dove si possono aggiungere voci anche con Siri.
          </p>
          {secure ? (
            <>
              <Button appearance="primary" onClick={() => void installProfile()}>Installa su questo iPhone</Button>
              <p className="calendar-detail-hint">
                Dopo il download apri Impostazioni → Profilo scaricato → Installa, poi inserisci la tua password di Familywall.
              </p>
            </>
          ) : (
            <p className="calendar-detail-hint">
              Per l'installazione automatica apri Familywall dall'indirizzo esterno (https) sull'iPhone.
            </p>
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
