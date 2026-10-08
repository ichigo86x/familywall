import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: Error | null;
}

/** Clears what this browser keeps (session, cached answers) and starts again from the login. */
const resetBrowser = () => {
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("familywall.auth") || key.startsWith("familywall.cache:")) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // Storage blocked: a reload is all we can do.
  }
  window.location.hash = "#/login";
  window.location.reload();
};

/**
 * Last line of defence: an unexpected error shows what happened and how to get out of it,
 * instead of an empty (black, in dark mode) page.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  public state: State = { error: null };

  public static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  public componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Familywall crashed:", error, info.componentStack);
  }

  public render(): ReactNode {
    if (!this.state.error) {
      return this.props.children;
    }
    return (
      <div className="crash-page" role="alert">
        <div className="crash-card">
          <p className="eyebrow">Familywall</p>
          <h1>Qualcosa non ha funzionato</h1>
          <p>
            La pagina ha ricevuto dati che non si aspettava. Succede di solito quando il browser parla con un server diverso o più vecchio della web
            app: in sviluppo controlla che l'API di Familywall sia avviata (<code>npm run dev:api</code>) e che nessun altro programma usi la sua porta
            (3001).
          </p>
          <pre>{this.state.error.message}</pre>
          <div className="crash-actions">
            <button type="button" onClick={() => window.location.reload()}>
              Ricarica
            </button>
            <button type="button" onClick={resetBrowser}>
              Esci e accedi di nuovo
            </button>
          </div>
        </div>
      </div>
    );
  }
}
