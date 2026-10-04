import { FluentProvider } from "@fluentui/react-components";

import { AuthProvider } from "@/components/auth/auth-provider";
import { appDarkTheme, appTheme } from "@/theme/brandTheme";
import { ThemePreferenceProvider } from "@/theme/theme-preference";

interface ProvidersProps {
  children: React.ReactNode;
}

export const Providers = ({ children }: ProvidersProps) => (
  <ThemePreferenceProvider>
    {(resolved) => (
      <FluentProvider theme={resolved === "dark" ? appDarkTheme : appTheme} style={{ minHeight: "100vh", background: "transparent" }}>
        <AuthProvider>{children}</AuthProvider>
      </FluentProvider>
    )}
  </ThemePreferenceProvider>
);
