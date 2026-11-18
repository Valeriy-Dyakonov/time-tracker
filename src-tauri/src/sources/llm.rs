//! OpenAI-compatible chat completions client.
use crate::util::{trim_url, truncate};
use serde_json::{json, Value};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use crate::error::{AppError, AppResult};

/// Rate-limited or temporarily unavailable gateway: retried with backoff.
const RETRIES: u32 = 4;
const MAX_RETRY_WAIT: Duration = Duration::from_secs(60);

/// When the next request may start. Global, because every command builds its own client and
/// the frontend runs several days in parallel.
static NEXT_SLOT: Mutex<Option<Instant>> = Mutex::new(None);

/// Spaces request starts evenly so that at most `rpm` start per minute; 0 = no limit.
async fn wait_turn(rpm: u32) {
    if rpm == 0 {
        return;
    }
    let gap = Duration::from_secs(60) / rpm;
    let wait = {
        let mut next = NEXT_SLOT.lock().unwrap_or_else(|e| e.into_inner());
        let now = Instant::now();
        let at = next.map_or(now, |n| n.max(now));
        *next = Some(at + gap);
        at - now
    };
    if !wait.is_zero() {
        tokio::time::sleep(wait).await;
    }
}

fn retryable(status: reqwest::StatusCode) -> bool {
    matches!(status.as_u16(), 429 | 502 | 503 | 504)
}

/// `Retry-After` in seconds if the gateway sent it, otherwise 2, 4, 8, 16 s.
fn retry_delay(headers: Option<&reqwest::header::HeaderMap>, retry: u32) -> Duration {
    let asked = headers
        .and_then(|h| h.get(reqwest::header::RETRY_AFTER))
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.trim().parse::<u64>().ok())
        .map(Duration::from_secs);
    asked.unwrap_or(Duration::from_secs(2 << retry)).min(MAX_RETRY_WAIT)
}

pub async fn chat(
    client: &reqwest::Client,
    base_url: &str,
    api_key: Option<&str>,
    model: &str,
    rpm: u32,
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

    let mut format_dropped = false;
    let mut retries = 0;
    loop {
        wait_turn(rpm).await;
        let mut req = client.post(&url).json(&body);
        if let Some(k) = api_key {
            req = req.bearer_auth(k);
        }
        let resp = match req.send().await {
            Ok(r) => r,
            Err(e) if retries < RETRIES && (e.is_timeout() || e.is_connect()) => {
                tokio::time::sleep(retry_delay(None, retries)).await;
                retries += 1;
                continue;
            }
            Err(e) => return Err(AppError::service("LLM", e)),
        };
        let status = resp.status();
        if retryable(status) && retries < RETRIES {
            tokio::time::sleep(retry_delay(Some(resp.headers()), retries)).await;
            retries += 1;
            continue;
        }
        let text = resp.text().await.map_err(AppError::raw)?;

        // Some gateways do not know `response_format`; retry once without it.
        if (status.as_u16() == 400 || status.as_u16() == 422) && !format_dropped {
            body.as_object_mut().unwrap().remove("response_format");
            format_dropped = true;
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use reqwest::header::{HeaderMap, HeaderValue, RETRY_AFTER};

    #[test]
    fn retry_delay_prefers_header_and_caps_it() {
        let mut h = HeaderMap::new();
        h.insert(RETRY_AFTER, HeaderValue::from_static("7"));
        assert_eq!(retry_delay(Some(&h), 0), Duration::from_secs(7));
        h.insert(RETRY_AFTER, HeaderValue::from_static("600"));
        assert_eq!(retry_delay(Some(&h), 0), MAX_RETRY_WAIT);
        assert_eq!(retry_delay(None, 0), Duration::from_secs(2));
        assert_eq!(retry_delay(None, 3), Duration::from_secs(16));
    }
}
