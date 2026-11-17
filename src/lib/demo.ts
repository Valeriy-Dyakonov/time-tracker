import type { Analysis, IssueInfo, Meeting } from "../types";
import { buildPlan, workDates, type DayActivity } from "./allocate";
import { t } from "../i18n";
import { addDays, localDate, monthRange } from "./dates";

/** Synthetic data so the report can be previewed before anything is configured. */
export function demoAnalysis(): Analysis {
  const { start, end } = monthRange(0);
  const today = localDate(new Date());
  const m = t().analysis.demo;
  const issues: Record<string, IssueInfo> = {
    "PAY-101": { key: "PAY-101", summary: m.issues["PAY-101"], status: "In Progress", issueType: "Story" },
    "PAY-117": { key: "PAY-117", summary: m.issues["PAY-117"], status: "Done", issueType: "Bug" },
    "OPS-42": { key: "OPS-42", summary: m.issues["OPS-42"], status: "In Review", issueType: "Task" },
    "PAY-130": { key: "PAY-130", summary: m.issues["PAY-130"], status: "In Progress", issueType: "Story" },
  };
  const dates = workDates(start, end, [1, 2, 3, 4, 5], today);
  const mixes: Record<string, number>[] = [
    { "PAY-101": 3, "PAY-117": 1 },
    { "PAY-101": 2, "OPS-42": 2, "PAY-117": 1 },
    { "PAY-130": 3, "PAY-101": 1 },
  ];
  const activity: Record<string, DayActivity> = {};
  dates.forEach((d, i) => {
    if (i % 4 === 3) return; // leave some days without activity
    activity[d] = {
      weights: mixes[i % mixes.length],
      notes: { "PAY-101": [m.noteApi], "OPS-42": [m.noteCache] },
      summary: m.summary,
      reasoning: m.reasoning,
      evidence: [
        { ts: Date.parse(d + "T10:12:00"), source: "git", key: "PAY-101", text: m.commit },
        { ts: Date.parse(d + "T13:40:00"), source: "jira", key: "OPS-42", text: m.comment },
      ],
      eventCount: 7,
    };
  });
  const meetings: Record<string, Meeting[]> = {};
  dates.forEach((d, i) => {
    const at = (h: number, m: number) => Date.parse(`${d}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
    meetings[d] = [{ ts: at(10, 0), endTs: at(10, 15), minutes: 15, title: "Daily", organizer: m.lead, location: "Teams", isCall: true, tentative: false }];
    if (i % 3 === 0) meetings[d].push({ ts: at(15, 0), endTs: at(16, 30), minutes: 90, title: m.archMeeting, organizer: m.architect, location: m.room, isCall: false, tentative: false });
  });
  const days = buildPlan(dates.length ? dates : [addDays(start, 0)], activity, issues, 8, "neighbors", meetings);
  return {
    start, end, hoursPerDay: 8, jiraUrl: "https://jira.example.com", days, issues, usedAi: true, createdAt: Date.now(), fillMode: "neighbors",
    narrative: m.narrative,
    log: [{ t: Date.now(), level: "info", msg: m.log }],
    warnings: [m.warning],
  };
}
