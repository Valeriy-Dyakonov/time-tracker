use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub jira_url: String,
    /// Jira project keys (e.g. "OPS") used only as context for AI: no hours are assigned to them.
    pub context_projects: Vec<String>,
    pub llm_base_url: String,
    pub llm_model: String,
    pub confluence_url: String,
    pub gitlab_url: String,
    /// Read merge requests only from projects of the locally selected repositories (matched by `origin`).
    pub gitlab_local_only: bool,
    /// Exchange (OWA) address, e.g. https://mail.company.ru — EWS path is appended automatically.
    pub exchange_url: String,
    pub exchange_user: String,
    /// Keep only meetings that look like calls (Teams/Zoom/... or "созвон" in title/location).
    pub calendar_only_calls: bool,
    pub matrix_homeserver: String,
    pub matrix_user_id: String,
    /// Room IDs to read. Empty = all joined rooms.
    /// Room IDs that are never read (private chats, off-topic channels). All other joined rooms are analysed.
    pub matrix_exclude_rooms: Vec<String>,
    /// Folder that contains many repositories (used by the repo picker).
    pub git_root: String,
    pub git_repos: Vec<String>,
    /// Author name/email patterns. Empty = `git config user.email` of each repo.
    pub git_authors: Vec<String>,
    pub hours_per_day: f64,
    /// 1 = Monday ... 7 = Sunday
    pub workdays: Vec<u8>,
    pub accept_invalid_certs: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            jira_url: String::new(),
            context_projects: vec![],
            llm_base_url: String::new(),
            llm_model: String::new(),
            confluence_url: String::new(),
            gitlab_url: String::new(),
            gitlab_local_only: true,
            exchange_url: String::new(),
            exchange_user: String::new(),
            calendar_only_calls: false,
            matrix_homeserver: String::new(),
            matrix_user_id: String::new(),
            matrix_exclude_rooms: vec![],
            git_root: String::new(),
            git_repos: vec![],
            git_authors: vec![],
            hours_per_day: 8.0,
            workdays: vec![1, 2, 3, 4, 5],
            accept_invalid_certs: false,
        }
    }
}

/// A single piece of evidence about what the user was doing.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    /// "jira" | "git" | "matrix"
    pub source: String,
    /// Unix epoch milliseconds.
    pub ts: i64,
    pub issue_key: Option<String>,
    pub text: String,
    /// Extra context used for issue-key detection (e.g. git branch, matrix room).
    pub context: Option<String>,
    /// Rough size of the work: changed lines for git, 1 otherwise.
    pub weight: f64,
}

/// One status change from the issue history (by anyone: QA moving a task to "Testing" matters too).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusChange {
    pub ts: i64,
    pub from: String,
    pub to: String,
    pub by_me: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IssueInfo {
    pub key: String,
    pub summary: String,
    pub status: String,
    pub issue_type: String,
    /// Start of the description (context for AI).
    #[serde(default)]
    pub description: String,
    /// Parent issue (sub-task parent) and epic: read as context, never get hours by themselves.
    #[serde(default)]
    pub parent: Option<String>,
    #[serde(default)]
    pub epic: Option<String>,
    /// Keys of linked issues.
    #[serde(default)]
    pub links: Vec<String>,
    /// Links found in the description (used to find related Confluence pages).
    #[serde(default)]
    pub urls: Vec<String>,
    /// Status history (all authors), oldest first. Only for tasks loaded by the period search.
    #[serde(default)]
    pub transitions: Vec<StatusChange>,
    /// Creation / resolution time, ms since epoch: a task cannot be worked on before it exists or after it was resolved.
    #[serde(default)]
    pub created: Option<i64>,
    #[serde(default)]
    pub resolved: Option<i64>,
}
