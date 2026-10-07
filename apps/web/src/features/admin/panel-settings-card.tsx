import { useState } from "react";
import { Button, Card, Field, Input, MessageBar, MessageBarBody, Switch } from "@fluentui/react-components";
import type { PanelNight } from "@familywall/shared";

import { api } from "@/api/client";

/** Night mode of the wall panels (Kiosk accounts). */
export const PanelSettingsCard = ({ night, onSaved }: { night: PanelNight; onSaved: () => void }) => {
  const [form, setForm] = useState<PanelNight>(night);
  const [result, setResult] = useState<{ intent: "success" | "error"; text: string } | null>(null);
  const changed = form.enabled !== night.enabled || form.start !== night.start || form.end !== night.end;

  const save = async () => {
    try {
      await api.updateSettings({ panelNight: form });
      setResult({ intent: "success", text: "Impostazioni del pannello salvate. I pannelli le leggono entro 15 minuti." });
      onSaved();
    } catch (error) {
      setResult({ intent: "error", text: error instanceof Error ? error.message : "Salvataggio non riuscito." });
    }
  };

  return (
    <Card className="panel-card">
      <div className="panel-card__header">
        <div>
          <p className="eyebrow">Pannello a muro</p>
          <h3>Notte</h3>
        </div>
      </div>
      <p>
        Negli orari scelti i pannelli mostrano solo un orologio tenue su sfondo nero. Un tocco li riattiva per 2 minuti. Con Fully Kiosk e
        l'interfaccia JavaScript attiva, anche la luminosità dello schermo si abbassa.
      </p>
      <Switch label="Modalità notte attiva" checked={form.enabled} onChange={(_, data) => setForm({ ...form, enabled: data.checked })} />
      <div className="inline-form">
        <Field label="Dalle">
          <Input type="time" value={form.start} disabled={!form.enabled} onChange={(_, data) => setForm({ ...form, start: data.value })} />
        </Field>
        <Field label="Alle">
          <Input type="time" value={form.end} disabled={!form.enabled} onChange={(_, data) => setForm({ ...form, end: data.value })} />
        </Field>
        <Button appearance="primary" disabled={!changed} onClick={() => void save()}>
          Salva
        </Button>
      </div>
      {result ? (
        <MessageBar intent={result.intent}>
          <MessageBarBody>{result.text}</MessageBarBody>
        </MessageBar>
      ) : null}
    </Card>
  );
};
