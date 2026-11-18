import { useState } from "react";
import { api, type Room } from "@/shared/api";
import { useT } from "@/i18n";
import { Button, Field, Help } from "@/shared/ui";
import { SectionCard, Status, TestButton, TokenField } from "../parts";
import type { SettingsForm } from "../useSettingsForm";

export function MatrixSection({ f }: { f: SettingsForm }) {
  const { s, set } = f;
  const m = useT().settings.matrix;
  return (
    <SectionCard title="Matrix" badge="opt">
      <Field label="Homeserver" hint={m.serverHint} tip={m.serverTip}>
        <input value={s.matrixHomeserver} placeholder="https://matrix.company.ru" onChange={(e) => set("matrixHomeserver", e.target.value)} />
      </Field>
      <Field label={m.userId} hint={m.userIdHint}>
        <input value={s.matrixUserId} placeholder="@ivan:company.ru" onChange={(e) => set("matrixUserId", e.target.value)} />
      </Field>
      <TokenField f={f} name="matrix_token" label="Access token" />
      <Help title={m.helpTitle} steps={m.helpSteps} note={m.helpNote} />
      <TestButton f={f} svc="matrix" />
      <MatrixLogin f={f} />
      <RoomExclusions f={f} />
    </SectionCard>
  );
}

function MatrixLogin({ f }: { f: SettingsForm }) {
  const { s } = f;
  const m = useT().settings.matrix.login;
  const [user, setUser] = useState("");
  const [pw, setPw] = useState("");
  const [status, setStatus] = useState("");

  async function login(kind: "sso" | "pw") {
    setStatus(kind === "sso" ? m.ssoWaiting : m.signingIn);
    try {
      await api.saveSettings(s); // the backend reads the homeserver address from saved settings
      const id = kind === "sso" ? await api.matrixLoginSso() : await api.matrixLoginPassword(user, pw);
      setPw("");
      await f.refresh();
      f.adopt(id ? { ...s, matrixUserId: id } : s);
      setStatus(m.done(id));
    } catch (e) {
      setStatus("✗ " + e);
    }
  }

  const noServer = !s.matrixHomeserver.trim();
  return (
    <details className="help" open={!!f.msg.matrix?.startsWith("✗") || !!status}>
      <summary>{m.summary}</summary>
      <p className="note">{m.intro}</p>
      <div className="row"><Button size="small" disabled={noServer} onClick={() => login("sso")}>{m.sso}</Button></div>
      <div className="row wrap">
        <input style={{ width: 150 }} placeholder={m.user} value={user} onChange={(e) => setUser(e.target.value)} />
        <input style={{ width: 150 }} type="password" placeholder={m.password} value={pw} onChange={(e) => setPw(e.target.value)} />
        <Button size="small" disabled={noServer || !user || !pw} onClick={() => login("pw")}>{m.byPassword}</Button>
      </div>
      <p className="note">{m.passwordNote}</p>
      <Status text={status} />
    </details>
  );
}

function RoomExclusions({ f }: { f: SettingsForm }) {
  const { s, set } = f;
  const m = useT().settings.matrix.rooms;
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState("");

  async function load() {
    setStatus(m.loading);
    try {
      await f.persist();
      setRooms(await api.listMatrixRooms());
      setStatus("");
    } catch (e) {
      setStatus("✗ " + e);
    }
  }

  const excluded = s.matrixExcludeRooms;
  const shown = (rooms ?? []).filter((r) => r.name.toLowerCase().includes(filter.toLowerCase()));
  return (
    <>
      <Field label={m.label} hint={excluded.length ? m.hintExcluded(excluded.length) : m.hintAll}>
        <div className="row"><Button size="small" onClick={load}>{m.load}</Button><Status text={status} /></div>
      </Field>
      {rooms && (
        <div className="rooms">
          <input placeholder={m.filter} value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="room-list">
            {shown.map((r) => (
              <label key={r.id} className="check">
                <input type="checkbox" checked={excluded.includes(r.id)}
                  onChange={(e) => set("matrixExcludeRooms", e.target.checked ? [...excluded, r.id] : excluded.filter((x) => x !== r.id))} />
                <span className={excluded.includes(r.id) ? "excluded" : ""}>{r.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
