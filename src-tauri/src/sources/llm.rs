//! OpenAI-compatible chat completions client.
use crate::util::{trim_url, truncate};
use serde_json::{json, Value};
use crate::error::{AppError, AppResult};

pub async fn chat(
    client: &reqwest::Client,
    base_url: &str,
    api_key: Option<&str>,
    model: &str,
    system: &str,
    user: &str,
) -> AppResult<String> {
    let url = format!("{}/chat/completions", trim_url(base_url));
    let mut body = json!({
        "model": model,
        "temperature": 0.2,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": user }
        ],
        "response_format": { "type": "json_object" }
    });

    for attempt in 0..2 {
        let mut req = client.post(&url).json(&body);
        if let Some(k) = api_key {
            req = req.bearer_auth(k);
        }
        let resp = req.send().await.map_err(|e| AppError::service("LLM", e))?;
        let status = resp.status();
        let text = resp.text().await.map_err(AppError::raw)?;

        // Some gateways do not know `response_format`; retry once without it.
        if (status.as_u16() == 400 || status.as_u16() == 422) && attempt == 0 {
            body.as_object_mut().unwrap().remove("response_format");
            continue;
        }
        if !status.is_success() {
            return Err(AppError::http("LLM", status, &truncate(&text, 300)));
        }
        let v: Value = serde_json::from_str(&text).map_err(|e| AppError::service("LLM", format!("JSON: {e}")))?;
        return v["choices"][0]["message"]["content"]
            .as_str()
            .map(String::from)
            .ok_or_else(|| AppError::new("llmNoContent").with("body", truncate(&text, 300)));
    }
    Err(AppError::new("llmNoAnswer"))
}
