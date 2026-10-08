import { HashRouter, Navigate, Route, Routes } from "react-router-dom";

import { RequireAuth } from "@/components/auth/require-auth";
import { ErrorBoundary } from "@/components/error-boundary";
import { Providers } from "@/components/providers";
import { AdminPage } from "@/features/admin/admin-page";
import { LoginPage } from "@/features/auth/login-page";
import { SetupPage } from "@/features/auth/setup-page";
import { CalendarPage } from "@/features/calendar/calendar-page";
import { DashboardPage } from "@/features/dashboard/dashboard-page";
import { ListsPage } from "@/features/lists/lists-page";
import { NotesPage } from "@/features/notes/notes-page";
import { SchedulePage } from "@/features/schedule/schedule-page";
import { MenuPage } from "@/features/menu/menu-page";

// Hash routing keeps every route on the same document URL, so deep links survive
// the Home Assistant ingress prefix, nginx and iOS home-screen launches without server rewrites.
export const App = () => (
  <ErrorBoundary>
    <Providers>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/" element={<RequireAuth><DashboardPage /></RequireAuth>} />
          <Route path="/calendar" element={<RequireAuth><CalendarPage /></RequireAuth>} />
          <Route path="/lists" element={<RequireAuth><ListsPage /></RequireAuth>} />
          <Route path="/notes" element={<RequireAuth><NotesPage /></RequireAuth>} />
          <Route path="/schedule" element={<RequireAuth><SchedulePage /></RequireAuth>} />
          <Route path="/menu" element={<RequireAuth><MenuPage /></RequireAuth>} />
          <Route path="/admin" element={<RequireAuth permission="members:manage"><AdminPage /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </Providers>
  </ErrorBoundary>
);
