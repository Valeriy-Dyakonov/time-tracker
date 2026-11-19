import type ru from "../ru/common";

const en: typeof ru = {
  appName: "Worklog Tracker",
  h: "h",
  min: "min",
  hoursValue: (h: string) => `${h} h`,
  copy: "Copy",
  copied: "Copied",
  save: "Save",
  cancel: "Cancel",
  close: "Close",
  remove: "Remove",
  more: "More",
  showAll: "Show all",
  collapse: "Collapse",
  optional: "optional",
  required: "required",
  recommended: "recommended",
  notConfigured: "not configured",
  help: "Help",
  day: { one: "day", other: "days" },
  workday: { one: "working day", other: "working days" },
  task: { one: "task", other: "tasks" },
  event: { one: "event", other: "events" },
  sources: {
    jira: "Jira",
    git: "Git",
    gitlab: "GitLab",
    matrix: "Matrix",
    confluence: "Confluence",
    calendar: "Calendar",
    calls: "Calls on PC",
    ai: "AI analysis",
  },
};

export default en;
