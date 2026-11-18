mod browser;
mod commands;
mod error;
mod texts;
mod http;
mod model;
mod secrets;
mod settings;
mod sources;
mod util;

// The updater plugin must stay a regular dependency: capabilities/default.json grants `updater:default`,
// which tauri-build validates in every build. It is only started with the `updater` feature.
#[cfg(not(feature = "updater"))]
use tauri_plugin_updater as _;

use commands::{atlassian, calendar, code, connection, llm, matrix, settings as config};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(feature = "updater")]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    builder
        .invoke_handler(tauri::generate_handler![
            config::load_settings,
            config::save_settings,
            config::set_secret,
            config::secrets_status,
            connection::test_connection,
            atlassian::fetch_jira,
            atlassian::open_issue,
            atlassian::lookup_issues,
            atlassian::jira_worklogs,
            atlassian::jira_add_worklog,
            atlassian::jira_update_worklog,
            atlassian::jira_delete_worklog,
            atlassian::fetch_confluence,
            atlassian::fetch_issue_pages,
            code::fetch_git,
            code::scan_git_repos,
            code::fetch_gitlab,
            calendar::fetch_calendar,
            calendar::fetch_holidays,
            matrix::fetch_matrix,
            matrix::list_matrix_rooms,
            matrix::matrix_login_sso,
            matrix::matrix_login_password,
            llm::llm_chat
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
