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

async fn state_str(client: &reqwest::Client, base: &str, token: &str, id: &str, ev: &str, field: &str) -> Option<String> {
    let path = format!("/_matrix/client/v3/rooms/{}/state/{ev}", urlencoding::encode(id));
    let v = get(client, base, token, &path, &[]).await.ok()?;
    let s = v[field].as_str()?.trim();
    (!s.is_empty()).then(|| s.to_string())
}

/// user id -> display name of the room's current members (empty on error).
async fn members(client: &reqwest::Client, base: &str, token: &str, id: &str) -> std::collections::HashMap<String, String> {
    let path = format!("/_matrix/client/v3/rooms/{}/joined_members", urlencoding::encode(id));
    let mut out = std::collections::HashMap::new();
    if let Ok(v) = get(client, base, token, &path, &[]).await {
        if let Some(joined) = v["joined"].as_object() {
            for (uid, m) in joined {
                out.insert(uid.clone(), m["display_name"].as_str().unwrap_or("").trim().to_string());
            }
        }
    }
    out
}

/// Display name for a user id, falling back to the localpart: @ivan:server -> ivan.
fn display(members: &std::collections::HashMap<String, String>, uid: &str) -> String {
    match members.get(uid) {
        Some(d) if !d.is_empty() => d.clone(),
        _ => uid.trim_start_matches('@').split(':').next().unwrap_or(uid).to_string(),
    }
}

/// "Иван", "Иван и Мария", "Иван, Мария и ещё 3" — like Element names rooms by their members.
fn members_label(mut names: Vec<String>) -> Option<String> {
    names.sort_by_key(|n| n.to_lowercase());
    match names.len() {
        0 => None,
        1 => Some(names.remove(0)),
        2 => Some(format!("{} и {}", names[0], names[1])),
        n => Some(format!("{}, {} и ещё {}", names[0], names[1], n - 2)),
    }
}

/// Room display name as the Matrix spec (and Element) computes it:
/// m.room.name, then m.room.canonical_alias, then the other members' display names.
async fn room_name(client: &reqwest::Client, base: &str, token: &str, id: &str, me: &str) -> String {
    if let Some(n) = state_str(client, base, token, id, "m.room.name", "name").await {
        return n;
    }
    if let Some(a) = state_str(client, base, token, id, "m.room.canonical_alias", "alias").await {
        return a;
    }
    let path = format!("/_matrix/client/v3/rooms/{}/joined_members", urlencoding::encode(id));
    if let Ok(v) = get(client, base, token, &path, &[]).await {
        if let Some(joined) = v["joined"].as_object() {
            let others: Vec<String> = joined
                .iter()
                .filter(|(uid, _)| uid.as_str() != me)
                .map(|(uid, m)| match m["display_name"].as_str().map(str::trim) {
                    Some(d) if !d.is_empty() => d.to_string(),
                    // @ivan:server -> ivan
                    _ => uid.trim_start_matches('@').split(':').next().unwrap_or(uid).to_string(),
                })
                .collect();
            return members_label(others).unwrap_or_else(|| "Пустая комната".into());
        }
    }
    format!("(без названия) {id}")
}

pub async fn list_rooms(client: &reqwest::Client, base: &str, token: &str) -> Result<Vec<Room>, String> {
    let base = trim_url(base);
    let me = get(client, &base, token, "/_matrix/client/v3/account/whoami", &[]).await?["user_id"]
        .as_str()
        .unwrap_or("")
        .to_string();
    let me = me.as_str();
    let v = get(client, &base, token, "/_matrix/client/v3/joined_rooms", &[]).await?;
    let ids: Vec<String> = v["joined_rooms"]
        .as_array()
        .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
        .unwrap_or_default();
    let mut rooms: Vec<Room> = stream::iter(ids)
        .map(|id| {
            let base = base.clone();
            async move {
                let name = room_name(client, &base, token, &id, me).await;
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
    let name = room_name(client, base, token, room_id, user_id).await;
    let members = members(client, base, token, room_id).await;
    // In a one-to-one room every message goes to the other person.
    let dm_peer = {
        let others: Vec<&String> = members.keys().filter(|u| u.as_str() != user_id).collect();
        if others.len() == 1 { Some(display(&members, others[0])) } else { None }
    };
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
            let mentioned: Vec<String> = e["content"]["m.mentions"]["user_ids"]
                .as_array()
                .map(|a| a.iter().filter_map(|x| x.as_str()).filter(|u| *u != user_id).map(|u| display(&members, u)).collect())
                .unwrap_or_default();
            let to = if mentioned.is_empty() { dm_peer.clone() } else { Some(mentioned.join(", ")) };
            out.push(Event {
                source: "matrix".into(),
                ts,
                issue_key: None,
                text: truncate(body, 240),
                context: Some(name.clone()),
                weight: 1.0,
                to,
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

#[cfg(test)]
mod tests {
    use super::members_label;
    fn v(a: &[&str]) -> Vec<String> { a.iter().map(|s| s.to_string()).collect() }

    #[test]
    fn labels_rooms_by_members() {
        assert_eq!(members_label(v(&[])), None);
        assert_eq!(members_label(v(&["Иван"])).as_deref(), Some("Иван"));
        assert_eq!(members_label(v(&["Мария", "Иван"])).as_deref(), Some("Иван и Мария"));
        assert_eq!(members_label(v(&["Пётр", "Мария", "Иван", "Анна"])).as_deref(), Some("Анна, Иван и ещё 2"));
    }
}
