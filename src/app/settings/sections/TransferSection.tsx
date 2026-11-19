import { useRef, useState } from "react";
import { useT } from "@/i18n";
import { api } from "@/shared/api";
import { Button, download } from "@/shared/ui";
import { exportSettings, importSettings } from "@/shared/lib/settingsFile";
import { SectionCard } from "../parts";
import type { SettingsForm } from "../useSettingsForm";

export function TransferSection({ f }: { f: SettingsForm }) {
  const m = useT().settings.transfer;
  const pick = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");

  async function load(file: File | undefined) {
    if (!file) return;
    const r = importSettings(await file.text(), f.s);
    if (!r) return setStatus(m.bad);
    f.replace(r.settings);
    setStatus(m.loaded(r.skipped.length));
  }

  return (
    <>
    <SectionCard title={m.title} tip={m.tip}>
      <div className="row">
        <Button onClick={() => download("worklog-tracker-settings.json", exportSettings(f.s), "application/json").then(() => setStatus(""), (e) => setStatus(`✗ ${e?.detail ?? e}`))}>{m.export}</Button>
        <Button onClick={() => pick.current?.click()}>{m.import}</Button>
        <input ref={pick} type="file" accept=".json,application/json" hidden
          onChange={(e) => { load(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      {status && <p className="hint">{status}</p>}
    </SectionCard>
    <CacheCard />
    </>
  );
}

function CacheCard() {
  const m = useT().settings.transfer.cache;
  const [status, setStatus] = useState("");
  const clear = () => api.clearCache().then(() => setStatus(m.done), (e) => setStatus(`✗ ${e?.detail ?? e}`));
  return (
    <SectionCard title={m.title} tip={m.tip}>
      <div className="row"><Button onClick={clear}>{m.clear}</Button></div>
      {status && <p className="hint">{status}</p>}
    </SectionCard>
  );
}
