import { useT } from "@/i18n";
import { Button } from "@/shared/ui";
import type { Stale } from "./stale";

export type Step = "calls" | "analysis" | "submit";
export type More = "ai" | "log" | "export";
export type View = Step | More;

const STEPS: Step[] = ["calls", "analysis", "submit"];
const MORE: More[] = ["ai", "log", "export"];

/** The user flow in order (calls -> analysis -> submit) and, apart, the views for looking closer. */
export function Flow({ view, onChange, stale, hasResult }: { view: View; onChange: (v: View) => void; stale: Stale; hasResult: boolean }) {
  const t = useT().report;
  return (
    <nav className="flow" aria-label={t.flowLabel}>
      <ol className="flow-steps">
        {STEPS.map((id, i) => {
          // Calls are always current; analysis and submit depend on a result that may be outdated.
          const old = id !== "calls" && hasResult && !!stale;
          return (
            <li key={id}>
              <button className={`flow-step ${view === id ? "on" : ""}`} aria-current={view === id ? "step" : undefined} title={t.steps[id].hint} onClick={() => onChange(id)}>
                <i>{i + 1}</i>{t.steps[id].label}
                {old && <small className="stale">{t.stale.badge}</small>}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="more" role="group" aria-label={t.moreLabel}>
        <span className="more-label">{t.moreLabel}</span>
        {MORE.map((id) => (
          <Button key={id} size="small" className={view === id ? "more-on" : ""} aria-pressed={view === id} title={t.tabs[id].hint} onClick={() => onChange(id)}>
            {t.tabs[id].label}
          </Button>
        ))}
      </div>
    </nav>
  );
}

/** The way on to the next step: a banner of its own, so the flow is never a guess. */
export function NextStep({ to, onGo }: { to: "analysis" | "submit"; onGo: () => void }) {
  const t = useT().report.next[to];
  return (
    <div className="next-bar">
      <span>{t.text}</span>
      <Button variant="primary" onClick={onGo}>{t.button}</Button>
    </div>
  );
}
