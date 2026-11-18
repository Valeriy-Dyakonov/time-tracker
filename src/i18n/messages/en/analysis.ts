import type ru from "../ru/analysis";

const en: typeof ru = {
  units: {
    h: "h",
    min: "min",
    hm: (h: number, m: number) => `${h} h ${m} min`,
    event: { one: "event", other: "events" },
  },

  log: {
    period: (start: string, end: string, hours: string, workdays: string) =>
      `Period ${start} – ${end}, ${hours} h per day, working days: ${workdays}.`,
    contextProjects: (list: string) => `Context-only projects (no hours are booked on them): ${list}.`,
    notAssigned: (n: number, list: string) =>
      `Tasks you were never assigned to (${n}) are used as context only, no hours are booked on them: ${list}${n > 8 ? "…" : ""}.`,
    toFill: (n: number, futureSkipped: boolean, ai: boolean) =>
      `Working days to fill: ${n}${futureSkipped ? " (future days are not filled)" : ""}. AI analysis: ${ai ? "on" : "off — heuristics will be used"}.`,
    step: (i: number, n: number, title: string) => `━━ Step ${i} of ${n}: ${title}`,
    daysStage: "━━ Day by day: events are matched by time (commits, Jira, calls, chat), then hours are split and days without data are filled.",
    done: (total: string, target: string, tasks: number, aiDays: number, withEvents: number) =>
      `Done: ${total} h of ${target} h; tasks: ${tasks}; AI used on ${aiDays} of ${withEvents} days with events.`,
  },

  steps: {
    matchCommits: "matching commits to Jira tasks",
    matchCommitsWhat: "commits and Jira",
    matchChatWhat: "chat and calendar",
    context: "parent tasks, epics and linked issues — for context",
  },

  sources: {
    git: {
      name: "Git",
      step: "git history (your commits only)",
      skipped: "Git: skipped (not selected or no repositories).",
      reading: (repos: number) => `Git: reading ${repos} repositories, all branches…`,
      commits: { one: "commit", other: "commits" },
      done: (commits: string, perRepo: string) => `Git: ${commits}${perRepo ? ` (${perRepo})` : ""}.`,
    },
    gitlab: {
      kinds: { mr_opened: "Opened MR", mr_merged: "MR merged", mr_merged_by_me: "Merged MR", mr_approved: "Approved MR", mr_comment: "Comment" },
      name: "GitLab",
      step: "GitLab: your MRs and reviews",
      skipped: "GitLab: skipped (not configured or turned off).",
      reading: "GitLab: reading MRs you created, approved or commented on…",
      other: "other",
      scoped: (n: number, head: string) => `only projects of your local repositories (${n}): ${head}`,
      fallback: "no local repository points to this GitLab — all projects were read",
      all: "all projects",
      done: (me: string, n: number, by: string, scope: string) => `GitLab (${me}): ${n} events${by ? ` (${by})` : ""}; ${scope}.`,
    },
    jira: {
      name: "Jira",
      step: "Jira for the period",
      skipped: "",
      reading: "Jira: loading tasks where you are assignee/reporter and your actions in the period…",
      done: (me: string, issues: number, actions: number, comments: number, created: number) =>
        `Jira (${me}): ${issues} tasks; ${actions} of your actions — ${comments} comments, ${created} created tasks, ${actions - comments - created} status/field changes.`,
    },
    confluence: {
      name: "Confluence",
      step: "Confluence: task pages and your edits",
      skipped: "Confluence: skipped (not configured or turned off).",
      reading: "Confluence: looking for pages and comments you created or edited…",
      done: (events: string) => `Confluence: ${events}.`,
    },
    calendar: {
      name: "Calendar",
      step: "calendar: meetings and calls",
      skipped: "Calendar: skipped (not configured or turned off).",
      reading: (onlyCalls: boolean) => `Calendar (Exchange): reading meetings and calls${onlyCalls ? " (calls only)" : ""}…`,
      meetings: { one: "meeting", other: "meetings" },
      done: (meetings: string, calls: number, total: string) =>
        `Calendar: ${meetings}, ${calls} of them look like calls; ${total} in total. Cancelled, declined and "free" items are skipped.`,
      eventContext: (range: string, minutes: number, isCall: boolean, organizer: string) =>
        `${range}, ${minutes} min${isCall ? " · call" : ""}${organizer ? " · organizer " + organizer : ""}`,
    },
    matrix: {
      name: "Matrix",
      step: "Matrix chats: work messages",
      skipped: "Matrix: skipped (not configured or turned off).",
      reading: (excluded: number) =>
        `Matrix: reading your messages (${excluded ? `all rooms except ${excluded} excluded` : "all rooms — you can exclude some in settings"})…`,
      messages: { one: "message", other: "messages" },
      done: (messages: string, work: number, rooms: string) =>
        `Matrix: ${messages}, ${work} look work-related${rooms ? ` (${rooms})` : ""}. Short replies and greetings are dropped; the AI filters the rest by meaning.`,
    },
  },

  enrich: {
    matched: (what: string, found: number, total: number, left: number, ai: boolean) =>
      `Linking (${what}): an ABC-123 style key was found in the text, branch or title of ${found} of ${total} events; ${left} left without a key${ai ? " — the AI will work out what they are about" : " — without AI they are not counted"}.`,
    checking: (n: number, what: string, head: string) => `Jira: checking ${n} tasks from ${what} (${head}).`,
    found: (found: number, total: number) => `Jira: found ${found} of ${total}.`,
    lookupFailed: (e: string) => `Jira lookup: ${e}`,
    contextReading: (n: number, head: string) => `Jira: reading parent tasks, epics and linked issues (${n}): ${head}.`,
    contextDone: (got: number, want: number) => `Jira: context loaded for ${got} of ${want}. No hours are booked on them.`,
    contextFailed: (e: string) => `Jira: context (parents/epics): ${e}`,
    pagesReading: (n: number) => `Confluence: looking for pages related to ${n} tasks and their epics (description links and Jira web links)…`,
    pages: { one: "page", other: "pages" },
    pagesFound: (pages: string, tasks: number) => `Confluence: found ${pages} for ${tasks} tasks — used as context.`,
    pagesNone: "Confluence: these tasks have no related pages.",
    pagesFailed: (e: string) => `Confluence: related pages: ${e}`,
    dropped: (list: string) => `Skipped keys Jira did not return (no such task or no access): ${list}. That is fine — they are not counted.`,
  },

  days: {
    onlyCalls: (n: number) => `calls only: ${n}`,
    noEvents: "no events",
    offDay: (label: string, events: string) => `${label}: ${events} on a day off — no hours are booked.`,
    withEvents: (n: number, total: number) => `Days with events: ${n} of ${total}; without events: ${total - n} (they are filled at the end).`,
    dayEvents: (label: string, events: string, bySource: string, keyed: number) => `${label}: ${events} — ${bySource}; with a task key: ${keyed}.`,
    label: (date: string, weekday: string) => `${date} (${weekday})`,
  },

  alloc: {
    heuristicReasoning: (why: string, parts: string, unkeyed: number) =>
      `${why} Shares are based on the number and size of actions with a task key: ${parts}.` +
      (unkeyed ? ` ${unkeyed} more events without a task key are not counted.` : ""),
    aiOff: "AI analysis is off.",
    heuristic: (label: string, shares: string) => `${label}: heuristics → ${shares || "no events with a task key"}.`,
    noCandidates: (label: string) => `${label}: no candidate tasks — the AI was not called.`,
    noCandidatesWhy: "The AI was not used for this day.",
    noCandidatesNote: "no candidate tasks",
    asking: (label: string, n: number) => `${label}: → asking the AI (candidates: ${n})…`,
    aiError: (label: string, e: string) => `${label}: AI error — ${e}. Heuristics used.`,
    aiErrorWarning: (date: string, e: string) => `${date}: AI error (${e}), heuristics used.`,
    aiErrorWhy: "The AI did not answer.",
    aiErrorNote: "AI error",
    unparsed: (label: string, head: string) => `${label}: could not parse the AI answer — heuristics used. Answer starts with: ${head}`,
    unparsedWarning: (date: string) => `${date}: unclear AI answer, heuristics used.`,
    unparsedWhy: "The AI answer could not be parsed.",
    unparsedNote: "unclear AI answer",
    aiDone: (label: string, sec: string, shares: string, summary: string) => `${label}: AI in ${sec} s → ${shares}${summary ? ` — "${summary}"` : ""}`,
    aiNoTask: (label: string, sec: string, said: string, hasKeys: boolean) =>
      `${label}: in ${sec} s the AI found no matching task${said ? ` — "${said}"` : ""}.${hasKeys ? " Shares by task keys are used." : " The day will be filled according to the \"days without events\" mode."}`,
    aiNoTaskReason: "The AI found no matching task.",
    aiNoTaskNote: "AI: no matching task",
  },

  period: {
    modeName: { neighbors: "like neighbouring days", period: "across the whole period", none: "leave empty" },
    gaps: (n: number, mode: string) => `Days not linked to tasks: ${n}. Fill mode: "${mode}".`,
    notFilled: (list: string) => `Days not filled: ${list}.`,
    filledFrom: (date: string) => `filled from ${date}`,
    filledPeriod: "filled from the whole period",
    projects: (list: string) => `Hours by project: ${list}. A project that does not belong here can be marked "context only" in the Jira settings.`,
    projectHours: (project: string, hours: string) => `${project} (${hours} h)`,
    narrativeAsk: "Period summary: asking the AI to describe the whole picture…",
    narrativeOk: "Period summary received.",
    narrativeEmpty: "The AI returned an empty summary — the template is used.",
    narrativeError: (e: string) => `Period summary: AI error (${e}) — the template is used.`,
  },

  polish: {
    asking: (rows: number, batches: number) => `Worklog descriptions: the AI is rewriting ${rows} entries in one style (requests: ${batches})…`,
    done: (done: number, total: number) => `Worklog descriptions: ${done} of ${total} rewritten.`,
    unparsed: (head: string) => `Worklog descriptions: the AI answer could not be parsed, originals kept ("${head}…").`,
    error: (e: string) => `Worklog descriptions: AI error (${e}), originals kept.`,
  },

  calendar: {
    loaded: (country: string, source: string, offList: string[], shortList: string[], shortHours: string, saturdays: number) =>
      `Work calendar (${country}, ${source}): holidays and moved days off on weekdays: ${offList.length}${offList.length ? " — " + offList.join(", ") : ""}; ` +
      `shortened days: ${shortList.length}${shortList.length ? " — " + shortList.join(", ") + ` (${shortHours} h each)` : ""}; working Saturdays: ${saturdays}.`,
    failed: (e: string) => `Work calendar not loaded (${e}) — holidays are ignored, only weekdays are used.`,
    warning: (e: string) => `Holidays ignored: ${e}`,
  },

  plan: {
    filler: {
      analysis: [
        "Task analysis and studying the context",
        "Working through requirements, clarifying details",
        "Studying related tasks and documentation",
        "Analysing the existing solution, preparing the approach",
        "Discussing implementation details, shaping the solution",
        "Planning the work on the task",
      ],
      dev: [
        "Implementation and debugging",
        "Refining the solution, checking it locally",
        "Refactoring and preparing changes for the task",
        "Debugging and checking edge cases",
        "Discussing implementation details with the team",
      ],
      qa: [
        "Testing, verifying the result",
        "QA support: answering questions on the task",
        "Fixing environment and test stand issues during testing",
        "Checking on the test stand, going through test results",
        "Preparing for release, verifying the result",
        "Analysing and fixing infrastructure issues during testing",
      ],
    },
    fillerWithin: (parent: string) => `Working on the task as part of "${parent}"`,
    phase: { analysis: "analysis", dev: "development", qa: "after development (testing, QA support)" },
    taskHours: (key: string, hours: number) => `${key} (${hours} h)`,
    whyUnmatched: (reasoning: string) => `The events of this day could not be linked to any task that gets hours.${reasoning ? ` ${reasoning}` : ""}`,
    whyMeetingsOnly: "This day had only calls and meetings — they do not tell which task it was.",
    whyNothing: "This day has no Jira actions, commits or messages.",
    empty: (why: string, noDataAtAll: boolean) => `${why} The day is left empty${noDataAtAll ? ": the whole period has no data to distribute" : " according to the selected mode"}.`,
    byPeriod: (why: string, tasks: string) => `${why} Hours are split in proportion to the tasks of the whole period: ${tasks}.`,
    byNeighbor: (why: string, earlier: boolean, date: string, tasks: string, phases: string) =>
      `${why} Taken from the ${earlier ? "previous" : "next"} day with activity — ${date}: ${tasks}. The description is generic, by task stage (${phases}): this day left no traces of work.`,
    noNeighbors: (why: string, tasks: string) => `${why} No suitable neighbouring days — hours are split across the tasks of the whole period: ${tasks}.`,
  },

  report: {
    call: " (call)",
    narrativeNoData: (start: string, end: string) => `For ${start} – ${end} no hours could be distributed: there is no data.`,
    narrativeTop: (key: string, summary: string, hours: string, days: number) => `${key}${summary ? ` "${summary}"` : ""} — ${hours} h (${days} d)`,
    narrative: (start: string, end: string, hours: string, tasks: number, workdays: number, top: string, inferred: string) =>
      `For ${start} – ${end}, ${hours} h were distributed across ${tasks} tasks over ${workdays} working days. ` +
      `Most of the time went to: ${top}.` +
      (inferred ? ` Days without data (${inferred}) were filled from neighbouring days or the whole period — please check them.` : ""),
    csvTasks: ["Date", "Task", "Title", "Hours", "Notes", "Link"],
    csvDays: ["Date", "Hours", "Description", "Calls and meetings"],
    dayOff: "Day off / vacation",
    md: {
      title: (start: string, end: string) => `# Time report ${start} – ${end}`,
      total: (total: string, target: string) => `Total: **${total} h** of ${target} h`,
      byTask: "## By task",
      tableHead: "| Task | Title | Hours | Days |",
      byWeek: "## By week",
      week: (from: string, to: string, hours: string) => `### ${from} – ${to}: ${hours} h`,
      day: (weekday: string, date: string, hours: string, off: boolean) => `- **${weekday} ${date}** — ${hours} h${off ? " (day off)" : ""}`,
      task: (key: string, summary: string, hours: string) => `  - ${key} ${summary}: ${hours} h`,
      meetings: (total: string, list: string) => `  - 📞 Calls and meetings (${total}): ${list}`,
    },
    dayTextHead: (date: string, hours: string) => `${date} — ${hours} h`,
    dayTextTask: (key: string, summary: string, hours: string, link: string) => `${key} ${summary}: ${hours} h${link ? " " + link : ""}`,
    dayTextMeetings: (total: string, list: string) => `Calls and meetings (${total}): ${list}`,
  },

  submit: {
    line: (key: string, title: string, hours: string, said: string) => `• ${key} ${title} — ${hours} h${said ? `: ${said}` : ""}`,
    meetings: (total: string) => `Calls and meetings: ${total}.`,
  },

  prompt: {
    day: `You are an assistant for tracking a developer's working time.
You get the events of ONE working day (Jira actions, git commits, chat messages) and a list of candidate Jira tasks.
Work out which tasks the person worked on that day and in what relative shares of effort.

Return ONLY JSON, with no explanations and no markdown:
{"tasks":[{"key":"ABC-1","weight":0.6,"note":"what exactly was done, up to 100 characters"}],"summary":"1-2 short sentences about what the person did that day (for the report)","reasoning":"2-4 plain-language sentences: which events (commits, status changes, comments, messages, pages) decided the choice of tasks and why the shares are like this; say separately what was assigned by meaning and what is unclear"}

Rules:
- Use only keys from the candidate list.
- weight is a relative share of effort (the numbers do not have to add up to 1). More commits, discussions and status changes on a task mean a bigger weight.
- Assign events without a key (commits, chat messages) to the best-matching task by meaning. If you are not sure, ignore them.
- Events with src=calendar are meetings and calls from the calendar (time and duration in ctx). Use them as context: a meeting topic may point to a task. Their time is already part of the working day, do not subtract it.
- Count chat messages (src=matrix) only if they are about work: discussing tasks, code, bugs, releases, decisions, approvals. Ignore greetings, everyday and personal topics and small talk.
- Candidates may have description, parent, epic and linked — the parent task, the epic and linked issues. Use them to understand commits and messages without a key.
- pages are Confluence pages related to the task, its parent or its epic (title, beginning of the text, child pages). They describe the subject of the work, they are not events of the day.
- Match events by time: a chat message, call or comment close in time to commits on the same topic belongs to the same task.
- Events with src=gitlab are merge request work in GitLab: creating, merging, approving and review comments. Reviewing someone else's MR is working time too; assign it to the task from the MR title, branch or description (they are in text and ctx). If there is no key, find the task by meaning or ignore it.
- Tasks in contextOnly are context only: do NOT include them in tasks (no time is booked on them), but use them to understand what the person was doing.
- If no candidate task fits, return an empty tasks list and explain in reasoning what was done.
- note is what exactly was done on the task: the action and the subject of the work, with the result where possible ("Added TIN validation to the taxpayer registry import"). No technical noise: do not mention links, Confluence, MR or commit numbers, technical parameters or identifiers (criteria=8, id), or formal actions ("approved", "commented", "changed status"). A review checks specific changes: say which. A discussion: say what was discussed and what was agreed.
- Do not invent work that is not in the events. Write in English; note and summary in a businesslike style, like a report entry.
- Do not try to fit the weights to the length of the working day.`,
    notes: `You edit work descriptions for time tracking (Jira Tempo).
You get entries in items: id, date, task (key, task — its title), a draft description (draft) and the day's facts on that task (facts: commits, Jira actions, merge requests, messages, meetings).
Rewrite each description so that a manager reading the worklog understands what exactly was done.

Rules:
- One sentence, up to 120 characters, businesslike English. Start with a past-tense verb (Implemented, Fixed, Extended, Reviewed, Investigated, Agreed…), the same way in all entries.
- Be concrete: what exactly was done and to what (module, service, report, scenario, data), with the result where possible.
- Remove noise: sources (Confluence, links, pages), MR and commit numbers, hashes, technical parameters and identifiers (criteria=8, id=…), formal actions ("approved", "commented", "changed status", "updated the task").
- Describe a review by the substance of the reviewed changes ("Reviewed changes to the resolution template for the new selection criterion"), a discussion by its subject and outcome.
- Do not repeat the task title verbatim and do not start with the task key.
- If different work was done on a task on different days, the descriptions must differ.
- Use only facts from the input, invent nothing. If there are few facts, describe what is known for sure.

Return ONLY JSON, no markdown: {"items":[{"id":"…","text":"…"}]} — one entry per id.`,
    narrative: `You are an assistant for tracking working time.
You get the results of a period: total hours per task and short descriptions of the days.
Write a coherent summary for the employee in plain businesslike English, 5-9 sentences, no markdown and no lists:
what the work was mainly about, how the time was distributed, which tasks took the most, whether some days were filled without data (basis = inferred).
Do not invent anything that is not in the input.
Return ONLY JSON: {"text":"..."}`,
    week: `You are an assistant for tracking working time.
You get the tasks of a week with hours and descriptions of the days. Write a short weekly report for the employee, 2-4 sentences, in plain businesslike English, no markdown and no lists: what they worked on and what was done.
Mention task keys. Do not invent anything that is not in the input.
Return ONLY JSON: {"text":"..."}`,
  },

  demo: {
    issues: {
      "PAY-101": "Payment gateway integration",
      "PAY-117": "Rounding error in receipts",
      "OPS-42": "Update the CI pipeline",
      "PAY-130": "Refactor the refunds module",
    },
    noteApi: "Implemented the gateway API call",
    noteCache: "Fixed the pipeline cache",
    summary: "Worked on the payments integration and supported CI.",
    reasoning: "That day had status changes on PAY-101, three commits in the integration branch and a comment on OPS-42, so most of the time goes to PAY-101 and the rest to the CI task.",
    commit: "[payments] PAY-101 gateway API call (+84/-12, files: 3)",
    comment: "Comment: fixed the pipeline cache",
    lead: "Team lead",
    architect: "Architect",
    archMeeting: "PAY-130 architecture discussion",
    room: "Meeting room 5",
    narrative: "This is a demo report. In a real report the AI describes here what the work in the period was about, which tasks took the most time and which days had to be filled without data.",
    log: "Demo data: the log of a real analysis appears after a run.",
    warning: "Demo data: this is not your real activity.",
  },
};

export default en;
