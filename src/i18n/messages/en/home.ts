import type ru from "../ru/home";

const home: typeof ru = {
  title: "Workspace",
  intro: "Pick a tool. Connection settings are shared by all of them.",
  products: {
    worklog: {
      name: "Worklog Tracker",
      desc: "Collects a period's activity from Jira, git, chat and calendar and splits the hours by task for Tempo and your own system.",
      points: ["Hours per day and task, explained by AI", "Logging to Tempo, checked against Jira", "Weekly text for your own system"],
    },
    dashboard: {
      name: "Work Dashboard",
      desc: "Your Jira tasks on one board: in progress, in review, in testing and on the way to release.",
      points: ["Developer, QA and lead profiles", "Tasks grouped under their epics", "Read a task right in the app"],
    },
    mrs: {
      name: "MR board",
      desc: "GitLab merge requests: what waits for your review, what waits for approval - yours and the team's - and where there are comments.",
      points: ["Waiting for your review, and your own", "The team's MRs from the roster, even when you are not a reviewer", "Approvals, discussions, ready to merge"],
    },
    team: {
      name: "Team",
      desc: "Who is in which department and team: leads, QA and each person's Jira, GitLab and Matrix accounts.",
      points: ["Hierarchy: department, team, sub-team", "Roles: lead, developer, QA", "Accounts are attached to a person"],
    },
  },
  needsJira: "Needs Jira: set up the connection",
  open: "Open",
  home: "Home",
  back: (to: string) => `Back: ${to}`,
};

export default home;
