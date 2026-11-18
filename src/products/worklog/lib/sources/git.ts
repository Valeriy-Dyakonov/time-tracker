import { api } from "@/shared/api";
import { count } from "@/i18n";
import { countBy, joinCounts, msg } from "../analysis/format";
import type { SourceCollector } from "./types";

const m = () => msg().sources.git;

export const gitSource: SourceCollector = {
  get name() { return m().name; },
  get step() { return m().step; },
  get skipped() { return m().skipped; },
  enabled: ({ o, settings }) => o.useGit && settings.gitRepos.length > 0,
  async collect(ctx) {
    ctx.log("info", m().reading(ctx.settings.gitRepos.length));
    // The whole period, not just the unfilled days: local history is cheap, and commits on days already filled in
    // Tempo still tell which tasks the neighbouring empty days are likely about.
    const g = await api.fetchGit(ctx.o.start, ctx.o.end);
    ctx.events = ctx.events.concat(g);
    const perRepo = joinCounts(countBy(g, (e) => /^\[([^\]]+)\]/.exec(e.text)?.[1] ?? "?"));
    ctx.log("ok", m().done(count(g.length, m().commits), g.length ? perRepo : ""));
  },
};
