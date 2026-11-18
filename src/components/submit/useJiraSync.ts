import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../api";
import type { Analysis, JiraWorklog } from "../../types";
import { rowId, type WorklogRow } from "../../lib/submit";
import { indexWorklogs, rowSync, type PlannedWrite, type RowSync } from "../../lib/worklogSync";

export type LoadState = { kind: "off" } | { kind: "loading" } | { kind: "ok" } | { kind: "error"; error: string };

/** Per-row action state: sending, or the last error. */
export type RowAction = { busy: true } | { busy: false; error: string };

export interface JiraSync {
  load: LoadState;
  sync: (r: WorklogRow) => RowSync | undefined;
  actions: Record<string, RowAction>;
  reload: () => Promise<void>;
  /** Writes only the missing minutes of one row. */
  submit: (r: WorklogRow, comment: string) => Promise<void>;
  /** Replaces the row's worklogs in Jira: the first one is updated, the rest deleted. Explicit, never automatic. */
  overwrite: (r: WorklogRow, comment: string) => Promise<void>;
  /** Sequential writes of a reviewed plan; returns how many failed. */
  submitMany: (plan: PlannedWrite[], onStep: (done: number) => void) => Promise<number>;
}

/** What the user already logged in Jira for the period, and the explicit writes of the "Списание" tab. */
export function useJiraSync(a: Analysis): JiraSync {
  const enabled = !!a.jiraUrl;
  const [list, setList] = useState<JiraWorklog[]>([]);
  const [load, setLoad] = useState<LoadState>(enabled ? { kind: "loading" } : { kind: "off" });
  const [actions, setActions] = useState<Record<string, RowAction>>({});
  const index = useMemo(() => indexWorklogs(list), [list]);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoad({ kind: "loading" });
    try {
      setList(await api.jiraWorklogs(a.start, a.end));
      setLoad({ kind: "ok" });
    } catch (e) {
      setLoad({ kind: "error", error: String(e) });
    }
  }, [enabled, a.start, a.end]);

  useEffect(() => { void reload(); }, [reload]);

  const sync = useCallback((r: WorklogRow) => (load.kind === "ok" ? rowSync(r, index.get(rowId(r))) : undefined), [load.kind, index]);

  /** Runs one row's write with busy/error state; true on success. */
  const run = useCallback(async (r: WorklogRow, write: () => Promise<void>): Promise<boolean> => {
    const id = rowId(r);
    setActions((p) => ({ ...p, [id]: { busy: true } }));
    try {
      await write();
      setActions(({ [id]: _, ...rest }) => rest);
      return true;
    } catch (e) {
      setActions((p) => ({ ...p, [id]: { busy: false, error: String(e) } }));
      return false;
    }
  }, []);

  const add = (r: WorklogRow, mins: number, comment: string) => async () => {
    const w = await api.jiraAddWorklog(r.key, r.date, mins * 60, comment);
    setList((p) => [...p, w]);
  };

  const submit = async (r: WorklogRow, comment: string) => {
    const s = rowSync(r, index.get(rowId(r)));
    if (s.missing > 0) await run(r, add(r, s.missing, comment));
  };

  const overwrite = async (r: WorklogRow, comment: string) => {
    const s = rowSync(r, index.get(rowId(r)));
    const [first, ...extra] = s.entries;
    if (!first) return;
    await run(r, async () => {
      const w = await api.jiraUpdateWorklog(r.key, first.id, s.planned * 60, comment);
      for (const x of extra) await api.jiraDeleteWorklog(x.key, x.id);
      const gone = new Set([first.id, ...extra.map((x) => x.id)]);
      setList((p) => [...p.filter((x) => !gone.has(x.id)), { ...w, date: r.date }]);
    });
  };

  const submitMany = async (plan: PlannedWrite[], onStep: (done: number) => void) => {
    let failed = 0;
    for (const [i, p] of plan.entries()) {
      if (!(await run(p.row, add(p.row, p.minutes, p.comment)))) failed++;
      onStep(i + 1);
    }
    return failed;
  };

  return { load, sync, actions, reload, submit, overwrite, submitMany };
}
