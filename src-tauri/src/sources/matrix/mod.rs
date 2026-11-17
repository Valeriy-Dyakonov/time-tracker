//! Matrix Client-Server API, read-only: the user's own messages in joined rooms.
pub mod login;
mod rooms;
mod text;

use crate::http::{Auth, JsonApi};
use crate::model::Event;
use crate::util::{trim_url, truncate};
use futures::stream::{self, StreamExt};
use rooms::{room_name, Members};
use serde::Serialize;
use serde_json::Value;
use crate::texts::Lang;
use crate::error::AppResult;

#[derive(Debug, Serialize)]
pub struct Room {
    pub id: String,
    pub name: String,
}

struct Matrix<'a> {
    api: JsonApi<'a>,
    base: String,
    lang: Lang,
}

impl<'a> Matrix<'a> {
    fn new(client: &'a reqwest::Client, base: &str, token: &'a str, lang: Lang) -> Self {
        let api = JsonApi::new(client, "Matrix", Auth::Bearer(token)).on_unauthorized("matrixUnauthorized");
        Self { api, base: trim_url(base), lang }
    }

    async fn get(&self, path: &str, query: &[(&str, String)]) -> AppResult<Value> {
        self.api.get(&format!("{}{path}", self.base), query).await
    }

    async fn whoami(&self) -> AppResult<String> {
        Ok(self.get("/_matrix/client/v3/account/whoami", &[]).await?["user_id"].as_str().unwrap_or("").to_string())
    }

    async fn joined_rooms(&self) -> AppResult<Vec<String>> {
        let v = self.get("/_matrix/client/v3/joined_rooms", &[]).await?;
        Ok(v["joined_rooms"].as_array().into_iter().flatten().filter_map(|x| x.as_str().map(String::from)).collect())
    }
}

/// The user id the token belongs to.
pub async fn test(client: &reqwest::Client, base: &str, token: &str) -> AppResult<String> {
    Matrix::new(client, base, token, Lang::default()).whoami().await
}

pub async fn list_rooms(client: &reqwest::Client, base: &str, token: &str, lang: Lang) -> AppResult<Vec<Room>> {
    let mx = Matrix::new(client, base, token, lang);
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

/// Mentioned users (Element also sets them for replies), else the quoted reply author, else the DM peer;
/// None for a message to the whole room.
fn recipient(content: &Value, reply_to: Option<&str>, me: &str, members: &Members, dm_peer: &Option<String>) -> Option<String> {
    let mentioned: Vec<String> = content["m.mentions"]["user_ids"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|x| x.as_str())
        .filter(|u| *u != me)
        .map(|u| members.display(u))
        .collect();
    if !mentioned.is_empty() {
        return Some(mentioned.join(", "));
    }
    match reply_to {
        Some(u) if u != me => Some(members.display(u)),
        _ => dm_peer.clone(),
    }
}

async fn room_events(mx: &Matrix<'_>, me: &str, room: &str, start_ms: i64, end_ms: i64) -> AppResult<Vec<Event>> {
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
            let parsed = text::split_reply(body);
            let readable = text::humanize_ids(&parsed.text, |u| members.display(u));
            if readable.trim().is_empty() {
                continue;
            }
            out.push(Event {
                context: Some(name.clone()),
                to: recipient(content, parsed.reply_to.as_deref(), me, &members, &dm_peer),
                ..Event::new("matrix", ts, truncate(readable.trim(), 240))
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
    (start_ms, end_ms): (i64, i64),
    lang: Lang,
) -> AppResult<Vec<Event>> {
    let mx = Matrix::new(client, base, token, lang);
    let rooms: Vec<String> = mx.joined_rooms().await?.into_iter().filter(|id| !exclude.contains(id)).collect();
    let results: Vec<AppResult<Vec<Event>>> = stream::iter(rooms)
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
