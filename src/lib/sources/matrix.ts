import { api } from "../../api";
import { count } from "../../i18n";
import { isWorkMessage } from "../events/keys";
import { countBy, joinCounts, msg } from "../analysis/format";
import type { SourceCollector } from "./types";

const m = () => msg().sources.matrix;

export const matrixSource: SourceCollector = {
  get name() { return m().name; },
  get step() { return m().step; },
  get skipped() { return m().skipped; },
  enabled: ({ o, settings }) => o.useMatrix && !!settings.matrixHomeserver,
  async collect(ctx) {
    ctx.log("info", m().reading(ctx.settings.matrixExcludeRooms.length));
    const all = await api.fetchMatrix(ctx.range.start, ctx.range.end);
    const work = all.filter((e) => isWorkMessage(e.text));
    ctx.events = ctx.events.concat(work);
    const rooms = joinCounts(countBy(work, (e) => e.context ?? "?").slice(0, 5));
    ctx.log("ok", m().done(count(all.length, m().messages), work.length, work.length ? rooms : ""));
  },
};
