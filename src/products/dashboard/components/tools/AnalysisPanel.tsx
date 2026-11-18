import { useEffect, useRef, useState } from "react";
import { dateShort, useT } from "@/i18n";
import { api } from "@/shared/api";
import type { SetupState } from "@/shared/lib/setup";
import type { DashIssue, DashProfile, GitLabItem, IssueDetail, PageDoc } from "@/shared/types";
import { Button, Segmented } from "@/shared/ui";
import {
  ANALYSIS_MODES, buildAnalysisPrompt, linksIn, MODE_SECTIONS, modeForProfile, parseAnalysis,
  type AnalysisMode, type Point, type Tone,
} from "../../lib/taskAnalysis";
import { analysisId, getResult, hasResult, runningJob, startJob, type Job, type Read, type Result, type Step } from "./analysisStore";
import { loadTaskDev, notesOf } from "./useTaskDev";

export const hasAnalysis = (key: string) => hasResult(key, ANALYSIS_MODES);
/** The mode picked last in this session; until then the dashboard profile decides. */
let lastMode: AnalysisMode | null = null;

/** "18.11 14:30" in local time. */
function when(iso: string): string {
  const d = new Date(iso);
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `${dateShort(day)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * AI analysis of a task in one of three views. Model requests are spent only on an explicit action:
 * opening the panel for a task never analysed in its view, "run" after switching the view, or "again".
 */
export function AnalysisPanel(props: { detail: IssueDetail; context: Map<string, DashIssue>; setup: SetupState; profile: DashProfile }) {
  const t = useT().dashboard;
  const m = t.tools;
  const key = props.detail.key;
  const [mode, setMode] = useState<AnalysisMode>(() => lastMode ?? modeForProfile(props.profile));
  const [result, setResult] = useState<Result | null>(null);
  const [step, setStep] = useState<Step | null>(null);
  const [error, setError] = useState("");
  /** What is on screen now; a run finishing for another task or mode must not overwrite it. */
  const shown = useRef("");
  /** Only opening the panel starts an analysis by itself; a switched view waits for "run". */
  const picked = useRef(false);

  /** Show a running analysis (started here or before the panel was reopened) until it ends. */
  function follow(id: string, job: Job) {
    const live = () => shown.current === id;
    const onStep = (s: Step) => { if (live()) setStep(s); };
    job.listeners.add(onStep);
    setStep(job.step);
    job.promise
      .then((r) => { if (live()) setResult(r); })
      .catch((e) => { if (live()) setError(String(e)); })
      .finally(() => { job.listeners.delete(onStep); if (live()) setStep(null); });
  }

  function run() {
    const id = analysisId(key, mode);
    const d = props.detail;
    const runMode = mode;
    setError("");
    setResult(null);
    follow(id, startJob(id, async (step) => {
      const used: string[] = [m.src.task(d.comments.length)];
      step("pages");
      const urls = linksIn(d.description, ...d.comments.map((c) => c.body));
      let pages: PageDoc[] = [];
      if (props.setup.confluence) {
        pages = await api.analysisPages(key, urls).catch(() => []);
        const nested = pages.filter((p) => p.depth > 0).length;
        if (pages.length) used.push(m.src.pages(pages.length - nested, nested));
      }
      step("git");
      const dev = await loadTaskDev(key, props.setup);
      if (dev.mrs.mrs.length) used.push(m.src.mrs(dev.mrs.mrs.length));
      if (dev.git.commits.length) used.push(m.src.commits(dev.git.commits.length));
      let gitlab: GitLabItem[] = [];
      if (props.setup.gitlab) {
        step("gitlab");
        // The task's own MRs first, then what the task and its pages link to.
        const links = [...dev.mrs.mrs.slice(0, 5).map((r) => r.webUrl), ...urls, ...pages.flatMap((p) => p.links)];
        gitlab = await api.gitlabLinks([...new Set(links)]).catch(() => []);
        if (gitlab.length) used.push(m.src.gitlab(gitlab.length));
      }
      step("notes");
      const texts = await Promise.all(notesOf(dev).slice(0, 5).map((n) => n.read().then((text) => ({ path: n.path, text })).catch(() => null)));
      const notes = texts.filter((x): x is { path: string; text: string } => !!x);
      if (notes.length) used.push(m.src.notes(notes.length));
      step("ask");
      const raw = await api.llmChat(t.prompt.analysis[runMode], buildAnalysisPrompt({
        detail: d, epic: d.epic ? props.context.get(d.epic) : undefined, parent: d.parent ? props.context.get(d.parent) : undefined,
        pages, gitlab, git: dev.git, mrs: dev.mrs.mrs, docs: notes,
      }));
      const r = parseAnalysis(raw, runMode);
      if (!r) throw new Error(m.unparsed);
      const read: Read[] = [
        ...pages.map((p) => ({ kind: p.depth ? "nested" as const : "page" as const, title: p.title, url: p.url })),
        ...gitlab.map((g) => ({ kind: g.kind, title: g.title, url: g.url })),
        ...notes.map((n) => ({ kind: "note" as const, title: n.path, url: null })),
      ];
      return { r, used, read, at: new Date().toISOString() };
    }));
  }

  // Saved -> shown; running -> followed; otherwise analysed only when the panel was just opened.
  useEffect(() => {
    const id = analysisId(key, mode);
    shown.current = id;
    setError("");
    setStep(null);
    const saved = getResult(id);
    setResult(saved);
    const job = runningJob(id);
    if (job) follow(id, job);
    else if (!saved && !picked.current) run();
  }, [key, mode]);

  const pick = (v: AnalysisMode) => { lastMode = v; picked.current = true; setMode(v); };
  const r = result?.r;
  return (
    <div className="tool-panel ai">
      <div className="ai-modes">
        <Segmented size="small" value={mode} onChange={pick}
          options={ANALYSIS_MODES.map((v) => ({ value: v, label: m.modes[v], title: m.modeTips[v] }))} />
      </div>
      {step && <div className="ai-progress"><i className="spin" />{m.steps[step]}</div>}
      {error && <div className="error">{m.failed(error)}</div>}
      {!r && !step && (
        <div className="ai-idle">
          <span className="muted">{m.notYet(m.modes[mode])}</span>
          <Button size="small" variant="primary" onClick={run}>{m.runNow}</Button>
        </div>
      )}
      {r && (
        <>
          {r.summary && <p className="ai-summary">{r.summary}</p>}
          {r.state && <p className="ai-state"><b>{m.state}:</b> {r.state}</p>}
          {r.changes.length > 0 && (
            <div className="ai-list tone-accent">
              <h5>{m.changes}</h5>
              <ol className="ai-changes">
                {r.changes.map((c, n) => (
                  <li key={n} className="ai-change">
                    <span className="ai-change-n" aria-hidden>{n + 1}</span>
                    <div className="ai-change-body">
                      <header>
                        <b>{c.service || "—"}</b>
                        {c.source && <span className="ai-src">{c.source}</span>}
                      </header>
                      <p>{c.what}</p>
                      {c.where.length > 0 && (
                        <div className="ai-where">
                          <span className="ai-where-label">{m.changeWhere}</span>
                          {c.where.map((w) => <code key={w} title={w}>{w}</code>)}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {MODE_SECTIONS[r.mode].map((s) => <AiList key={s.key} title={m.sections[s.key]} items={r.sections[s.key] ?? []} tone={s.tone} />)}
          {result!.read.length > 0 && (
            <details className="ai-read">
              <summary>{m.readList(result!.read.length)}</summary>
              <ul>
                {result!.read.map((x, n) => (
                  <li key={n}>
                    <span className="muted">{m.readKinds[x.kind]}</span>{" "}
                    {x.url ? <a href={x.url} title={x.url} onClick={(e) => { e.preventDefault(); void api.openLink(x.url!); }}>{x.title || x.url}</a> : x.title}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="ai-foot">
            <span className="muted">{m.analysedAt(when(result!.at))} · {m.used(result!.used.join(", "))}</span>
            <span className="spacer" />
            <button className="board-more" disabled={!!step} onClick={run} title={m.againTip}>{m.again}</button>
          </div>
        </>
      )}
    </div>
  );
}

function AiList({ title, items, tone }: { title: string; items: Point[]; tone: Tone }) {
  if (!items.length) return null;
  return (
    <div className={`ai-list tone-${tone}`}>
      <h5>{title}</h5>
      <ul>{items.map((x, n) => <li key={n}>{x.text}{x.source && <span className="ai-src">{x.source}</span>}</li>)}</ul>
    </div>
  );
}
