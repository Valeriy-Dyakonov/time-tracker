import { useEffect, useState } from "react";
import { inTauri } from "../api";

type Upd = { version: string; body?: string; downloadAndInstall: (cb?: (e: { event: string; data?: { contentLength?: number; chunkLength?: number } }) => void) => Promise<void> };

/** Checks for a new version on start (silently) and offers to install it. Works only in release builds with the updater feature. */
export default function UpdateBanner() {
  const [upd, setUpd] = useState<Upd | null>(null);
  const [state, setState] = useState<"" | "busy" | "error">("");
  const [msg, setMsg] = useState("");
  const [version, setVersion] = useState("");

  useEffect(() => {
    if (!inTauri) return;
    (async () => {
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        setVersion(await getVersion());
      } catch { /* version label is optional */ }
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const u = await check();
        if (u) setUpd(u as unknown as Upd);
      } catch {
        // Dev build or updater not configured: stay silent.
      }
    })();
  }, []);

  const install = async () => {
    if (!upd) return;
    setState("busy");
    let total = 0, got = 0;
    try {
      await upd.downloadAndInstall((e) => {
        if (e.event === "Started") total = e.data?.contentLength ?? 0;
        if (e.event === "Progress") { got += e.data?.chunkLength ?? 0; setMsg(total ? `Скачано ${Math.round((got / total) * 100)}%` : "Скачиваю…"); }
        if (e.event === "Finished") setMsg("Устанавливаю, приложение перезапустится…");
      });
    } catch (e) {
      setState("error");
      setMsg(String(e));
    }
  };

  if (!upd) return version ? <span className="muted small ver">v{version}</span> : null;
  return (
    <div className="update-banner">
      <span>Доступна версия <b>{upd.version}</b>{version ? ` (сейчас ${version})` : ""}.</span>
      {state === "busy" ? <span>{msg}</span> : <button className="btn small primary" onClick={install}>Обновить</button>}
      {state === "error" && <span className="bad">Не удалось обновить: {msg}</span>}
    </div>
  );
}
