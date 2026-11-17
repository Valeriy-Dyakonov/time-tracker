import { api } from "../api";
import type {
  Analysis, DayProgress, Evt, FillMode, IssueInfo, LogEntry, LogLevel, Meeting, Settings,
} from "../types";
import {
  attachKeys, buildPlan, distribute, groupByDay, heuristicWeights, isPlausibleKey, isWorkMessage, localDay, projectOf,
  toEvidence, workDates,
  type DayActivity,
} from "./allocate";
import { addDays, eachDate, formatRu, isoWeekday, localDate, plural, weekdayName, WEEKDAYS_SHORT } from "./dates";
const nEv = (n: number) => `${n} ${plural(n, "событие", "события", "событий")}`;
import {
  buildNarrativePrompt, buildUserPrompt, NARRATIVE_SYSTEM, parseAiDay, parseNarrative, SYSTEM_PROMPT,
} from "./prompt";
import { fmtH, fmtMinutes, meetingRange, templateNarrative, totalsOf } from "./report";

export interface RunOptions {
  start: string;
  end: string;
  hoursPerDay: number;
  useJira: boolean;
  useGit: boolean;
  useGitlab: boolean;
  useMatrix: boolean;
  useConfluence: boolean;
  useCalendar: boolean;
  useAi: boolean;
  fillMode: FillMode;
}

export interface RunHandlers {
  onLog: (e: LogEntry) => void;
  onDays: (d: DayProgress[]) => void;
}

const sd = (d: string) => formatRu(d).slice(0, 5);

