import type ru from "../ru/submit";

const en: typeof ru = {
  tempo: {
    title: "Tempo in Jira — hours per task",
    tip: "Tempo is the Jira time-tracking plugin. Each row below is one “Log work” entry: task, date, hours and description. Ticks and edited descriptions are saved, so you can come back later.",
    introBefore: "Click a task key to open it in the browser. In Tempo press “Log work” and for each row copy the ",
    introHours: "hours",
    introAnd: " and the ",
    introDesc: "description",
    introAfter: " (click the ⧉ icon), pick the date and save. Then tick the row so you don't lose your place.",
    byTask: "By task",
    byDay: "By day",
    formatTip: "How hours are copied. Tempo accepts both, but some setups understand only one — use whichever works for you.",
    progressTitle: "How many rows you've already marked as logged",
    progressRows: (total: number) => ` of ${total} rows · `,
    progressOf: (total: string) => ` of ${total}`,
    reset: "Clear ticks",
    resetTitle: "Remove all “logged” ticks for this period",
    countTitle: "Rows logged out of all rows for the task",
  },
  row: {
    estimated: "Day without data: hours were taken from neighbouring days and the description is generic. Check before logging.",
    markDone: "Mark as logged in Tempo",
    unmarkDone: "Marked as logged — click to undo",
    copyHours: "Copy hours for the Time Spent field",
    descPlaceholder: "Work description",
    descTitle: "Text for the Tempo Description field — you can edit it",
    copyDesc: "Copy description",
  },
  weekly: {
    title: "Your own system — weekly text",
    tip: "For time systems where you write a weekly “what was done” text plus hours. The text is built from the week's tasks; your edits are saved.",
    intro: "Each week has a ready text. Adjust it if needed, press “Copy” and paste it into the week's field. Hours per day are under a separate button in case the system asks for them.",
    week: (title: string) => `Week ${title}`,
    revert: "restore original",
    revertTitle: "Discard edits and restore the automatically built text",
    copyText: "Copy text",
    dayHours: "Hours per day",
    dayHoursTitle: "Dates and hours of the week's working days, one line per day — for systems that ask for hours separately",
    aiBusy: "AI is writing…",
    aiRewrite: "Rewrite as prose with AI",
    aiTip: "The AI turns the week's task list into a coherent paragraph for the report: what was done and why. The text in the field is replaced; use “restore original” to get it back.",
    aiEmpty: "The AI returned an empty answer — the text was not changed.",
    aiError: (e: string) => `AI error: ${e}`,
  },
};

export default en;
