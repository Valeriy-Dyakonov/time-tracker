import { calendarSource } from "../sources/calendar";
import { callsSource } from "../sources/calls";
import { confluenceSource } from "../sources/confluence";
import { gitSource } from "../sources/git";
import { gitlabSource } from "../sources/gitlab";
import { jiraSource } from "../sources/jira";
import { matrixSource } from "../sources/matrix";
import type { SourceCollector } from "../sources/types";
import { msg } from "./format";
import type { RunContext } from "./types";

export interface Step {
  readonly title: string;
  run(ctx: RunContext): Promise<void>;
}

/** Runs a source with the common skip / error policy. */
function sourceStep(s: SourceCollector): Step {
  return {
    get title() { return s.step; },
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
  { get title() { return msg().steps.matchCommits; }, run: (ctx) => ctx.enrich.matchAndLookup(ctx, msg().steps.matchCommitsWhat) },
  { get title() { return msg().steps.context; }, run: (ctx) => ctx.enrich.loadContext(ctx) },
  sourceStep(confluenceSource),
  sourceStep(calendarSource),
  sourceStep(callsSource),
  sourceStep(matrixSource),
];
