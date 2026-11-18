import { useEffect, useState } from "react";
import { inTauri } from "@/shared/api";
import { t as messages, useT } from "@/i18n";

type Upd = { version: string; downloadAndInstall: (cb?: (e: { event: string; data?: { contentLength?: number; chunkLength?: number } }) => void) => Promise<void> };
type Win = { minimize(): Promise<void>; toggleMaximize(): Promise<void>; close(): Promise<void>; isMaximized(): Promise<boolean>; onResized(cb: () => void): Promise<() => void> };

const RECHECK_MS = 4 * 60 * 60 * 1000;

/** Custom window title bar (the native one is off via "decorations": false): app name, version, update button, window controls. */
export default function TitleBar(props: {
  /** Current tool; the bare app name on the start screen. */
  title?: string;
  /** Back to the start screen; absent when already there. */
  onHome?: () => void;
  settingsOpen: boolean;
  onToggleSettings: () => void;
}) {
  const all = useT();
  const t = all.shell.titlebar;
  const home = all.home;
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
    const tb = messages().shell.titlebar;
    setMsg(tb.downloading);
    let total = 0, got = 0;
    try {
      await upd.downloadAndInstall((e) => {
        if (e.event === "Started") total = e.data?.contentLength ?? 0;
        if (e.event === "Progress") { got += e.data?.chunkLength ?? 0; if (total) setMsg(tb.downloaded(Math.round((got / total) * 100))); }
        if (e.event === "Finished") setMsg(tb.installing);
      });
    } catch (e) {
      setState("error");
      setMsg(String(e));
    }
  };

  return (
    <div className="titlebar" data-tauri-drag-region>
      {props.onHome && (
        <button className="tb-btn tb-home" aria-label={home.home} title={home.home} onClick={props.onHome}>
          <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
        </button>
      )}
      <div className="tb-title" data-tauri-drag-region>
        {props.title ?? home.title}{version && <span className="tb-ver" data-tauri-drag-region>v{version}</span>}
      </div>
      {upd && (
        <div className="tb-update">
          {state === "busy" ? (
            <span className="tb-msg">{msg}</span>
          ) : (
            <button className="tb-upd-btn" onClick={install} title={state === "error" ? t.updateFailed(msg) : t.installVersion(upd.version)}>
              {state === "error" ? t.retryUpdate : t.updateTo(upd.version)}
            </button>
          )}
        </div>
      )}
      <div className="tb-fill" data-tauri-drag-region />
      <button className={`tb-btn tb-gear ${props.settingsOpen ? "on" : ""}`} aria-label={t.settings} title={props.settingsOpen ? t.closeSettings : t.settings} onClick={props.onToggleSettings}>
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
      </button>
      {win && <span className="tb-sep" />}
      {win && (
        <div className="tb-controls">
          <button className="tb-btn" aria-label={t.minimize} onClick={() => win.minimize()}>
            <svg viewBox="0 0 10 10"><path d="M0 5h10" /></svg>
          </button>
          <button className="tb-btn" aria-label={maximized ? t.restore : t.maximize} onClick={() => win.toggleMaximize()}>
            {maximized
              ? <svg viewBox="0 0 10 10"><path d="M2 0.5h7.5v7.5M0.5 2h7.5v7.5h-7.5z" /></svg>
              : <svg viewBox="0 0 10 10"><path d="M0.5 0.5h9v9h-9z" /></svg>}
          </button>
          <button className="tb-btn tb-close" aria-label={t.close} onClick={() => win.close()}>
            <svg viewBox="0 0 10 10"><path d="M0 0l10 10M10 0l-10 10" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}
