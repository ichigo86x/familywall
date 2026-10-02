import { FluentProvider } from "@fluentui/react-components";

import { AuthProvider } from "@/components/auth/auth-provider";
import { appTheme } from "@/theme/brandTheme";

interface ProvidersProps {
  children: React.ReactNode;
}

export const Providers = ({ children }: ProvidersProps) => (
  <FluentProvider theme={appTheme} style={{ minHeight: "100vh", background: "transparent" }}>
    <AuthProvider>{children}</AuthProvider>
  </FluentProvider>
);
