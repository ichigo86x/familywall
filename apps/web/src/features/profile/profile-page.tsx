import { useState } from "react";
import { Button, Card, Field, Input } from "@fluentui/react-components";
import { useNavigate } from "react-router-dom";

import { api } from "@/api/client";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/auth/use-auth";
import { SecurityCard } from "@/features/admin/security-card";
import { PhoneSetupCard } from "./phone-setup";

const ROLE_LABELS = { Admin: "Admin", Parent: "Genitore", Child: "Figlio", Kiosk: "Pannello" } as const;

/** The signed-in member's own things: account, phone setup, two-step sign-in. */
export const ProfilePage = () => {
  const auth = useAuth();
  const user = auth.user;

  return (
    <AppShell compact currentRoute="/profile" eyebrow="Profilo" title={user?.displayName ?? "Profilo"} subtitle="" summaryChip={user ? ROLE_LABELS[user.role] : ""}>
      {user ? (
        <Card className="panel-card">
          <div className="panel-card__header">
            <div>
              <p className="eyebrow">Il mio account</p>
              <h3>
                <span className="member-avatar member-avatar--inline" style={{ background: user.color }} aria-hidden="true" /> {user.displayName}
              </h3>
            </div>
          </div>
          <p>
            Nome utente <code>{user.username}</code> · {ROLE_LABELS[user.role]}
          </p>
          <p className="calendar-detail-hint">Per cambiare nome o colore chiedi all'amministratore della famiglia.</p>
        </Card>
      ) : null}
      {user?.role === "Kiosk" ? null : <PasswordCard />}
      {user?.role === "Kiosk" ? null : <PhoneSetupCard />}
      {user?.role === "Kiosk" ? null : <SecurityCard />}
    </AppShell>
  );
};

/** Own password: the current one is asked; afterwards every session of the member (phones too) signs in again. */
const PasswordCard = () => {
  const auth = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ current: "", next: "", repeat: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mismatch = form.repeat !== "" && form.next !== form.repeat;

  const save = async () => {
    if (!auth.user) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.setMemberPassword(auth.user.id, { password: form.next, currentPassword: form.current });
      auth.logout();
      navigate("/login");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Operazione non riuscita.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="panel-card">
      <div className="panel-card__header">
        <div>
          <p className="eyebrow">Accesso</p>
          <h3>Cambia password</h3>
        </div>
      </div>
      <p className="calendar-detail-hint">
        La stessa password vale per i telefoni collegati con CalDAV: dopo il cambio aggiornala anche lì. Familywall ti chiede di entrare di nuovo.
      </p>
      <div className="dialog-form profile-password">
        <Field label="Password attuale" required>
          <Input type="password" autoComplete="current-password" value={form.current} onChange={(_, data) => setForm({ ...form, current: data.value })} />
        </Field>
        <Field label="Nuova password" required hint="Almeno 8 caratteri.">
          <Input type="password" autoComplete="new-password" value={form.next} onChange={(_, data) => setForm({ ...form, next: data.value })} />
        </Field>
        <Field label="Ripeti la nuova password" required validationMessage={mismatch ? "Le password non coincidono." : undefined}>
          <Input type="password" autoComplete="new-password" value={form.repeat} onChange={(_, data) => setForm({ ...form, repeat: data.value })} />
        </Field>
        <div>
          <Button appearance="primary" disabled={busy || !form.current || form.next.length < 8 || form.next !== form.repeat} onClick={() => void save()}>
            {busy ? "Salvataggio..." : "Cambia password"}
          </Button>
        </div>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
    </Card>
  );
};
