import { api } from "../../api";
import { nEv } from "../analysis/format";
import type { SourceCollector } from "./types";

export const confluenceSource: SourceCollector = {
  name: "Confluence",
  step: "Confluence: страницы задач и ваши правки",
  skipped: "Confluence: пропущен (не настроен или выключен).",
  enabled: ({ o, settings }) => o.useConfluence && !!settings.confluenceUrl,
  async collect(ctx) {
    await ctx.enrich.loadPages(ctx);
    ctx.log("info", "Confluence: ищу страницы и комментарии, которые вы создали или правили…");
    const c = await api.fetchConfluence(ctx.o.start, ctx.o.end);
    ctx.events = ctx.events.concat(c);
    ctx.log("ok", `Confluence: ${nEv(c.length)}.`);
  },
};
