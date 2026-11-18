import { useEffect, useState } from "react";
import { api } from "@/shared/api";
import type { SetupState } from "@/shared/lib/setup";
import type { TaskGit, TaskMrs } from "@/shared/types";

/** Everything known about a task's development: local commits and notes, GitLab merge requests and notes. */
export interface TaskDev {
  git: TaskGit;
  mrs: TaskMrs;
}

/** A note from either place, read the way it was found. */
export interface TaskNote {
  id: string;
  path: string;
  /** Repository or project it came from, and the branch/commit when that helps. */
  where: string;
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
const cache = new Map<string, Promise<TaskDev>>();

/** Forget what was found for a task, so the next read asks git and GitLab again. */
export function forgetTaskDev(key: string): void {
  texts.clear();
  for (const id of [...cache.keys()]) if (id.startsWith(`${key}|`)) cache.delete(id);
}

export function loadTaskDev(key: string, setup: Pick<SetupState, "git" | "gitlab">): Promise<TaskDev> {
  const id = `${key}|${setup.git}|${setup.gitlab}`;
  if (!cache.has(id)) {
    cache.set(id, Promise.all([
      setup.git ? api.taskGit(key).catch((e) => ({ ...EMPTY_GIT, searched: [{ repoName: "git", refs: [], error: String(e) }] })) : Promise.resolve(EMPTY_GIT),
      setup.gitlab ? api.taskMrs(key).catch((e) => ({ ...EMPTY_MRS, configured: true, error: e })) : Promise.resolve(EMPTY_MRS),
    ]).then(([git, mrs]) => ({ git, mrs })));
  }
  return cache.get(id)!;
}

/** Notes found locally first (they are what is checked out), then those only in GitLab branches. */
export function notesOf(dev: TaskDev): TaskNote[] {
  const seen = new Set<string>();
  const out: TaskNote[] = [];
  for (const d of dev.git.docs) {
    seen.add(d.path.toLowerCase());
    out.push({ id: `l:${d.repo}:${d.commit}:${d.path}`, path: d.path, where: d.repoName, date: d.date, url: d.webUrl, read: () => api.taskDoc(d.repo, d.commit, d.path) });
  }
  for (const d of dev.mrs.docs) {
    if (seen.has(d.path.toLowerCase())) continue;
    seen.add(d.path.toLowerCase());
    const mr = dev.mrs.mrs.find((r) => r.projectId === d.projectId && r.iid === d.mrIid);
    const base = mr?.webUrl.split("/-/merge_requests")[0];
    const url = base ? `${base}/-/blob/${pathUrl(d.refName)}/${pathUrl(d.path)}` : null;
    out.push({ id: `r:${d.projectId}:${d.path}`, path: d.path, where: `${d.project}!${d.mrIid} · ${d.refName}`, date: "", url, read: () => api.taskRemoteDoc(d.projectId, d.refName, d.path) });
  }
  return out;
}

/** The task's development data, and a way to search again (after a push or a new MR). */
export function useTaskDev(key: string, setup: SetupState): { dev: TaskDev | null; reload: () => void } {
  const [dev, setDev] = useState<TaskDev | null>(null);
  const [round, setRound] = useState(0);
  // Primitive deps: the setup object is rebuilt on every App render.
  const { git, gitlab } = setup;
  useEffect(() => {
    let live = true;
    setDev(null);
    if (git || gitlab) void loadTaskDev(key, { git, gitlab }).then((d) => live && setDev(d));
    else setDev({ git: EMPTY_GIT, mrs: EMPTY_MRS });
    return () => { live = false; };
  }, [key, git, gitlab, round]);
  const reload = () => {
    forgetTaskDev(key);
    setRound((n) => n + 1);
  };
  return { dev, reload };
}
