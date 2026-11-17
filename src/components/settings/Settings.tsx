import { useState } from "react";
import type { Settings as S } from "../../types";
import { Status } from "./parts";
import { SECTIONS } from "./registry";
import { useSettingsForm } from "./useSettingsForm";

export default function Settings(props: { settings: S; onSaved: (s: S) => void }) {
  const f = useSettingsForm(props.settings, props.onSaved);
  const [active, setActive] = useState(SECTIONS[0].id);

  return (
    <div className="settings-layout">
      <nav className="sidenav">
        {SECTIONS.map((sec) => {
          const st = sec.status(f.ready, f.s);
          const mark = st.ok ? "ok" : st.required ? "req" : "off";
          return (
            <button key={sec.id} className={`sideitem ${active === sec.id ? "active" : ""}`} onClick={() => setActive(sec.id)}>
              <span className={`mark ${mark}`}>{st.ok ? "✓" : st.required ? "!" : "○"}</span>
              <span className="lbl">{sec.label}<small>{st.sub}</small></span>
            </button>
          );
        })}
        <p className="side-note">Все подключения только читают данные и ничего не меняют.</p>
        <div className="side-note secure">
          <svg viewBox="0 0 16 16"><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></svg>
          <span>Токены и пароли хранятся в системном хранилище — <b>Windows Credential Manager</b> (Диспетчер учётных данных), а не в файле настроек. Они не покидают компьютер, кроме запросов к самим сервисам.</span>
        </div>
      </nav>
      <div className="settings-main">
        {/* All sections stay mounted so loaded room/repo lists survive switching between them. */}
        {SECTIONS.map(({ id, Component }) => (
          <div key={id} hidden={active !== id}><Component f={f} /></div>
        ))}
        <div className="savebar">
          <button className="btn primary" onClick={f.save} disabled={!f.dirty}>Сохранить</button>
          {f.dirty && <span className="status">Есть несохранённые изменения</span>}
          <Status text={f.msg.save} />
        </div>
      </div>
    </div>
  );
}
