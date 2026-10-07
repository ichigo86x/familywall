import { useState } from "react";
import { Button, Card, Field, Input, MessageBar, MessageBarBody } from "@fluentui/react-components";
import type { WeatherLocation } from "@familywall/shared";

import { api } from "@/api/client";

const errorText = (error: unknown) => (error instanceof Error ? error.message : "Operazione non riuscita.");

/** Place for the dashboard weather (Open-Meteo: free, no account needed). */
export const WeatherCard = ({ location, onSaved }: { location: WeatherLocation | null; onSaved: () => void }) => {
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<WeatherLocation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };

  const choose = (place: WeatherLocation | null) =>
    run(async () => {
      await api.updateSettings({ weatherLocation: place });
      setPlaces(null);
      setQuery("");
      onSaved();
    });

  return (
    <Card className="panel-card">
      <div className="panel-card__header">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h3>Meteo</h3>
        </div>
      </div>
      <p>{location ? <>Meteo di <strong>{location.name}</strong> sullo sfondo dell'orologio.</> : "Scegli la città: il meteo del giorno colora lo sfondo dell'orologio in dashboard."}</p>
      <form
        className="inline-form"
        onSubmit={(submit) => {
          submit.preventDefault();
          void run(async () => setPlaces(await api.searchWeatherPlaces(query)));
        }}
      >
        <Field label="Città">
          <Input value={query} placeholder="Es. Milano" onChange={(_, data) => setQuery(data.value)} />
        </Field>
        <Button type="submit" appearance="primary" disabled={busy || query.trim().length < 2}>Cerca</Button>
        {location ? (
          <Button appearance="secondary" disabled={busy} onClick={() => void choose(null)}>Togli meteo</Button>
        ) : null}
      </form>
      {places ? (
        places.length === 0 ? (
          <p className="calendar-detail-hint">Nessuna località trovata.</p>
        ) : (
          <div className="weather-places">
            {places.map((place) => (
              <Button key={`${place.latitude},${place.longitude}`} appearance="outline" disabled={busy} onClick={() => void choose(place)}>
                {place.name}
              </Button>
            ))}
          </div>
        )
      ) : null}
      {error ? (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      ) : null}
    </Card>
  );
};
