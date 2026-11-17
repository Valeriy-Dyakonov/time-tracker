import { useEffect, useState } from "react";
import { inTauri } from "../api";

type Upd = { version: string; downloadAndInstall: (cb?: (e: { event: string; data?: { contentLength?: number; chunkLength?: number } }) => void) => Promise<void> };
type Win = { minimize(): Promise<void>; toggleMaximize(): Promise<void>; close(): Promise<void>; isMaximized(): Promise<boolean>; onResized(cb: () => void): Promise<() => void> };

const RECHECK_MS = 4 * 60 * 60 * 1000;

/** Custom window title bar (the native one is off via "decorations": false): app name, version, update button, window controls. */
export default function TitleBar() {
  const [win, setWin] = useState<Win | null>(null);
  const [maximized, setMaximized] = useState(false);
  const [version, setVersion] = useState("");
  const [upd, setUpd] = useState<Upd | null>(null);
  const [state, setState] = useState<"" | "busy" | "error">("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!inTauri) return;
    let unlisten: (() => void) | undefined;
    let timer: number | undefined;
    (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const w = getCurrentWindow() as unknown as Win;
      setWin(w);
      setMaximized(await w.isMaximized());
      unlisten = await w.onResized(() => { w.isMaximized().then(setMaximized).catch(() => {}); });
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        setVersion(await getVersion());
      } catch { /* version label is optional */ }
      const check = async () => {
        try {
          const { check } = await import("@tauri-apps/plugin-updater");
          const u = await check();
          if (u) setUpd(u as unknown as Upd);
        } catch { /* dev build or updater not configured: stay silent */ }
      };
      await check();
      timer = window.setInterval(check, RECHECK_MS);
    })();
    return () => { unlisten?.(); if (timer) window.clearInterval(timer); };
  }, []);

  const install = async () => {
    if (!upd) return;
    setState("busy");
    setMsg("Скачиваю…");
    let total = 0, got = 0;
    try {
      await upd.downloadAndInstall((e) => {
        if (e.event === "Started") total = e.data?.contentLength ?? 0;
        if (e.event === "Progress") { got += e.data?.chunkLength ?? 0; if (total) setMsg(`Скачано ${Math.round((got / total) * 100)}%`); }
        if (e.event === "Finished") setMsg("Устанавливаю…");
      });
    } catch (e) {
      setState("error");
      setMsg(String(e));
    }
  };

  return (
    <div className="titlebar" data-tauri-drag-region>
      <div className="tb-title" data-tauri-drag-region>
        Worklog Tracker{version && <span className="tb-ver" data-tauri-drag-region>v{version}</span>}
      </div>
      {upd && (
        <div className="tb-update">
          {state === "busy" ? (
            <span className="tb-msg">{msg}</span>
          ) : (
            <button className="tb-upd-btn" onClick={install} title={state === "error" ? `Не удалось обновить: ${msg}` : `Установить версию ${upd.version}`}>
              {state === "error" ? "Повторить обновление" : `Обновить до v${upd.version}`}
            </button>
          )}
        </div>
      )}
      <div className="tb-fill" data-tauri-drag-region />
      {win && (
        <div className="tb-controls">
          <button className="tb-btn" aria-label="Свернуть" onClick={() => win.minimize()}>
            <svg viewBox="0 0 10 10"><path d="M0 5h10" /></svg>
          </button>
          <button className="tb-btn" aria-label={maximized ? "Восстановить" : "Развернуть"} onClick={() => win.toggleMaximize()}>
            {maximized
              ? <svg viewBox="0 0 10 10"><path d="M2 0.5h7.5v7.5M0.5 2h7.5v7.5h-7.5z" /></svg>
              : <svg viewBox="0 0 10 10"><path d="M0.5 0.5h9v9h-9z" /></svg>}
          </button>
          <button className="tb-btn tb-close" aria-label="Закрыть" onClick={() => win.close()}>
            <svg viewBox="0 0 10 10"><path d="M0 0l10 10M10 0l-10 10" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}
