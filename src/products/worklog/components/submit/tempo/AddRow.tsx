import { useState } from "react";
import type { Analysis } from "@/shared/types";
import { useT } from "@/i18n";
import type { WorklogRow } from "../../../lib/submit/rows";
import { checkNewRow, parseHours, type AddError } from "../../../lib/submit/edits";
import { Button } from "@/shared/ui";

/** A row the analysis did not produce: any task, any day of the period. */
export function AddRow(props: { a: Analysis; rows: WorklogRow[]; onAdd: (r: WorklogRow) => void; onClose: () => void }) {
  const m = useT().submit.add;
  const [key, setKey] = useState("");
  const [date, setDate] = useState(props.a.start);
  const [hours, setHours] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<AddError | null>(null);
  const keys = Object.values(props.a.issues).sort((x, y) => x.key.localeCompare(y.key));

  const add = () => {
    const k = key.trim().toUpperCase();
    const h = parseHours(hours);
    const err = checkNewRow({ key: k, date, hours: h }, props.a.start, props.a.end, props.rows);
    setError(err);
    if (err || h === null) return;
    props.onAdd({ key: k, date, hours: h, comment: comment.trim() || (props.a.issues[k]?.summary ?? ""), inferred: false });
    setKey(""); setHours(""); setComment("");
  };

  return (
    <section className="bulk add-row">
      <h4>{m.title}</h4>
      <div className="add-grid">
        <label>{m.key}
          <input list="wl-add-keys" value={key} placeholder="ABC-123" onChange={(e) => setKey(e.target.value)} />
          <datalist id="wl-add-keys">{keys.map((i) => <option key={i.key} value={i.key}>{i.summary}</option>)}</datalist>
        </label>
        <label>{m.date}
          <input type="date" value={date} min={props.a.start} max={props.a.end} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>{m.hours}
          <input value={hours} placeholder="2h 30m" size={8} onChange={(e) => setHours(e.target.value)} />
        </label>
        <label className="add-desc">{m.comment}
          <input value={comment} placeholder={props.a.issues[key.trim().toUpperCase()]?.summary ?? m.commentPlaceholder} onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        </label>
      </div>
      <div className="bulk-bar">
        {error && <span className="wl-err">{m.errors[error]}</span>}
        <span className="spacer" />
        <Button variant="ghost" size="small" onClick={props.onClose}>{m.close}</Button>
        <Button variant="primary" size="small" onClick={add}>{m.add}</Button>
      </div>
    </section>
  );
}
