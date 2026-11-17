import { useMemo, useState } from "react";
import type { Analysis } from "../../types";
import { api } from "../../api";
import { dayTotal } from "../../lib/allocate";
import { formatDate } from "../../lib/dates";
import { parseNarrative } from "../../lib/prompt";
import { fmtH, weeksOf, type Week } from "../../lib/report";
import { weekHours, weekPrompt, weekSystemPrompt, weekText, weekTitle } from "../../lib/submit";
import { useStored } from "../hooks/useStored";
import { Button, Card, CopyChip, InfoTip } from "../ui";
import { StepHeader } from "./StepHeader";
import { useT } from "../../i18n";

/** Step 2: a ready text per week for a time system that wants a weekly description. */
export function WeeklyText({ a, storeId, canAi }: { a: Analysis; storeId: string; canAi: boolean }) {
  const weeks = useMemo(() => weeksOf(a.days), [a]);
  const [texts, setTexts] = useStored<Record<string, string>>(`${storeId}.weeks`, {});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const t = useT();
  const m = t.submit.weekly;

  async function rewrite(w: Week) {
    setBusy(w.monday);
    setErr("");
    try {
      const text = parseNarrative(await api.llmChat(weekSystemPrompt(), weekPrompt(a, w)));
      if (text) setTexts((p) => ({ ...p, [w.monday]: text }));
      else setErr(m.aiEmpty);
    } catch (e) {
      setErr(m.aiError(String(e)));
    } finally {
      setBusy(null);
    }
  }

  const reset = (monday: string) => setTexts((p) => { const n = { ...p }; delete n[monday]; return n; });

  return (
    <Card className="step">
      <StepHeader n={2} title={m.title} tip={m.tip}>{m.intro}</StepHeader>
      {err && <div className="error">{err}</div>}
      <div className="wk-grid">
        {weeks.map((w) => {
          const base = weekText(a, w);
          const text = texts[w.monday] ?? base;
          const edited = texts[w.monday] !== undefined && texts[w.monday] !== base;
          return (
            <article className="wk-card" key={w.monday}>
              <header>
                <b>{m.week(weekTitle(w))}</b>
                <span className="wl-sum sm">{fmtH(weekHours(w))}&nbsp;<small>{t.common.h}</small></span>
                <span className="spacer" />
                {edited && <Button variant="link" title={m.revertTitle} onClick={() => reset(w.monday)}>{m.revert}</Button>}
              </header>
              <textarea rows={Math.min(12, Math.max(4, text.split("\n").length + 1))} value={text} onChange={(e) => setTexts((p) => ({ ...p, [w.monday]: e.target.value }))} />
              <div className="row wrap">
                <CopyChip text={text} label={m.copyText} wide />
                <CopyChip
                  text={w.days.filter((d) => !d.off).map((d) => `${formatDate(d.date)}\t${fmtH(dayTotal(d))}`).join("\n")}
                  label={m.dayHours}
                  title={m.dayHoursTitle}
                  wide
                />
                {canAi && (
                  <>
                    <Button size="small" disabled={busy !== null} onClick={() => rewrite(w)}>
                      {busy === w.monday ? m.aiBusy : m.aiRewrite}
                    </Button>
                    <InfoTip>{m.aiTip}</InfoTip>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </Card>
  );
}
