import { useState } from "react";
import { Button, Card, Field, Input, MessageBar, MessageBarBody } from "@fluentui/react-components";

import { api } from "@/api/client";
import { AppShell } from "@/components/app-shell";
import { ErrorState, LoadingState } from "@/components/page-states";
import { useAuth } from "@/components/auth/use-auth";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { MembersSection } from "./members-section";
import { ProvidersSection } from "./providers-section";
import { TaskListsSection } from "./task-lists-section";
import { WeatherCard } from "./weather-card";
import { PanelSettingsCard } from "./panel-settings-card";
import { HomeButtonsCard } from "./home-buttons-card";

const loadAdminData = async () => {
  const [members, accounts, calendars, settings, taskLists] = await Promise.all([
    api.getMembers(),
    api.getProviderAccounts(),
    api.getCalendarConfigs(),
    api.getSettings(),
    api.getTaskListConfigs()
  ]);
  return { members, accounts, calendars, settings, taskLists };
};

export const AdminPage = () => {
  const admin = useAsyncResource(loadAdminData, []);

  return (
    <AppShell
      currentRoute="/admin"
      eyebrow="Amministrazione"
      title="Famiglia e calendari"
      subtitle="Gestisci i membri e i loro permessi, collega gli account iCloud e scegli quali calendari mostrare."
      summaryChip={admin.data ? `${admin.data.members.length} membri · ${admin.data.calendars.length} calendari` : "Admin"}
    >
      {admin.status === "loading" && !admin.data ? (
        <LoadingState title="Caricamento" message="Lettura della configurazione della famiglia." />
      ) : admin.status === "error" ? (
        <ErrorState title="Admin non disponibile" message={admin.error.message} actionLabel="Riprova" onAction={admin.reload} />
      ) : admin.data ? (
        <>
          <HouseholdCard householdName={admin.data.settings.householdName} onSaved={admin.reload} />
          <WeatherCard location={admin.data.settings.weatherLocation} onSaved={admin.reload} />
          <PanelSettingsCard night={admin.data.settings.panelNight} onSaved={admin.reload} />
          <HomeButtonsCard buttons={admin.data.settings.homeButtons} onSaved={admin.reload} />
          <MembersSection members={admin.data.members} onChanged={admin.reload} />
          <ProvidersSection accounts={admin.data.accounts} calendars={admin.data.calendars} onChanged={admin.reload} />
          <TaskListsSection lists={admin.data.taskLists} onChanged={admin.reload} />
        </>
      ) : null}
    </AppShell>
  );
};

const HouseholdCard = ({ householdName, onSaved }: { householdName: string; onSaved: () => void }) => {
  const auth = useAuth();
  const [name, setName] = useState(householdName);
  const [result, setResult] = useState<{ intent: "success" | "error"; text: string } | null>(null);

  const save = async () => {
    try {
      await api.updateSettings({ householdName: name.trim() });
      setResult({ intent: "success", text: "Nome aggiornato." });
      onSaved();
      await auth.reloadHousehold();
    } catch (error) {
      setResult({ intent: "error", text: error instanceof Error ? error.message : "Salvataggio non riuscito." });
    }
  };

  return (
    <Card className="panel-card">
      <div className="panel-card__header">
        <div>
          <p className="eyebrow">Impostazioni</p>
          <h3>Famiglia</h3>
        </div>
      </div>
      <div className="inline-form">
        <Field label="Nome della famiglia">
          <Input value={name} onChange={(_, data) => setName(data.value)} />
        </Field>
        <Button appearance="primary" disabled={name.trim().length < 2 || name === householdName} onClick={() => void save()}>
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
