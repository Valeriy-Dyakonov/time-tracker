use crate::secrets;
use crate::settings::{self, Settings};
use std::collections::HashMap;

#[tauri::command]
pub fn load_settings(app: tauri::AppHandle) -> Result<Settings, String> {
    settings::load(&app)
}

#[tauri::command]
pub fn save_settings(app: tauri::AppHandle, settings: Settings) -> Result<(), String> {
    settings::save(&app, &settings)
}

/// An empty value removes the secret.
#[tauri::command]
pub fn set_secret(name: String, value: String) -> Result<(), String> {
    if !secrets::is_known(&name) {
        return Err("unknown secret".into());
    }
    secrets::set(&name, &value)
}

/// Which secrets are present, without revealing them.
#[tauri::command]
pub fn secrets_status() -> HashMap<String, bool> {
    secrets::ALL.iter().map(|s| (s.name.to_string(), secrets::get(s.name).is_some())).collect()
}
