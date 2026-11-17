//! Meetings from Exchange and the production calendar.
use super::Ctx;
use crate::secrets::{self, require};
use crate::sources::{calendar, holidays};
use crate::util::range_ms;
use crate::texts::Lang;
use crate::error::AppResult;

#[tauri::command]
pub async fn fetch_calendar(app: tauri::AppHandle, start: String, end: String, lang: Option<String>) -> AppResult<Vec<calendar::Meeting>> {
    let c = Ctx::load(&app)?;
    let s = &c.settings;
    let (a, b) = range_ms(&start, &end)?;
    let password = require(&secrets::EXCHANGE)?;
    calendar::fetch(&c.client, &s.exchange_url, &s.exchange_user, &password, (a, b), s.calendar_only_calls, Lang::parse(lang.as_deref())).await
}

#[tauri::command]
pub async fn fetch_holidays(app: tauri::AppHandle, country: String, start: String, end: String, lang: Option<String>) -> AppResult<holidays::HolidayOut> {
    let c = Ctx::load(&app)?;
    holidays::fetch(&c.client, &country, &start, &end, Lang::parse(lang.as_deref())).await
}
