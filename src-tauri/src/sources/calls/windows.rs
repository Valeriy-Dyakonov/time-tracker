//! Windows keeps, for every program, whether it holds the microphone right now (the privacy indicator's
//! data). That, the list of running programs and the titles of their windows are all this reads.
use super::{call_title, is_browser, label, Seen};
use std::collections::HashMap;
use sysinfo::{ProcessesToUpdate, System};
use windows_sys::Win32::Foundation::{HWND, LPARAM};
use windows_sys::Win32::UI::WindowsAndMessaging::{EnumWindows, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible};
use winreg::enums::HKEY_CURRENT_USER;
use winreg::RegKey;

const MIC: &str = r"Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone";
/// 100 ns ticks between 1601-01-01 and 1970-01-01, in milliseconds.
const FILETIME_EPOCH_MS: i64 = 11_644_473_600_000;

/// A program that holds the microphone now: its file or package name and since when.
struct MicUse {
    program: String,
    packaged: bool,
    since: i64,
}

fn filetime_ms(ft: u64) -> i64 {
    (ft / 10_000) as i64 - FILETIME_EPOCH_MS
}

fn in_use(key: &RegKey) -> Option<i64> {
    let start: u64 = key.get_value("LastUsedTimeStart").ok()?;
    let stop: u64 = key.get_value("LastUsedTimeStop").ok()?;
    (start > 0 && stop == 0).then(|| filetime_ms(start))
}

fn mic_users() -> Vec<MicUse> {
    let Ok(root) = RegKey::predef(HKEY_CURRENT_USER).open_subkey(MIC) else { return vec![] };
    let mut out = vec![];
    for name in root.enum_keys().flatten() {
        let Ok(key) = root.open_subkey(&name) else { continue };
        if name == "NonPackaged" {
            for app in key.enum_keys().flatten() {
                let Ok(k) = key.open_subkey(&app) else { continue };
                if let Some(since) = in_use(&k) {
                    // `C:#Users#me#AppData#Roaming#Zoom#bin#Zoom.exe`: the path with # for \
                    let file = app.rsplit('#').next().unwrap_or(&app).to_string();
                    out.push(MicUse { program: file, packaged: false, since });
                }
            }
        } else if let Some(since) = in_use(&key) {
            out.push(MicUse { program: name, packaged: true, since });
        }
    }
    out
}

unsafe extern "system" fn collect(hwnd: HWND, lparam: LPARAM) -> i32 {
    let out = &mut *(lparam as *mut Vec<(u32, String)>);
    if IsWindowVisible(hwnd) != 0 {
        let mut buf = [0u16; 512];
        let n = GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
        if n > 0 {
            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, &mut pid);
            out.push((pid, String::from_utf16_lossy(&buf[..n as usize])));
        }
    }
    1
}

/// (process id, window title) of visible top-level windows.
fn windows() -> Vec<(u32, String)> {
    let mut out: Vec<(u32, String)> = vec![];
    unsafe {
        EnumWindows(Some(collect), &mut out as *mut _ as LPARAM);
    }
    out
}

pub fn detect(tracked: &[String]) -> Vec<Seen> {
    let users = mic_users();
    let zoom_tracked = tracked.iter().any(|t| t.trim().eq_ignore_ascii_case("zoom"));
    if users.is_empty() && !zoom_tracked {
        return vec![];
    }
    let Ok(mut sys) = System::new() else { return vec![] };
    sys.refresh_processes(ProcessesToUpdate::All, true);
    let names: HashMap<u32, String> = sys.processes().iter().map(|(pid, p)| (pid.as_u32(), p.name().to_string_lossy().to_lowercase())).collect();
    let running = |file: &str| names.values().any(|n| n == &file.to_lowercase());

    // label -> earliest start; a stale microphone flag of a program that is gone is not a call.
    let mut found: HashMap<String, i64> = HashMap::new();
    for u in &users {
        if !u.packaged && !running(&u.program) {
            continue;
        }
        if let Some(l) = label(&u.program, tracked) {
            let e = found.entry(l).or_insert(u.since);
            *e = (*e).min(u.since);
        }
    }
    // Zoom's call process exists only while a meeting is open, even when the microphone is not taken.
    if zoom_tracked && running("cpthost.exe") {
        found.entry("zoom".to_string()).or_insert(i64::MAX);
    }
    if found.is_empty() {
        return vec![];
    }

    let all_windows = windows();
    let mut out = vec![];
    for (l, since) in found {
        let titles: Vec<String> = all_windows
            .iter()
            .filter(|(pid, _)| names.get(pid).is_some_and(|n| n.contains(l.as_str())))
            .map(|(_, t)| t.clone())
            .collect();
        let title = call_title(&l, &titles);
        if is_browser(&l) && title.is_empty() {
            continue;
        }
        out.push(Seen { app: l, title, since: (since != i64::MAX).then_some(since) });
    }
    out
}
