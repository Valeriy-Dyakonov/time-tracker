import { useT } from "@/i18n";

export type View = "weeks" | "submit" | "ai" | "log" | "export";

const TABS: { id: View; icon: JSX.Element }[] = [
  { id: "weeks", icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> },
  { id: "submit", icon: <><path d="M5 12l4 4L19 6" /></> },
  { id: "ai", icon: <><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /></> },
  { id: "log", icon: <><path d="M5 6h14M5 12h14M5 18h9" /></> },
  { id: "export", icon: <><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></> },
];

export function ViewTabs({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const tabs = useT().report.tabs;
  return (
    <nav className="viewtabs" role="tablist">
      {TABS.map((t) => (
        <button key={t.id} role="tab" aria-selected={view === t.id} title={tabs[t.id].hint} className={view === t.id ? "vt on" : "vt"} onClick={() => onChange(t.id)}>
          <svg viewBox="0 0 24 24">{t.icon}</svg>{tabs[t.id].label}
        </button>
      ))}
    </nav>
  );
}
