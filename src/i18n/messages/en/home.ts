import type ru from "../ru/home";

const home: typeof ru = {
  title: "Workspace",
  intro: "Pick a tool. Connection settings are shared by all of them.",
  products: {
    worklog: {
      name: "Worklog Tracker",
      desc: "Collects a period's activity from Jira, git, chat and calendar and splits the hours by task for Tempo and your own system.",
    },
    dashboard: {
      name: "Work Dashboard",
      desc: "Your Jira tasks by status: what is in progress, what is waiting, what is overdue and what was just closed.",
    },
  },
  needsJira: "Needs Jira: set up the connection",
  open: "Open",
  home: "Home",
  back: (to: string) => `Back: ${to}`,
};

export default home;
