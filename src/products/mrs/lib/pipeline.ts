import type { MrDetail, Mr } from "@/shared/types";

/** How a pipeline status looks: `run` = still going, `wait` = not started, `off` = ended without a verdict. */
export type PipeTone = "good" | "bad" | "run" | "wait" | "warn" | "off";

const TONES: Record<string, PipeTone> = {
  success: "good",
  failed: "bad",
  running: "run",
  pending: "wait",
  created: "wait",
  preparing: "wait",
  scheduled: "wait",
  waiting_for_resource: "wait",
  manual: "warn",
  canceled: "off",
  canceling: "off",
  skipped: "off",
};

export const pipeTone = (status: string): PipeTone => TONES[status] ?? "off";

/** What the AI is asked about a failed pipeline: the MR, the stage, and for every failed job the log lines that matter. */
export function logsFacts(mr: Mr, detail: MrDetail): string {
  const p = detail.pipeline;
  if (!p || p.jobs.length === 0) return "";
  const jobs = p.jobs.map((j) => [`Job: ${j.name} (stage: ${j.stage}${j.reason ? `, reason: ${j.reason}` : ""})`, ...j.lines.map((l) => `  ${l}`)].join("\n"));
  return [`Merge request: ${mr.title}`, `Branch: ${mr.sourceBranch} -> ${mr.targetBranch}`, `First failed stage: ${p.failedStage ?? "?"}`, "", ...jobs].join("\n");
}
