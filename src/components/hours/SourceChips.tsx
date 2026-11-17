import type { Source } from "../../types";
import { SOURCE_LABELS } from "../sources";

export function SourceChips({ counts, title }: { counts: [Source, number][]; title?: string }) {
  if (counts.length === 0) return null;
  return (
    <span className="st-srcs" title={title}>
      {counts.map(([s, n]) => <span key={s} className={`src s-${s}`}><i />{SOURCE_LABELS[s]} <b>{n}</b></span>)}
    </span>
  );
}
