import { useEffect, useState } from "react";
import { api } from "@/shared/api";
import type { SetupState } from "@/shared/lib/setup";
import type { TaskGit, TaskMrs } from "@/shared/types";

/** Everything known about a task's development: local commits and notes, GitLab merge requests and notes. */
export interface TaskDev {
  git: TaskGit;
  mrs: TaskMrs;
  /** Tasks searched together with the opened one (its subtasks, or the tasks of an epic). */
  children?: string[];
  /** When it was read (ms). */
  at?: number;
  /** Which task each merge request (`mr:project!iid`) and commit (`c:hash`) was found for. */
  owner?: Record<string, string>;
}

export const mrId = (r: { projectId: number; iid: number }) => `mr:${r.projectId}!${r.iid}`;
export const commitId = (hash: string) => `c:${hash}`;

/** A note from either place, read the way it was found. */
export interface TaskNote {
  id: string;
  path: string;
  /** Repository or project it came from, and the branch/commit when that helps. */
  where: string;
  /** The service it belongs to: the repository or the GitLab project. */
  service: string;
  date: string;
  /** The file on the repository's web page, when known. */
  url: string | null;
  read: () => Promise<string>;
}

const EMPTY_GIT: TaskGit = { commits: [], docs: [], searched: [], docsEnabled: false };
const EMPTY_MRS: TaskMrs = { configured: false, mrs: [], docs: [], error: null };

/** Note texts by note id, read once per session (or until "search again"). */
const texts = new Map<string, Promise<string>>();

export function readNote(n: TaskNote): Promise<string> {
  if (!texts.has(n.id)) texts.set(n.id, n.read().catch((e) => { texts.delete(n.id); throw e; }));
  return texts.get(n.id)!;
}

const pathUrl = (s: string) => s.split("/").map(encodeURIComponent).join("/");

/** Per task, for the session: reopening a task or running the analysis does not read git again. */
const cache = new Map<string, { at: number; read: Promise<TaskDev> }>();

/** After this long a task is read again (the app keeps GitLab's answer for the same time, see TASK_MRS_TTL in Rust). */
export const DEV_MAX_AGE_MS = 15 * 60 * 1000;
const old = (at: number) => Date.now() - at > DEV_MAX_AGE_MS;

/** Tasks whose next read must skip what GitLab said before (the stored answer included). */
const forced = new Set<string>();

/** Tasks under a task, for the session. */
const under = new Map<string, { at: number; read: Promise<string[]> }>();

/** Every task under the task (subtasks, tasks of an epic, theirs...); `known` are those the board already shows. */
export function loadDescendants(key: string, known: string[]): Promise<string[]> {
  const kept = under.get(key);
  if (!kept || old(kept.at)) under.set(key, { at: Date.now(), read: api.jiraDescendants(key).catch(() => []) });
  return under.get(key)!.read.then((found) => [...new Set([...known, ...found])].filter((k) => k !== key));
}

/** Forget what was found for a task, so the next read asks git and GitLab again. */
export function forgetTaskDev(key: string): void {
  forced.add(key);
  under.delete(key);
  texts.clear();
  for (const id of [...cache.keys()]) if (id.startsWith(`${key}|`)) cache.delete(id);
}

export function loadTaskDev(key: string, setup: Pick<SetupState, "git" | "gitlab">): Promise<TaskDev> {
  const id = `${key}|${setup.git}|${setup.gitlab}`;
  const kept = cache.get(id);
  if (!kept || old(kept.at)) {
    const read = Promise.all([
      setup.git ? api.taskGit(key).catch((e) => ({ ...EMPTY_GIT, searched: [{ repoName: "git", refs: [], error: String(e) }] })) : Promise.resolve(EMPTY_GIT),
      setup.gitlab ? api.taskMrs(key, forced.delete(key) || undefined).catch((e) => ({ ...EMPTY_MRS, configured: true, error: e })) : Promise.resolve(EMPTY_MRS),
    ]).then(([git, mrs]): TaskDev => ({ git, mrs, at: Date.now() }));
    cache.set(id, { at: Date.now(), read });
    // An answer that failed is not kept: the next open asks again.
    void read.then((d) => { if (d.mrs.error != null && cache.get(id)?.read === read) cache.delete(id); });
  }
  return cache.get(id)!.read;
}

/**
 * One view of a task and the tasks under it: what was found for several tasks put together, each merge request and
 * commit once, with the task it was found for (the opened task first, so a shared one is credited to it).
 */
