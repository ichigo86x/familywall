import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  Dropdown,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Option,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow
} from "@fluentui/react-components";
import { createMemberSchema, type User, type UserRole } from "@familywall/shared";

import { api } from "@/api/client";
import { CloseableDialogTitle } from "@/components/closeable-dialog-title";
import { useAuth } from "@/components/auth/use-auth";
import { AvatarDialog, MemberAvatar } from "@/components/member-avatar";
import { DeleteRegular, EditRegular, KeyRegular, PersonAddRegular } from "@/lib/fluent-icons";

export const ROLE_INFO: Record<UserRole, { label: string; description: string }> = {
  Admin: { label: "Admin", description: "Gestisce membri, account e calendari; modifica eventi." },
  Parent: { label: "Genitore", description: "Crea e modifica eventi." },
  Child: { label: "Figlio", description: "Vede il calendario; scrive liste e note." },
  Kiosk: { label: "Pannello", description: "Pannello a muro; non vede gli eventi nascosti sul wall. In sola lettura, salvo modalità scrittura." }
};

const ROLES = Object.keys(ROLE_INFO) as UserRole[];

const PALETTE = ["#2563EB", "#DB2777", "#F97316", "#14B8A6", "#8B5CF6", "#EC4899", "#65A30D", "#0EA5E9"];

type Dialogs =
  | { kind: "create" }
  | { kind: "edit"; member: User }
  | { kind: "password"; member: User }
  | { kind: "avatar"; member: User }
  | null;

const errorText = (error: unknown) => (error instanceof Error ? error.message : "Operazione non riuscita.");

interface MembersSectionProps {
  members: User[];
  onChanged: () => void;
}

export const MembersSection = ({ members, onChanged }: MembersSectionProps) => {
  const auth = useAuth();
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const remove = async (member: User) => {
    if (!window.confirm(`Eliminare ${member.displayName}? Gli eventi restano, ma senza questo membro.`)) {
      return;
    }
    try {
      await api.deleteMember(member.id);
      onChanged();
    } catch (error) {
      setFeedback(errorText(error));
    }
  };

  return (
    <Card className="panel-card">
      <div className="panel-card__header">
        <div>
          <p className="eyebrow">Famiglia</p>
          <h3>Membri e permessi</h3>
        </div>
        <Button appearance="primary" icon={<PersonAddRegular />} onClick={() => setDialog({ kind: "create" })}>
          Aggiungi membro
        </Button>
      </div>

      {feedback ? (
        <MessageBar intent="error">
          <MessageBarBody>{feedback}</MessageBarBody>
        </MessageBar>
      ) : null}

      <Table className="members-table" aria-label="Membri della famiglia">
        <TableHeader>
          <TableRow>
            <TableHeaderCell>Nome</TableHeaderCell>
            <TableHeaderCell>Utente</TableHeaderCell>
            <TableHeaderCell>Ruolo</TableHeaderCell>
            <TableHeaderCell>Azioni</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => (
            <TableRow key={member.id}>
              <TableCell>
                <div className="identity-cell">
                  <MemberAvatar member={member} className="member-picture--small" />
                  <span>{member.displayName}</span>
                  {member.disabled ? <Badge appearance="outline" color="danger">disattivato</Badge> : null}
                </div>
              </TableCell>
              <TableCell>{member.username}</TableCell>
              <TableCell>
                {ROLE_INFO[member.role].label}
                {member.canLogin === false ? <div className="table-subline">solo etichetta, nessun accesso</div> : null}
                {member.panelWrite ? <div className="table-subline">modalità scrittura</div> : null}
                {member.totpEnabled ? <div className="table-subline">🔐 verifica in due passaggi</div> : null}
                {member.keywords?.length ? <div className="table-subline">anche: {member.keywords.join(", ")}</div> : null}
              </TableCell>
              <TableCell>
                <div className="row-actions">
                  <Button size="small" appearance="subtle" icon={<EditRegular />} aria-label="Modifica" onClick={() => setDialog({ kind: "edit", member })} />
                  <Button size="small" appearance="subtle" aria-label="Foto o emoji" title="Foto o emoji" onClick={() => setDialog({ kind: "avatar", member })}>
                    🖼️
                  </Button>
                  <Button size="small" appearance="subtle" icon={<KeyRegular />} aria-label="Reimposta password" onClick={() => setDialog({ kind: "password", member })} />
                  {member.totpEnabled && member.id !== auth.user?.id ? (
                    <Button
                      size="small"
                      appearance="subtle"
                      aria-label="Azzera verifica in due passaggi"
                      title="Azzera la verifica in due passaggi (telefono perso)"
                      onClick={() => {
                        if (window.confirm(`Azzerare la verifica in due passaggi di ${member.displayName}? Potrà accedere con la sola password e riattivarla.`)) {
                          void api.resetTotp(member.id).then(onChanged).catch((caught: unknown) => window.alert(caught instanceof Error ? caught.message : "Operazione non riuscita."));
                        }
                      }}
                    >
                      🔓
                    </Button>
                  ) : null}
                  {member.id !== auth.user?.id ? (
                    <Button size="small" appearance="subtle" icon={<DeleteRegular />} aria-label="Elimina" onClick={() => void remove(member)} />
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {dialog?.kind === "create" ? (
        <MemberDialog
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            onChanged();
          }}
          defaultColor={PALETTE[members.length % PALETTE.length]!}
        />
      ) : null}
      {dialog?.kind === "edit" ? (
        <MemberDialog
          member={dialog.member}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            onChanged();
          }}
          defaultColor={dialog.member.color}
        />
      ) : null}
      {dialog?.kind === "password" ? <PasswordDialog member={dialog.member} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "avatar" ? (
        <AvatarDialog
          member={dialog.member}
          onClose={() => setDialog(null)}
          onSaved={(member) => {
            auth.updateUser(member);
            onChanged();
          }}
        />
      ) : null}
    </Card>
  );
};

