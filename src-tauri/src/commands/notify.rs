//! A system notification. The reminder itself is timed in the frontend (it knows the language, the work calendar and
//! what is already logged); this only shows the message.
use crate::error::{AppError, AppResult};
use tauri_plugin_notification::NotificationExt;

/// Titles and bodies come from the app's own texts; kept short so the OS does not cut them.
const MAX_CHARS: usize = 200;

#[tauri::command]
pub fn notify(app: tauri::AppHandle, title: String, body: String) -> AppResult<()> {
    let n = app.notification();
    // macOS asks once; elsewhere the state is already "granted".
    if !matches!(n.permission_state(), Ok(tauri_plugin_notification::PermissionState::Granted)) {
        let _ = n.request_permission();
    }
    n.builder()
        .title(title.chars().take(MAX_CHARS).collect::<String>())
        .body(body.chars().take(MAX_CHARS).collect::<String>())
        .show()
        .map_err(AppError::raw)
}
