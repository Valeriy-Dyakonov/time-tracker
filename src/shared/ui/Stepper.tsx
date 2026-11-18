import { useState } from "react";
import { hours, useT } from "@/i18n";

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
  const t = useT().shell.ui;
  const { value, step, min = 0, max = 24 } = props;
  const [text, setText] = useState<string | null>(null);
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  const commit = (raw: string) => {
    const v = Number(raw.replace(",", "."));
    if (Number.isFinite(v)) props.onChange(clamp(v));
    setText(null);
  };
  const shown = text ?? hours(value);
  return (
    <span className={`stepper ${props.small ? "small" : ""}`} title={props.title}>
      <button type="button" aria-label={t.less} disabled={value <= min} onClick={() => props.onChange(clamp(value - step))}>−</button>
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
      <button type="button" aria-label={t.more} disabled={value >= max} onClick={() => props.onChange(clamp(value + step))}>+</button>
    </span>
  );
}
