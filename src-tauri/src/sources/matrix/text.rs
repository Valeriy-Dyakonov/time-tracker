//! Turns a raw Matrix `body` into readable text: reply quotes dropped, user ids replaced by names.

/// Message text without the reply fallback, plus the author of the replied-to message (if quoted).
pub struct Body {
    pub text: String,
    pub reply_to: Option<String>,
}

/// Older clients prepend the replied-to message as `> <@user:server> quote` lines followed by an empty line.
pub fn split_reply(body: &str) -> Body {
    if !body.starts_with("> ") {
        return Body { text: body.to_string(), reply_to: None };
    }
    let mut lines = body.lines();
    let mut reply_to = None;
    for line in lines.by_ref() {
        if line.is_empty() {
            break;
        }
        if reply_to.is_none() {
            reply_to = line.trim_start_matches('>').trim().strip_prefix('<').and_then(|r| r.split('>').next()).map(str::to_string);
        }
    }
    Body { text: lines.collect::<Vec<_>>().join("\n"), reply_to }
}

/// Replaces `@user:server` and `<@user:server>` with a display name.
pub fn humanize_ids(text: &str, name_of: impl Fn(&str) -> String) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(at) = rest.find('@') {
        let (before, tail) = rest.split_at(at);
        let len = tail.find(|c: char| c.is_whitespace() || matches!(c, '>' | ',' | ';' | ')' | '"' | '\'')).unwrap_or(tail.len());
        let id = tail[..len].trim_end_matches(['.', ':', '!', '?']);
        if is_user_id(id) {
            let bracketed = before.ends_with('<') && tail[id.len()..].starts_with('>');
            out.push_str(if bracketed { &before[..before.len() - 1] } else { before });
            out.push_str(&name_of(id));
            rest = &tail[id.len() + usize::from(bracketed)..];
        } else {
            out.push_str(before);
            out.push('@');
            rest = &tail[1..];
        }
    }
    out.push_str(rest);
    out
}

fn is_user_id(s: &str) -> bool {
    let Some((local, server)) = s.strip_prefix('@').and_then(|r| r.split_once(':')) else { return false };
    !local.is_empty()
        && server.contains('.')
        && local.chars().all(|c| c.is_ascii_alphanumeric() || "._=-/+".contains(c))
        && server.chars().all(|c| c.is_ascii_alphanumeric() || ".-:[]".contains(c))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn name(id: &str) -> String {
        match id {
            "@m.tols:matrix.company.ru" => "Михаил Толстов".into(),
            _ => id.trim_start_matches('@').split(':').next().unwrap().into(),
        }
    }

    #[test]
    fn replaces_bracketed_and_bare_ids() {
        assert_eq!(humanize_ids("<@m.tols:matrix.company.ru> глянь PR", name), "Михаил Толстов глянь PR");
        assert_eq!(humanize_ids("cc @ivan:matrix.company.ru, ок?", name), "cc ivan, ок?");
        assert_eq!(humanize_ids("почта a@b и @ без id", name), "почта a@b и @ без id");
    }

    #[test]
    fn strips_reply_fallback_and_keeps_its_author() {
        let b = split_reply("> <@m.tols:matrix.company.ru> что с релизом?\n> вторая строка\n\nВыкатили вчера");
        assert_eq!(b.text, "Выкатили вчера");
        assert_eq!(b.reply_to.as_deref(), Some("@m.tols:matrix.company.ru"));
        assert_eq!(split_reply("обычное сообщение").text, "обычное сообщение");
    }
}
