import { api } from "@/shared/api";
import { msg } from "../analysis/format";
import type { SourceCollector } from "./types";

const m = () => msg().sources.jira;

/** Event kinds as written by the backend, in either language. */

export const jiraSource: SourceCollector = {
  get name() { return m().name; },
  get step() { return m().step; },
  get skipped() { return m().skipped; },
  required: true,
  enabled: () => true,
  async collect(ctx) {
    ctx.log("info", m().reading);
    const r = await api.fetchJira(ctx.range.start, ctx.range.end);
    for (const i of r.issues) ctx.issues[i.key] = i;
    ctx.events = ctx.events.concat(r.events);
    const comments = r.events.filter((e) => e.kind === "comment").length;
    const created = r.events.filter((e) => e.kind === "created").length;
    ctx.log("ok", m().done(r.me, r.issues.length, r.events.length, comments, created));
  },
};
