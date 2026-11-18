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
  },
  needsJira: "Needs Jira: set up the connection",
  open: "Open",
  home: "Home",
  back: (to: string) => `Back: ${to}`,
};

export default home;
