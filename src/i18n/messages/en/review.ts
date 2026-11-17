import type ru from "../ru/review";

const en: typeof ru = {
  basis: {
    activity: "from the day's data",
    inferred: "no data",
    empty: "empty",
  },
  period: {
    title: "Period summary",
    tip: "A readable account of the period built from tasks and events. Copy it to send to your manager or paste into a report.",
    byAi: "written by AI",
    byTemplate: "template, no AI",
  },
  days: {
    title: "How each day was calculated",
    tip: "For every day: why the hours were split this way, which tasks and notes came out, which meetings there were and what events were found in the sources. Helps to check that the AI understood the day correctly.",
    onlyData: "only days with data",
    onlyDataTitle: "Hide days without their own events — their hours come from neighbouring days or the whole period",
    onlyDataTip: "Keep only days with your own events (commits, tasks, messages, meetings). Days filled from neighbours or from the period are hidden.",
    summary: "Day in brief",
    tasks: "Tasks",
    reasoning: "Why this split",
  },
  evidence: {
    title: (n: number) => `Found on this day (${n})`,
    inRoom: (room: string) => `in “${room}”`,
    toTitle: "Addressed to: people mentioned, the author of the message you replied to, or the other person in a direct chat",
  },
};

export default en;
