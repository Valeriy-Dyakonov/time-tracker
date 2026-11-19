import type { ReactNode } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { useT } from "@/i18n";
import { api } from "@/shared/api";

export function Field(props: { label: string; hint?: string; tip?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{props.label}{props.tip && <InfoTip>{props.tip}</InfoTip>}</span>
      {props.children}
      {props.hint && <span className="hint">{props.hint}</span>}
    </label>
  );
}

/** Small "i" badge that shows an explanation on hover or keyboard focus. */
export function InfoTip(props: { children: ReactNode; wide?: boolean }) {
  const t = useT().common;
  return (
    <span className={`infotip ${props.wide ? "wide" : ""}`} tabIndex={0} aria-label={t.help}>
      <svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5" /><path d="M8 7.2v4M8 4.8v.1" /></svg>
      <span className="tip" role="tooltip">{props.children}</span>
    </span>
  );
}

export function Help(props: { title: string; steps: ReactNode[]; note?: ReactNode }) {
  return (
    <details className="help">
      <summary>{props.title}</summary>
      <ol>
        {props.steps.map((s, i) => <li key={i}>{s}</li>)}
      </ol>
      {props.note && <p className="note">{props.note}</p>}
    </details>
  );
}

export function Title(props: { children: ReactNode; tip?: ReactNode; wide?: boolean; as?: "h3" | "h4" }) {
  const H = props.as ?? "h3";
  return <H className="titled">{props.children}{props.tip && <InfoTip wide={props.wide}>{props.tip}</InfoTip>}</H>;
}

/** Saves a text file: the system "Save as" dialog in the app, a browser download as a fallback. */
export async function download(name: string, content: string, mime = "text/plain"): Promise<void> {
  try {
    const ext = name.split(".").pop() ?? "";
    const path = await save({ defaultPath: name, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
    if (path) await api.saveExport(path, content);
    return;
  } catch (e) {
    if (isTauri()) throw e;
  }
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const PALETTE = ["#3b82f6", "#ef6c3e", "#10b981", "#a855f7", "#eab308", "#ec4899", "#06b6d4", "#84cc16", "#f43f5e", "#6366f1"];
const assigned = new Map<string, string>();

/** Distinct colour per issue key: palette in order of first appearance, hashed beyond 10 keys. */
export function keyColor(key: string): string {
  let c = assigned.get(key);
  if (!c) {
    let h = 0;
    for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    c = assigned.size < PALETTE.length ? PALETTE[assigned.size] : `hsl(${h % 360} 65% 55%)`;
    assigned.set(key, c);
  }
  return c;
}
