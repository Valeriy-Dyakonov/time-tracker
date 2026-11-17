use std::process::Command;
use crate::error::{AppError, AppResult};

pub fn open(url: &str) -> AppResult<()> {
    #[cfg(target_os = "windows")]
    let r = Command::new("rundll32").args(["url.dll,FileProtocolHandler", url]).spawn();
    #[cfg(target_os = "macos")]
    let r = Command::new("open").arg(url).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let r = Command::new("xdg-open").arg(url).spawn();
    r.map(|_| ())
        .map_err(|e| AppError::new("browserOpen").with("detail", e.to_string()).with("url", url))
}
