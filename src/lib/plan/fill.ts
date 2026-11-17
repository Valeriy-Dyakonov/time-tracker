import type { DayPlan, FillMode, IssueInfo, TaskHours } from "../../types";
import { dayBounds, formatRu } from "../dates";
import { distribute, normalized, toTasks } from "./distribute";
import { fillerNote, PHASE_LABEL, TaskTimeline } from "./phase";
import type { DayActivity } from "./types";

export function autoSummary(tasks: TaskHours[], issues: Record<string, IssueInfo>): string {
  return tasks
    .slice(0, 4)
    .map((t) => `${t.key}${issues[t.key] ? " " + issues[t.key].summary : ""}`)
    .join("; ");
}

const short = (d: string) => formatRu(d).slice(0, 5);
const listTasks = (tasks: TaskHours[]) => tasks.map((t) => `${t.key} (${t.hours} ч)`).join(", ");

/** Stage-aware notes for inferred days; numbering runs across the whole period so wording varies. */
class FillerNotes {
  private used: Record<string, number> = {};
  lastPhases = "";

  constructor(private issues: Record<string, IssueInfo>, private timeline: TaskTimeline) {}

  apply(tasks: TaskHours[], date: string): TaskHours[] {
    const phases: string[] = [];
    const out = tasks.map((t) => {
      const phase = this.timeline.phaseOf(t.key, date);
      phases.push(`${t.key}: ${PHASE_LABEL[phase]}`);
      const n = (this.used[t.key] = (this.used[t.key] ?? -1) + 1);
      return { ...t, notes: [fillerNote(t.key, n, this.issues, phase)] };
    });
    this.lastPhases = phases.join("; ");
    return out;
  }
}

/** A working day without usable activity, waiting to be filled. */
export interface Gap {
  date: string;
  target: number;
  base: Omit<DayPlan, "tasks" | "basis" | "summary" | "reasoning" | "inferredFrom">;
  /** Why the day has no data, in plain words. */
  why: string;
}

/** Strategy for a day without own activity, chosen by the "дни без данных" mode. */
export interface GapFiller {
  fill(gap: Gap): DayPlan;
}

interface FillContext {
  active: string[];
  activity: Record<string, DayActivity>;
  issues: Record<string, IssueInfo>;
  notes: FillerNotes;
  periodWeights: Record<string, number>;
}

/** A task cannot be worked on before it was created or after it was resolved. */
function aliveOnly(w: Record<string, number>, date: string, issues: Record<string, IssueInfo>): Record<string, number> {
  const [s, e] = dayBounds(date);
  return Object.fromEntries(
    Object.entries(w).filter(([k]) => {
      const i = issues[k];
      return !i || !((i.created && i.created >= e) || (i.resolved && i.resolved < s));
    }),
  );
}

class EmptyFiller implements GapFiller {
  constructor(private noDataAtAll: boolean) {}

  fill(g: Gap): DayPlan {
    return {
      ...g.base,
      tasks: [],
      basis: "empty",
      summary: "",
      reasoning: `${g.why} День оставлен пустым${this.noDataAtAll ? ": во всём периоде нет данных для распределения" : " по выбранному режиму"}.`,
    };
  }
}

class PeriodFiller implements GapFiller {
  constructor(protected c: FillContext) {}

  protected periodTasks(g: Gap): TaskHours[] {
    const alive = aliveOnly(this.c.periodWeights, g.date, this.c.issues);
    const w = Object.keys(alive).length ? alive : this.c.periodWeights;
    return this.c.notes.apply(toTasks(distribute(w, g.target), {}), g.date);
  }

  protected inferred(g: Gap, tasks: TaskHours[], reasoning: string, inferredFrom?: string): DayPlan {
    return { ...g.base, tasks, basis: "inferred", ...(inferredFrom ? { inferredFrom } : {}), summary: autoSummary(tasks, this.c.issues), reasoning };
  }

  fill(g: Gap): DayPlan {
    const tasks = this.periodTasks(g);
    return this.inferred(g, tasks, `${g.why} Часы распределены пропорционально задачам всего периода: ${listTasks(tasks)}.`);
  }
}

/** Copies the task mix of the nearest day with activity: earlier days first, then later ones. */
class NeighborsFiller extends PeriodFiller {
  fill(g: Gap): DayPlan {
    const { active, activity, issues } = this.c;
    const order = [...[...active].reverse().filter((d) => d < g.date), ...active.filter((d) => d > g.date)];
    for (const src of order) {
      const mix = aliveOnly(activity[src].weights, g.date, issues);
      if (!Object.keys(mix).length) continue;
      const tasks = this.c.notes.apply(toTasks(distribute(mix, g.target), {}), g.date);
      return this.inferred(
        g,
        tasks,
        `${g.why} Взято по ${src < g.date ? "предыдущему" : "следующему"} дню с активностью — ${short(src)}: ${listTasks(tasks)}. Описание типовое, по этапу задачи (${this.c.notes.lastPhases}): за этот день нет следов работы.`,
        src,
      );
    }
    const tasks = this.periodTasks(g);
    return this.inferred(g, tasks, `${g.why} Подходящих соседних дней нет — часы распределены по задачам всего периода: ${listTasks(tasks)}.`);
  }
}

export function gapFiller(mode: FillMode, activity: Record<string, DayActivity>, issues: Record<string, IssueInfo>): GapFiller {
  const active = Object.keys(activity).filter((d) => Object.keys(activity[d].weights).length > 0).sort();
  if (mode === "none" || active.length === 0) return new EmptyFiller(active.length === 0);

  // Each active day counts equally, so one huge day does not dominate the period mix.
  const periodWeights: Record<string, number> = {};
  for (const d of active)
    for (const [k, v] of Object.entries(normalized(activity[d].weights))) periodWeights[k] = (periodWeights[k] ?? 0) + v;

  const c: FillContext = { active, activity, issues, periodWeights, notes: new FillerNotes(issues, new TaskTimeline(activity, issues)) };
  return mode === "period" ? new PeriodFiller(c) : new NeighborsFiller(c);
}
