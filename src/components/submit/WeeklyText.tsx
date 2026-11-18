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
import { tempoDayHours, tempoReadiness, tempoWeekText } from "../../lib/tempoWeek";
import type { JiraSync } from "./useJiraSync";
import { Segmented } from "../ui";

type Source = "plan" | "tempo";

/** Step 2: a ready text per week for a time system that wants a weekly description. */
export function WeeklyText({ a, storeId, canAi, jira }: { a: Analysis; storeId: string; canAi: boolean; jira: JiraSync }) {
  const weeks = useMemo(() => weeksOf(a.days), [a]);
  const [texts, setTexts] = useStored<Record<string, string>>(`${storeId}.weeks`, {});
  const [busy, setBusy] = useState<string | null>(null);
  /** Per week: build the text from the plan or from what is logged in Tempo. */
  const [sources, setSources] = useStored<Record<string, Source>>(`${storeId}.weekSource`, {});
  const [err, setErr] = useState("");
  const t = useT();
  const m = t.submit.weekly;

  const tempoOn = jira.load.kind === "ok";
  /** Tempo once the week is fully logged there, unless the user picked the plan; texts are kept per source. */
  const view = (w: Week) => {
    const ready = tempoOn ? tempoReadiness(w, jira.list) : null;
    const src: Source = ready?.ready ? (sources[w.monday] ?? "tempo") : "plan";
    const id = src === "tempo" ? `${w.monday}|tempo` : w.monday;
    const base = src === "tempo" ? tempoWeekText(a, w, jira.list) : weekText(a, w);
    const hours = src === "tempo" ? (ready?.logged ?? 0) / 60 : weekHours(w);
    const dayHours = src === "tempo"
      ? tempoDayHours(w, jira.list)
      : w.days.filter((d) => !d.off).map((d) => `${formatDate(d.date)}\t${fmtH(dayTotal(d))}`).join("\n");
    return { ready, src, id, base, hours, dayHours };
  };

  async function rewrite(w: Week) {
    setBusy(w.monday);
    setErr("");
    try {
      const v = view(w);
      const text = parseNarrative(await api.llmChat(weekSystemPrompt(), weekPrompt(a, w, v.src === "tempo" ? v.base : undefined)));
      if (text) setTexts((p) => ({ ...p, [v.id]: text }));
      else setErr(m.aiEmpty);
    } catch (e) {
      setErr(m.aiError(String(e)));
    } finally {
      setBusy(null);
    }
  }

  const reset = (id: string) => setTexts((p) => { const n = { ...p }; delete n[id]; return n; });

  return (
    <Card className="step">
      <StepHeader n={2} title={m.title} tip={m.tip}>{m.intro}</StepHeader>
      {err && <div className="error">{err}</div>}
      {jira.load.kind !== "off" && (
        <div className="row wrap wk-tempo">
          {jira.load.kind === "error" && <span className="wl-err">{t.submit.jira.loadFailed(jira.load.error)}</span>}
          <span className="spacer" />
          <Button variant="ghost" size="small" disabled={jira.load.kind === "loading" || Object.values(jira.actions).some((x) => x.busy)} onClick={() => void jira.reload()}>
            {jira.load.kind === "loading" ? t.submit.jira.loading : m.tempoRefresh}
          </Button>
          <InfoTip>{m.sourceTip}</InfoTip>
        </div>
      )}
      <div className="wk-grid">
        {weeks.map((w) => {
          const v = view(w);
          const text = texts[v.id] ?? v.base;
          const edited = texts[v.id] !== undefined && texts[v.id] !== v.base;
          return (
            <article className="wk-card" key={w.monday}>
              <header>
                <b>{m.week(weekTitle(w))}</b>
                <span className="wl-sum sm">{fmtH(v.hours)}&nbsp;<small>{t.common.h}</small></span>
                <span className="spacer" />
                {edited && <Button variant="link" title={m.revertTitle} onClick={() => reset(v.id)}>{m.revert}</Button>}
                {v.ready && (
                  <span title={v.ready.ready ? m.sourceTip : m.tempoNotReady(fmtH(v.ready.logged / 60), fmtH(v.ready.norm / 60))}>
                    <Segmented size="small" value={v.src} onChange={(s) => v.ready?.ready && setSources((p) => ({ ...p, [w.monday]: s }))}
                      options={[{ value: "plan", label: m.fromPlan }, { value: "tempo", label: m.fromTempo, title: v.ready.ready ? m.fromTempoTitle : m.tempoNotReady(fmtH(v.ready.logged / 60), fmtH(v.ready.norm / 60)) }]} />
                  </span>
                )}
              </header>
              <textarea rows={Math.min(12, Math.max(4, text.split("\n").length + 1))} value={text} onChange={(e) => setTexts((p) => ({ ...p, [v.id]: e.target.value }))} />
              <div className="row wrap">
                <CopyChip text={text} label={m.copyText} wide />
                <CopyChip
                  text={v.dayHours}
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
