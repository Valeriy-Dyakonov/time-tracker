//! Production calendar: public holidays, transferred days off and shortened pre-holiday days.
//! Source: isdayoff.ru (free public API, no key; RU, BY, KZ, UA, UZ, US). If it is unreachable, Russia 2026
//! is served from a built-in table. Read-only: the only thing sent out is the date range and country code.
use chrono::{Datelike, Duration, NaiveDate};
use crate::texts::Lang;
use serde::Serialize;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HolidayDay {
    pub date: String,
    /// "off" – day off (holiday, weekend, transfer); "short" – working day shorter by an hour; "work" – working day
    pub kind: String,
    pub name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HolidayOut {
    pub source: String,
    /// true: every date of the range is present (weekends and transferred working Saturdays included);
    /// false: only exceptions are listed, other days follow the normal weekday rule.
    pub complete: bool,
    pub days: Vec<HolidayDay>,
}

pub const COUNTRIES: [&str; 6] = ["ru", "by", "kz", "ua", "uz", "us"];

fn parse(s: &str) -> AppResult<NaiveDate> {
    NaiveDate::parse_from_str(s, "%Y-%m-%d").map_err(|e| AppError::raw(format!("{s}: {e}")))
}

fn ru_name(d: NaiveDate, lang: Lang) -> Option<String> {
    Some(lang.holiday(d.month(), d.day()).to_string())
}

/// Russia 2026 (Постановление Правительства РФ от 24.09.2025 № 1466): weekday days off and shortened days.
/// Weekends are not listed: they follow the normal rule. No transferred working Saturdays in 2026.
const RU_2026_OFF: [&str; 15] = [
    "2026-01-01", "2026-01-02", "2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09",
    "2026-02-23", "2026-03-09", "2026-05-01", "2026-05-11", "2026-06-12", "2026-11-04", "2026-12-31", "2026-01-12",
];
const RU_2026_SHORT: [&str; 4] = ["2026-04-30", "2026-05-08", "2026-06-11", "2026-11-03"];

fn builtin_ru_2026(a: NaiveDate, b: NaiveDate, lang: Lang) -> Vec<HolidayDay> {
    let mut out = vec![];
    for s in RU_2026_OFF.iter().filter(|s| **s != "2026-01-12") {
        let d = parse(s).unwrap();
        if d >= a && d <= b {
            out.push(HolidayDay { date: s.to_string(), kind: "off".into(), name: ru_name(d, lang) });
        }
    }
    for s in RU_2026_SHORT {
        let d = parse(s).unwrap();
        if d >= a && d <= b {
            out.push(HolidayDay { date: s.to_string(), kind: "short".into(), name: Some(lang.pre_holiday().into()) });
        }
    }
    out.sort_by(|x, y| x.date.cmp(&y.date));
    out
}

/// isdayoff.ru answer: one char per day of the range (0 work, 1 off, 2 short, 4 work).
pub fn decode(cc: &str, start: NaiveDate, n: usize, text: &str, lang: Lang) -> Option<Vec<HolidayDay>> {
    let t = text.trim();
    if t.chars().count() != n || !t.chars().all(|c| "0124".contains(c)) {
        return None;
    }
    Some(
        t.chars()
            .enumerate()
            .map(|(i, c)| {
                let d = start + Duration::days(i as i64);
                let kind = match c {
                    '1' => "off",
                    '2' => "short",
                    _ => "work",
                };
                let name = match (cc, kind) {
                    ("ru", "short") => Some(lang.pre_holiday().to_string()),
                    ("ru", "off") => ru_name(d, lang),
                    _ => None,
                };
                HolidayDay { date: d.format("%Y-%m-%d").to_string(), kind: kind.into(), name }
            })
            .collect(),
    )
}

pub async fn fetch(client: &reqwest::Client, country: &str, start: &str, end: &str, lang: Lang) -> AppResult<HolidayOut> {
    let cc = country.to_lowercase();
    if !COUNTRIES.contains(&cc.as_str()) {
        return Err(AppError::new("holidaysCountry").with("country", country));
    }
    let a = parse(start)?;
    let mut b = parse(end)?;
    if b < a {
        return Err(AppError::new("periodReversed"));
    }
    if (b - a).num_days() > 365 {
        b = a + Duration::days(365);
    }
    let n = ((b - a).num_days() + 1) as usize;
    let url = format!(
        "https://isdayoff.ru/api/getdata?date1={}&date2={}&cc={}&pre=1",
        a.format("%Y%m%d"),
        b.format("%Y%m%d"),
        cc
    );

    let online: AppResult<String> = async {
        let r = client.get(&url).send().await.map_err(AppError::raw)?;
        if !r.status().is_success() {
            return Err(AppError::raw(format!("HTTP {}", r.status())));
        }
        r.text().await.map_err(AppError::raw)
    }
    .await;

    match online {
        Ok(t) if decode(&cc, a, n, &t, lang).is_some() => {
            Ok(HolidayOut { source: lang.source_isdayoff().into(), complete: true, days: decode(&cc, a, n, &t, lang).unwrap() })
        }
        other => {
            let why = match other {
                Ok(t) => lang.unexpected_answer(&t.chars().take(40).collect::<String>()),
                Err(e) => e.detail(),
            };
            if cc == "ru" && a.year() == 2026 && b.year() == 2026 {
                Ok(HolidayOut { source: lang.source_builtin(&why), complete: false, days: builtin_ru_2026(a, b, lang) })
            } else {
                Err(AppError::new("holidaysUnavailable").with("detail", why))
            }
        }
    }
}
