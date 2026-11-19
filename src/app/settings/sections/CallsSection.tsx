import { useState } from "react";
import { os } from "@/shared/lib/platform";
import { useT } from "@/i18n";
import { Button, Field, InfoTip } from "@/shared/ui";
import { SectionCard } from "../parts";
import { addCustom, customApps, isOn, KNOWN_APPS, setApp } from "@/shared/lib/callApps";
import type { SettingsForm } from "../useSettingsForm";

function Apps({ list, onChange }: { list: string[]; onChange: (v: string[]) => void }) {
  const m = useT().settings.calls;
  const [typed, setTyped] = useState("");
  const add = () => { onChange(addCustom(list, typed)); setTyped(""); };
  return (
    <Field label={m.apps} hint={m.appsHint}>
      <div className="app-grid">
        {KNOWN_APPS.map((a) => (
          <label key={a.id} className="check">
            <input type="checkbox" checked={isOn(list, a.id)} onChange={(e) => onChange(setApp(list, a.id, e.target.checked))} />
            {a.name}{a.browser && <><span className="app-tag">{m.browser}</span><InfoTip>{m.browserTip}</InfoTip></>}
          </label>
        ))}
      </div>
      <div className="app-custom">
        <b>{m.custom}<InfoTip>{m.customTip}</InfoTip></b>
        {customApps(list).length > 0 && (
          <div className="row wrap">
            {customApps(list).map((a) => (
              <span key={a} className="app-chip">{a}<button title={m.removeApp} onClick={() => onChange(setApp(list, a, false))}>×</button></span>
            ))}
          </div>
        )}
      <div className="row">
        <input value={typed} placeholder={m.customPlaceholder} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <Button size="small" disabled={!typed.trim()} onClick={add}>{m.add}</Button>
      </div>
      </div>
    </Field>
  );
}

export function CallsSection({ f }: { f: SettingsForm }) {
  const m = useT().settings.calls;
  const supported = os === "windows";
  return (
    <SectionCard title={m.title} badge="opt" tip={m.enableTip}>
      <label className="check">
        <input type="checkbox" disabled={!supported} checked={f.s.trackCalls} onChange={(e) => f.set("trackCalls", e.target.checked)} />
        {m.enable}
      </label>
      {!supported && <p className="hint">{m.windowsOnly}</p>}
      {f.s.trackCalls && supported && (
        <div className="calls-body">
          <Apps list={f.s.callApps} onChange={(v) => f.set("callApps", v)} />
        </div>
      )}
    </SectionCard>
  );
}
