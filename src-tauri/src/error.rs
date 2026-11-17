//! Errors reported to the frontend as `{ code, params }`: the backend says what went wrong,
//! the UI words it in the user's language (src/i18n/messages/*/errors.ts).
use serde::Serialize;
use serde_json::{Map, Value};

#[derive(Debug, Serialize)]
pub struct AppError {
    pub code: &'static str,
    #[serde(skip_serializing_if = "Map::is_empty")]
    pub params: Map<String, Value>,
}

pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    pub fn new(code: &'static str) -> Self {
        Self { code, params: Map::new() }
    }

    pub fn with(mut self, key: &str, value: impl Into<Value>) -> Self {
        self.params.insert(key.to_string(), value.into());
        self
    }

    /// A technical failure with no dedicated wording (I/O, TLS, malformed data): shown as is.
    pub fn raw(detail: impl ToString) -> Self {
        Self::new("raw").with("detail", detail.to_string())
    }

    /// Prefixes the service name to a technical failure, e.g. "Jira: connection refused".
    pub fn service(service: &str, detail: impl ToString) -> Self {
        Self::new("service").with("service", service).with("detail", detail.to_string())
    }

    pub fn http(service: &str, status: impl ToString, body: &str) -> Self {
        Self::new("http").with("service", service).with("status", status.to_string()).with("body", body)
    }

    pub fn detail(&self) -> String {
        self.params.get("detail").and_then(Value::as_str).unwrap_or(self.code).to_string()
    }
}

impl From<String> for AppError {
    fn from(s: String) -> Self {
        Self::raw(s)
    }
}

impl From<&str> for AppError {
    fn from(s: &str) -> Self {
        Self::raw(s)
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, Value::Object(self.params.clone()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_code_and_params() {
        let e = AppError::new("tokenMissing").with("secret", "jira_pat");
        assert_eq!(serde_json::to_string(&e).unwrap(), r#"{"code":"tokenMissing","params":{"secret":"jira_pat"}}"#);
        assert_eq!(serde_json::to_string(&AppError::new("llmNoAnswer")).unwrap(), r#"{"code":"llmNoAnswer"}"#);
    }
}
