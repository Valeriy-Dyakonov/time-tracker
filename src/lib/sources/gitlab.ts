import { api } from "../../api";
import { countBy } from "../analysis/format";
import type { SourceCollector } from "./types";

export const gitlabSource: SourceCollector = {
  name: "GitLab",
  step: "GitLab: ваши MR и ревью",
  skipped: "GitLab: пропущен (не настроен или выключен).",
  enabled: ({ o, settings }) => o.useGitlab && !!settings.gitlabUrl,
  async collect(ctx) {
    ctx.log("info", "GitLab: читаю MR, которые вы создали, одобрили или комментировали…");
    const r = await api.fetchGitlab(ctx.o.start, ctx.o.end);
    ctx.events = ctx.events.concat(r.events);
    const by = countBy(r.events, (e) => /\] (Создал MR|MR смёржен|Одобрил MR|Смёржил MR|Комментарий)/.exec(e.text)?.[1] ?? "другое").map(([k, n]) => `${k} ${n}`).join(", ");
    const scope = r.scoped.length
      ? `только проекты ваших локальных репозиториев (${r.scoped.length}): ${r.scoped.slice(0, 4).join(", ")}${r.scoped.length > 4 ? "…" : ""}`
      : r.fallback ? "ни один локальный репозиторий не указывает на этот GitLab — прочитаны все проекты" : "все проекты";
    ctx.log("ok", `GitLab (${r.me}): ${r.events.length} событий${r.events.length ? ` (${by})` : ""}; ${scope}.`);
  },
};
