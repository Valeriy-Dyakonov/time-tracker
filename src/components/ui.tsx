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

/** Number field with −/+ buttons instead of the native spinner; accepts "7,5" as well as "7.5". */
export function Stepper(props: {
  value: number;
  onChange: (v: number) => void;
  step: number;
  min?: number;
  max?: number;
  suffix?: string;
  title?: string;
  small?: boolean;
}) {
  const { value, step, min = 0, max = 24 } = props;
  const [text, setText] = useState<string | null>(null);
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  const commit = (raw: string) => {
    const v = Number(raw.replace(",", "."));
    if (Number.isFinite(v)) props.onChange(clamp(v));
    setText(null);
  };
  const shown = text ?? (Math.round(value * 100) / 100).toString().replace(".", ",");
  return (
    <span className={`stepper ${props.small ? "small" : ""}`} title={props.title}>
      <button type="button" aria-label="Меньше" disabled={value <= min} onClick={() => props.onChange(clamp(value - step))}>−</button>
      <span className="mid">
        <input
          inputMode="decimal"
          value={shown}
          style={{ width: `${Math.max(1, shown.length) + 0.6}ch` }}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit((e.target as HTMLInputElement).value);
            if (e.key === "ArrowUp") { e.preventDefault(); props.onChange(clamp(value + step)); }
            if (e.key === "ArrowDown") { e.preventDefault(); props.onChange(clamp(value - step)); }
          }}
        />
        {props.suffix && <span className="sfx">{props.suffix}</span>}
      </span>
      <button type="button" aria-label="Больше" disabled={value >= max} onClick={() => props.onChange(clamp(value + step))}>+</button>
    </span>
  );
}

/** Small "i" badge that shows an explanation on hover or keyboard focus. */
export function InfoTip(props: { children: ReactNode; wide?: boolean }) {
  return (
    <span className={`infotip ${props.wide ? "wide" : ""}`} tabIndex={0} aria-label="Подсказка">
      <svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5" /><path d="M8 7.2v4M8 4.8v.1" /></svg>
      <span className="tip" role="tooltip">{props.children}</span>
    </span>
  );
}
