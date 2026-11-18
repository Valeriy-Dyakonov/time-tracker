use super::Ctx;
use crate::secrets;
use crate::sources::llm;
use crate::error::AppResult;

#[tauri::command]
pub async fn llm_chat(app: tauri::AppHandle, system: String, user: String) -> AppResult<String> {
    let c = Ctx::load(&app)?;
    let key = secrets::get(secrets::LLM.name);
    llm::chat(&c.client, &c.settings.llm_base_url, key.as_deref(), &c.settings.llm_model, c.settings.llm_rpm, &system, &user).await
}
