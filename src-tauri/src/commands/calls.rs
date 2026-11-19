//! Calls seen on this computer: the background check and the list for the UI.
use crate::error::AppResult;
use crate::settings;
use crate::sources::calls;
use crate::store::{calls as saved, now_ms, Store};
use tauri::Manager;

const CHECK_EVERY: std::time::Duration = std::time::Duration::from_secs(30);

/// Starts the check that runs while the app is open; it does nothing unless the user turned it on.
pub fn spawn_tracker(app: tauri::AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(CHECK_EVERY);
        check(&app);
    });
}

fn check(app: &tauri::AppHandle) {
    let Ok(s) = settings::load(app) else { return };
    if !s.track_calls {
        return;
    }
    let seen = calls::detect(&s.call_apps);
    if seen.is_empty() {
        return;
    }
    let _ = app.state::<Store>().with(|c| saved::record(c, &seen, now_ms()));
}

/// Calls that began in `[from, to)` (epoch ms), oldest first. `with_hidden` also returns the ones marked as not work.
#[tauri::command]
pub fn calls_list(store: tauri::State<'_, Store>, from: i64, to: i64, with_hidden: bool) -> AppResult<Vec<saved::Call>> {
    store.with(|c| saved::between(c, from, to, with_hidden))
}

/// The user says a call was not work (or changes their mind): it leaves the hours or comes back.
#[tauri::command]
pub fn calls_set_hidden(store: tauri::State<'_, Store>, id: i64, hidden: bool) -> AppResult<()> {
    store.with(|c| saved::set_hidden(c, id, hidden))
}
