import { useEffect, useState } from "react";
import { Badge, Button, Card, Tab, TabList, Toolbar } from "@fluentui/react-components";
import { useNavigate } from "react-router-dom";

import { useAuth } from "@/components/auth/use-auth";
import {
  CalendarRegular,
  ClipboardTaskRegular,
  HomeRegular,
  PersonCircleRegular,
  SignOutRegular,
  SparkleRegular
} from "@/lib/fluent-icons";

export type AppRoute = "/" | "/calendar" | "/lists" | "/admin";

interface AppShellProps {
  currentRoute: AppRoute;
  eyebrow: string;
  title: string;
  subtitle: string;
  summaryChip: string;
  children: React.ReactNode;
  toolbarActions?: React.ReactNode;
}

const ROLE_LABELS = { Admin: "Admin", Parent: "Genitore", Child: "Figlio", Kiosk: "Pannello" } as const;

const NARROW_QUERY = "(max-width: 1120px)";

/** Below the breakpoint the navigation becomes a horizontal tab bar above the content. */
const useIsNarrow = () => {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_QUERY).matches);
  useEffect(() => {
    const query = window.matchMedia(NARROW_QUERY);
    const update = () => setNarrow(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return narrow;
};

const initials = (name: string) =>
  name
    .split(/s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");

export const AppShell = ({ currentRoute, eyebrow, title, subtitle, summaryChip, children, toolbarActions }: AppShellProps) => {
  const auth = useAuth();
  const navigate = useNavigate();
  const isNarrow = useIsNarrow();

  const tabs = [
    { value: "/", label: "Dashboard", icon: <HomeRegular /> },
    { value: "/calendar", label: "Calendario", icon: <CalendarRegular /> },
    { value: "/lists", label: "Liste", icon: <ClipboardTaskRegular /> },
    ...(auth.can("members:manage") ? [{ value: "/admin", label: "Admin", icon: <PersonCircleRegular /> }] : [])
  ];

  return (
    <div className="app-shell">
      <Toolbar className="app-toolbar" aria-label="Family wall toolbar">
        <div className="app-toolbar__brand">
          <span className="app-toolbar__dot" />
          <div>
            <p className="eyebrow">Family wall</p>
            <h1 className="app-toolbar__title">{auth.household?.householdName ?? "Familywall"}</h1>
          </div>
        </div>
        <div className="app-toolbar__meta">
          <Badge appearance="filled" color="informative">
            {summaryChip}
          </Badge>
          {auth.user ? (
            <span
              className="member-avatar"
              style={{ background: auth.user.color }}
              title={`${auth.user.displayName} · ${ROLE_LABELS[auth.user.role]}`}
              aria-label={`${auth.user.displayName} · ${ROLE_LABELS[auth.user.role]}`}
            >
              {initials(auth.user.displayName)}
            </span>
          ) : null}
          <Button
            appearance="subtle"
            icon={<SignOutRegular />}
            onClick={() => {
              auth.logout();
              navigate("/login");
            }}
          >
            Esci
          </Button>
        </div>
      </Toolbar>

      <div className="shell-grid">
        <Card className="shell-nav">
          <TabList
            vertical={!isNarrow}
            selectedValue={currentRoute}
            onTabSelect={(_, data) => {
              if (typeof data.value === "string") {
                navigate(data.value);
              }
            }}
          >
            {tabs.map((tab) => (
              <Tab key={tab.value} icon={tab.icon} value={tab.value}>
                {tab.label}
              </Tab>
            ))}
          </TabList>
          {isNarrow ? null : (
            <Card className="shell-nav__callout">
              <SparkleRegular fontSize={20} />
              <h3>Wall-safe by design</h3>
              <p>Le voci private restano nascoste mentre il display condiviso mantiene visibile il ritmo della famiglia.</p>
            </Card>
          )}
        </Card>

        <main className="shell-main">
          <section className="hero-card">
            <svg className="hero-mesh" aria-hidden="true" viewBox="0 0 800 400" preserveAspectRatio="none">
              <defs>
                <radialGradient id="mesh-one" cx="0%" cy="0%" r="80%">
                  <stop offset="0%" stopColor="#E9A24D" stopOpacity="0.52" />
                  <stop offset="100%" stopColor="#E9A24D" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="mesh-two" cx="100%" cy="100%" r="80%">
                  <stop offset="0%" stopColor="#3A7D6E" stopOpacity="0.7" />
                  <stop offset="100%" stopColor="#3A7D6E" stopOpacity="0" />
                </radialGradient>
              </defs>
              <rect width="800" height="400" fill="url(#mesh-one)" />
              <rect width="800" height="400" fill="url(#mesh-two)" />
            </svg>
            <div className="hero-card__content">
              <div>
                <p className="eyebrow">{eyebrow}</p>
                <h2>{title}</h2>
                <p>{subtitle}</p>
              </div>
              <div className="hero-card__actions">{toolbarActions}</div>
            </div>
          </section>

          <div className="page-stack">{children}</div>
        </main>
      </div>
    </div>
  );
};
