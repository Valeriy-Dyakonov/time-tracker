import { api } from "../../api";
import { msg, nEv } from "../analysis/format";
import type { SourceCollector } from "./types";

const m = () => msg().sources.confluence;

export const confluenceSource: SourceCollector = {
  get name() { return m().name; },
  get step() { return m().step; },
  get skipped() { return m().skipped; },
  enabled: ({ o, settings }) => o.useConfluence && !!settings.confluenceUrl,
  async collect(ctx) {
    await ctx.enrich.loadPages(ctx);
    ctx.log("info", m().reading);
    const c = await api.fetchConfluence(ctx.o.start, ctx.o.end);
    ctx.events = ctx.events.concat(c);
    ctx.log("ok", m().done(nEv(c.length)));
  },
};
