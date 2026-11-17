import { api } from "../../api";
import { plural } from "../dates";
import { isWorkMessage } from "../events/keys";
import { countBy } from "../analysis/format";
import type { SourceCollector } from "./types";

export const matrixSource: SourceCollector = {
  name: "Matrix",
  step: "чаты Matrix: рабочие сообщения",
  skipped: "Matrix: пропущен (не настроен или выключен).",
  enabled: ({ o, settings }) => o.useMatrix && !!settings.matrixHomeserver,
  async collect(ctx) {
    const excluded = ctx.settings.matrixExcludeRooms.length;
    ctx.log("info", `Matrix: читаю ваши сообщения (${excluded ? `все комнаты, кроме ${excluded} исключённых` : "все комнаты — можно исключить лишние в настройках"})…`);
    const all = await api.fetchMatrix(ctx.o.start, ctx.o.end);
    const work = all.filter((e) => isWorkMessage(e.text));
    ctx.events = ctx.events.concat(work);
    const rooms = countBy(work, (e) => e.context ?? "?").slice(0, 5).map(([r, n]) => `${r} ${n}`).join(", ");
    ctx.log("ok", `Matrix: ${all.length} ${plural(all.length, "сообщение", "сообщения", "сообщений")}, похожих на рабочие ${work.length}${work.length ? ` (${rooms})` : ""}. Короткие реплики и приветствия отброшены, остальное ИИ отфильтрует по смыслу.`);
  },
};
