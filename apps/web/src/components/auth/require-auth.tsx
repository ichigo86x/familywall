import { Navigate } from "react-router-dom";
import type { Permission } from "@familywall/shared";

import { ErrorState, LoadingState } from "@/components/page-states";
import { useAuth } from "@/components/auth/use-auth";

interface RequireAuthProps {
  children: React.ReactNode;
  /** When set, members without it are sent back to the calendar. */
  permission?: Permission;
}

export const RequireAuth = ({ children, permission }: RequireAuthProps) => {
  const auth = useAuth();

  if (auth.status === "loading") {
    return <LoadingState title="Apertura del family wall" message="Verifica dell'accesso in corso." />;
  }

  if (auth.status === "error") {
    return <ErrorState title="Server non raggiungibile" message={auth.error ?? "Si è verificato un problema."} actionLabel="Riprova" onAction={auth.retry} />;
  }

  if (auth.status === "needs-setup") {
    return <Navigate to="/setup" replace />;
  }

  if (auth.status === "guest") {
    return <Navigate to="/login" replace />;
  }

  if (permission && !auth.can(permission)) {
    return <Navigate to="/calendar" replace />;
  }

  return <>{children}</>;
};
