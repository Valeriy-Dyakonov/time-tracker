//! Tauri commands, grouped by area. Names, arguments and returned JSON are the frontend contract (src/api.ts).
pub mod atlassian;
pub mod calendar;
pub mod calls;
pub mod code;
pub mod connection;
pub mod llm;
pub mod matrix;
pub mod people;
pub mod settings;

use crate::settings::Settings;
use crate::util;
use crate::error::AppResult;

/// What every command needs: the saved settings and an HTTP client built from them.
pub struct Ctx {
    pub settings: Settings,
    pub client: reqwest::Client,
}

impl Ctx {
    pub fn load(app: &tauri::AppHandle) -> AppResult<Self> {
        let settings = crate::settings::load(app)?;
        let client = util::client(settings.accept_invalid_certs)?;
        Ok(Self { settings, client })
    }
}
