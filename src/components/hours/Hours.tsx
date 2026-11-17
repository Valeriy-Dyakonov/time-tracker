import { useState } from "react";
import type { Analysis, DayPlan } from "../../types";
import { InfoTip } from "../ui";
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
        <div className="seg small" role="tablist">
          <button className={mode === "days" ? "on" : ""} onClick={() => setMode("days")}>По дням</button>
          <button className={mode === "tasks" ? "on" : ""} onClick={() => setMode("tasks")}>По задачам</button>
        </div>
        <InfoTip>«По дням» — для системы учёта по дням и для проверки: что и сколько в каждый день. «По задачам» — для Jira: по каждой задаче видно, в какие дни и сколько списать.</InfoTip>
        {mode === "days" ? (
          <>
            <span className="legend">
              <span><i className="lg good" />по событиям</span>
              <span><i className="lg warn" />без событий</span>
              <span><i className="lg bad" />не заполнен</span>
              <InfoTip wide>Цвет полосы слева у дня. Зелёный — часы построены по вашим событиям за этот день. Жёлтый — событий не было, часы взяты с соседнего дня или по периоду (см. «Дни без событий» в фильтрах). Красный — заполнить не из чего, распределите сами.</InfoTip>
            </span>
            <span className="spacer" />
            <label className="switch" title="Скрыть дни, которые построены по событиям и сходятся с нормой">
              <input type="checkbox" checked={onlyReview} onChange={(e) => setOnlyReview(e.target.checked)} />
              <i />Только для проверки ({review.length})
            </label>
            <button className="btn small ghost" title="Раскрыть подробности всех дней: задачи, заметки, встречи" onClick={() => setOpen(allOpen ? new Set() : new Set(a.days.map((d) => d.date)))}>
              {allOpen ? "Свернуть все" : "Развернуть все"}
            </button>
          </>
        ) : (
          <span className="muted">Для Jira: по каждой задаче — в какие дни и сколько часов списать.</span>
        )}
      </div>
      {mode === "days"
        ? <Weeks a={a} updateDay={props.updateDay} onlyReview={onlyReview} open={open} toggle={toggle} />
        : <ByTask a={a} />}
    </div>
  );
}
