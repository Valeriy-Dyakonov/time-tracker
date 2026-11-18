import { useEffect, useState } from "react";
import { useT } from "@/i18n";
import { api } from "@/shared/api";
import type { SetupState } from "@/shared/lib/setup";
import type { DashIssue, IssueDetail, PageCtx } from "@/shared/types";
import { buildAnalysisPrompt, linksIn, parseAnalysis, type TaskAnalysis } from "../../lib/taskAnalysis";
import { loadTaskDev, notesOf } from "./useTaskDev";

/** Per task, for the session: reopening the task shows the last analysis; "again" reruns it. */
const results = new Map<string, { r: TaskAnalysis; used: string[] }>();
export const hasAnalysis = (key: string) => results.has(key);

type Step = "pages" | "git" | "notes" | "ask";

export function AnalysisPanel(props: { detail: IssueDetail; context: Map<string, DashIssue>; setup: SetupState }) {
  const t = useT().dashboard;
  const m = t.tools;
  const key = props.detail.key;
  const [result, setResult] = useState(results.get(key) ?? null);
  const [step, setStep] = useState<Step | null>(null);
  const [error, setError] = useState("");

  async function run() {
    const d = props.detail;
    setError("");
    setResult(null);
    const used: string[] = [m.src.task(d.comments.length)];
    try {
      setStep("pages");
      let pages: PageCtx[] = [];
      if (props.setup.confluence) {
        const urls = linksIn(d.description, ...d.comments.map((c) => c.body));
        pages = (await api.fetchIssuePages([{ key, urls }]).catch(() => [])).flatMap((x) => x.pages);
        if (pages.length) used.push(m.src.pages(pages.length));
      }
      setStep("git");
      const dev = await loadTaskDev(key, props.setup);
      if (dev.mrs.mrs.length) used.push(m.src.mrs(dev.mrs.mrs.length));
      if (dev.git.commits.length) used.push(m.src.commits(dev.git.commits.length));
      setStep("notes");
      const read = await Promise.all(notesOf(dev).slice(0, 5).map((n) => n.read().then((text) => ({ path: n.path, text })).catch(() => null)));
      const notes = read.filter((x): x is { path: string; text: string } => !!x);
      if (notes.length) used.push(m.src.notes(notes.length));
      setStep("ask");
      const raw = await api.llmChat(t.prompt.task, buildAnalysisPrompt({
        detail: d, epic: d.epic ? props.context.get(d.epic) : undefined, parent: d.parent ? props.context.get(d.parent) : undefined,
        pages, git: dev.git, mrs: dev.mrs.mrs, docs: notes,
      }));
      const r = parseAnalysis(raw);
      if (!r) throw new Error(m.unparsed);
      const done = { r, used };
      results.set(key, done);
      setResult(done);
    } catch (e) {
      setError(String(e));
    } finally {
      setStep(null);
    }
  }

  // Opening the panel starts the analysis once per task.
  useEffect(() => { if (!results.has(key)) void run(); }, [key]);

  const r = result?.r;
  return (
    <div className="tool-panel ai">
      {step && <div className="ai-progress"><i className="spin" />{m.steps[step]}</div>}
      {error && <div className="error">{m.failed(error)}</div>}
      {r && (
        <>
          {r.summary && <p className="ai-summary">{r.summary}</p>}
          {r.state && <p className="ai-state"><b>{m.state}:</b> {r.state}</p>}
          <AiList title={m.done} items={r.done} tone="good" />
          <AiList title={m.next} items={r.next} tone="accent" />
          <AiList title={m.risks} items={r.risks} tone="bad" />
          <AiList title={m.details} items={r.details} tone="muted" />
          <AiList title={m.questions} items={r.questions} tone="warn" />
          <div className="ai-foot">
            <span className="muted">{m.used(result!.used.join(", "))}</span>
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
