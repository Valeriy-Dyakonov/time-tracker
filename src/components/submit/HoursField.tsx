import { useEffect, useState } from "react";
import { useT } from "../../i18n";
import { fmtTempo, type HoursFormat } from "../../lib/submit";
import { parseHours } from "../../lib/submitEdits";
import { CopyIcon } from "../ui";

/** Hours of a row: editable in place, copied in the Tempo format; shows the planned value when changed. */
export function HoursField(props: { hours: number; planHours?: number; fmt: HoursFormat; onChange: (h: number) => void }) {
  const m = useT().submit.row;
  const shown = fmtTempo(props.hours, props.fmt);
  const [draft, setDraft] = useState(shown);
  const [bad, setBad] = useState(false);
  useEffect(() => { setDraft(shown); setBad(false); }, [shown]);

  const commit = () => {
    const h = parseHours(draft);
    if (h === null) {
      setBad(true);
      setDraft(shown);
      return;
    }
    setBad(false);
    if (h !== props.hours) props.onChange(h);
    else setDraft(shown);
  };

  return (
    <span className={`wl-hours ${props.planHours !== undefined ? "edited" : ""}`}>
      <input
        className={bad ? "bad" : ""}
        value={draft}
        size={7}
        title={bad ? m.hoursBad : m.hoursTitle}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setDraft(shown); }}
      />
      <CopyIcon text={shown} title={m.copyHours} />
      {props.planHours !== undefined && (
        <button className="wl-mini" title={m.revertHours(fmtTempo(props.planHours, props.fmt))} onClick={() => props.onChange(props.planHours!)}>↺</button>
      )}
    </span>
  );
}
