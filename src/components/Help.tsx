import type { ReactNode } from "react";

/** Collapsible step-by-step instruction shown inside a settings card. */
export default function Help(props: { title: string; steps: ReactNode[]; note?: ReactNode }) {
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
