use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub jira_url: String,
    /// Jira project keys used only as context for the AI: no hours are assigned to them.
    pub context_projects: Vec<String>,
    /// Work Dashboard role: "dev", "qa" or "lead" (whose tasks are loaded and which statuses come first).
    pub dashboard_profile: String,
    pub llm_base_url: String,
    pub llm_model: String,
    /// Requests to the AI per minute; 0 = no limit. Corporate gateways reject bursts with 429.
    pub llm_rpm: u32,
    pub confluence_url: String,
    pub gitlab_url: String,
    /// Production calendar country (ru, by, kz, ua, uz, us); empty = weekdays only.
    pub holiday_country: String,
    /// Shorten pre-holiday days by one hour.
    pub short_days: bool,
    /// Read merge requests only from projects of the selected local repositories (matched by `origin`).
    pub gitlab_local_only: bool,
    /// Exchange (OWA) address; the EWS path is appended automatically.
    pub exchange_url: String,
    pub exchange_user: String,
    /// Keep only meetings that look like calls (Teams/Zoom/... or a call keyword in title/location).
    pub calendar_only_calls: bool,
    /// Task that gets the time of calls not tied to any task (dailies, hand-overs); empty = such calls get no hours.
    pub calls_task_key: String,
    /// Note calls on this computer (a program holding the microphone); off until the user turns it on.
    pub track_calls: bool,
    /// Programs counted as calls, by a part of their name (zoom, teams, telegram...).
    pub call_apps: Vec<String>,
    pub matrix_homeserver: String,
    pub matrix_user_id: String,
    /// Room IDs that are never read; all other joined rooms are analysed.
    pub matrix_exclude_rooms: Vec<String>,
    /// Folder with many repositories, used by the repo picker.
    pub git_root: String,
    pub git_repos: Vec<String>,
    /// Author name/email patterns. Empty = `git config user.email` of each repo.
    pub git_authors: Vec<String>,
    /// Show markdown notes kept per task in the repositories (a team convention, off by default).
    pub ai_docs_enabled: bool,
    /// Where those notes live; `{key}` is the task key.
    pub ai_docs_paths: Vec<String>,
    /// Remind to log the time in the evening (the app must be open).
    pub remind_enabled: bool,
    /// Local time of the reminder, "HH:MM".
    pub remind_time: String,
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
            dashboard_profile: "dev".into(),
            llm_base_url: String::new(),
            llm_model: String::new(),
            llm_rpm: 30,
            confluence_url: String::new(),
            gitlab_url: String::new(),
            holiday_country: "ru".into(),
            short_days: true,
            gitlab_local_only: true,
            exchange_url: String::new(),
            exchange_user: String::new(),
            calendar_only_calls: false,
            calls_task_key: String::new(),
            track_calls: false,
            call_apps: crate::sources::calls::default_apps(),
            matrix_homeserver: String::new(),
            matrix_user_id: String::new(),
            matrix_exclude_rooms: vec![],
            git_root: String::new(),
            git_repos: vec![],
            git_authors: vec![],
            ai_docs_enabled: false,
            ai_docs_paths: vec!["docs/ai/{key}".into(), "ai/{key}".into()],
            remind_enabled: false,
            remind_time: "18:00".into(),
            hours_per_day: 8.0,
            workdays: vec![1, 2, 3, 4, 5],
            accept_invalid_certs: false,
        }
    }
}

fn path(app: &tauri::AppHandle) -> AppResult<PathBuf> {
    let dir = app.path().app_config_dir().map_err(AppError::raw)?;
    fs::create_dir_all(&dir).map_err(AppError::raw)?;
    Ok(dir.join("settings.json"))
}

pub fn load(app: &tauri::AppHandle) -> AppResult<Settings> {
    let p = path(app)?;
    if !p.exists() {
        return Ok(Settings::default());
    }
    let s = fs::read_to_string(p).map_err(AppError::raw)?;
    serde_json::from_str(&s).map_err(AppError::raw)
}

pub fn save(app: &tauri::AppHandle, settings: &Settings) -> AppResult<()> {
    let json = serde_json::to_string_pretty(settings).map_err(AppError::raw)?;
    fs::write(path(app)?, json).map_err(AppError::raw)
}
