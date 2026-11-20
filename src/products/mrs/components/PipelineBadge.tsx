import { useT } from "@/i18n";
import { pipeTone } from "../lib/pipeline";

/** The pipeline status as a small indicator: a coloured dot and the word. */
export function PipelineBadge({ status, compact }: { status: string; compact?: boolean }) {
  const m = useT().mrs.pipelines;
  const label = m[status] ?? status;
  return (
    <span className={`mr-pipe ${pipeTone(status)}`} title={`${m.title}: ${label}`}>
      <i aria-hidden />
      {!compact && label}
    </span>
  );
}
