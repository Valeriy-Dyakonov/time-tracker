//! Getting a fresh Matrix access token from inside the app:
//! - SSO: opens the browser, catches `loginToken` on a one-shot localhost listener and
//!   exchanges it via `m.login.token` (same flow as any Matrix client).
//! - password: `m.login.password`. The password is used once and never stored.
//!
//! No refresh token is requested, so servers issue a normal long-lived session token.
use crate::util::{trim_url, truncate};
use serde::Serialize;
use serde_json::{json, Value};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

#[derive(Debug, Serialize)]
pub struct Login {
    pub access_token: String,
    pub user_id: String,
}

async fn exchange(client: &reqwest::Client, base: &str, body: Value) -> Result<Login, String> {
    let resp = client
        .post(format!("{base}/_matrix/client/v3/login"))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Matrix: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("Matrix вход не удался (HTTP {status}): {}", truncate(&text, 200)));
    }
    let v: Value = serde_json::from_str(&text).map_err(|e| format!("Matrix JSON: {e}"))?;
    Ok(Login {
        access_token: v["access_token"].as_str().ok_or("в ответе нет access_token")?.to_string(),
        user_id: v["user_id"].as_str().unwrap_or("").to_string(),
    })
}

async fn login_types(client: &reqwest::Client, base: &str) -> Result<Vec<String>, String> {
    let v: Value = client
        .get(format!("{base}/_matrix/client/v3/login"))
        .send()
        .await
        .map_err(|e| format!("Matrix: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Matrix JSON: {e}"))?;
    Ok(v["flows"]
        .as_array()
        .map(|a| a.iter().filter_map(|f| f["type"].as_str().map(String::from)).collect())
        .unwrap_or_default())
}

pub async fn password_login(
    client: &reqwest::Client,
    base: &str,
    user: &str,
    password: &str,
) -> Result<Login, String> {
    let base = trim_url(base);
    let types = login_types(client, &base).await?;
    if !types.iter().any(|t| t == "m.login.password") {
        return Err("Сервер не принимает вход по паролю. Используйте «Войти через SSO».".into());
    }
    exchange(
        client,
        &base,
        json!({
            "type": "m.login.password",
            "identifier": { "type": "m.id.user", "user": user },
            "password": password,
            "initial_device_display_name": "Worklog Tracker"
        }),
    )
    .await
}

const DONE_PAGE: &str = "<!doctype html><html><head><meta charset=\"utf-8\"><title>Worklog Tracker</title></head>\
<body style=\"font-family:system-ui;text-align:center;margin-top:20vh\"><h2>Готово ✓</h2>\
<p>Вход выполнен. Эту вкладку можно закрыть и вернуться в Worklog Tracker.</p></body></html>";

async fn wait_for_token(listener: TcpListener) -> Result<String, String> {
    loop {
        let (mut sock, _) = listener.accept().await.map_err(|e| e.to_string())?;
        let mut buf = [0u8; 4096];
        let n = match tokio::time::timeout(Duration::from_secs(5), sock.read(&mut buf)).await {
            Ok(Ok(n)) => n,
            _ => continue,
        };
        let req = String::from_utf8_lossy(&buf[..n]).to_string();
        let target = req.lines().next().unwrap_or("").split_whitespace().nth(1).unwrap_or("");
        let token = target.split_once('?').and_then(|(_, q)| {
            q.split('&').find_map(|kv| kv.strip_prefix("loginToken=")).map(|t| {
                urlencoding::decode(t).map(|c| c.into_owned()).unwrap_or_else(|_| t.to_string())
            })
        });
        let (status, body) = if token.is_some() { ("200 OK", DONE_PAGE) } else { ("404 Not Found", "") };
        let resp = format!(
            "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        );
        let _ = sock.write_all(resp.as_bytes()).await;
        let _ = sock.shutdown().await;
        if let Some(t) = token {
            return Ok(t);
        }
    }
}

/// `opener` is injected so the flow can be tested without a browser.
pub async fn sso_login_with(
    client: &reqwest::Client,
    base: &str,
    opener: impl FnOnce(&str) -> Result<(), String>,
) -> Result<Login, String> {
    let base = trim_url(base);
    let types = login_types(client, &base).await?;
    if !types.iter().any(|t| t == "m.login.sso") {
        return Err("Сервер не предлагает вход через SSO. Попробуйте вход по паролю.".into());
    }
    let listener = TcpListener::bind("127.0.0.1:0").await.map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let redirect = format!("http://127.0.0.1:{port}/");
    let url = format!(
        "{base}/_matrix/client/v3/login/sso/redirect?redirectUrl={}",
        urlencoding::encode(&redirect)
    );
    opener(&url)?;
    let token = tokio::time::timeout(Duration::from_secs(240), wait_for_token(listener))
        .await
        .map_err(|_| "Время ожидания входа истекло (4 минуты). Попробуйте ещё раз.".to_string())??;
    exchange(
        client,
        &base,
        json!({
            "type": "m.login.token",
            "token": token,
            "initial_device_display_name": "Worklog Tracker"
        }),
    )
    .await
}

pub async fn sso_login(client: &reqwest::Client, base: &str) -> Result<Login, String> {
    sso_login_with(client, base, crate::browser::open).await
}
