import { useEffect, useMemo, useState } from "react";
import { useT } from "@/i18n";
import type { SetupState } from "@/shared/lib/setup";
import type { DashIssue, DashProfile, IssueDetail } from "@/shared/types";
import { AnalysisPanel, hasAnalysis } from "./AnalysisPanel";
import { DevPanel } from "./DevPanel";
import { NotesPanel } from "./NotesPanel";
import { DEV_MAX_AGE_MS, loadDescendants, notesOf, useTaskDev } from "./useTaskDev";

type View = "dev" | "notes" | "ai" | null;

/**
 * Development of a task with subtasks is mostly in the subtasks, that of an epic in its tasks, and that of a release in
 * the tasks it is linked to: look at them too.
 */
const MAX_UNDER = 15;
export function underTask(detail: Pick<IssueDetail, "key" | "subtasks" | "linked">, context: Map<string, Pick<DashIssue, "key" | "parent" | "epic">>): string[] {
  const keys = new Set([...detail.subtasks, ...detail.linked].map((s) => s.key));
  for (const i of context.values()) if (i.parent === detail.key || i.epic === detail.key) keys.add(i.key);
  keys.delete(detail.key);
  return [...keys].sort().slice(0, MAX_UNDER);
}

/**
 * Buttons under the task title, all read-only: development (merge requests, commits and where the app looked),
 * the task's notes kept in git (when found), and an AI analysis of everything readable about the task.
 */
export function TaskTools(props: {
  detail: IssueDetail;
  context: Map<string, DashIssue>;
  setup: SetupState;
  profile: DashProfile;
  isKey: (k: string) => boolean;
  onKey: (k: string) => void;
  onSettings?: () => void;
}) {
  const m = useT().dashboard.tools;
  const key = props.detail.key;
  const [children, setChildren] = useState<string[] | null>(null);
  const [round, setRound] = useState(0);
  const { detail, context } = props;
  useEffect(() => {
    let live = true;
    setChildren(null);
    void loadDescendants(key, underTask(detail, context)).then((c) => live && setChildren(c));
    return () => { live = false; };
    // The board's own data is enough to start from; a new task or a repeated search asks again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, round]);
  const { dev, reload: reloadDev } = useTaskDev(key, props.setup, children);
  const reload = () => {
    reloadDev();
    setRound((n) => n + 1);
  };
  const [view, setView] = useState<View>(null);
  useEffect(() => { setView(hasAnalysis(key) ? "ai" : null); }, [key]);

  const notes = useMemo(() => (dev ? notesOf(dev) : []), [dev]);
  const devCount = dev ? dev.mrs.mrs.length + dev.git.commits.length : 0;
  const toggle = (v: View) => {
    // Opening a panel on data that has grown old reads it again.
    if (v !== view && dev?.at && Date.now() - dev.at > DEV_MAX_AGE_MS) reload();
    setView((cur) => (cur === v ? null : v));
  };
  const looked = props.setup.git || props.setup.gitlab;

  return (
    <div className="task-tools">
      <div className="task-tools-bar">
        {looked && (
          <button className={`tool-btn t-dev ${view === "dev" ? "on" : ""}`} onClick={() => toggle("dev")} title={m.devTip} disabled={!dev}>
            <svg viewBox="0 0 24 24" aria-hidden><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="12" r="2.5" /><path d="M6 8.5v7M8.3 7.2c4.5 1 7.4 2.3 7.6 3.6" /></svg>
            {m.dev}{dev ? <span className="tool-n">{devCount}</span> : <i className="spin" />}
          </button>
        )}
        {dev && (notes.length > 0 || dev.git.docsEnabled) && (
          <button className={`tool-btn t-docs ${view === "notes" ? "on" : ""}`} onClick={() => toggle("notes")} title={m.docsTip}>
            <svg viewBox="0 0 24 24" aria-hidden><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></svg>
            {m.docs}<span className="tool-n">{notes.length}</span>
          </button>
        )}
        <button className={`tool-btn t-ai ${view === "ai" ? "on" : ""}`} disabled={!props.setup.llm} onClick={() => toggle("ai")}
          title={props.setup.llm ? m.aiTip : m.aiOff}>
          <svg viewBox="0 0 24 24" aria-hidden><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z" /></svg>
          {m.ai}
        </button>
      </div>
      {view === "dev" && (dev ? <DevPanel dev={dev} onSettings={props.onSettings} onReload={reload} /> : <div className="tool-panel dev"><div className="ai-progress"><i className="spin" />{m.searching}</div></div>)}
      {view === "notes" && <NotesPanel notes={notes} onReload={reload} isKey={props.isKey} onKey={props.onKey} />}
      {view === "ai" && <AnalysisPanel detail={props.detail} context={props.context} setup={props.setup} profile={props.profile} />}
    </div>
  );
}
