import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Button, Card, Field, Input } from "@fluentui/react-components";

import { useAuth } from "@/components/auth/use-auth";
import { LoadingState } from "@/components/page-states";
import { ArrowRightRegular } from "@/lib/fluent-icons";

export const LoginPage = () => {
  const auth = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (auth.status === "loading") {
    return <LoadingState title="Apertura del family wall" message="Verifica dell'accesso in corso." />;
  }
  if (auth.status === "authenticated") {
    return <Navigate to="/" replace />;
  }
  if (auth.status === "needs-setup") {
    return <Navigate to="/setup" replace />;
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await auth.login({ username, password });
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : "Impossibile accedere.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <section className="auth-hero">
        <p className="eyebrow">Bentornato</p>
        <h1>Il calendario di famiglia, sempre a portata di mano.</h1>
        <p>Accedi con l'utente che ti ha assegnato l'amministratore. Su iPhone e iPad usa "Condividi → Aggiungi alla schermata Home" per aprirlo come un'app.</p>
      </section>
      <Card className="auth-card">
        <form onSubmit={submit} className="auth-form">
          <div className="panel-card__header">
            <div>
              <p className="eyebrow">Accedi</p>
              <h2>Apri il family wall</h2>
            </div>
          </div>
          <Field label="Utente" validationState={formError ? "error" : undefined} validationMessage={formError ?? undefined}>
            <Input
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              value={username}
              onChange={(_, data) => setUsername(data.value)}
            />
          </Field>
          <Field label="Password">
            <Input type="password" autoComplete="current-password" value={password} onChange={(_, data) => setPassword(data.value)} />
          </Field>
          <div className="auth-actions">
            <Button type="submit" appearance="primary" icon={<ArrowRightRegular />} disabled={submitting || !username || !password}>
              {submitting ? "Accesso in corso..." : "Accedi"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};