export function mergeDev(parts: { key: string; dev: TaskDev }[]): TaskDev {
  const owner: Record<string, string> = {};
  const seenDoc = new Set<string>();
  const out: TaskDev = {
    git: { commits: [], docs: [], searched: [], docsEnabled: false },
    mrs: { configured: false, mrs: [], docs: [], error: null },
    children: parts.slice(1).map((p) => p.key),
    at: Math.min(...parts.map((p) => p.dev.at ?? Date.now())),
    owner,
  };
  for (const { key, dev } of parts) {
    out.git.docsEnabled ||= dev.git.docsEnabled;
    out.mrs.configured ||= dev.mrs.configured;
    out.mrs.error ??= dev.mrs.error;
    if (out.git.searched.length === 0) out.git.searched = dev.git.searched;
    for (const c of dev.git.commits) if (!(commitId(c.hash) in owner)) { owner[commitId(c.hash)] = key; out.git.commits.push(c); }
    for (const r of dev.mrs.mrs) if (!(mrId(r) in owner)) { owner[mrId(r)] = key; out.mrs.mrs.push(r); }
    for (const d of dev.git.docs) {
      const id = `l:${d.repo}:${d.commit}:${d.path}`;
      if (!seenDoc.has(id)) { seenDoc.add(id); out.git.docs.push(d); }
    }
    for (const d of dev.mrs.docs) {
      const id = `r:${d.projectId}:${d.path}`;
      if (!seenDoc.has(id)) { seenDoc.add(id); out.mrs.docs.push(d); }
    }
  }
  return out;
}

/** The task and the tasks under it, a few requests at a time. */
export async function loadTaskTree(key: string, children: string[], setup: Pick<SetupState, "git" | "gitlab">): Promise<TaskDev> {
  const keys = [key, ...children];
  const devs: TaskDev[] = new Array(keys.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(3, keys.length) }, async () => {
    while (next < keys.length) {
      const i = next++;
      devs[i] = await loadTaskDev(keys[i], setup);
    }
  }));
  return children.length === 0 ? devs[0] : mergeDev(keys.map((k, i) => ({ key: k, dev: devs[i] })));
}

/** Notes found locally first (they are what is checked out), then those only in GitLab branches. */
export function notesOf(dev: TaskDev): TaskNote[] {
  const seen = new Set<string>();
  const out: TaskNote[] = [];
  for (const d of dev.git.docs) {
    seen.add(d.path.toLowerCase());
    out.push({ id: `l:${d.repo}:${d.commit}:${d.path}`, path: d.path, where: d.repoName, service: d.repoName, date: d.date, url: d.webUrl, read: () => api.taskDoc(d.repo, d.commit, d.path) });
  }
  for (const d of dev.mrs.docs) {
    if (seen.has(d.path.toLowerCase())) continue;
    seen.add(d.path.toLowerCase());
    const mr = dev.mrs.mrs.find((r) => r.projectId === d.projectId && r.iid === d.mrIid);
    const base = mr?.webUrl.split("/-/merge_requests")[0];
    const url = base ? `${base}/-/blob/${pathUrl(d.refName)}/${pathUrl(d.path)}` : null;
    out.push({ id: `r:${d.projectId}:${d.path}`, path: d.path, where: `${d.project}!${d.mrIid} · ${d.refName}`, service: d.project, date: "", url, read: () => api.taskRemoteDoc(d.projectId, d.refName, d.path) });
  }
  return out;
}

/** The task's development data, and a way to search again (after a push or a new MR). */
export function useTaskDev(key: string, setup: SetupState, children: string[] | null): { dev: TaskDev | null; reload: () => void } {
  const [dev, setDev] = useState<TaskDev | null>(null);
  const [round, setRound] = useState(0);
  // Primitive deps: the setup object is rebuilt on every App render.
  const { git, gitlab } = setup;
  // null = the tasks under this one are not known yet: wait, so the panel is not built twice.
  const below = children === null ? null : children.join(",");
  useEffect(() => {
    let live = true;
    setDev(null);
    if (below === null) return;
    if (git || gitlab) void loadTaskTree(key, below ? below.split(",") : [], { git, gitlab }).then((d) => live && setDev(d));
    else setDev({ git: EMPTY_GIT, mrs: EMPTY_MRS });
    return () => { live = false; };
  }, [key, below, git, gitlab, round]);
  const reload = () => {
    for (const k of [key, ...(children ?? [])]) forgetTaskDev(k);
    setRound((n) => n + 1);
  };
  return { dev, reload };
}
