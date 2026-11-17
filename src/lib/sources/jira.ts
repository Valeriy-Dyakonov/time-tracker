import { api } from "../../api";
import type { SourceCollector } from "./types";

export const jiraSource: SourceCollector = {
  name: "Jira",
  step: "Jira за период",
  skipped: "",
  required: true,
  enabled: () => true,
  async collect(ctx) {
    ctx.log("info", "Jira: загружаю задачи, где вы исполнитель/автор, и ваши действия за период…");
    const r = await api.fetchJira(ctx.o.start, ctx.o.end);
    for (const i of r.issues) ctx.issues[i.key] = i;
    ctx.events = ctx.events.concat(r.events);
    const comments = r.events.filter((e) => e.text.startsWith("Комментарий")).length;
    const created = r.events.filter((e) => e.text.startsWith("Создал")).length;
    ctx.log("ok", `Jira (${r.me}): задач ${r.issues.length}; ваших действий ${r.events.length} — комментариев ${comments}, созданных задач ${created}, смен статусов/полей ${r.events.length - comments - created}.`);
  },
};