async function pool<T>(items: T[], limit: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

function countBy<T>(items: T[], f: (x: T) => string): [string, number][] {
  const m = new Map<string, number>();
  for (const x of items) m.set(f(x), (m.get(f(x)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

const bySource = (evs: Evt[]) => countBy(evs, (e) => e.source).map(([s, n]) => `${s} ${n}`).join(", ");

function percents(weights: Record<string, number>): string {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  return Object.entries(weights)
    .sort((a, b) => b[1] - a[1])
    .map(([k, w]) => `${k} ${Math.round((w / sum) * 100)}%`)
    .join(" · ");
}

/** Plain-language explanation for days analysed without AI. */
function heuristicReasoning(evs: Evt[], weights: Record<string, number>, why: string): string {
  const parts = Object.keys(weights).map((k) => {
    const mine = evs.filter((e) => e.issueKey === k);
    const c = countBy(mine, (e) => e.source).map(([s, n]) => `${s}: ${n}`).join(", ");
    return `${k} (${c})`;
  });
  const unkeyed = evs.filter((e) => !e.issueKey).length;
  return (
    `${why} Доли посчитаны по числу и размеру действий с ключом задачи: ${parts.join("; ")}.` +
    (unkeyed ? ` Ещё ${unkeyed} событий без ключа задачи в расчёте не участвуют.` : "")
  );
}

export async function runAnalysis(settings: Settings, o: RunOptions, h: RunHandlers): Promise<Analysis> {
  const logs: LogEntry[] = [];
  const warnings: string[] = [];
  const log = (level: LogLevel, msg: string) => {
    const e = { t: Date.now(), level, msg };
    logs.push(e);
    h.onLog(e);
  };

  const issues: Record<string, IssueInfo> = {};
  const ctxProjects = new Set(settings.contextProjects.map((p) => p.trim().toUpperCase()).filter(Boolean));
  const isCtx = (key: string) => ctxProjects.has(projectOf(key));
  let events: Evt[] = [];
  let meetings: Meeting[] = [];
  const today = localDate(new Date());
  const dates = workDates(o.start, o.end, settings.workdays, today);
  const aiOn = o.useAi && !!settings.llmBaseUrl && !!settings.llmModel;

  log("info", `Период ${formatRu(o.start)} – ${formatRu(o.end)}, норма ${fmtH(o.hoursPerDay)} ч в день, рабочие дни: ${settings.workdays.map((d) => WEEKDAYS_SHORT[d - 1]).join(", ")}.`);
  if (ctxProjects.size) log("info", `Проекты только для контекста (часы на них не начисляются): ${[...ctxProjects].join(", ")}.`);
  log("info", `К заполнению ${dates.length} рабочих дн.${o.end > today ? " (будущие дни не заполняются)" : ""}. Анализ ИИ: ${aiOn ? "включён" : "выключен — будет эвристика"}.`);

  // The flow follows how a person would work it out: git -> Jira -> parents/epics -> wiki -> calendar -> chat -> match by time.
  const STEPS = 8;
  const step = (n: number, title: string) => log("info", `━━ Шаг ${n} из ${STEPS}: ${title}`);
  const contextParents = new Set<string>();
  const pagesTried = new Set<string>();

  /** Finds task keys in commit messages, branches and chat text, and reads those tasks from Jira. */
  const matchAndLookup = async (what: string) => {
    const needKey = events.filter((e) => !e.issueKey).length;
    events = attachKeys(events);
    const keyed = events.filter((e) => !e.issueKey).length;
    log("info", `Привязка (${what}): ключ вида ABC-123 найден в тексте, ветке или названии у ${needKey - keyed} из ${needKey} событий; без ключа осталось ${keyed}${aiOn ? " — их смысл определит ИИ" : " — без ИИ они в расчёте не участвуют"}.`);
    // Keys from commits/chat may belong to tasks you only touched via git (not assignee/reporter): check every plausible key.
    const unknown = [...new Set(events.map((e) => e.issueKey).filter((k): k is string => !!k && !issues[k]))].filter(isPlausibleKey);
    if (unknown.length === 0) return;
    log("info", `Jira: проверяю ${unknown.length} задач из ${what} (${unknown.slice(0, 6).join(", ")}${unknown.length > 6 ? "…" : ""}).`);
    try {
      for (const i of await api.lookupIssues(unknown.slice(0, 200))) issues[i.key] = i;
      const found = unknown.filter((k) => issues[k]).length;
      log(found === unknown.length ? "ok" : "info", `Jira: найдено ${found} из ${unknown.length}.`);
    } catch (e) {
      log("warn", `Jira lookup: ${e}`);
    }
  };

  /** Parents, epics and linked tasks: read for context only, they never get hours by themselves. */
  const loadContext = async () => {
    for (let pass = 0; pass < 2; pass++) {
      const from = pass === 0 ? Object.values(issues) : [...contextParents].map((k) => issues[k]).filter(Boolean);
      const want = [...new Set(
        from.flatMap((i) => [i.parent, i.epic, ...(pass === 0 ? (i.links ?? []).slice(0, 5) : [])])
          .filter((k): k is string => !!k && !issues[k] && isPlausibleKey(k)),
      )].slice(0, 150);
      if (want.length === 0) break;
      log("info", `Jira: читаю родительские задачи, эпики и связанные тикеты (${want.length}): ${want.slice(0, 6).join(", ")}${want.length > 6 ? "…" : ""}.`);
      try {
        const got = await api.lookupIssues(want);
        for (const i of got) { issues[i.key] = i; contextParents.add(i.key); }
        log("ok", `Jira: контекст получен для ${got.length} из ${want.length}. Часы на них не начисляются.`);
      } catch (e) {
        log("warn", `Jira: контекст (родители/эпики): ${e}`);
        break;
      }
    }
  };

  /** Confluence pages linked from the tasks (description, web links) and from their epics: context only. */
  const loadPages = async () => {
    if (!(o.useConfluence && settings.confluenceUrl)) return;
    const hits = new Map<string, number>();
    for (const e of events) if (e.issueKey && !isCtx(e.issueKey)) hits.set(e.issueKey, (hits.get(e.issueKey) ?? 0) + 1);
    const keys = [...hits.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k).slice(0, 30);
    const withUp = [...new Set(keys.flatMap((k) => [k, issues[k]?.epic, issues[k]?.parent]).filter((k): k is string => !!k && !!issues[k]))]
      .filter((k) => !pagesTried.has(k)).slice(0, 45);
    if (withUp.length === 0) return;
    withUp.forEach((k) => pagesTried.add(k));
    log("info", `Confluence: ищу страницы, связанные с ${withUp.length} задачами и их эпиками (ссылки в описании и веб-ссылки Jira)…`);
    try {
      const got = await api.fetchIssuePages(withUp.map((k) => ({ key: k, urls: issues[k].urls ?? [] })));
      for (const g of got) issues[g.key] = { ...issues[g.key], pages: g.pages };
      const n = got.reduce((s, g) => s + g.pages.length, 0);
      log(n ? "ok" : "info", n ? `Confluence: найдено ${n} ${plural(n, "страница", "страницы", "страниц")} у ${got.length} задач — используются как контекст.` : "Confluence: связанных страниц у этих задач нет.");
    } catch (e) {
      log("warn", `Confluence: связанные страницы: ${e}`);
    }
  };

  // ---- 1. git: where you are the author
  step(1, "история git (только ваши коммиты)");
  if (o.useGit && settings.gitRepos.length > 0) {
    log("info", `Git: читаю ${settings.gitRepos.length} репозиториев, все ветки…`);
    try {
      const g = await api.fetchGit(o.start, o.end);
      events = events.concat(g);
      const perRepo = countBy(g, (e) => /^\[([^\]]+)\]/.exec(e.text)?.[1] ?? "?").map(([r, n]) => `${r} ${n}`).join(", ");
      log("ok", `Git: ${g.length} ${plural(g.length, "коммит", "коммита", "коммитов")}${g.length ? ` (${perRepo})` : ""}.`);
    } catch (e) {
      warnings.push(`Git: ${e}`);
      log("error", `Git: ${e}`);
    }
  } else {
    log("info", "Git: пропущен (не выбран или нет репозиториев).");
  }

  // ---- 2. GitLab: merge requests you opened, approved, commented
  step(2, "GitLab: ваши MR и ревью");
  if (o.useGitlab && settings.gitlabUrl) {
    log("info", "GitLab: читаю MR, которые вы создали, одобрили или комментировали…");
    try {
      const r = await api.fetchGitlab(o.start, o.end);
      events = events.concat(r.events);
      const by = countBy(r.events, (e) => /\] (Создал MR|MR смёржен|Одобрил MR|Смёржил MR|Комментарий)/.exec(e.text)?.[1] ?? "другое").map(([k, n]) => `${k} ${n}`).join(", ");
      const scope = r.scoped.length ? `только проекты ваших локальных репозиториев (${r.scoped.length}): ${r.scoped.slice(0, 4).join(", ")}${r.scoped.length > 4 ? "…" : ""}` : r.fallback ? "ни один локальный репозиторий не указывает на этот GitLab — прочитаны все проекты" : "все проекты";
      log("ok", `GitLab (${r.me}): ${r.events.length} событий${r.events.length ? ` (${by})` : ""}; ${scope}.`);
    } catch (e) {
      warnings.push(`GitLab: ${e}`);
      log("error", `GitLab: ${e}`);
    }
  } else {
    log("info", "GitLab: пропущен (не настроен или выключен).");
  }

  // ---- 2. Jira for the period
  step(3, "Jira за период");
  try {
    log("info", "Jira: загружаю задачи, где вы исполнитель/автор, и ваши действия за период…");
    const r = await api.fetchJira(o.start, o.end);
    for (const i of r.issues) issues[i.key] = i;
    events = events.concat(r.events);
    const comments = r.events.filter((e) => e.text.startsWith("Комментарий")).length;
    const created = r.events.filter((e) => e.text.startsWith("Создал")).length;
    log("ok", `Jira (${r.me}): задач ${r.issues.length}; ваших действий ${r.events.length} — комментариев ${comments}, созданных задач ${created}, смен статусов/полей ${r.events.length - comments - created}.`);
  } catch (e) {
    log("error", `Jira: ${e}`);
    throw e;
  }

  // ---- 3. commits <-> Jira
  step(4, "сопоставление коммитов с задачами Jira");
  await matchAndLookup("коммитов и Jira");

  // ---- 4. parents / epics / links
  step(5, "родительские задачи, эпики и связанные тикеты — для контекста");
  await loadContext();

  // ---- 5. Confluence
  step(6, "Confluence: страницы задач и ваши правки");
  if (o.useConfluence && settings.confluenceUrl) {
    await loadPages();
    log("info", "Confluence: ищу страницы и комментарии, которые вы создали или правили…");
    try {
      const c = await api.fetchConfluence(o.start, o.end);
      events = events.concat(c);
      log("ok", `Confluence: ${nEv(c.length)}.`);
    } catch (e) {
      warnings.push(`Confluence: ${e}`);
      log("error", `Confluence: ${e}`);
    }
  } else {
    log("info", "Confluence: пропущен (не настроен или выключен).");
  }

  // ---- 6. calendar
  step(7, "календарь: встречи и звонки");
  if (o.useCalendar && settings.exchangeUrl) {
    log("info", `Календарь (Exchange): читаю встречи и звонки${settings.calendarOnlyCalls ? " (только звонки)" : ""}…`);
    try {
      meetings = await api.fetchCalendar(o.start, o.end);
      const calls = meetings.filter((m) => m.isCall).length;
      log("ok", `Календарь: ${meetings.length} ${plural(meetings.length, "встреча", "встречи", "встреч")}, из них похожих на звонки ${calls}; всего ${fmtMinutes(meetings.reduce((s, m) => s + m.minutes, 0))}. Отменённые, отклонённые и «свободные» пропущены.`);
      events = events.concat(
        meetings.map((m): Evt => ({
          source: "calendar",
          ts: m.ts,
          issueKey: null,
          text: m.title,
          context: `${meetingRange(m)}, ${m.minutes} мин${m.isCall ? " · звонок" : ""}${m.organizer ? " · организатор " + m.organizer : ""}`,
          weight: m.minutes,
        })),
      );
    } catch (e) {
      warnings.push(`Календарь: ${e}`);
      log("error", `Календарь: ${e}`);
    }
  } else {
    log("info", "Календарь: пропущен (не настроен или выключен).");
  }

  // ---- 7. chat
  step(8, "чаты Matrix: рабочие сообщения");
  if (o.useMatrix && settings.matrixHomeserver) {
    log("info", `Matrix: читаю ваши сообщения (${settings.matrixExcludeRooms.length ? `все комнаты, кроме ${settings.matrixExcludeRooms.length} исключённых` : "все комнаты — можно исключить лишние в настройках"})…`);
    try {
      const all = await api.fetchMatrix(o.start, o.end);
      const m = all.filter((e) => isWorkMessage(e.text));
      events = events.concat(m);
      const rooms = countBy(m, (e) => e.context ?? "?").slice(0, 5).map(([r, n]) => `${r} ${n}`).join(", ");
      log("ok", `Matrix: ${all.length} ${plural(all.length, "сообщение", "сообщения", "сообщений")}, похожих на рабочие ${m.length}${m.length ? ` (${rooms})` : ""}. Короткие реплики и приветствия отброшены, остальное ИИ отфильтрует по смыслу.`);
    } catch (e) {
      warnings.push(`Matrix: ${e}`);
      log("error", `Matrix: ${e}`);
    }
  } else {
    log("info", "Matrix: пропущен (не настроен или выключен).");
  }

  // Chat and calendar may mention tasks that git/Jira did not: second pass for the new keys, with their context.
  const before = Object.keys(issues).length;
  await matchAndLookup("чата и календаря");
  if (Object.keys(issues).length > before) {
    await loadContext();
    await loadPages();
  }
  const dropped = [...new Set(events.map((e) => e.issueKey).filter((k): k is string => !!k && !issues[k]))];
  if (dropped.length)
    log("info", `Пропущены ключи, которых Jira не вернула (нет такой задачи или нет доступа): ${dropped.slice(0, 8).join(", ")}. Это нормально — в расчёт они не идут.`);
  events = events.map((e) => (e.issueKey && !issues[e.issueKey] ? { ...e, issueKey: null } : e));
  log("info", "━━ Анализ по дням: события сопоставляются по времени (коммиты, Jira, звонки, чат), затем часы распределяются, дни без данных заполняются.");

  // ---- 3. per-day analysis, streamed
  const byDay = groupByDay(events);
  const inRange = new Set(eachDate(o.start, o.end));
  for (const d of Object.keys(byDay).sort()) {
    if (inRange.has(d) && !settings.workdays.includes(isoWeekday(d)))
      log("info", `${sd(d)} (${weekdayName(d)}): ${nEv(byDay[d].length)} в нерабочий день — часы не начисляются.`);
  }

  // Calendar entries without a task key are only context: a day with nothing but meetings has no task activity.
  const isActivity = (e: Evt) => e.source !== "calendar" || !!e.issueKey;
  const meetingsByDay: Record<string, Meeting[]> = {};
  for (const m of meetings) (meetingsByDay[localDay(m.ts)] ??= []).push(m);

  let progress: DayProgress[] = dates.map((date) => {
    const n = byDay[date]?.length ?? 0;
    const active = (byDay[date] ?? []).some(isActivity);
    const mc = meetingsByDay[date]?.length ?? 0;
    return {
      date, events: n, status: active ? "queued" : "nodata",
      note: active ? undefined : mc ? `только звонки: ${mc}` : "нет событий",
    };
  });
  const patch = (date: string, p: Partial<DayProgress>) => {
    progress = progress.map((d) => (d.date === date ? { ...d, ...p } : d));
    h.onDays(progress);
  };
  h.onDays(progress);

  const withEvents = dates.filter((d) => (byDay[d] ?? []).some(isActivity));
  log("info", `Дней с событиями: ${withEvents.length} из ${dates.length}; без событий: ${dates.length - withEvents.length} (они будут заполнены в конце).`);

  const activity: Record<string, DayActivity> = {};
  let aiDays = 0;

  await pool(withEvents, 3, async (date) => {
    const evs = byDay[date];
    const label = `${sd(date)} (${weekdayName(date)})`;
    patch(date, { status: "running" });
    log("info", `${label}: ${nEv(evs.length)} — ${bySource(evs)}; с ключом задачи: ${evs.filter((e) => e.issueKey).length}.`);

    const heur = heuristicWeights(evs, isCtx);
    let act: DayActivity = {
      weights: heur, notes: {}, summary: "", eventCount: evs.length, evidence: toEvidence(evs),
      reasoning: heuristicReasoning(evs, heur, aiOn ? "ИИ не использовался для этого дня." : "Анализ ИИ выключен."),
    };
    let status: DayProgress["status"] = "done";
    let note: string | undefined;

    if (aiOn) {
      const near = new Set<string>();
      for (let k = -3; k <= 3; k++)
        for (const e of byDay[addDays(date, k)] ?? []) if (e.issueKey) near.add(e.issueKey);
      if (near.size < 3) for (const k of Object.keys(issues).filter((x) => !contextParents.has(x)).slice(0, 10)) near.add(k);
      const candidates = [...near].filter((k) => !isCtx(k)).map((k) => issues[k]).filter(Boolean);
      const contextOnly = [...near].filter(isCtx).map((k) => issues[k]).filter(Boolean);

      if (candidates.length === 0) {
        log("warn", `${label}: нет задач-кандидатов — ИИ не вызывался.`);
        status = "fallback";
        note = "нет задач-кандидатов";
      } else {
        log("info", `${label}: → запрос к ИИ (кандидатов: ${candidates.length})…`);
        const t0 = performance.now();
        try {
          const raw = await api.llmChat(SYSTEM_PROMPT, buildUserPrompt(date, evs, candidates, o.hoursPerDay, contextOnly, issues));
          const sec = ((performance.now() - t0) / 1000).toFixed(1);
          const parsed = parseAiDay(raw, new Set(candidates.map((c) => c.key)));
          if (parsed && Object.keys(parsed.weights).length > 0) {
            act = { ...parsed, eventCount: evs.length, evidence: toEvidence(evs) };
            aiDays += 1;
            log("ok", `${label}: ИИ за ${sec} с → ${percents(parsed.weights)}${parsed.summary ? ` — «${parsed.summary}»` : ""}`);
          } else if (parsed) {
            // Valid answer, but none of the candidate tasks fits: keep AI's explanation, fall back to key-based weights.
            const said = parsed.reasoning || parsed.summary;
            act = { weights: heur, notes: {}, summary: parsed.summary, reasoning: said || "ИИ не нашёл подходящей задачи.", eventCount: evs.length, evidence: toEvidence(evs) };
            note = "ИИ: нет подходящей задачи";
            if (Object.keys(heur).length) status = "fallback";
            log("info", `${label}: ИИ за ${sec} с не нашёл подходящей задачи${said ? ` — «${said.slice(0, 160)}»` : ""}.${Object.keys(heur).length ? " Использованы доли по ключам задач." : " День будет заполнен по режиму «дни без данных»."}`);
          } else {
            status = "fallback";
            note = "непонятный ответ ИИ";
            act.reasoning = heuristicReasoning(evs, heur, "Ответ ИИ не удалось разобрать.");
            log("warn", `${label}: ответ ИИ не удалось разобрать — использована эвристика. Начало ответа: ${raw.slice(0, 120).replace(/\s+/g, " ")}`);
            warnings.push(`${sd(date)}: непонятный ответ ИИ, использована эвристика.`);
          }
        } catch (e) {
          status = "fallback";
          note = "ошибка ИИ";
          act.reasoning = heuristicReasoning(evs, heur, "ИИ не ответил.");
          log("error", `${label}: ошибка ИИ — ${e}. Использована эвристика.`);
          warnings.push(`${sd(date)}: ошибка ИИ (${e}), использована эвристика.`);
        }
      }
    } else {
      log("info", `${label}: эвристика → ${percents(heur) || "нет событий с ключом задачи"}.`);
    }

    activity[date] = act;
    const hrs = distribute(act.weights, o.hoursPerDay);
    patch(date, {
      status,
      note,
      tasks: Object.entries(hrs).map(([key, hours]) => ({ key, hours })),
    });
  });

  // ---- 4. fill the period
  const days = buildPlan(dates, activity, issues, o.hoursPerDay, o.fillMode, meetingsByDay);
  const modeName = { neighbors: "по соседним дням", period: "по всему периоду", none: "оставить пустыми" }[o.fillMode];
  const gaps = days.filter((d) => d.basis !== "activity");
  if (gaps.length) {
    log("info", `Дней без привязки к задачам: ${gaps.length}. Режим заполнения: «${modeName}».`);
    for (const d of gaps) log(d.basis === "empty" ? "warn" : "info", `${sd(d.date)} (${weekdayName(d.date)}): ${d.reasoning}`);
  }
  const empty = days.filter((d) => d.basis === "empty");
  if (empty.length) warnings.push(`Не заполнены дни: ${empty.map((d) => sd(d.date)).join(", ")}.`);
  for (const d of days.filter((x) => x.basis === "inferred"))
    patch(d.date, { note: d.inferredFrom ? `заполнен по ${sd(d.inferredFrom)}` : "заполнен по всему периоду", tasks: d.tasks.map((t) => ({ key: t.key, hours: t.hours })) });

  // ---- 5. period narrative
  let narrative = "";
  const totals = totalsOf(days, issues);
  const byProject = new Map<string, number>();
  for (const t of totals) byProject.set(projectOf(t.key), (byProject.get(projectOf(t.key)) ?? 0) + t.hours);
  if (byProject.size)
    log("info", `Часы начислены по проектам: ${[...byProject.entries()].sort((a, b) => b[1] - a[1]).map(([p, h]) => `${p} (${fmtH(h)} ч)`).join(", ")}. Лишний проект можно перенести в «только для контекста» в настройках Jira.`);
  if (aiOn && totals.length > 0) {
    log("info", "Итог периода: прошу ИИ описать картину целиком…");
    try {
      const raw = await api.llmChat(
        NARRATIVE_SYSTEM,
        buildNarrativePrompt({
          start: o.start, end: o.end, hoursPerDay: o.hoursPerDay, totals,
          days: days.map((d) => ({ date: d.date, hours: d.tasks.reduce((s, t) => s + t.hours, 0), basis: d.basis, summary: d.summary })),
        }),
      );
      narrative = parseNarrative(raw) ?? "";
      log(narrative ? "ok" : "warn", narrative ? "Итог периода получен." : "ИИ вернул пустой итог — использован шаблон.");
    } catch (e) {
      log("warn", `Итог периода: ошибка ИИ (${e}) — использован шаблон.`);
    }
  }
  if (!narrative) narrative = templateNarrative(o.start, o.end, days, issues);

  const total = days.reduce((s, d) => s + d.tasks.reduce((x, t) => x + t.hours, 0), 0);
  log("ok", `Готово: ${fmtH(total)} ч из ${fmtH(days.length * o.hoursPerDay)} ч; задач ${totals.length}; ИИ использован в ${aiDays} из ${withEvents.length} дней с событиями.`);

  return {
    start: o.start, end: o.end, hoursPerDay: o.hoursPerDay, jiraUrl: settings.jiraUrl.trim().replace(/\/+$/, ""), days, issues, warnings,
    usedAi: aiDays > 0, fillMode: o.fillMode, narrative, log: logs, createdAt: Date.now(),
  };
}
