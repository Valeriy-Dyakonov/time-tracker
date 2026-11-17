//! Room members and room names, computed the way the Matrix spec (and Element) does.
use super::Matrix;
use std::collections::HashMap;

/// user id -> display name of the room's current members.
pub struct Members(HashMap<String, String>);

impl Members {
    /// Empty when the request fails: names then fall back to ids.
    pub async fn load(mx: &Matrix<'_>, room: &str) -> Self {
        let path = format!("/_matrix/client/v3/rooms/{}/joined_members", urlencoding::encode(room));
        let mut map = HashMap::new();
        if let Ok(v) = mx.get(&path, &[]).await {
            for (uid, m) in v["joined"].as_object().into_iter().flatten() {
                map.insert(uid.clone(), m["display_name"].as_str().unwrap_or("").trim().to_string());
            }
        }
        Self(map)
    }

    /// Display name, falling back to the localpart: @ivan:server -> ivan.
    pub fn display(&self, uid: &str) -> String {
        match self.0.get(uid) {
            Some(d) if !d.is_empty() => d.clone(),
            _ => uid.trim_start_matches('@').split(':').next().unwrap_or(uid).to_string(),
        }
    }

    pub fn others(&self, me: &str) -> Vec<String> {
        self.0.keys().filter(|u| u.as_str() != me).map(|u| self.display(u)).collect()
    }

    /// In a one-to-one room every message goes to the other person.
    pub fn dm_peer(&self, me: &str) -> Option<String> {
        let others = self.others(me);
        (others.len() == 1).then(|| others[0].clone())
    }
}

/// "Иван", "Иван и Мария", "Иван, Мария и ещё 3".
fn members_label(mut names: Vec<String>) -> Option<String> {
    names.sort_by_key(|n| n.to_lowercase());
    match names.len() {
        0 => None,
        1 => Some(names.remove(0)),
        2 => Some(format!("{} и {}", names[0], names[1])),
        n => Some(format!("{}, {} и ещё {}", names[0], names[1], n - 2)),
    }
}

async fn state_str(mx: &Matrix<'_>, room: &str, event: &str, field: &str) -> Option<String> {
    let path = format!("/_matrix/client/v3/rooms/{}/state/{event}", urlencoding::encode(room));
    let v = mx.get(&path, &[]).await.ok()?;
    let s = v[field].as_str()?.trim();
    (!s.is_empty()).then(|| s.to_string())
}

/// m.room.name, then m.room.canonical_alias, then the other members' names.
/// `members` is loaded only when the room has neither name nor alias.
pub async fn room_name(mx: &Matrix<'_>, room: &str, me: &str, members: Option<&Members>) -> String {
    if let Some(n) = state_str(mx, room, "m.room.name", "name").await {
        return n;
    }
    if let Some(a) = state_str(mx, room, "m.room.canonical_alias", "alias").await {
        return a;
    }
    let loaded;
    let members = match members {
        Some(m) => m,
        None => {
            loaded = Members::load(mx, room).await;
            &loaded
        }
    };
    if members.0.is_empty() {
        return format!("(без названия) {room}");
    }
    members_label(members.others(me)).unwrap_or_else(|| "Пустая комната".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v(a: &[&str]) -> Vec<String> {
        a.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn labels_rooms_by_members() {
        assert_eq!(members_label(v(&[])), None);
        assert_eq!(members_label(v(&["Иван"])).as_deref(), Some("Иван"));
        assert_eq!(members_label(v(&["Мария", "Иван"])).as_deref(), Some("Иван и Мария"));
        assert_eq!(members_label(v(&["Пётр", "Мария", "Иван", "Анна"])).as_deref(), Some("Анна, Иван и ещё 2"));
    }

    #[test]
    fn display_falls_back_to_localpart() {
        let m = Members(HashMap::from([("@a:s".to_string(), "Анна".to_string()), ("@b:s".to_string(), String::new())]));
        assert_eq!(m.display("@a:s"), "Анна");
        assert_eq!(m.display("@b:s"), "b");
        assert_eq!(m.dm_peer("@a:s").as_deref(), Some("b"));
    }
}
