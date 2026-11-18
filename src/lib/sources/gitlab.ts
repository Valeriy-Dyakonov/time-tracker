import { api } from "../../api";
import { countBy, joinCounts, listHead, msg } from "../analysis/format";
import type { SourceCollector } from "./types";

const m = () => msg().sources.gitlab;


export const gitlabSource: SourceCollector = {
  get name() { return m().name; },
  get step() { return m().step; },
  get skipped() { return m().skipped; },
  enabled: ({ o, settings }) => o.useGitlab && !!settings.gitlabUrl,
  async collect(ctx) {
    ctx.log("info", m().reading);
    const r = await api.fetchGitlab(ctx.range.start, ctx.range.end);
    ctx.events = ctx.events.concat(r.events);
    const by = joinCounts(countBy(r.events, (e) => m().kinds[e.kind as keyof ReturnType<typeof m>["kinds"]] ?? m().other));
    const scope = r.scoped.length ? m().scoped(r.scoped.length, listHead(r.scoped, 4)) : r.fallback ? m().fallback : m().all;
    ctx.log("ok", m().done(r.me, r.events.length, r.events.length ? by : "", scope));
  },
};
