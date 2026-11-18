import { Component, type ReactNode } from "react";
import { t } from "@/i18n";
import { Button } from "@/shared/ui";

/**
 * A screen that throws while rendering would otherwise blank the whole window.
 * Shows what broke and a way out instead; keyed by screen in App, so leaving the screen resets it.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; onHome: () => void }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const m = t().shell.crash;
    return (
      <div className="card crash">
        <h3>{m.title}</h3>
        <p className="muted">{m.hint}</p>
        <pre>{error.message}</pre>
        <div className="row">
          <Button variant="primary" onClick={this.props.onHome}>{m.home}</Button>
          <Button onClick={() => window.location.reload()}>{m.reload}</Button>
        </div>
      </div>
    );
  }
}
