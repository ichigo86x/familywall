import { createContext, useContext } from "react";
import type { HouseholdSettings, LoginInput, Permission, SetupInput, User } from "@familywall/shared";

export interface AuthContextValue {
  status: "loading" | "authenticated" | "guest" | "needs-setup" | "error";
  user: User | null;
  household: HouseholdSettings | null;
  error: string | null;
  can: (permission: Permission) => boolean;
  login: (input: LoginInput) => Promise<void>;
  setup: (input: SetupInput) => Promise<void>;
  logout: () => void;
  retry: () => void;
  reloadHousehold: () => Promise<void>;
  /** The signed-in member changed (e.g. their picture): shown at once without signing in again. */
  updateUser: (user: User) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
};
