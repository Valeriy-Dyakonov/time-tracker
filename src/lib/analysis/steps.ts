import { calendarSource } from "../sources/calendar";
import { confluenceSource } from "../sources/confluence";
import { gitSource } from "../sources/git";
import { gitlabSource } from "../sources/gitlab";
import { jiraSource } from "../sources/jira";
import { matrixSource } from "../sources/matrix";
import type { SourceCollector } from "../sources/types";
import type { RunContext } from "./types";

export interface Step {
  title: string;
  run(ctx: RunContext): Promise<void>;
}

/** Runs a source with the common skip / error policy. */
function sourceStep(s: SourceCollector): Step {
  return {
    title: s.step,
    async run(ctx) {
      if (!s.enabled(ctx)) {
        ctx.log("info", s.skipped);
        return;
      }
      try {
        await s.collect(ctx);
      } catch (e) {
        ctx.log("error", `${s.name}: ${e}`);
        if (s.required) throw e;
        ctx.warnings.push(`${s.name}: ${e}`);
      }
    },
  };
}

/** The order follows how a person would work it out: git -> Jira -> parents/epics -> wiki -> calendar -> chat. */
export const COLLECT_STEPS: Step[] = [
  sourceStep(gitSource),
  sourceStep(gitlabSource),
  sourceStep(jiraSource),
  { title: "сопоставление коммитов с задачами Jira", run: (ctx) => ctx.enrich.matchAndLookup(ctx, "коммитов и Jira") },
  { title: "родительские задачи, эпики и связанные тикеты — для контекста", run: (ctx) => ctx.enrich.loadContext(ctx) },
  sourceStep(confluenceSource),
  sourceStep(calendarSource),
  sourceStep(matrixSource),
];
