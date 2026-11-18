import type ru from "../ru/shell";

const en: typeof ru = {
  app: {
    settings: "Settings",
    desktopOnly: "Settings are available in the desktop app only.",
  },
  titlebar: {
    downloading: "Downloading…",
    downloaded: (pct: number) => `Downloaded ${pct}%`,
    installing: "Installing…",
    updateFailed: (msg: string) => `Update failed: ${msg}`,
    installVersion: (v: string) => `Install version ${v}`,
    retryUpdate: "Retry update",
    updateTo: (v: string) => `Update to v${v}`,
    settings: "Settings",
    closeSettings: "Close settings",
    minimize: "Minimize",
    maximize: "Maximize",
    restore: "Restore",
    close: "Close",
  },
  dateRange: {
    dialog: "Choose a period",
    prevMonth: "Previous month",
    nextMonth: "Next month",
    pickStart: "Pick the first day",
    pickEnd: "Pick the last day",
  },
  live: {
    running: "Analysing…",
    stopped: "Analysis stopped",
    progress: (done: number, total: number) => `Days with events analysed: ${done} of ${total}`,
    withoutEvents: (n: number) => ` · without events: ${n}`,
    log: "Log",
    taskHours: (key: string, h: string) => `${key} ${h}h`,
    status: {
      queued: "queued",
      running: "analysing…",
      done: "done",
      fallback: "heuristic",
      nodata: "no events",
    },
  },
  meetings: {
    title: "Calls and meetings",
    calls: (n: number) => ` · calls ${n}`,
    organizer: (name: string) => `Organizer: ${name}`,
    call: "call",
  },
  issueLink: {
    open: (key: string) => `Open ${key} in the browser`,
  },
  ui: {
    copyTitle: "Copy",
    clickToCopy: "Click to copy",
    less: "Less",
    more: "More",
  },
};

export default en;
