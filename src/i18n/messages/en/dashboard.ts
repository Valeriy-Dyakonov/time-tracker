import type ru from "../ru/dashboard";

const dashboard: typeof ru = {
  stats: {
    open: "Open",
    openTip: "Your unresolved tasks (you are the assignee)",
    inProgress: "In progress",
    inProgressTip: "Statuses in the \"in progress\" category: development, review, testing and so on",
    overdue: "Overdue",
    overdueTip: "Unresolved tasks with a due date before today",
    done: (days: number) => `Closed in ${days} days`,
    doneTip: "Tasks resolved over the last days",
  },
  columns: {
    new: "To do",
    indeterminate: "In progress",
    done: (days: number) => `Closed in ${days} days`,
  },
  allProjects: "All projects",
  search: "Search by key or title",
  refresh: "Refresh",
  loading: "Loading tasks from Jira…",
  updatedAt: (time: string) => `Updated at ${time}`,
  failed: (e: string) => `Could not load tasks: ${e}`,
  empty: "No tasks",
  nothing: "No tasks match the filter.",
  overdue: (date: string) => `due ${date}`,
  due: (date: string) => `by ${date}`,
  ago: {
    now: "just now",
    min: (n: number) => `${n} min ago`,
    hours: (n: number) => `${n} h ago`,
    days: (n: number) => `${n} d ago`,
  },
  updatedTitle: "When the task last changed in Jira",
  needsJira: "The dashboard needs Jira: set its address and token in the settings.",
  openSettings: "Open settings",
};

export default dashboard;
