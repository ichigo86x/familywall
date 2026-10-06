import { useMemo } from "react";
import { FluentProvider } from "@fluentui/react-components";

import { AuthProvider } from "@/components/auth/auth-provider";
import { appDarkTheme, appTheme, scaleTheme } from "@/theme/brandTheme";
import { ThemePreferenceProvider, type ResolvedTheme } from "@/theme/theme-preference";

interface ProvidersProps {
  children: React.ReactNode;
}

const ThemedApp = ({ resolved, scale, children }: { resolved: ResolvedTheme; scale: number; children: React.ReactNode }) => {
  const theme = useMemo(() => scaleTheme(resolved === "dark" ? appDarkTheme : appTheme, scale), [resolved, scale]);
  return (
    <FluentProvider theme={theme} style={{ minHeight: "100vh", background: "transparent" }}>
      <AuthProvider>{children}</AuthProvider>
    </FluentProvider>
  );
};

export const Providers = ({ children }: ProvidersProps) => (
  <ThemePreferenceProvider>
    {(resolved, scale) => (
      <ThemedApp resolved={resolved} scale={scale}>
        {children}
      </ThemedApp>
    )}
  </ThemePreferenceProvider>
);
