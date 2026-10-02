import { Badge, Button, Card, ProgressBar, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow } from "@fluentui/react-components";
import { api } from "@/api/client";
import { AppShell } from "@/components/app-shell";
import { EmptyState, ErrorState, LoadingState } from "@/components/page-states";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { ArrowSyncRegular, WeatherSunnyRegular } from "@/lib/fluent-icons";
import type { DashboardData } from "@familywall/shared";

const isEmpty = (data: DashboardData): boolean => {
  return data.agenda.length === 0 && data.routines.length === 0 && data.reminders.length === 0;
};

export const DashboardPage = () => {
  const dashboard = useAsyncResource(() => api.getDashboard(), []);

  return (
    <>
      <AppShell
        currentRoute="/"
        eyebrow="Today at a glance"
        title="A warm command center for the whole household"
        subtitle="Shared agenda, routines, and gentle reminders stay readable from the wall without spilling private detail."
        summaryChip="Wall mode ready"
        toolbarActions={
          <Button appearance="primary" icon={<ArrowSyncRegular />} onClick={dashboard.reload}>
            Refresh overview
          </Button>
        }
      >
        {dashboard.status === "loading" ? (
          <LoadingState title="Loading dashboard" message="Pulling today's household overview and routine progress." />
        ) : dashboard.status === "error" ? (
          <ErrorState
            title="Dashboard temporarily offline"
            message={dashboard.error.message}
            actionLabel="Retry dashboard"
            onAction={dashboard.reload}
          />
        ) : isEmpty(dashboard.data) ? (
          <EmptyState
            title="Dashboard in arrivo"
            message="Agenda, routine e promemoria arriveranno nelle prossime versioni. Intanto usa il calendario."
            actionLabel="Ricarica"
            onAction={dashboard.reload}
          />
        ) : (
          <>
            <section className="stats-grid">
              <Card className="metric-card">
                <div className="metric-card__header">
                  <WeatherSunnyRegular fontSize={20} />
                  <span>{dashboard.data.focusDateLabel}</span>
                </div>
                <strong>{dashboard.data.weather.temperatureC}°C</strong>
                <p>{dashboard.data.weather.condition}</p>
                <small>{dashboard.data.weather.note}</small>
              </Card>
              <Card className="metric-card">
                <span>Agenda items</span>
                <strong>{dashboard.data.agenda.length}</strong>
                <p>Every schedule touchpoint visible for wall and tablet screens.</p>
              </Card>
              <Card className="metric-card">
                <span>Routines running</span>
                <strong>{dashboard.data.routines.length}</strong>
                <p>Touch-friendly progress cards help the household close the evening calmly.</p>
              </Card>
            </section>

            <section className="content-grid content-grid--wide">
              <Card className="panel-card">
                <div className="panel-card__header">
                  <div>
                    <p className="eyebrow">Shared agenda</p>
                    <h3>Who is on point today</h3>
                  </div>
                  <Badge appearance="filled">{dashboard.data.householdName}</Badge>
                </div>
                <Table aria-label="Daily family agenda">
                  <TableHeader>
                    <TableRow>
                      <TableHeaderCell>Member</TableHeaderCell>
                      <TableHeaderCell>Today</TableHeaderCell>
                      <TableHeaderCell>Time</TableHeaderCell>
                      <TableHeaderCell>Status</TableHeaderCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dashboard.data.agenda.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="identity-cell">
                            <img src={item.memberAvatarUrl} alt={item.memberName} className="avatar-thumb" />
                            <span>{item.memberName}</span>
                          </div>
                        </TableCell>
                        <TableCell>{item.today}</TableCell>
                        <TableCell>{item.time}</TableCell>
                        <TableCell>{item.status}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>

              <Card className="panel-card">
                <div className="panel-card__header">
                  <div>
                    <p className="eyebrow">Rhythm</p>
                    <h3>Evening routines</h3>
                  </div>
                </div>
                <div className="stack-list">
                  {dashboard.data.routines.map((routine) => (
                    <article key={routine.id} className="routine-row">
                      <div>
                        <h4>{routine.title}</h4>
                        <p>{routine.ownerName} · {routine.cadence}</p>
                      </div>
                      <div className="routine-row__progress">
                        <ProgressBar value={routine.completion / 100} />
                        <span>{routine.completion}% complete</span>
                      </div>
                    </article>
                  ))}
                </div>
              </Card>

              <Card className="panel-card">
                <div className="panel-card__header">
                  <div>
                    <p className="eyebrow">Reminders</p>
                    <h3>Quiet nudges for the family</h3>
                  </div>
                </div>
                <div className="stack-list">
                  {dashboard.data.reminders.map((reminder) => (
                    <article key={reminder.id} className="reminder-card">
                      <Badge appearance="filled" color={reminder.severity === "Action" ? "danger" : reminder.severity === "Watch" ? "warning" : "success"}>
                        {reminder.severity}
                      </Badge>
                      <h4>{reminder.title}</h4>
                      <p>{reminder.note}</p>
                    </article>
                  ))}
                </div>
              </Card>
            </section>
          </>
        )}
      </AppShell>
    </>
  );
};