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

/// Writes an export file to the place the user picked in the save dialog; only the formats the app exports.
#[tauri::command]
pub fn save_export(path: String, content: String) -> AppResult<()> {
    let ext = std::path::Path::new(&path).extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    if !["json", "csv", "md"].contains(&ext.as_str()) {
        return Err(AppError::raw(format!("unsupported file type: {path}")));
    }
    std::fs::write(&path, content).map_err(AppError::raw)
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
