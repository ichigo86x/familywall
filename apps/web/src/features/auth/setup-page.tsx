import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Button, Card, Field, Input } from "@fluentui/react-components";
import { setupSchema } from "@familywall/shared";

import { useAuth } from "@/components/auth/use-auth";
import { LoadingState } from "@/components/page-states";
import { ArrowRightRegular } from "@/lib/fluent-icons";

/** First-run wizard: shown only while the household has no members. */
export const SetupPage = () => {
  const auth = useAuth();
  const [form, setForm] = useState({ householdName: "", displayName: "", username: "", password: "", confirm: "", color: "#3A7D6E" });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (auth.status === "loading") {
    return <LoadingState title="Apertura del family wall" message="Verifica della configurazione." />;
  }
  if (auth.status !== "needs-setup") {
    return <Navigate to="/" replace />;
  }

  const update = (field: keyof typeof form) => (_: unknown, data: { value: string }) => setForm((current) => ({ ...current, [field]: data.value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    if (form.password !== form.confirm) {
      setFormError("Le password non coincidono.");
      return;
    }

    const parsed = setupSchema.safeParse(form);
    if (!parsed.success) {
      setFormError(parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(" · "));
      return;
    }

    setSubmitting(true);
    try {
      await auth.setup(parsed.data);
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : "Configurazione non riuscita.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <section className="auth-hero">
        <p className="eyebrow">Primo avvio</p>
        <h1>Configura il family wall.</h1>
        <p>Crea l'account amministratore. Dopo potrai aggiungere i membri della famiglia, il pannello a muro e collegare i calendari iCloud.</p>
      </section>
      <Card className="auth-card">
        <form onSubmit={submit} className="auth-form">
          <Field label="Nome della famiglia" required>
            <Input placeholder="Casa Rossi" value={form.householdName} onChange={update("householdName")} />
          </Field>
          <div className="form-grid">
            <Field label="Il tuo nome" required>
              <Input value={form.displayName} onChange={update("displayName")} />
            </Field>
            <Field label="Utente" required hint="3-32 caratteri: lettere minuscole, numeri, . _ -">
              <Input autoCapitalize="none" autoComplete="username" value={form.username} onChange={update("username")} />
            </Field>
          </div>
          <div className="form-grid">
            <Field label="Password" required hint="Almeno 10 caratteri">
              <Input type="password" autoComplete="new-password" value={form.password} onChange={update("password")} />
            </Field>
            <Field label="Conferma password" required>
              <Input type="password" autoComplete="new-password" value={form.confirm} onChange={update("confirm")} />
            </Field>
          </div>
          {formError ? <p className="form-error">{formError}</p> : null}
          <div className="auth-actions">
            <Button type="submit" appearance="primary" icon={<ArrowRightRegular />} disabled={submitting}>
              {submitting ? "Creazione..." : "Crea famiglia"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};
