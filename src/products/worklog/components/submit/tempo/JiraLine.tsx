import { useState } from "react";
import { useT } from "@/i18n";
import { fmtH } from "../../../lib/report/report";
import type { RowSync } from "../../../lib/submit/sync";
import { Badge, Button } from "@/shared/ui";
import type { RowAction } from "../useJiraSync";

const h = (minutes: number) => fmtH(minutes / 60);

/** Under a worklog row: what Jira already has, and the row's own write buttons. */
export function JiraLine(props: {
  sync: RowSync;
  comment: string;
  action?: RowAction;
  /** Set when this write would break a day/period limit: the user is asked first. */
  limitWarning?: string;
  onSubmit: () => void;
  onOverwrite: () => void;
}) {
  const { sync: s, action } = props;
  const m = useT().submit.row;
  const [asking, setAsking] = useState<"overwrite" | "submit" | null>(null);
  const busy = action?.busy === true;
  const differs = s.logged !== s.planned || s.entries.length > 1 || s.entries[0]?.comment.trim() !== props.comment.trim();

  return (
    <div className="wl-jira">
      {s.state === "full" && <Badge tone="good" title={m.inJiraTitle(s.entries.length)}>{m.filled} · {h(s.logged)}</Badge>}
      {s.state === "over" && <Badge tone="warn" title={m.overTitle}>{m.over(h(s.logged), h(s.planned))}</Badge>}
      {s.state === "partial" && <Badge tone="warn" title={m.inJiraTitle(s.entries.length)}>{m.inJira(h(s.logged))}</Badge>}
      <span className="spacer" />
      {busy && <span className="muted">{m.busy}</span>}
      {!busy && asking === "overwrite" && (
        <span className="wl-ask">
          {m.overwriteAsk(h(s.logged), h(s.planned), s.entries.length - 1)}
          <Button size="small" variant="primary" onClick={() => { setAsking(null); props.onOverwrite(); }}>{m.overwriteYes}</Button>
          <Button size="small" variant="ghost" onClick={() => setAsking(null)}>{m.cancel}</Button>
        </span>
      )}
      {!busy && asking === "submit" && (
        <span className="wl-ask">
          <span className="wl-err">{props.limitWarning}</span>
          <Button size="small" variant="primary" onClick={() => { setAsking(null); props.onSubmit(); }}>{m.submitAnyway}</Button>
          <Button size="small" variant="ghost" onClick={() => setAsking(null)}>{m.cancel}</Button>
        </span>
      )}
      {!busy && !asking && (
        <>
          {s.missing > 0 && (
            <Button size="small" title={props.limitWarning ?? m.submitTitle} onClick={() => (props.limitWarning ? setAsking("submit") : props.onSubmit())}>
              {s.logged > 0 ? m.topUp(h(s.missing)) : m.submit}
            </Button>
          )}
          {s.logged > 0 && differs && (
            <Button size="small" variant="ghost" title={m.overwriteTitle} onClick={() => setAsking("overwrite")}>{m.overwrite}</Button>
          )}
        </>
      )}
      {action && !action.busy && <span className="wl-err">{m.failed(action.error)}</span>}
    </div>
  );
}
