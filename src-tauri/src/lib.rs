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
    let builder = tauri::Builder::default().plugin(tauri_plugin_dialog::init());
    #[cfg(feature = "updater")]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    builder
        .setup(|app| {
            // The window starts hidden so no blank frame shows before the page; the page shows it once the
            // loader is painted. Should the page fail to, show it anyway after a moment.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(3));
                if let Some(w) = tauri::Manager::get_webview_window(&handle, "main") {
                    let _ = w.show();
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            config::load_settings,
            config::save_settings,
            config::set_secret,
            config::save_export,
            config::secrets_status,
            connection::test_connection,
            atlassian::fetch_jira,
            atlassian::open_issue,
            atlassian::lookup_issues,
            atlassian::jira_worklogs,
            atlassian::jira_dashboard,
            atlassian::jira_issue_detail,
            atlassian::open_link,
            atlassian::jira_add_worklog,
            atlassian::jira_update_worklog,
            atlassian::jira_delete_worklog,
            atlassian::fetch_confluence,
            atlassian::fetch_issue_pages,
            atlassian::analysis_pages,
            code::fetch_git,
            code::scan_git_repos,
            code::task_git,
            code::task_doc,
            code::task_mrs,
            code::gitlab_links,
            code::task_remote_doc,
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
