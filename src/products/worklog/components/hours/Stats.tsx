import { useMemo } from "react";
import type { Analysis } from "@/shared/types";
import { dateShort, plural, t as messages, useT } from "@/i18n";
import { fmtH, grandTotal, meetingMinutes, targetTotal } from "../../lib/report/report";
import { InfoTip } from "@/shared/ui";
import { needsReview, percent, sourceCounts } from "./review";
import { SourceChips } from "./SourceChips";

function minutesValue(mm: number) {
  const t = messages().hours.minutesValue;
  if (mm === 0) return <>—</>;
  if (mm < 60) return <>{mm}<small>{t.min}</small></>;
  return <>{Math.floor(mm / 60)}<small>{t.hoursAndMinutes(mm % 60)}</small></>;
}

/** One-glance answer to "is the period done, and what needs my attention". */
export function Stats({ a, onReview }: { a: Analysis; onReview: () => void }) {
  const all = useT();
  const t = all.hours.stats;
  const h = all.common.h;
  const total = grandTotal(a);
  const target = targetTotal(a);
  const diff = total - target;
  const ok = Math.abs(diff) < 0.01;
  const work = a.days.filter((d) => !d.off);
  const review = a.days.filter(needsReview);
  const mm = work.reduce((s, d) => s + meetingMinutes(d), 0);
  const counts = useMemo(() => sourceCounts(work), [a]);

  return (
    <section className="stats">
      <div className="stat">
        <span className="st-label">{t.distributed}<InfoTip>{t.distributedTip}</InfoTip></span>
        <span className="st-val">{fmtH(total)}<small> / {fmtH(target)} {h}</small></span>
        <span className="st-bar"><i className={ok ? "good" : "bad"} style={{ width: `${Math.min(100, percent(total, target))}%` }} /></span>
        <span className={`st-sub ${ok ? "good" : "bad"}`}>{ok ? t.matches : diff > 0 ? t.extra(fmtH(diff)) : t.missing(fmtH(-diff))}</span>
      </div>
      <div className="stat">
        <span className="st-label">{t.workdays}<InfoTip>{t.workdaysTip}</InfoTip></span>
        <span className="st-val">{work.length}<small> × {fmtH(a.hoursPerDay)} {h}</small></span>
        <span className="st-sub">{dateShort(a.start)} – {dateShort(a.end)}</span>
      </div>
      <button className={`stat ${review.length ? "warn click" : ""}`} disabled={!review.length} onClick={onReview} title={review.length ? t.checkHint : ""}>
        <span className="st-label">{t.check}</span>
        <span className={`st-val ${review.length ? "warn" : "good"}`}>{review.length || "✓"}<small>{review.length ? ` ${plural(review.length, all.common.day)}` : t.allFromData}</small></span>
        <span className="st-sub">{review.length ? t.checkSub : t.allFromDataSub}</span>
      </button>
      <div className="stat">
        <span className="st-label">{t.meetings}<InfoTip>{t.meetingsTip}</InfoTip></span>
        <span className="st-val">{minutesValue(mm)}</span>
        <span className="st-sub">{t.meetingsSub}</span>
      </div>
      <div className="stat wide">
        <span className="st-label">{a.usedAi ? t.ai : t.heuristic}<InfoTip>{a.usedAi ? t.aiTip : t.heuristicTip}{t.sourcesTip}</InfoTip></span>
        <SourceChips counts={counts} />
        <span className="st-sub">{t.sourcesSub}</span>
      </div>
    </section>
  );
}
