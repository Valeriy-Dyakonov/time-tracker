//! Wording of the data the backend produces (event descriptions, room and holiday names).
//! Errors are not here: they travel as codes (see error.rs) and are worded by the frontend.
//! Event texts are worded here because they are part of the data the AI reads.

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Lang {
    #[default]
    Ru,
    En,
}

impl Lang {
    pub fn parse(s: Option<&str>) -> Self {
        match s {
            Some(l) if l.eq_ignore_ascii_case("en") => Lang::En,
            _ => Lang::Ru,
        }
    }

    const fn pick(self, ru: &'static str, en: &'static str) -> &'static str {
        match self {
            Lang::Ru => ru,
            Lang::En => en,
        }
    }

    pub fn jira_created(self, summary: &str) -> String {
        format!("{}: {summary}", self.pick("Создал задачу", "Created issue"))
    }

    pub fn jira_comment(self, body: &str) -> String {
        format!("{}: {body}", self.pick("Комментарий", "Comment"))
    }

    pub fn confluence(self, edited: bool, is_comment: bool, title: &str) -> String {
        let verb = if edited { self.pick("Отредактировал", "Edited") } else { self.pick("Создал", "Created") };
        let what = if is_comment { self.pick("комментарий к странице", "a comment on page") } else { self.pick("страницу", "page") };
        format!("{verb} {what} «{title}»")
    }

    pub fn mr_opened(self) -> &'static str {
        self.pick("Создал MR", "Opened MR")
    }
    pub fn mr_merged(self) -> &'static str {
        self.pick("MR смёржен", "MR merged")
    }
    pub fn mr_approved(self) -> &'static str {
        self.pick("Одобрил MR (ревью)", "Approved MR (review)")
    }
    pub fn mr_accepted(self) -> &'static str {
        self.pick("Смёржил MR", "Merged MR")
    }
    pub fn mr_review_note(self) -> &'static str {
        self.pick("Комментарий в ревью MR", "Review comment on MR")
    }

    pub fn commit_stats(self, ins: u64, del: u64, files: u64) -> String {
        format!("(+{ins}/-{del}, {}: {files})", self.pick("файлов", "files"))
    }

    pub fn no_subject(self) -> &'static str {
        self.pick("(без темы)", "(no subject)")
    }

    pub fn room_unnamed(self, id: &str) -> String {
        format!("{} {id}", self.pick("(без названия)", "(unnamed)"))
    }
    pub fn room_empty(self) -> &'static str {
        self.pick("Пустая комната", "Empty room")
    }
    /// "Ivan and Maria".
    pub fn two_names(self, a: &str, b: &str) -> String {
        format!("{a} {} {b}", self.pick("и", "and"))
    }
    /// "Ivan, Maria and 3 more".
    pub fn names_and_more(self, a: &str, b: &str, more: usize) -> String {
        match self {
            Lang::Ru => format!("{a}, {b} и ещё {more}"),
            Lang::En => format!("{a}, {b} and {more} more"),
        }
    }

    pub fn holiday(self, month: u32, day: u32) -> &'static str {
        match (month, day) {
            (1, 7) => self.pick("Рождество Христово", "Orthodox Christmas"),
            (1, 1..=11) => self.pick("Новогодние каникулы", "New Year holidays"),
            (2, 23) => self.pick("День защитника Отечества", "Defender of the Fatherland Day"),
            (3, 8) | (3, 9) => self.pick("Международный женский день", "International Women's Day"),
            (5, 1) => self.pick("Праздник Весны и Труда", "Spring and Labour Day"),
            (5, 9) | (5, 11) => self.pick("День Победы", "Victory Day"),
            (6, 12) => self.pick("День России", "Russia Day"),
            (11, 4) => self.pick("День народного единства", "Unity Day"),
            _ => self.pick("Перенесённый выходной", "Transferred day off"),
        }
    }
    pub fn pre_holiday(self) -> &'static str {
        self.pick("Предпраздничный день", "Pre-holiday day")
    }
    pub fn source_isdayoff(self) -> &'static str {
        "isdayoff.ru"
    }
    pub fn source_builtin(self, why: &str) -> String {
        match self {
            Lang::Ru => format!("встроенный календарь РФ 2026 (isdayoff.ru недоступен: {why})"),
            Lang::En => format!("built-in Russia 2026 calendar (isdayoff.ru unavailable: {why})"),
        }
    }
    pub fn unexpected_answer(self, head: &str) -> String {
        format!("{}: {head}", self.pick("неожиданный ответ", "unexpected answer"))
    }

    pub fn sso_done_page(self) -> String {
        let (title, body) = match self {
            Lang::Ru => ("Готово ✓", "Вход выполнен. Эту вкладку можно закрыть и вернуться в Worklog Tracker."),
            Lang::En => ("Done ✓", "You are signed in. You can close this tab and return to Worklog Tracker."),
        };
        format!(
            "<!doctype html><html><head><meta charset=\"utf-8\"><title>Worklog Tracker</title></head>\
<body style=\"font-family:system-ui;text-align:center;margin-top:20vh\"><h2>{title}</h2><p>{body}</p></body></html>"
        )
    }
}
