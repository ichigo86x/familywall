import { useState } from "react";
import { Button, Card, Field, Input, MessageBar, MessageBarBody, Tab, TabList } from "@fluentui/react-components";
import { useSearchParams } from "react-router-dom";

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
import { BackupCard } from "./backup-card";
import { HomeAssistantHintCard, HomeCalendarsCard, HomeListsCard } from "./home-lists-card";
import { AuditCard } from "./security-card";
import { DashboardListsCard } from "./dashboard-lists-card";
import { FamilyTargetsCard } from "./family-targets-card";
import { PresenceCard } from "./presence-card";
import { PhotosCard } from "./photos-card";
import { RemoteBackupCard } from "./remote-backup-card";

const loadAdminData = async () => {
  const [members, accounts, calendars, settings, taskLists, home] = await Promise.all([
    api.getMembers(),
    api.getProviderAccounts(),
    api.getCalendarConfigs(),
    api.getSettings(),
    api.getTaskListConfigs(),
    api.getHomeStatus().catch(() => ({ available: false }))
  ]);
  return { members, accounts, calendars, settings, taskLists, homeAvailable: home.available };
};

type AdminSection = "family" | "dashboard" | "accounts" | "home" | "security";

const SECTIONS: Array<{ value: AdminSection; label: string; hint: string }> = [
  { value: "family", label: "Famiglia", hint: "Nome della famiglia, membri e permessi." },
  { value: "dashboard", label: "Dashboard e pannelli", hint: "Cosa mostra la dashboard, meteo, notte e impostazioni di ogni pannello a muro." },
  { value: "accounts", label: "Calendari e liste", hint: "Account collegati (iCloud, Google, CalDAV, Cookidoo), calendari visibili e liste." },
  { value: "home", label: "Home Assistant", hint: "Pulsanti, liste e calendari di Home Assistant." },
  { value: "security", label: "Backup e sicurezza", hint: "Backup, ripristino e registro delle attività." }
];

const isSection = (value: string | null): value is AdminSection => SECTIONS.some((section) => section.value === value);

export const AdminPage = () => {
  const admin = useAsyncResource(loadAdminData, [], "admin");
  // The section is in the address (#/admin?sezione=...), so a link or a reload opens the same one.
  const [params, setParams] = useSearchParams();
  const requested = params.get("sezione");
  const section: AdminSection = isSection(requested) ? requested : "family";
  const current = SECTIONS.find((entry) => entry.value === section)!;

  return (
    <AppShell
      compact
      currentRoute="/admin"
      eyebrow="Amministrazione"
      title={current.label}
      subtitle={current.hint}
    >
      <TabList
        className="admin-sections"
        selectedValue={section}
        onTabSelect={(_, data) => setParams({ sezione: String(data.value) }, { replace: true })}
        aria-label="Sezioni dell'amministrazione"
      >
        {SECTIONS.map((entry) => (
          <Tab key={entry.value} value={entry.value}>
            {entry.label}
          </Tab>
        ))}
      </TabList>
      <p className="calendar-detail-hint admin-section-hint">{current.hint}</p>

      {admin.status === "loading" && !admin.data ? (
        <LoadingState title="Caricamento" message="Lettura della configurazione della famiglia." />
      ) : admin.status === "error" ? (
        <ErrorState title="Admin non disponibile" message={admin.error.message} actionLabel="Riprova" onAction={admin.reload} />
      ) : admin.data ? (
        <>
          {section === "family" ? (
            <>
              <HouseholdCard householdName={admin.data.settings.householdName} onSaved={admin.reload} />
              <MembersSection members={admin.data.members} onChanged={admin.reload} />
            </>
          ) : null}
          {section === "dashboard" ? (
            <>
              <DashboardListsCard listIds={admin.data.settings.dashboardListIds} onSaved={admin.reload} />
              <WeatherCard location={admin.data.settings.weatherLocation} onSaved={admin.reload} />
              <PhotosCard photos={admin.data.settings.photos} onSaved={admin.reload} />
              <PanelSettingsCard
                night={admin.data.settings.panelNight}
                panels={admin.data.members.filter((member) => member.role === "Kiosk")}
                profiles={admin.data.settings.panelProfiles ?? {}}
                buttons={admin.data.settings.homeButtons}
                onSaved={admin.reload}
              />
            </>
          ) : null}
          {section === "accounts" ? (
            <>
              <ProvidersSection accounts={admin.data.accounts} calendars={admin.data.calendars} members={admin.data.members} onChanged={admin.reload} />
              <FamilyTargetsCard onChanged={admin.reload} />
              <TaskListsSection lists={admin.data.taskLists} onChanged={admin.reload} />
            </>
          ) : null}
          {/* Home Assistant cards only where Familywall can reach it: add-on (Supervisor) or HA_URL + long-lived HA_TOKEN. */}
          {section === "home" ? (
            admin.data.homeAvailable ? (
              <>
                <HomeButtonsCard buttons={admin.data.settings.homeButtons} onSaved={admin.reload} />
                <HomeListsCard lists={admin.data.settings.homeLists} onSaved={admin.reload} />
                <HomeCalendarsCard calendars={admin.data.settings.homeCalendars ?? []} onSaved={admin.reload} />
                <PresenceCard members={admin.data.members} links={admin.data.settings.homePresence ?? []} onSaved={admin.reload} />
              </>
            ) : (
              <HomeAssistantHintCard />
            )
          ) : null}
          {section === "security" ? (
            <>
              <BackupCard />
              <RemoteBackupCard />
              <AuditCard />
              <p className="calendar-detail-hint">La verifica in due passaggi del tuo account è nel Profilo (tocca il tuo cerchio in alto).</p>
            </>
          ) : null}
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
