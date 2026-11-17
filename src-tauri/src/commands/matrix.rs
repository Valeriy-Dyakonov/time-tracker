use super::Ctx;
use crate::model::Event;
use crate::secrets::{self, require};
use crate::sources::matrix::{self, login};
use crate::util::range_ms;
use crate::texts::Lang;
use crate::error::AppResult;

#[tauri::command]
pub async fn fetch_matrix(app: tauri::AppHandle, start: String, end: String, lang: Option<String>) -> AppResult<Vec<Event>> {
    let c = Ctx::load(&app)?;
    let s = &c.settings;
    let (a, b) = range_ms(&start, &end)?;
    let token = require(&secrets::MATRIX)?;
    matrix::fetch(&c.client, &s.matrix_homeserver, &token, &s.matrix_user_id, &s.matrix_exclude_rooms, (a, b), Lang::parse(lang.as_deref())).await
}

#[tauri::command]
pub async fn list_matrix_rooms(app: tauri::AppHandle, lang: Option<String>) -> AppResult<Vec<matrix::Room>> {
    let c = Ctx::load(&app)?;
    matrix::list_rooms(&c.client, &c.settings.matrix_homeserver, &require(&secrets::MATRIX)?, Lang::parse(lang.as_deref())).await
}

/// Saves the new token and fills in the user ID when it changed.
fn store_login(app: &tauri::AppHandle, l: login::Login) -> AppResult<String> {
    secrets::set(secrets::MATRIX.name, &l.access_token)?;
    let mut s = crate::settings::load(app)?;
    if !l.user_id.is_empty() && s.matrix_user_id != l.user_id {
        s.matrix_user_id = l.user_id.clone();
        crate::settings::save(app, &s)?;
    }
    Ok(l.user_id)
}

/// Opens the browser for SSO and waits up to 4 minutes for the login to finish.
#[tauri::command]
pub async fn matrix_login_sso(app: tauri::AppHandle, lang: Option<String>) -> AppResult<String> {
    let c = Ctx::load(&app)?;
    let l = login::sso_login(&c.client, &c.settings.matrix_homeserver, Lang::parse(lang.as_deref())).await?;
    store_login(&app, l)
}

#[tauri::command]
pub async fn matrix_login_password(app: tauri::AppHandle, user: String, password: String) -> AppResult<String> {
    let c = Ctx::load(&app)?;
    let l = login::password_login(&c.client, &c.settings.matrix_homeserver, &user, &password).await?;
    store_login(&app, l)
}
