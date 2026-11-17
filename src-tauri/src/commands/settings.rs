use crate::secrets;
use crate::settings::{self, Settings};
use std::collections::HashMap;
use crate::error::{AppError, AppResult};

#[tauri::command]
pub fn load_settings(app: tauri::AppHandle) -> AppResult<Settings> {
    settings::load(&app)
}

#[tauri::command]
pub fn save_settings(app: tauri::AppHandle, settings: Settings) -> AppResult<()> {
    settings::save(&app, &settings)
}

/// An empty value removes the secret.
#[tauri::command]
pub fn set_secret(name: String, value: String) -> AppResult<()> {
    if !secrets::is_known(&name) {
        return Err(AppError::new("unknownSecret").with("secret", name));
    }
    secrets::set(&name, &value)
}

/// Which secrets are present, without revealing them.
#[tauri::command]
pub fn secrets_status() -> HashMap<String, bool> {
    secrets::ALL.iter().map(|s| (s.name.to_string(), secrets::get(s.name).is_some())).collect()
}
