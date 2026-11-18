import { useState } from "react";
import { useT } from "@/i18n";
import type { Analysis, DayPlan } from "@/shared/types";
import { Button, InfoTip, Segmented, Switch } from "@/shared/ui";
import { ByTask } from "./ByTask";
import { Overview } from "./Overview";
import { needsReview } from "./review";
import { Weeks } from "./Weeks";

type Mode = "days" | "tasks";

const FLASH_MS = 1600;

/** Opens a day, scrolls to it and briefly highlights it. */
function useDayFocus(setMode: (m: Mode) => void, setOpen: (fn: (o: Set<string>) => Set<string>) => void) {
  return (date: string) => {
    setMode("days");
    setOpen((o) => new Set(o).add(date));
    setTimeout(() => {
      const el = document.getElementById(`day-${date}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("flash");
      setTimeout(() => el.classList.remove("flash"), FLASH_MS);
    }, 30);
  };
}

export function Hours(props: {
  a: Analysis;
  updateDay: (date: string, fn: (d: DayPlan) => DayPlan) => void;
  onlyReview: boolean;
  setOnlyReview: (v: boolean) => void;
  onAi: () => void;
}) {
  const t = useT().hours;
  const { a, onlyReview, setOnlyReview } = props;
  const [mode, setMode] = useState<Mode>("days");
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const review = a.days.filter(needsReview);
  const jump = useDayFocus(setMode, setOpen);
  const toggle = (date: string) => setOpen((o) => { const n = new Set(o); if (n.has(date)) n.delete(date); else n.add(date); return n; });
  const allOpen = a.days.length > 0 && a.days.every((d) => open.has(d.date));

  return (
    <div className="ts-main">
      <Overview a={a} review={review} onJump={jump} onAi={props.onAi} />
      <div className="ts-bar">
        <Segmented size="small" role="tablist" value={mode} onChange={setMode}
          options={[{ value: "days", label: t.modes.days }, { value: "tasks", label: t.modes.tasks }]} />
        <InfoTip>{t.modes.tip}</InfoTip>
        {mode === "days" ? (
          <>
            <span className="legend">
              <span><i className="lg good" />{t.legend.activity}</span>
              <span><i className="lg warn" />{t.legend.inferred}</span>
              <span><i className="lg bad" />{t.legend.empty}</span>
              <InfoTip wide>{t.legend.tip}</InfoTip>
            </span>
            <span className="spacer" />
            <Switch checked={onlyReview} onChange={setOnlyReview} title={t.onlyReviewHint}>
              {t.onlyReview(review.length)}
            </Switch>
            <Button variant="ghost" size="small" title={t.expandAllHint} onClick={() => setOpen(allOpen ? new Set() : new Set(a.days.map((d) => d.date)))}>
              {allOpen ? t.collapseAll : t.expandAll}
            </Button>
          </>
        ) : (
          <span className="muted">{t.modes.tasksIntro}</span>
        )}
      </div>
      {mode === "days"
        ? <Weeks a={a} updateDay={props.updateDay} onlyReview={onlyReview} open={open} toggle={toggle} />
        : <ByTask a={a} />}
    </div>
  );
}
