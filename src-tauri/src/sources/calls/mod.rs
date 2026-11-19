//! Calls on this computer: a tracked program holds the microphone (or Zoom's call process runs). Only
//! calls are looked at: no other windows, programs or titles are read or kept. Windows only; elsewhere
//! nothing is detected.
#[cfg(windows)]
mod windows;

pub use crate::store::calls::Seen;

/// Programs whose microphone use counts as a call, by a part of the program's name.
pub fn default_apps() -> Vec<String> {
    ["zoom", "teams", "telegram", "slack", "discord", "chrome", "msedge", "firefox", "browser"].map(String::from).to_vec()
}

#[cfg(windows)]
pub fn detect(tracked: &[String]) -> Vec<Seen> {
    windows::detect(tracked)
}

#[cfg(not(windows))]
pub fn detect(_tracked: &[String]) -> Vec<Seen> {
    vec![]
}

/// The tracked name a program belongs to (`ms-teams` -> `teams`), if any.
#[cfg_attr(not(windows), allow(dead_code))]
pub fn label(program: &str, tracked: &[String]) -> Option<String> {
    let p = program.to_lowercase();
    tracked.iter().map(|t| t.trim().to_lowercase()).find(|t| !t.is_empty() && p.contains(t.as_str()))
}

/// Browsers use the microphone for much more than calls (dictation, voice search): they count only
/// when a window looks like a meeting.
#[cfg_attr(not(windows), allow(dead_code))]
pub fn is_browser(label: &str) -> bool {
    ["chrome", "edge", "firefox", "browser", "opera", "brave"].iter().any(|b| label.contains(b))
}

const TEAMS_GENERIC: [&str; 12] = ["microsoft teams", "chat", "чат", "calendar", "календарь", "teams", "команды", "activity", "активность", "calls", "звонки", "files"];
const MEETING_MARKERS: [&str; 6] = ["meet –", "meet -", "телемост", "google meet", "jitsi", "zoom"];
const BROWSER_SUFFIXES: [&str; 6] = ["google chrome", "microsoft edge", "mozilla firefox", "яндекс браузер", "yandex", "brave"];

/// The name of the call, from the titles of the program's windows; empty when none looks like a call.
/// Best effort: the window titles are not a documented interface.
#[cfg_attr(not(windows), allow(dead_code))]
pub fn call_title(label: &str, titles: &[String]) -> String {
    if label.contains("zoom") {
        for t in titles {
            for prefix in ["Zoom Конференция", "Zoom Meeting", "Zoom Webinar", "Zoom Вебинар"] {
                if let Some(rest) = t.strip_prefix(prefix) {
                    return rest.trim_matches(|c: char| c == '-' || c == '–' || c.is_whitespace()).to_string();
                }
            }
        }
    } else if label.contains("teams") {
        for t in titles {
            if let Some(name) = t.strip_suffix("| Microsoft Teams") {
                let name = name.trim();
                if !name.is_empty() && !TEAMS_GENERIC.contains(&name.to_lowercase().as_str()) {
                    return name.to_string();
                }
            }
        }
    } else if is_browser(label) {
        for t in titles {
            let low = t.to_lowercase();
            if MEETING_MARKERS.iter().any(|m| low.contains(m)) {
                return strip_browser(t);
            }
        }
    }
    String::new()
}

fn strip_browser(title: &str) -> String {
    match title.rsplit_once(" - ") {
        Some((head, tail)) if BROWSER_SUFFIXES.iter().any(|b| tail.to_lowercase().contains(b)) => head.trim().to_string(),
        _ => title.trim().to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn titles(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn programs_map_to_tracked_names() {
        let t = default_apps();
        assert_eq!(label("ms-teams.exe", &t).as_deref(), Some("teams"));
        assert_eq!(label("MSTeams_8wekyb3d8bbwe", &t).as_deref(), Some("teams"));
        assert_eq!(label("Zoom.exe", &t).as_deref(), Some("zoom"));
        assert_eq!(label("DOOMEternalx64vk.exe", &t), None);
        assert_eq!(label("Zoom.exe", &[" ".to_string()]), None);
    }

    #[test]
    fn zoom_title_is_the_meeting_name() {
        let w = titles(&["Zoom Workplace", "Zoom Конференция - БЛЛК - ekk"]);
        assert_eq!(call_title("zoom", &w), "БЛЛК - ekk");
        assert_eq!(call_title("zoom", &titles(&["Zoom Workplace"])), "");
    }

    #[test]
    fn teams_title_skips_generic_windows() {
        let w = titles(&["Чат | Microsoft Teams", "Daily sync | Microsoft Teams"]);
        assert_eq!(call_title("teams", &w), "Daily sync");
        assert_eq!(call_title("teams", &titles(&["Calendar | Microsoft Teams"])), "");
    }

    #[test]
    fn browsers_count_only_with_a_meeting_title() {
        assert!(is_browser("chrome") && !is_browser("zoom"));
        assert_eq!(call_title("chrome", &titles(&["Meet – abc-defg-hij - Google Chrome"])), "Meet – abc-defg-hij");
        assert_eq!(call_title("chrome", &titles(&["YouTube - Google Chrome"])), "");
        assert_eq!(call_title("telegram", &titles(&["Telegram"])), "");
    }
}
