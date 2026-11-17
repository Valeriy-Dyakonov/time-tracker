//! Matrix Client-Server API, read-only: own messages from joined rooms.
use crate::settings::Event;
use crate::util::{trim_url, truncate};
use futures::stream::{self, StreamExt};
use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Serialize)]
pub struct Room {
    pub id: String,
    pub name: String,
}

async fn get(
    client: &reqwest::Client,
    base: &str,
    token: &str,
    path: &str,
    query: &[(&str, String)],
) -> Result<Value, String> {
    let resp = client
        .get(format!("{base}{path}"))
        .bearer_auth(token)
        .query(query)
        .send()
        .await
        .map_err(|e| format!("Matrix: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if status.as_u16() == 401 {
        return Err(format!(
            "Matrix: сервер не принимает токен (401: {}). Он истёк, отозван или сессия, из которой его скопировали, закрыта. \
             Получите новый: Настройки → Matrix → раскройте «Токен не подходит или истёк? Получить новый здесь».",
            truncate(&text, 120)
        ));
    }
    if !status.is_success() {
        return Err(format!("Matrix HTTP {status}: {}", truncate(&text, 200)));
    }
    serde_json::from_str(&text).map_err(|e| format!("Matrix JSON: {e}"))
}

pub async fn test(client: &reqwest::Client, base: &str, token: &str) -> Result<String, String> {
    let v = get(client, &trim_url(base), token, "/_matrix/client/v3/account/whoami", &[]).await?;
    Ok(format!("OK: {}", v["user_id"].as_str().unwrap_or("?")))
}

async fn room_name(client: &reqwest::Client, base: &str, token: &str, id: &str) -> String {
    let path = format!(
        "/_matrix/client/v3/rooms/{}/state/m.room.name",
        urlencoding::encode(id)
    );
    match get(client, base, token, &path, &[]).await {
        Ok(v) => v["name"].as_str().unwrap_or(id).to_string(),
        Err(_) => format!("(без названия) {id}"),
    }
}

pub async fn list_rooms(client: &reqwest::Client, base: &str, token: &str) -> Result<Vec<Room>, String> {
    let base = trim_url(base);
    let v = get(client, &base, token, "/_matrix/client/v3/joined_rooms", &[]).await?;
    let ids: Vec<String> = v["joined_rooms"]
        .as_array()
        .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
        .unwrap_or_default();
    let mut rooms: Vec<Room> = stream::iter(ids)
        .map(|id| {
            let base = base.clone();
            async move {
                let name = room_name(client, &base, token, &id).await;
                Room { id, name }
            }
        })
        .buffer_unordered(8)
        .collect()
        .await;
    rooms.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(rooms)
}

async fn room_events(
    client: &reqwest::Client,
    base: &str,
    token: &str,
    user_id: &str,
    room_id: &str,
    start_ms: i64,
    end_ms: i64,
) -> Result<Vec<Event>, String> {
    let name = room_name(client, base, token, room_id).await;
    let filter = serde_json::json!({ "senders": [user_id], "types": ["m.room.message"] }).to_string();
    let path = format!("/_matrix/client/v3/rooms/{}/messages", urlencoding::encode(room_id));

    let mut out = vec![];
    let mut from: Option<String> = None;
    for _ in 0..60 {
        let mut q = vec![
            ("dir", "b".to_string()),
            ("limit", "100".to_string()),
            ("filter", filter.clone()),
        ];
        if let Some(f) = &from {
            q.push(("from", f.clone()));
        }
        let v = get(client, base, token, &path, &q).await?;
        let chunk = v["chunk"].as_array().cloned().unwrap_or_default();
        if chunk.is_empty() {
            break;
        }
        let mut oldest = i64::MAX;
        for e in &chunk {
            let ts = e["origin_server_ts"].as_i64().unwrap_or(0);
            oldest = oldest.min(ts);
            if ts < start_ms || ts >= end_ms {
                continue;
            }
            if e["content"]["m.relates_to"]["rel_type"] == "m.replace" {
                continue; // edits duplicate the original message
            }
            let body = e["content"]["body"].as_str().unwrap_or("");
            if body.trim().is_empty() {
                continue;
            }
            out.push(Event {
                source: "matrix".into(),
                ts,
                issue_key: None,
                text: truncate(body, 240),
                context: Some(name.clone()),
                weight: 1.0,
            });
        }
        match v["end"].as_str() {
            Some(t) if oldest >= start_ms => from = Some(t.to_string()),
            _ => break,
        }
    }
    Ok(out)
}

pub async fn fetch(
    client: &reqwest::Client,
    base: &str,
    token: &str,
    user_id: &str,
    exclude: &[String],
    start_ms: i64,
    end_ms: i64,
) -> Result<Vec<Event>, String> {
    let base = trim_url(base);
    let v = get(client, &base, token, "/_matrix/client/v3/joined_rooms", &[]).await?;
    let ids: Vec<String> = v["joined_rooms"]
        .as_array()
        .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect::<Vec<String>>())
        .unwrap_or_default()
        .into_iter()
        .filter(|id| !exclude.contains(id))
        .collect();

    let results: Vec<Result<Vec<Event>, String>> = stream::iter(ids)
        .map(|id| {
            let base = base.clone();
            async move { room_events(client, &base, token, user_id, &id, start_ms, end_ms).await }
        })
        .buffer_unordered(4)
        .collect()
        .await;

    let mut all = vec![];
    for r in results {
        // One broken room (no access, rate limit) should not kill the whole report.
        if let Ok(mut e) = r {
            all.append(&mut e);
        }
    }
    Ok(all)
}
