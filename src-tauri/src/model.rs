use serde::{Deserialize, Serialize};

/// A single piece of evidence about what the user was doing.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub source: String,
    /// Unix epoch milliseconds.
    pub ts: i64,
    pub issue_key: Option<String>,
    pub text: String,
    /// Extra text searched for issue keys (git branch, chat room, MR description).
    pub context: Option<String>,
    /// Rough size of the work: changed lines for git, 1 otherwise.
    pub weight: f64,
    /// Who a chat message was addressed to (mentions, reply target or the other person in a DM).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub to: Option<String>,
}

impl Event {
    pub fn new(source: &str, ts: i64, text: String) -> Self {
        Self { source: source.into(), ts, issue_key: None, text, context: None, weight: 1.0, to: None }
    }
}

/// One status change from the issue history, by anyone: QA moving a task to "Testing" matters too.
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
    #[serde(default)]
    pub description: String,
    /// Parent and epic are context only: they never get hours by themselves.
    #[serde(default)]
    pub parent: Option<String>,
    #[serde(default)]
    pub epic: Option<String>,
    #[serde(default)]
    pub links: Vec<String>,
    /// Links from the description, used to find related Confluence pages.
    #[serde(default)]
    pub urls: Vec<String>,
    /// Oldest first. Only filled for tasks loaded by the period search.
    #[serde(default)]
    pub transitions: Vec<StatusChange>,
    /// A task cannot be worked on before it exists or after it was resolved.
    #[serde(default)]
    pub created: Option<i64>,
    #[serde(default)]
    pub resolved: Option<i64>,
}
