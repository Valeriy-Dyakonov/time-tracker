import { useEffect, useState } from "react";
import { useT } from "@/i18n";
import { api } from "@/shared/api";
import type { SetupState } from "@/shared/lib/setup";
import type { DashIssue, IssueDetail, PageCtx, TaskGit } from "@/shared/types";
import { buildAnalysisPrompt, linksIn, parseAnalysis, type TaskAnalysis } from "../lib/taskAnalysis";
import { WikiText } from "./WikiText";

/** Per task, for the session: reopening a task does not repeat git reads or AI calls. */
const gitCache = new Map<string, Promise<TaskGit>>();
const analysisCache = new Map<string, TaskAnalysis>();
const gitFor = (key: string) => {
  if (!gitCache.has(key)) gitCache.set(key, api.taskGit(key).catch(() => ({ commits: [], docs: [] })));
  return gitCache.get(key)!;
};

type View = "docs" | "ai" | null;

/**
 * Two buttons under the task title: the task's notes kept in git (when that feature is on and notes exist),
 * and an AI analysis of everything readable about the task. Both read-only.
 */
export function TaskTools(props: {
  detail: IssueDetail;
  context: Map<string, DashIssue>;
  setup: SetupState;
  isKey: (k: string) => boolean;
  onKey: (k: string) => void;
}) {
  const m = useT().dashboard.tools;
  const key = props.detail.key;
  const [git, setGit] = useState<TaskGit | null>(null);
  const [view, setView] = useState<View>(null);

  useEffect(() => {
    let live = true;
    setGit(null);
    setView(analysisCache.has(key) ? "ai" : null);
    if (props.setup.git) void gitFor(key).then((g) => live && setGit(g));
    return () => { live = false; };
  }, [key, props.setup.git]);

  const docs = git?.docs ?? [];
  const toggle = (v: View) => setView((cur) => (cur === v ? null : v));

  return (
    <div className="task-tools">
      <div className="task-tools-bar">
        {docs.length > 0 && (
          <button className={`tool-btn t-docs ${view === "docs" ? "on" : ""}`} onClick={() => toggle("docs")} title={m.docsTip}>
            <svg viewBox="0 0 24 24" aria-hidden><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></svg>
            {m.docs}<span className="tool-n">{docs.length}</span>
          </button>
        )}
        <button className={`tool-btn t-ai ${view === "ai" ? "on" : ""}`} disabled={!props.setup.llm} onClick={() => toggle("ai")}
          title={props.setup.llm ? m.aiTip : m.aiOff}>
          <svg viewBox="0 0 24 24" aria-hidden><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z" /></svg>
          {m.ai}
        </button>
      </div>
      {view === "docs" && <Docs docs={docs} isKey={props.isKey} onKey={props.onKey} />}
      {view === "ai" && <Analysis detail={props.detail} context={props.context} setup={props.setup} />}
    </div>
  );
}