interface MemberDialogProps {
  member?: User;
  defaultColor: string;
  onClose: () => void;
  onSaved: () => void;
}

const MemberDialog = ({ member, defaultColor, onClose, onSaved }: MemberDialogProps) => {
  const [form, setForm] = useState({
    displayName: member?.displayName ?? "",
    username: member?.username ?? "",
    role: member?.role ?? ("Child" as UserRole),
    color: defaultColor,
    password: "",
    disabled: member?.disabled ?? false,
    keywords: (member?.keywords ?? []).join(", "),
    tagOnly: member ? member.canLogin === false : false,
    panelWrite: member?.panelWrite ?? false
  });
  const wasTagOnly = member?.canLogin === false;
  const tagOnly = form.role === "Child" && form.tagOnly;
  /** A password is needed for new members that sign in, and to give access back to a tag-only member. */
  const needsPassword = !tagOnly && (!member || wasTagOnly);

  const keywordList = form.keywords
    .split(",")
    .map((word) => word.trim())
    .filter(Boolean);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      if (member) {
        if (needsPassword && form.password.length < 8) {
          setError("Imposta una password di almeno 8 caratteri per dare l'accesso.");
          return;
        }
        if (needsPassword) {
          await api.setMemberPassword(member.id, { password: form.password });
        }
        await api.updateMember(member.id, {
          displayName: form.displayName,
          role: form.role,
          color: form.color,
          disabled: form.disabled,
          keywords: keywordList,
          panelWrite: form.role === "Kiosk" && form.panelWrite,
          ...(tagOnly && !wasTagOnly ? { loginEnabled: false as const } : {})
        });
      } else {
        const parsed = createMemberSchema.safeParse({
          username: form.username,
          displayName: form.displayName,
          role: form.role,
          color: form.color,
          keywords: keywordList,
          loginEnabled: !tagOnly,
          panelWrite: form.role === "Kiosk" && form.panelWrite,
          password: tagOnly ? undefined : form.password
        });
        if (!parsed.success) {
          setError(parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(" · "));
          return;
        }
        await api.createMember(parsed.data);
      }
      onSaved();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(_, data) => (!data.open ? onClose() : undefined)}>
      <DialogSurface>
        <DialogBody>
          <CloseableDialogTitle>{member ? `Modifica ${member.displayName}` : "Nuovo membro"}</CloseableDialogTitle>
          <DialogContent className="dialog-form">
            <Field label="Nome visualizzato" required>
              <Input value={form.displayName} onChange={(_, data) => setForm({ ...form, displayName: data.value })} />
            </Field>
            {!member ? (
              <Field label="Utente" required hint="Usato per l'accesso: minuscole, numeri, . _ -">
                <Input autoCapitalize="none" value={form.username} onChange={(_, data) => setForm({ ...form, username: data.value })} />
              </Field>
            ) : null}
            <Field label="Ruolo" hint={ROLE_INFO[form.role].description}>
              <Dropdown
                value={ROLE_INFO[form.role].label}
                selectedOptions={[form.role]}
                onOptionSelect={(_, data) => setForm({ ...form, role: data.optionValue as UserRole })}
              >
                {ROLES.map((role) => (
                  <Option key={role} value={role}>{ROLE_INFO[role].label}</Option>
                ))}
              </Dropdown>
            </Field>
            <Field label="Colore">
              <div className="color-picker">
                {PALETTE.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`color-swatch ${form.color.toLowerCase() === color.toLowerCase() ? "color-swatch--selected" : ""}`.trim()}
                    style={{ background: color }}
                    aria-label={color}
                    onClick={() => setForm({ ...form, color })}
                  />
                ))}
                <input type="color" value={form.color} onChange={(change) => setForm({ ...form, color: change.target.value.toUpperCase() })} aria-label="Colore personalizzato" />
              </div>
            </Field>
            {form.role !== "Kiosk" ? (
              <Field
                label="Altri nomi nei titoli"
                hint={`Separati da virgola, es. soprannomi o abbreviazioni. "${form.displayName || "Il nome"}" è già riconosciuto: un evento intitolato "Karate ${form.displayName || "Luca"}" prende questo colore.`}
              >
                <Input placeholder="Raffa, Raffy" value={form.keywords} onChange={(_, data) => setForm({ ...form, keywords: data.value })} />
              </Field>
            ) : null}
            {form.role === "Child" ? (
              <Switch
                label="Solo etichetta: nessuna password, non accede all'app"
                checked={form.tagOnly}
                onChange={(_, data) => setForm({ ...form, tagOnly: data.checked })}
              />
            ) : null}
            {form.role === "Kiosk" ? (
              <Switch
                label="Modalità scrittura: dal pannello si aggiungono eventi, turni, liste e note"
                checked={form.panelWrite}
                onChange={(_, data) => setForm({ ...form, panelWrite: data.checked })}
              />
            ) : null}
            {needsPassword ? (
              <Field
                label={member ? "Password per l'accesso" : "Password iniziale"}
                required
                hint="Almeno 8 caratteri. Il membro potrà cambiarla."
              >
                <Input type="password" autoComplete="new-password" value={form.password} onChange={(_, data) => setForm({ ...form, password: data.value })} />
              </Field>
            ) : null}
            {member ? (
              <Switch label="Account disattivato" checked={form.disabled} onChange={(_, data) => setForm({ ...form, disabled: data.checked })} />
            ) : null}
            {error ? <p className="form-error">{error}</p> : null}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>Annulla</Button>
            <Button appearance="primary" disabled={busy} onClick={() => void submit()}>{busy ? "Salvataggio..." : "Salva"}</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};

