mod browser;
mod commands;
mod error;
mod texts;
mod http;
mod model;
mod secrets;
mod settings;
mod sources;
mod store;
mod util;

// The updater plugin must stay a regular dependency: capabilities/default.json grants `updater:default`,
// which tauri-build validates in every build. It is only started with the `updater` feature.
#[cfg(not(feature = "updater"))]
use tauri_plugin_updater as _;

use commands::{atlassian, calendar, calls, code, connection, llm, matrix, notify, people, settings as config};

/// The local cache lives next to the settings but in the machine-local folder (it is not worth roaming).
fn open_store(app: &tauri::AppHandle) -> Result<store::Store, Box<dyn std::error::Error>> {
    let dir = tauri::Manager::path(app).app_local_data_dir()?;
    std::fs::create_dir_all(&dir)?;
    let store = store::Store::open(&dir.join("worklog.db")).map_err(|e| e.detail())?;
    // Old rows go at every start; a failure here only means the file stays a bit larger.
    let _ = store.with(store::fresh::purge);
    let _ = store.with(|c| store::calls::purge(c, store::now_ms()));
    Ok(store)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_dialog::init()).plugin(tauri_plugin_notification::init());
    #[cfg(feature = "updater")]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    builder
        .setup(|app| {
            // The window starts hidden so no blank frame shows before the page; the page shows it once the
            // loader is painted. Should the page fail to, show it anyway after a moment.
            let store = open_store(app.handle())?;
            tauri::Manager::manage(app, store);
            calls::spawn_tracker(app.handle().clone());
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
            config::clear_cache,
            config::roster_load,
            config::roster_save,
            config::secrets_status,
            connection::test_connection,
            atlassian::fetch_jira,
            atlassian::open_issue,
            atlassian::lookup_issues,
            atlassian::jira_worklogs,
            atlassian::jira_dashboard,
            atlassian::jira_issue_detail,
            atlassian::jira_descendants,
            atlassian::open_link,
            atlassian::jira_add_worklog,
            atlassian::jira_update_worklog,
            atlassian::jira_delete_worklog,
            atlassian::jira_transitions,
            atlassian::jira_transition,
            atlassian::fetch_confluence,
            atlassian::fetch_issue_pages,
            atlassian::analysis_pages,
            code::fetch_git,
            code::scan_git_repos,
            code::task_git,
            code::task_doc,
            notify::notify,
            code::task_mrs,
            code::gitlab_links,
            code::task_remote_doc,
            code::fetch_gitlab,
            code::gitlab_mr_board,
            code::gitlab_mr_detail,
            calendar::fetch_calendar,
            calendar::fetch_holidays,
            matrix::fetch_matrix,
            matrix::list_matrix_rooms,
            matrix::matrix_login_sso,
            matrix::matrix_login_password,
            calls::calls_list,
            calls::calls_set_hidden,
            people::search_people,
            people::my_accounts,
            llm::llm_chat
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
