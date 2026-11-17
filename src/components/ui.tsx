import { useState, type ReactNode } from "react";

export function Field(props: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{props.label}</span>
      {props.children}
      {props.hint && <span className="hint">{props.hint}</span>}
    </label>
  );
}

export function CopyButton(props: { text: () => string; label?: string; title?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      className="btn small ghost"
      title={props.title ?? "Скопировать"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(props.text());
          setOk(true);
          setTimeout(() => setOk(false), 1200);
        } catch {
          /* clipboard blocked */
        }
      }}
    >
      {ok ? "✓" : (props.label ?? "Копировать")}
    </button>
  );
}

export function download(name: string, content: string, mime = "text/plain") {
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
