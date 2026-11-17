import { useMemo } from "react";
import type { Analysis } from "../../types";
import { formatRu, plural } from "../../lib/dates";
import { fmtH, grandTotal, meetingMinutes, targetTotal } from "../../lib/report";
import { InfoTip } from "../ui";
import { needsReview, percent, sourceCounts } from "./review";
import { SourceChips } from "./SourceChips";

function minutesValue(mm: number) {
  if (mm === 0) return <>—</>;
  if (mm < 60) return <>{mm}<small> мин</small></>;
  return <>{Math.floor(mm / 60)}<small> ч{mm % 60 ? ` ${mm % 60} мин` : ""}</small></>;
}

/** One-glance answer to "is the period done, and what needs my attention". */
export function Stats({ a, onReview }: { a: Analysis; onReview: () => void }) {
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
        <span className="st-label">Распределено<InfoTip>Сколько часов разложено по задачам за весь период и сколько нужно по норме (рабочие дни × часы в день). Должно сойтись — иначе в каких-то днях недобор или перебор.</InfoTip></span>
        <span className="st-val">{fmtH(total)}<small> / {fmtH(target)} ч</small></span>
        <span className="st-bar"><i className={ok ? "good" : "bad"} style={{ width: `${Math.min(100, percent(total, target))}%` }} /></span>
        <span className={`st-sub ${ok ? "good" : "bad"}`}>{ok ? "сходится с нормой" : diff > 0 ? `лишних ${fmtH(diff)} ч` : `не хватает ${fmtH(-diff)} ч`}</span>
      </div>
      <div className="stat">
        <span className="st-label">Рабочих дней<InfoTip>Будни периода без праздников, выходных и дней, которые вы отметили как выходной или отпуск.</InfoTip></span>
        <span className="st-val">{work.length}<small> × {fmtH(a.hoursPerDay)} ч</small></span>
        <span className="st-sub">{formatRu(a.start).slice(0, 5)} – {formatRu(a.end).slice(0, 5)}</span>
      </div>
      <button className={`stat ${review.length ? "warn click" : ""}`} disabled={!review.length} onClick={onReview} title={review.length ? "Показать только эти дни" : ""}>
        <span className="st-label">Проверить</span>
        <span className={`st-val ${review.length ? "warn" : "good"}`}>{review.length || "✓"}<small>{review.length ? ` ${plural(review.length, "день", "дня", "дней")}` : " всё по данным"}</small></span>
        <span className="st-sub">{review.length ? "без событий или не равны норме →" : "каждый день — по реальным событиям"}</span>
      </button>
      <div className="stat">
        <span className="st-label">Встречи<InfoTip>Суммарное время звонков и встреч из календаря. Оно не вычитается из рабочих часов — это часть дня, которую ИИ учитывает как контекст.</InfoTip></span>
        <span className="st-val">{minutesValue(mm)}</span>
        <span className="st-sub">входят в рабочие часы</span>
      </div>
      <div className="stat wide">
        <span className="st-label">{a.usedAi ? "Распределил ИИ" : "Эвристика без ИИ"}<InfoTip>{a.usedAi
          ? "Корпоративный ИИ прочитал события каждого дня и решил, над какими задачами вы работали и в каких долях."
          : "ИИ не подключён или не ответил: доли посчитаны по числу действий и коммитов с ключом задачи."} Ниже — сколько событий пришло из каждого источника.</InfoTip></span>
        <SourceChips counts={counts} />
        <span className="st-sub">событий из источников</span>
      </div>
    </section>
  );
}
