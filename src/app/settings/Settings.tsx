import { useState } from "react";
import { os } from "@/shared/lib/platform";
import type { Settings as S } from "@/shared/types";
import { Status } from "./parts";
import { GROUPS, SECTIONS, sectionLabel } from "./registry";
import { useT } from "@/i18n";
import { useSettingsForm } from "./useSettingsForm";
import { Button } from "@/shared/ui";
import { useTheme } from "@/shared/theme";

export default function Settings(props: { settings: S; onSaved: (s: S) => void }) {
  const f = useSettingsForm(props.settings, props.onSaved);
  const [active, setActive] = useState(SECTIONS[0].id);
  const [open, setOpen] = useState<Set<string>>(new Set());
  useTheme();
  const t = useT();
  const m = t.settings;

  return (
    <div className="settings-layout">
      <nav className="sidenav">
        {GROUPS.map((g) => {
          const items = SECTIONS.filter((sec) => sec.group === g).map((sec) => ({ sec, st: sec.status(f.ready, f.s) }));
          const isOpen = open.has(g) || items.some((i) => i.sec.id === active);
          const missing = items.some((i) => i.st.required && !i.st.ok);
          return (
            <div key={g} className="sidegroup">
              <button className="sidehead" aria-expanded={isOpen} onClick={() => setOpen((cur) => { const n = new Set(cur); if (n.has(g)) n.delete(g); else n.add(g); return n; })}>
                <svg className={`sidechev ${isOpen ? "open" : ""}`} width="10" height="10" viewBox="0 0 12 12" aria-hidden><path d="M4 2.5 7.5 6 4 9.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <span>{m.groups[g]}</span>
                {missing && <span className="mark req small">!</span>}
              </button>
              {isOpen && items.map(({ sec, st }) => {
                const mark = st.ok ? "ok" : st.required ? "req" : "off";
                return (
                  <button key={sec.id} className={`sideitem sub ${active === sec.id ? "active" : ""}`} onClick={() => setActive(sec.id)}>
                    <span className={`mark ${mark}`}>{st.ok ? "✓" : st.required ? "!" : "○"}</span>
                    <span className="lbl">{sectionLabel(sec.id)}<small>{st.sub}</small></span>
                  </button>
                );
              })}
            </div>
          );
        })}
        <p className="side-note">{m.readOnlyNote}</p>
        <div className="side-note secure">
          <svg viewBox="0 0 16 16"><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></svg>
          <span>{m.secure.before}<b>{m.secure.stores[os]}</b>{m.secure.after}</span>
        </div>
      </nav>
      <div className="settings-main">
        {/* All sections stay mounted so loaded room/repo lists survive switching between them. */}
        {SECTIONS.map(({ id, Component }) => (
          <div key={id} hidden={active !== id}><Component f={f} /></div>
        ))}
        <div className="savebar">
          <Button variant="primary" onClick={f.save} disabled={!f.dirty}>{t.common.save}</Button>
          {f.dirty && <span className="status">{m.saveBar.unsaved}</span>}
          <Status text={f.msg.save} />
        </div>
      </div>
    </div>
  );
}