function Docs({ docs, isKey, onKey }: { docs: TaskGit["docs"]; isKey: (k: string) => boolean; onKey: (k: string) => void }) {
  const m = useT().dashboard.tools;
  const [open, setOpen] = useState<string | null>(docs[0] ? docs[0].repo + docs[0].path : null);
  const [texts, setTexts] = useState<Record<string, string | { error: string }>>({});

  useEffect(() => {
    const d = docs.find((x) => x.repo + x.path === open);
    if (!d || texts[open!] !== undefined) return;
    api.taskDoc(d.repo, d.commit, d.path)
      .then((t) => setTexts((p) => ({ ...p, [open!]: t })))
      .catch((e) => setTexts((p) => ({ ...p, [open!]: { error: String(e) } })));
  }, [open, docs, texts]);

  return (
    <div className="tool-panel docs">
      {docs.map((d) => {
        const id = d.repo + d.path;
        const t = texts[id];
        const name = d.path.split("/").pop();
        return (
          <section key={id} className={`doc ${open === id ? "open" : ""}`}>
            <button className="doc-h" onClick={() => setOpen(open === id ? null : id)}>
              <span className="doc-caret">›</span>
              <b>{name}</b>
              <span className="muted doc-path" title={`${d.repoName}/${d.path}`}>{d.repoName} · {d.path.slice(0, -(name?.length ?? 0))}</span>
              <span className="spacer" />
              <span className="muted">{d.date.slice(0, 10)}</span>
            </button>
            {open === id && (
              <div className="doc-body">
                {t === undefined && <p className="muted">{m.loading}</p>}
                {typeof t === "object" && <div className="error">{t.error}</div>}
                {typeof t === "string" && <WikiText text={t} isKey={isKey} onKey={onKey} format="md" />}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

type Step = "pages" | "git" | "notes" | "ask";

function Analysis(props: { detail: IssueDetail; context: Map<string, DashIssue>; setup: SetupState }) {
  const t = useT().dashboard;
  const m = t.tools;
  const key = props.detail.key;
  const [result, setResult] = useState<TaskAnalysis | null>(analysisCache.get(key) ?? null);
  const [step, setStep] = useState<Step | null>(null);
  const [error, setError] = useState("");
  const [used, setUsed] = useState<string[]>([]);

  async function run() {
    const d = props.detail;
    setError("");
    setResult(null);
    const sources: string[] = [m.src.task(d.comments.length)];
    try {
      setStep("pages");
      let pages: PageCtx[] = [];
      if (props.setup.confluence) {
        const urls = linksIn(d.description, ...d.comments.map((c) => c.body));
        pages = (await api.fetchIssuePages([{ key, urls }]).catch(() => [])).flatMap((x) => x.pages);
        if (pages.length) sources.push(m.src.pages(pages.length));
      }
      setStep("git");
      const git = props.setup.git ? await gitFor(key) : { commits: [], docs: [] };
      if (git.commits.length) sources.push(m.src.commits(git.commits.length));
      setStep("notes");
      const notes = await Promise.all(
        git.docs.slice(0, 5).map((n) => api.taskDoc(n.repo, n.commit, n.path).then((text) => ({ path: n.path, text })).catch(() => null)),
      );
      const docs = notes.filter((x): x is { path: string; text: string } => !!x);
      if (docs.length) sources.push(m.src.notes(docs.length));
      setStep("ask");
      const raw = await api.llmChat(t.prompt.task, buildAnalysisPrompt({
        detail: d, epic: d.epic ? props.context.get(d.epic) : undefined, parent: d.parent ? props.context.get(d.parent) : undefined, pages, git, docs,
      }));
      const r = parseAnalysis(raw);
      if (!r) throw new Error(m.unparsed);
      analysisCache.set(key, r);
      setResult(r);
      setUsed(sources);
    } catch (e) {
      setError(String(e));
    } finally {
      setStep(null);
    }
  }

  // Opening the panel starts the analysis once per task; "again" reruns it.
  useEffect(() => { if (!analysisCache.has(key)) void run(); }, [key]);

  return (
    <div className="tool-panel ai">
      {step && (
        <div className="ai-progress"><i className="spin" />{m.steps[step]}</div>
      )}
      {error && <div className="error">{m.failed(error)}</div>}
      {result && (
        <>
          {result.summary && <p className="ai-summary">{result.summary}</p>}
          {result.state && <p className="ai-state"><b>{m.state}:</b> {result.state}</p>}
          <AiList title={m.done} items={result.done} tone="good" />
          <AiList title={m.next} items={result.next} tone="accent" />
          <AiList title={m.risks} items={result.risks} tone="bad" />
          <AiList title={m.details} items={result.details} tone="muted" />
          <AiList title={m.questions} items={result.questions} tone="warn" />
          <div className="ai-foot">
            {used.length > 0 && <span className="muted">{m.used(used.join(", "))}</span>}
            <span className="spacer" />
            <button className="board-more" disabled={!!step} onClick={() => void run()}>{m.again}</button>
          </div>
        </>
      )}
    </div>
  );
}

function AiList({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  if (!items.length) return null;
  return (
    <div className={`ai-list tone-${tone}`}>
      <h5>{title}</h5>
      <ul>{items.map((x, n) => <li key={n}>{x}</li>)}</ul>
    </div>
  );
}
