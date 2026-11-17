use std::process::Command;

pub fn open(url: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let r = Command::new("rundll32").args(["url.dll,FileProtocolHandler", url]).spawn();
    #[cfg(target_os = "macos")]
    let r = Command::new("open").arg(url).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let r = Command::new("xdg-open").arg(url).spawn();
    r.map(|_| ())
        .map_err(|e| format!("Не удалось открыть браузер ({e}). Откройте вручную: {url}"))
}
