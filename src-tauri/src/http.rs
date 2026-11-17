//! JSON GET shared by the REST sources: auth, status handling and error wording in one place.
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
    unauthorized: Option<fn(&str) -> String>,
}

impl<'a> JsonApi<'a> {
    pub fn new(client: &'a reqwest::Client, service: &'static str, auth: Auth<'a>) -> Self {
        Self { client, service, auth, unauthorized: None }
    }

    /// Message for HTTP 401 built from the response body; without it 401 is reported like any other error.
    pub fn on_unauthorized(mut self, message: fn(&str) -> String) -> Self {
        self.unauthorized = Some(message);
        self
    }

    pub async fn get(&self, url: &str, query: &[(&str, String)]) -> Result<Value, String> {
        let req = self.client.get(url).header("Accept", "application/json").query(query);
        let req = match self.auth {
            Auth::Bearer(token) => req.bearer_auth(token),
            Auth::Header(name, value) => req.header(name, value),
        };
        let service = self.service;
        let resp = req.send().await.map_err(|e| format!("{service}: {e}"))?;
        let status = resp.status();
        let text = resp.text().await.map_err(|e| e.to_string())?;
        if status.as_u16() == 401 {
            if let Some(message) = self.unauthorized {
                return Err(message(&text));
            }
        }
        if !status.is_success() {
            return Err(format!("{service} HTTP {status}: {}", truncate(&text, 300)));
        }
        serde_json::from_str(&text).map_err(|e| format!("{service} JSON: {e}"))
    }
}
