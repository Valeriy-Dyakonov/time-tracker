import { api } from "../../api";
import { plural } from "../dates";
import { countBy } from "../analysis/format";
import type { SourceCollector } from "./types";

export const gitSource: SourceCollector = {
  name: "Git",
  step: "история git (только ваши коммиты)",
  skipped: "Git: пропущен (не выбран или нет репозиториев).",
  enabled: ({ o, settings }) => o.useGit && settings.gitRepos.length > 0,
  async collect(ctx) {
    ctx.log("info", `Git: читаю ${ctx.settings.gitRepos.length} репозиториев, все ветки…`);
    const g = await api.fetchGit(ctx.o.start, ctx.o.end);
    ctx.events = ctx.events.concat(g);
    const perRepo = countBy(g, (e) => /^\[([^\]]+)\]/.exec(e.text)?.[1] ?? "?").map(([r, n]) => `${r} ${n}`).join(", ");
    ctx.log("ok", `Git: ${g.length} ${plural(g.length, "коммит", "коммита", "коммитов")}${g.length ? ` (${perRepo})` : ""}.`);
  },
};
