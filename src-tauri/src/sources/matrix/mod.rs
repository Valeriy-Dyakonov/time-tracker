//! Matrix Client-Server API, read-only: the user's own messages in joined rooms.
pub mod login;
mod rooms;

use crate::http::{Auth, JsonApi};
use crate::model::Event;
use crate::util::{trim_url, truncate};
use futures::stream::{self, StreamExt};
use rooms::{room_name, Members};
use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Serialize)]
pub struct Room {
    pub id: String,
    pub name: String,
}

fn unauthorized(body: &str) -> String {
    format!(
        "Matrix: сервер не принимает токен (401: {}). Он истёк, отозван или сессия, из которой его скопировали, закрыта. \
         Получите новый: Настройки → Matrix → раскройте «Токен не подходит или истёк? Получить новый здесь».",
        truncate(body, 120)
    )
}

struct Matrix<'a> {
    api: JsonApi<'a>,
    base: String,
}

impl<'a> Matrix<'a> {
    fn new(client: &'a reqwest::Client, base: &str, token: &'a str) -> Self {
        let api = JsonApi::new(client, "Matrix", Auth::Bearer(token)).on_unauthorized(unauthorized);
        Self { api, base: trim_url(base) }
    }

    async fn get(&self, path: &str, query: &[(&str, String)]) -> Result<Value, String> {
        self.api.get(&format!("{}{path}", self.base), query).await
    }

    async fn whoami(&self) -> Result<String, String> {
        Ok(self.get("/_matrix/client/v3/account/whoami", &[]).await?["user_id"].as_str().unwrap_or("").to_string())
    }

    async fn joined_rooms(&self) -> Result<Vec<String>, String> {
        let v = self.get("/_matrix/client/v3/joined_rooms", &[]).await?;
        Ok(v["joined_rooms"].as_array().into_iter().flatten().filter_map(|x| x.as_str().map(String::from)).collect())
    }
}

pub async fn test(client: &reqwest::Client, base: &str, token: &str) -> Result<String, String> {
    let me = Matrix::new(client, base, token).whoami().await?;
    Ok(format!("OK: {}", if me.is_empty() { "?" } else { &me }))
}

pub async fn list_rooms(client: &reqwest::Client, base: &str, token: &str) -> Result<Vec<Room>, String> {
    let mx = Matrix::new(client, base, token);
    let me = mx.whoami().await?;
    let mut rooms: Vec<Room> = stream::iter(mx.joined_rooms().await?)
        .map(|id| {
            let (mx, me) = (&mx, &me);
            async move {
                let name = room_name(mx, &id, me, None).await;
                Room { id, name }
            }
        })
        .buffer_unordered(8)
        .collect()
        .await;
    rooms.sort_by_key(|r| r.name.to_lowercase());
    Ok(rooms)
}

/// Mentioned users (Element also sets them for replies), else the DM peer; None for a message to the whole room.
fn recipient(content: &Value, me: &str, members: &Members, dm_peer: &Option<String>) -> Option<String> {
    let mentioned: Vec<String> = content["m.mentions"]["user_ids"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|x| x.as_str())
        .filter(|u| *u != me)
        .map(|u| members.display(u))
        .collect();
    if mentioned.is_empty() { dm_peer.clone() } else { Some(mentioned.join(", ")) }
}

async fn room_events(mx: &Matrix<'_>, me: &str, room: &str, start_ms: i64, end_ms: i64) -> Result<Vec<Event>, String> {
    let members = Members::load(mx, room).await;
    let name = room_name(mx, room, me, Some(&members)).await;
    let dm_peer = members.dm_peer(me);
    let filter = serde_json::json!({ "senders": [me], "types": ["m.room.message"] }).to_string();
    let path = format!("/_matrix/client/v3/rooms/{}/messages", urlencoding::encode(room));

    let mut out = vec![];
    let mut from: Option<String> = None;
    for _ in 0..60 {
        let mut q = vec![("dir", "b".to_string()), ("limit", "100".to_string()), ("filter", filter.clone())];
        if let Some(f) = &from {
            q.push(("from", f.clone()));
        }
        let v = mx.get(&path, &q).await?;
        let chunk = v["chunk"].as_array().cloned().unwrap_or_default();
        if chunk.is_empty() {
            break;
        }
        let mut oldest = i64::MAX;
        for e in &chunk {
            let ts = e["origin_server_ts"].as_i64().unwrap_or(0);
            oldest = oldest.min(ts);
            let content = &e["content"];
            let body = content["body"].as_str().unwrap_or("");
            // Edits (m.replace) duplicate the original message.
            if ts < start_ms || ts >= end_ms || content["m.relates_to"]["rel_type"] == "m.replace" || body.trim().is_empty() {
                continue;
            }
            out.push(Event {
                context: Some(name.clone()),
                to: recipient(content, me, &members, &dm_peer),
                ..Event::new("matrix", ts, truncate(body, 240))
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
    let mx = Matrix::new(client, base, token);
    let rooms: Vec<String> = mx.joined_rooms().await?.into_iter().filter(|id| !exclude.contains(id)).collect();
    let results: Vec<Result<Vec<Event>, String>> = stream::iter(rooms)
        .map(|id| {
            let mx = &mx;
            async move { room_events(mx, user_id, &id, start_ms, end_ms).await }
        })
        .buffer_unordered(4)
        .collect()
        .await;
    // One broken room (no access, rate limit) must not kill the whole report.
    Ok(results.into_iter().filter_map(Result::ok).flatten().collect())
}
