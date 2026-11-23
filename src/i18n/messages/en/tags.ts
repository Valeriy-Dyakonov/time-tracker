import type ru from "../ru/tags";

const tags: typeof ru = {
  needGitlab: "GitLab is required: its address and a token with the read_api scope.",
  openSettings: "Open settings",
  placeholder: "Part of a tag name, e.g. 1.4 or release",
  search: "Search",
  searching: "Searching…",
  searchTip: "Finds tags whose name contains this text. ^text - the name starts with it, text$ - ends with it. Services are the GitLab projects of the selected local repositories (settings, git section).",
  noRepos: "None of the selected local repositories points to this GitLab. Choose repositories in the settings.",
  failed: (why: string) => `Could not search tags: ${why}`,
  summary: (found: number, services: number) => `Tags found in ${found} of ${services} services`,
  progress: (done: number, total: number) => `Checked ${done} of ${total} services…`,
  nothing: "No service has a tag with this name.",
  readFailed: (why: string) => `Could not read: ${why}`,
  latest: "Latest",
  unknownDate: "date unknown",
  branchesTip: "Git does not record the branch a tag was made on. These are the branches that contain the tagged commit, the main one first.",
  noBranches: "branch not found",
  copyTag: "Copy the tag",
  copyAll: "Copy the list",
  copyAllTip: "Lines \"service - branch - tag\" for all found tags",
  openTag: "Open the tag in GitLab",
  openProject: "Open the project in GitLab",
};

export default tags;