const PasswordDialog = ({ member, onClose }: { member: User; onClose: () => void }) => {
  const auth = useAuth();
  const isSelf = auth.user?.id === member.id;
  const [password, setPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [result, setResult] = useState<{ intent: "success" | "error"; text: string } | null>(null);

  const submit = async () => {
    try {
      await api.setMemberPassword(member.id, { password, currentPassword: isSelf ? currentPassword : undefined });
      if (isSelf) {
        // Changing the password revokes the current session too.
        auth.logout();
        return;
      }
      setResult({ intent: "success", text: `Password di ${member.displayName} aggiornata. Le sessioni aperte sono state chiuse.` });
      setPassword("");
    } catch (error) {
      setResult({ intent: "error", text: errorText(error) });
    }
  };

  return (
    <Dialog open onOpenChange={(_, data) => (!data.open ? onClose() : undefined)}>
      <DialogSurface>
        <DialogBody>
          <CloseableDialogTitle>Password di {member.displayName}</CloseableDialogTitle>
          <DialogContent className="dialog-form">
            {isSelf ? (
              <Field label="Password attuale" required>
                <Input type="password" autoComplete="current-password" value={currentPassword} onChange={(_, data) => setCurrentPassword(data.value)} />
              </Field>
            ) : null}
            <Field label="Nuova password" required hint="Almeno 8 caratteri">
              <Input type="password" autoComplete="new-password" value={password} onChange={(_, data) => setPassword(data.value)} />
            </Field>
            {result ? (
              <MessageBar intent={result.intent}>
                <MessageBarBody>{result.text}</MessageBarBody>
              </MessageBar>
            ) : null}
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>Chiudi</Button>
            <Button appearance="primary" disabled={password.length < 8} onClick={() => void submit()}>Imposta password</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
};
