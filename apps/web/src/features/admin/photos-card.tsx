import { useState } from "react";
import { Button, Card, Field, Input, MessageBar, MessageBarBody, Radio, RadioGroup } from "@fluentui/react-components";
import type { PhotoSettings, PhotoSource } from "@familywall/shared";

import { api } from "@/api/client";
import { useAsyncResource } from "@/hooks/use-async-resource";

const errorText = (error: unknown) => (error instanceof Error ? error.message : "Operazione non riuscita.");

/** Where the screensaver photos come from: seasonal scene, Unsplash, the media folder or an iCloud shared album. */
export const PhotosCard = ({ photos, onSaved }: { photos: PhotoSettings; onSaved: () => void }) => {
  const status = useAsyncResource(() => api.getPhotoStatus(), []);
  const [form, setForm] = useState({ ...photos, folder: photos.folder ?? "", icloudAlbum: photos.icloudAlbum ?? "" });
  const [accessKey, setAccessKey] = useState("");
  const [result, setResult] = useState<{ intent: "success" | "warning" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setResult(null);
    try {
      if (accessKey.trim()) {
        await api.setUnsplashKey(accessKey.trim());
        setAccessKey("");
        status.reload();
      }
      await api.updateSettings({ photos: { ...form, folder: form.folder.trim() || null, icloudAlbum: form.icloudAlbum.trim() || null } });
      onSaved();
      if (form.source === "none") {
        setResult({ intent: "success", text: "Salvato: lo screensaver mostra la scena della stagione." });
      } else {
        const { count } = await api.testPhotos();
        setResult(count > 0 ? { intent: "success", text: `Salvato: ${count} foto trovate.` } : { intent: "warning", text: "Salvato, ma non ho trovato foto." });
      }
    } catch (caught) {
      setResult({ intent: "error", text: errorText(caught) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="panel-card">
      <div className="panel-card__header">
        <div>
          <p className="eyebrow">Screensaver</p>
          <h3>Foto</h3>
        </div>
        <Button appearance="primary" disabled={busy} onClick={() => void save()}>
          {busy ? "Verifica..." : "Salva e prova"}
        </Button>
      </div>
      <RadioGroup value={form.source} onChange={(_, data) => setForm({ ...form, source: data.value as PhotoSource })}>
        <Radio value="none" label="Scena animata della stagione (nessuna foto)" />
        <Radio value="unsplash" label="Paesaggi della stagione da Unsplash" />
        <Radio value="folder" label="Foto della cartella media di Home Assistant" />
        <Radio value="icloud" label="Album condiviso di iCloud" />
      </RadioGroup>

      {form.source === "unsplash" ? (
        <div className="provider-help">
          <p>
            Serve una chiave gratuita: su <a href="https://unsplash.com/developers" target="_blank" rel="noreferrer">unsplash.com/developers</a> crea
            un'applicazione e copia la <strong>Access Key</strong>. In modalità demo Unsplash concede 50 richieste all'ora: Familywall ne usa una
            ogni mezz'ora. Ogni foto mostra il nome del fotografo, come chiede Unsplash.
          </p>
          <Field label="Access Key" hint={status.data?.unsplashKeySet ? "Chiave già salvata: scrivine una nuova solo per cambiarla." : undefined}>
            <Input type="password" autoComplete="off" value={accessKey} onChange={(_, data) => setAccessKey(data.value)} />
          </Field>
        </div>
      ) : null}
      {form.source === "folder" ? (
        <div className="provider-help">
          <p>
            Copia le foto nella cartella <strong>media</strong> di Home Assistant (Impostazioni → Sistema → Archiviazione, oppure con gli add-on
            Samba o SSH in <code>/media</code>) e scrivi qui la sottocartella. Vengono lette anche le sue sottocartelle (JPG, PNG, WebP, GIF).
          </p>
          <Field label="Sottocartella di /media" hint="Es. Famiglia. Vuota per usare tutta la cartella media.">
            <Input value={form.folder} onChange={(_, data) => setForm({ ...form, folder: data.value })} />
          </Field>
        </div>
      ) : null}
      {form.source === "icloud" ? (
        <div className="provider-help">
          <p>
            Nell'app Foto dell'iPhone apri l'album condiviso → icona delle persone → attiva <strong>Sito web pubblico</strong> e copia il link. Le
            nuove foto dell'album arrivano sul pannello entro mezz'ora. Familywall usa l'indirizzo pubblico dell'album, non il tuo Apple ID.
          </p>
          <Field label="Link dell'album" hint="https://www.icloud.com/sharedalbum/#...">
            <Input value={form.icloudAlbum} onChange={(_, data) => setForm({ ...form, icloudAlbum: data.value })} />
          </Field>
        </div>
      ) : null}
      {form.source !== "none" ? (
        <Field label="Secondi per foto">
          <Input
            type="number"
            min={10}
            max={3600}
            value={String(form.intervalSeconds)}
            onChange={(_, data) => setForm({ ...form, intervalSeconds: Math.min(3600, Math.max(10, Number(data.value) || 60)) })}
          />
        </Field>
      ) : null}
      {result ? (
        <MessageBar intent={result.intent}>
          <MessageBarBody>{result.text}</MessageBarBody>
        </MessageBar>
      ) : null}
    </Card>
  );
};
