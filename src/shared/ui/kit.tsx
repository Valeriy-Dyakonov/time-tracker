import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "secondary" | "primary" | "ghost" | "link";
  size?: "md" | "small";
};

export function Button({ variant = "secondary", size = "md", className, type = "button", ...rest }: ButtonProps) {
  const base = variant === "link" ? "linkbtn" : cx("btn", variant === "primary" && "primary", variant === "ghost" && "ghost");
  return <button type={type} className={cx(base, size === "small" && "small", className)} {...rest} />;
}

export function Card({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return <section className={cx("card", className)} {...rest} />;
}

export function Badge({ tone, className, children, title }: { tone?: "good" | "warn" | "bad" | "req" | "opt"; className?: string; children: ReactNode; title?: string }) {
  return <span className={cx("badge", tone, className)} title={title}>{children}</span>;
}

export interface SegmentOption<T extends string> { value: T; label: ReactNode; title?: string }

export function Segmented<T extends string>(props: {
  options: SegmentOption<T>[];
  value: T | null;
  onChange: (v: T) => void;
  size?: "md" | "small";
  title?: string;
  role?: string;
}) {
  return (
    <div className={cx("seg", props.size === "small" && "small")} title={props.title} role={props.role}>
      {props.options.map((o) => (
        <button key={o.value} type="button" title={o.title} className={props.value === o.value ? "on" : ""} onClick={() => props.onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch(props: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; title?: string }) {
  return (
    <label className="switch" title={props.title}>
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      <i />{props.children}
    </label>
  );
}
