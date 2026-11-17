import type { Source } from "../../types";
import { sourceLabel } from "../sources";

export function SourceChips({ counts, title }: { counts: [Source, number][]; title?: string }) {
  if (counts.length === 0) return null;
  return (
    <span className="st-srcs" title={title}>
      {counts.map(([s, n]) => <span key={s} className={`src s-${s}`}><i />{sourceLabel(s)} <b>{n}</b></span>)}
    </span>
  );
}
