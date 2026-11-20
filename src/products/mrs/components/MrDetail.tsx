import { useEffect, useState } from "react";
import { useT } from "@/i18n";
import { api } from "@/shared/api";
import type { Mr, MrDetail as Detail } from "@/shared/types";
import { Button } from "@/shared/ui";
import { logsFacts } from "../lib/pipeline";
import { PipelineBadge } from "./PipelineBadge";

/**
 * What is behind an MR's indicators, read from GitLab when the card is opened: the failed stage and the log lines of
 * the failed jobs, the unresolved review threads, and an AI reading of the failure. Read-only.
 */
export function MrDetail({ mr, aiReady }: { mr: Mr; aiReady: boolean }) {
  const m = useT().mrs.detail;
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [advice, setAdvice] = useState("");
  const [asking, setAsking] = useState(false);
  const [adviceError, setAdviceError] = useState("");

  useEffect(() => {
    let live = true;
    api.gitlabMrDetail(mr.projectId, mr.iid)
      .then((d) => { if (live) setDetail(d); })
      .catch((e) => { if (live) setError(String(e)); });
    return () => { live = false; };
  }, [mr.projectId, mr.iid, mr.updated]);

  async function analyse() {
    if (!detail) return;
    setAsking(true);
    setAdviceError("");
    try {
      setAdvice(await api.llmChat(m.aiSystem, `${m.aiAsk}\n\n${logsFacts(mr, detail)}`));
    } catch (e) {
      setAdviceError(String(e));
    } finally {
      setAsking(false);
    }
  }

  if (error) return <div className="error mr-detail">{m.failed(error)}</div>;
  if (!detail) return <p className="muted mr-detail">{m.loading}</p>;

  const p = detail.pipeline;
  return (
    <div className="mr-detail">
      <section>
        <h5>{m.pipeline}{p && <PipelineBadge status={p.status} />}{p?.url && <button type="button" className="mr-link" onClick={() => void api.openLink(p.url).catch(() => {})}>{m.openPipeline}</button>}</h5>
        {!p && <p className="muted">{m.noPipeline}</p>}
        {p && p.status !== "failed" && <p className="muted">{m.pipelineOk}</p>}
        {p?.status === "failed" && (
          <>
            <p>{p.failedStage ? m.failedStage(p.failedStage) : m.failedNoStage}</p>
            {p.jobs.length === 0 && <p className="muted">{m.noJobs}</p>}
            {p.jobs.map((j) => (
              <div key={j.id} className="mr-job">
                <div className="mr-job-head">
                  <b>{j.name}</b>
                  <span className="muted">{j.stage}{j.reason ? ` · ${j.reason}` : ""}</span>
                  {j.url && <button type="button" className="mr-link" onClick={() => void api.openLink(j.url).catch(() => {})}>{m.openLog}</button>}
                </div>
                {j.lines.length > 0 ? <pre className="mr-log">{j.lines.join("\n")}</pre> : <p className="muted">{m.noLog}</p>}
              </div>
            ))}
            {p.jobs.length > 0 && (
              <div className="mr-ai">
                <Button size="small" disabled={asking || !aiReady} title={aiReady ? undefined : m.aiOff} onClick={() => void analyse()}>
                  {asking ? m.aiRunning : advice ? m.aiAgain : m.aiRun}
                </Button>
                {adviceError && <div className="error">{adviceError}</div>}
                {advice && <div className="mr-advice">{advice}</div>}
              </div>
            )}
          </>
        )}
      </section>

      <section>
        <h5>{m.review}<span className="muted">{m.reviewCount(detail.threads.length, detail.resolved)}</span></h5>
        {detail.threads.length === 0 && <p className="muted">{m.noThreads}</p>}
        {detail.threads.map((t) => (
          <div key={t.noteId} className="mr-thread">
            <div className="mr-thread-head">
              <b>{t.author}</b>
              {t.file && <code>{t.file}{t.line ? `:${t.line}` : ""}</code>}
              {t.replies > 0 && <span className="muted">{m.replies(t.replies)}</span>}
              <button type="button" className="mr-link" onClick={() => void api.openLink(`${mr.url}#note_${t.noteId}`).catch(() => {})}>{m.openThread}</button>
            </div>
            <p className="mr-thread-body">{t.body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
