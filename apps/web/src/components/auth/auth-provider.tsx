import { useCallback, useEffect, useMemo, useState } from "react";
import { userCan, type HouseholdSettings, type LoginInput, type Permission, type SetupInput, type User } from "@familywall/shared";

import { api, setUnauthorizedHandler, tokenStore } from "@/api/client";
import { AuthContext, type AuthContextValue } from "@/components/auth/use-auth";

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [status, setStatus] = useState<AuthContextValue["status"]>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [household, setHousehold] = useState<HouseholdSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const adopt = useCallback(async (nextUser: User) => {
    setUser(nextUser);
    setHousehold(await api.getSettings());
    setStatus("authenticated");
    setError(null);
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    setStatus("guest");
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setStatus("guest");
    });
  }, []);

  useEffect(() => {
    let active = true;
    setStatus("loading");

    const bootstrap = async () => {
      if (tokenStore.get()) {
        try {
          const me = await api.me();
          if (active) {
            await adopt(me);
          }
          return;
        } catch {
          // Token rejected: fall through to the setup check / login.
        }
      }

      const { needsSetup } = await api.getSetupStatus();
      if (active) {
        setStatus(needsSetup ? "needs-setup" : "guest");
      }
    };

    bootstrap().catch((bootstrapError: unknown) => {
      if (active) {
        setStatus("error");
        setError(bootstrapError instanceof Error ? bootstrapError.message : "Impossibile contattare il server.");
      }
    });

    return () => {
      active = false;
    };
  }, [adopt, attempt]);

  const login = useCallback(async (input: LoginInput) => adopt((await api.login(input)).user), [adopt]);
  const setup = useCallback(async (input: SetupInput) => adopt((await api.setup(input)).user), [adopt]);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const can = useCallback((permission: Permission) => Boolean(user && userCan(user, permission)), [user]);
  const reloadHousehold = useCallback(async () => setHousehold(await api.getSettings()), []);
  const updateUser = useCallback((next: User) => setUser((current) => (current?.id === next.id ? next : current)), []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, household, error, can, login, setup, logout, retry, reloadHousehold, updateUser }),
    [status, user, household, error, can, login, setup, logout, retry, reloadHousehold, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
