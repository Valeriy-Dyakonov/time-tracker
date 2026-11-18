import { dateFull, useT, weekdayShort } from "@/i18n";
import { formatDate, isoWeekday } from "@/shared/lib/dates";
import { fmtH } from "../../../lib/report/report";
import type { DayBlock } from "../../../lib/submit/rows";
import { Button, CopyChip } from "@/shared/ui";

/** The week as one block per day, for systems that want daily entries. Edits are kept per day and source. */
export function DayBlocks(props: {
  blocks: DayBlock[];
  source: "plan" | "tempo";
  texts: Record<string, string>;
  setTexts: (f: (p: Record<string, string>) => Record<string, string>) => void;
}) {
  const t = useT();
  const m = t.submit.weekly;
  if (props.blocks.length === 0) return <p className="muted">{m.noDays}</p>;
  return (
    <div className="wk-days">
      {props.blocks.map((b) => {
        const id = props.source === "tempo" ? `${b.date}|tempo` : b.date;
        const text = props.texts[id] ?? b.text;
        const edited = props.texts[id] !== undefined && props.texts[id] !== b.text;
        return (
          <section className="wk-day" key={b.date}>
            <header>
              <b>{m.dayTitle(`${weekdayShort(isoWeekday(b.date))}, ${dateFull(b.date)}`)}</b>
              <span className="wl-sum sm">{fmtH(b.hours)}&nbsp;<small>{t.common.h}</small></span>
              <span className="spacer" />
              {edited && (
                <Button variant="link" title={m.revertTitle}
                  onClick={() => props.setTexts((p) => { const n = { ...p }; delete n[id]; return n; })}>{m.revert}</Button>
              )}
            </header>
            <textarea rows={Math.min(8, Math.max(2, text.split("\n").length + 1))} value={text}
              onChange={(e) => props.setTexts((p) => ({ ...p, [id]: e.target.value }))} />
            <div className="row wrap">
              <CopyChip text={text} label={m.copyDay} title={m.copyDayTitle} />
              <CopyChip text={`${formatDate(b.date)}\t${fmtH(b.hours)}`} label={m.copyDayHours} />
            </div>
          </section>
        );
      })}
    </div>
  );
}
