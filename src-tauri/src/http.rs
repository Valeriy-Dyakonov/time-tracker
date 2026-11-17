//! JSON GET shared by the REST sources: auth and status handling in one place.
use crate::error::{AppError, AppResult};
use crate::util::truncate;
use serde_json::Value;

pub enum Auth<'a> {
    Bearer(&'a str),
    Header(&'static str, &'a str),
}

pub struct JsonApi<'a> {
    client: &'a reqwest::Client,
    service: &'static str,
    auth: Auth<'a>,
    unauthorized: Option<&'static str>,
}

impl<'a> JsonApi<'a> {
    pub fn new(client: &'a reqwest::Client, service: &'static str, auth: Auth<'a>) -> Self {
        Self { client, service, auth, unauthorized: None }
    }

    /// Error code for HTTP 401 (with the server's reply as `body`); without it 401 is reported like any other status.
    pub fn on_unauthorized(mut self, code: &'static str) -> Self {
        self.unauthorized = Some(code);
        self
    }

    pub async fn get(&self, url: &str, query: &[(&str, String)]) -> AppResult<Value> {
        let req = self.client.get(url).header("Accept", "application/json").query(query);
        let req = match self.auth {
            Auth::Bearer(token) => req.bearer_auth(token),
            Auth::Header(name, value) => req.header(name, value),
        };
        let service = self.service;
        let resp = req.send().await.map_err(|e| AppError::service(service, e))?;
        let status = resp.status();
        let text = resp.text().await.map_err(AppError::raw)?;
        if status.as_u16() == 401 {
            if let Some(code) = self.unauthorized {
                return Err(AppError::new(code).with("body", truncate(&text, 120)));
            }
        }
        if !status.is_success() {
            return Err(AppError::http(service, status, &truncate(&text, 300)));
        }
        serde_json::from_str(&text).map_err(|e| AppError::service(service, format!("JSON: {e}")))
    }
}
