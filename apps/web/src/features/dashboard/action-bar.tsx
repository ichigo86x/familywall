import { useEffect, useState } from "react";
import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger } from "@fluentui/react-components";
import { useNavigate } from "react-router-dom";
import { HOME_STATE_LABELS, type HomeButtonView } from "@familywall/shared";

import { api } from "@/api/client";
import { CloseableDialogTitle } from "@/components/closeable-dialog-title";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { AddRegular } from "@/lib/fluent-icons";

const STATE_REFRESH_MS = 30 * 1000;

interface ActionBarProps {
  canWriteEvents: boolean;
  canWriteLists: boolean;
}

/**
 * Top of the dashboard: one "+" button with a menu (new event, shift, dish, note, list item)
 * and the Home Assistant buttons chosen by the Admin (door opener, intercom, lights...).
 */
export const ActionBar = ({ canWriteEvents, canWriteLists }: ActionBarProps) => {
  const navigate = useNavigate();
  const home = useAsyncResource(() => api.getHomeButtons().catch(() => null), [], "home-buttons");
  const [confirming, setConfirming] = useState<HomeButtonView | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const timer = window.setInterval(home.reload, STATE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [home.reload]);

  useEffect(() => {
    if (!feedback) {
      return;
    }
    const timer = window.setTimeout(() => setFeedback(null), 4000);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const run = async (button: HomeButtonView) => {
    setConfirming(null);
    setRunning(button.id);
    try {
      await api.runHomeButton(button.id);
      setFeedback({ id: button.id, ok: true, text: "Fatto" });
      window.setTimeout(home.reload, 1500);
    } catch (error) {
      setFeedback({ id: button.id, ok: false, text: error instanceof Error ? error.message : "Non riuscito" });
    } finally {
      setRunning(null);
    }
  };

  const shortcuts = [
    ...(canWriteEvents
      ? [
          { to: "/calendar?new=1", icon: "📅", label: "Evento" },
          { to: "/schedule?new=1", icon: "🏡", label: "Turno" },
          { to: "/menu?new=1", icon: "🍽️", label: "Piatto" }
        ]
      : []),
    ...(canWriteLists
      ? [
          { to: "/notes?new=1", icon: "📝", label: "Nota" },
          { to: "/lists", icon: "🛒", label: "Voce in lista" }
        ]
      : [])
  ];
  const buttons = home.data?.buttons ?? [];

  if (shortcuts.length === 0 && buttons.length === 0) {
    return null;
  }

  return (
    <nav className="action-bar" aria-label="Azioni rapide">
      {shortcuts.length > 0 ? (
        <Menu>
          <MenuTrigger disableButtonEnhancement>
            <button type="button" className="action-bar__item action-bar__item--add" title="Aggiungi">
              <span className="action-bar__icon" aria-hidden="true">
                <AddRegular />
              </span>
              <span className="action-bar__label">Aggiungi</span>
            </button>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              {shortcuts.map((shortcut) => (
                <MenuItem key={shortcut.to} icon={<span aria-hidden="true">{shortcut.icon}</span>} onClick={() => navigate(shortcut.to)}>
                  {shortcut.label}
                </MenuItem>
              ))}
            </MenuList>
          </MenuPopover>
        </Menu>
      ) : null}
      {buttons.map((button) => {
        // Only meaningful states (locks, covers, switches); buttons and scripts report timestamps or "unknown".
        const state = button.state ? (HOME_STATE_LABELS[button.state] ?? null) : null;
        const active = button.state === "on" || button.state === "open" || button.state === "unlocked";
        const result = feedback?.id === button.id ? feedback : null;
        return (
          <button
            key={button.id}
            type="button"
            className={`action-bar__item action-bar__item--home ${active ? "action-bar__item--active" : ""}`.trim()}
            disabled={running === button.id || button.state === "unavailable"}
            title={state ? `${button.label}: ${state}` : button.label}
            onClick={() => (button.confirm ? setConfirming(button) : void run(button))}
          >
            <span className="action-bar__icon" aria-hidden="true">{running === button.id ? "⏳" : button.icon}</span>
            <span className="action-bar__label">{button.label}</span>
            {result ? (
              <span className={`action-bar__state ${result.ok ? "" : "action-bar__state--error"}`.trim()}>{result.ok ? "✓ " + result.text : result.text}</span>
            ) : state ? (
              <span className="action-bar__state">{state}</span>
            ) : null}
          </button>
        );
      })}

      <Dialog open={confirming !== null} onOpenChange={(_, data) => (!data.open ? setConfirming(null) : undefined)}>
        <DialogSurface className="confirm-dialog">
          <DialogBody>
            <CloseableDialogTitle>
              {confirming?.icon} {confirming?.label}
            </CloseableDialogTitle>
            <DialogContent>Confermi?</DialogContent>
            <DialogActions>
              <Button appearance="secondary" size="large" onClick={() => setConfirming(null)}>Annulla</Button>
              <Button appearance="primary" size="large" onClick={() => confirming && void run(confirming)}>Conferma</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </nav>
  );
};
