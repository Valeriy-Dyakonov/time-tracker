import { api } from "@/shared/api";
import { count } from "@/i18n";
import { attachKeys, isPlausibleKey } from "../events/keys";
import { listHead, msg } from "./format";
import type { RunContext } from "./types";

/** Completes the picture around the collected events: task keys, the tasks themselves, their parents and wiki pages. */
export class IssueEnricher {
  /** Parents, epics and linked tasks: read for context only, they never get hours by themselves. */
  readonly contextParents = new Set<string>();
  private pagesTried = new Set<string>();


  /** Finds task keys in commit messages, branches and chat text, and reads those tasks from Jira. */
  async matchAndLookup(ctx: RunContext, what: string): Promise<void> {
    const needKey = ctx.events.filter((e) => !e.issueKey).length;
    ctx.events = attachKeys(ctx.events);
    const left = ctx.events.filter((e) => !e.issueKey).length;
    const m = msg().enrich;
    ctx.log("info", m.matched(what, needKey - left, needKey, left, ctx.aiOn));
    // Keys from commits/chat may belong to tasks touched only via git (not assignee/reporter): check every plausible key.
    const unknown = [...new Set(ctx.events.map((e) => e.issueKey).filter((k): k is string => !!k && !ctx.issues[k]))].filter(isPlausibleKey);
    if (unknown.length === 0) return;
    ctx.log("info", m.checking(unknown.length, what, listHead(unknown)));
    try {
      for (const i of await api.lookupIssues(unknown.slice(0, 200))) ctx.issues[i.key] = i;
      const found = unknown.filter((k) => ctx.issues[k]).length;
      ctx.log(found === unknown.length ? "ok" : "info", m.found(found, unknown.length));
    } catch (e) {
      ctx.log("warn", m.lookupFailed(String(e)));
    }
  }

  async loadContext(ctx: RunContext): Promise<void> {
    const m = msg().enrich;
    for (let pass = 0; pass < 2; pass++) {
      const from = pass === 0 ? Object.values(ctx.issues) : [...this.contextParents].map((k) => ctx.issues[k]).filter(Boolean);
      const want = [...new Set(
        from.flatMap((i) => [i.parent, i.epic, ...(pass === 0 ? (i.links ?? []).slice(0, 5) : [])])
          .filter((k): k is string => !!k && !ctx.issues[k] && isPlausibleKey(k)),
      )].slice(0, 150);
      if (want.length === 0) break;
      ctx.log("info", m.contextReading(want.length, listHead(want)));
      try {
        const got = await api.lookupIssues(want);
        for (const i of got) { ctx.issues[i.key] = i; this.contextParents.add(i.key); }
        ctx.log("ok", m.contextDone(got.length, want.length));
      } catch (e) {
        ctx.log("warn", m.contextFailed(String(e)));
        break;
      }
    }
  }

  /** Confluence pages linked from the most active tasks and their epics: context only. */
  async loadPages(ctx: RunContext): Promise<void> {
    if (!(ctx.o.useConfluence && ctx.settings.confluenceUrl)) return;
    const hits = new Map<string, number>();
    for (const e of ctx.events) if (e.issueKey && !ctx.isCtx(e.issueKey)) hits.set(e.issueKey, (hits.get(e.issueKey) ?? 0) + 1);
    const keys = [...hits.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k).slice(0, 30);
    const withUp = [...new Set(keys.flatMap((k) => [k, ctx.issues[k]?.epic, ctx.issues[k]?.parent]).filter((k): k is string => !!k && !!ctx.issues[k]))]
      .filter((k) => !this.pagesTried.has(k)).slice(0, 45);
    if (withUp.length === 0) return;
    withUp.forEach((k) => this.pagesTried.add(k));
    const m = msg().enrich;
    ctx.log("info", m.pagesReading(withUp.length));
    try {
      const got = await api.fetchIssuePages(withUp.map((k) => ({ key: k, urls: ctx.issues[k].urls ?? [] })));
      for (const g of got) ctx.issues[g.key] = { ...ctx.issues[g.key], pages: g.pages };
      const n = got.reduce((s, g) => s + g.pages.length, 0);
      ctx.log(n ? "ok" : "info", n ? m.pagesFound(count(n, m.pages), got.length) : m.pagesNone);
    } catch (e) {
      ctx.log("warn", m.pagesFailed(String(e)));
    }
  }

  /** Chat and calendar may mention tasks that git/Jira did not: a second pass for the new keys, with their context. */
  async secondPass(ctx: RunContext): Promise<void> {
    const before = Object.keys(ctx.issues).length;
    await this.matchAndLookup(ctx, msg().steps.matchChatWhat);
    if (Object.keys(ctx.issues).length > before) {
      await this.loadContext(ctx);
      await this.loadPages(ctx);
    }
  }

  /** Keys Jira did not return (no such task or no access) cannot get hours. */
  dropUnknownKeys(ctx: RunContext): void {
    const dropped = [...new Set(ctx.events.map((e) => e.issueKey).filter((k): k is string => !!k && !ctx.issues[k]))];
    if (dropped.length)
      ctx.log("info", msg().enrich.dropped(dropped.slice(0, 8).join(", ")));
    ctx.events = ctx.events.map((e) => (e.issueKey && !ctx.issues[e.issueKey] ? { ...e, issueKey: null } : e));
  }
}
