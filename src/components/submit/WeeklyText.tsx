import { useMemo, useState } from "react";
import type { Analysis } from "../../types";
import { api } from "../../api";
import { dayTotal } from "../../lib/allocate";
import { formatRu } from "../../lib/dates";
import { parseNarrative } from "../../lib/prompt";
import { fmtH, weeksOf, type Week } from "../../lib/report";
import { WEEK_SYSTEM, weekHours, weekPrompt, weekText, weekTitle } from "../../lib/submit";
import { useStored } from "../hooks/useStored";
import { Button, Card, CopyChip, InfoTip } from "../ui";
import { StepHeader } from "./StepHeader";

/** Step 2: a ready text per week for a time system that wants a weekly description. */
export function WeeklyText({ a, storeId, canAi }: { a: Analysis; storeId: string; canAi: boolean }) {
  const weeks = useMemo(() => weeksOf(a.days), [a]);
  const [texts, setTexts] = useStored<Record<string, string>>(`${storeId}.weeks`, {});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  async function rewrite(w: Week) {
    setBusy(w.monday);
    setErr("");
    try {
      const t = parseNarrative(await api.llmChat(WEEK_SYSTEM, weekPrompt(a, w)));
      if (t) setTexts((p) => ({ ...p, [w.monday]: t }));
      else setErr("ИИ вернул пустой ответ — текст не изменён.");
    } catch (e) {
      setErr(`Ошибка ИИ: ${e}`);
    } finally {
      setBusy(null);
    }
  }

  const reset = (monday: string) => setTexts((p) => { const n = { ...p }; delete n[monday]; return n; });

  return (
    <Card className="step">
      <StepHeader n={2} title="Своя система — текст за неделю"
        tip="Для систем учёта, где за неделю пишут общий текст «что сделано» и часы. Текст собран из задач недели; правки сохраняются.">
        Для каждой недели готов текст. Поправьте при необходимости, нажмите «Копировать» и вставьте в поле недели.
        Часы по дням лежат отдельной кнопкой, если система их спросит.
      </StepHeader>
      {err && <div className="error">{err}</div>}
      <div className="wk-grid">
        {weeks.map((w) => {
          const base = weekText(a, w);
          const text = texts[w.monday] ?? base;
          const edited = texts[w.monday] !== undefined && texts[w.monday] !== base;
          return (
            <article className="wk-card" key={w.monday}>
              <header>
                <b>Неделя {weekTitle(w)}</b>
                <span className="wl-sum sm">{fmtH(weekHours(w))}&nbsp;<small>ч</small></span>
                <span className="spacer" />
                {edited && <Button variant="link" title="Отменить правки и вернуть автоматически собранный текст" onClick={() => reset(w.monday)}>вернуть исходный</Button>}
              </header>
              <textarea rows={Math.min(12, Math.max(4, text.split("\n").length + 1))} value={text} onChange={(e) => setTexts((p) => ({ ...p, [w.monday]: e.target.value }))} />
              <div className="row wrap">
                <CopyChip text={text} label="Копировать текст" wide />
                <CopyChip
                  text={w.days.filter((d) => !d.off).map((d) => `${formatRu(d.date)}\t${fmtH(dayTotal(d))}`).join("\n")}
                  label="Часы по дням"
                  title="Даты и часы рабочих дней недели, по строке на день — если система просит часы отдельно"
                  wide
                />
                {canAi && (
                  <>
                    <Button size="small" disabled={busy !== null} onClick={() => rewrite(w)}>
                      {busy === w.monday ? "ИИ пишет текст…" : "Переписать связным текстом через ИИ"}
                    </Button>
                    <InfoTip>ИИ превратит список задач недели в связный абзац для отчёта: что делали и зачем. Текст в поле заменится; исходный можно вернуть кнопкой «вернуть исходный».</InfoTip>
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
