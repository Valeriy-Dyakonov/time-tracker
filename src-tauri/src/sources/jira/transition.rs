//! Moving a task along its Jira workflow. The transitions are whatever Jira allows for this task and user right now;
//! a transition is performed only on an explicit action of the user (see AGENTS.md).
use super::Jira;
use crate::error::{AppError, AppResult};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Choice {
    pub id: String,
    pub name: String,
}

/// A required field of the transition screen that the user picks from Jira's own list of values (e.g. resolution).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NeededField {
    pub id: String,
    pub name: String,
    pub multiple: bool,
    pub options: Vec<Choice>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Transition {
    pub id: String,
    pub name: String,
    /// Status the task gets.
    pub to: String,
    /// Jira status category of `to` ("new", "indeterminate", "done").
    pub category: String,
    pub fields: Vec<NeededField>,
    /// The screen asks for something the app cannot fill (free text, users...): do it in Jira.
    pub needs_jira: bool,
}

/// What the user chose for a required field: option ids.
#[derive(Debug, Deserialize)]
pub struct Picked {
    pub id: String,
    pub values: Vec<String>,
}

fn id_of(v: &Value) -> Option<String> {
    v["id"].as_str().map(String::from).or_else(|| v["id"].as_i64().map(|i| i.to_string()))
}

fn needed(id: &str, f: &Value) -> Option<NeededField> {
    let options: Vec<Choice> = f["allowedValues"]
        .as_array()?
        .iter()
        .filter_map(|o| Some(Choice { id: id_of(o)?, name: o["name"].as_str().or(o["value"].as_str())?.to_string() }))
        .collect();
    if options.is_empty() {
        return None;
    }
    Some(NeededField {
        id: id.to_string(),
        name: f["name"].as_str().unwrap_or(id).to_string(),
        multiple: f["schema"]["type"].as_str() == Some("array"),
        options,
    })
}

fn transition(t: &Value) -> Option<Transition> {
    let mut fields = vec![];
    let mut needs_jira = false;
    for (id, f) in t["fields"].as_object().into_iter().flatten() {
        if !f["required"].as_bool().unwrap_or(false) || f["hasDefaultValue"].as_bool().unwrap_or(false) {
            continue;
        }
        match needed(id, f) {
            Some(n) => fields.push(n),
            None => needs_jira = true,
        }
    }
    Some(Transition {
        id: id_of(t)?,
        name: t["name"].as_str().unwrap_or("").to_string(),
        to: t["to"]["name"].as_str().unwrap_or("").to_string(),
        category: t["to"]["statusCategory"]["key"].as_str().unwrap_or("").to_string(),
        fields,
        needs_jira,
    })
}

pub async fn list(client: &reqwest::Client, base: &str, pat: &str, key: &str) -> AppResult<Vec<Transition>> {
    let v = Jira::new(client, base, pat)
        .get(&format!("/rest/api/2/issue/{key}/transitions"), &[("expand", "transitions.fields".into())])
        .await?;
    Ok(v["transitions"].as_array().into_iter().flatten().filter_map(transition).collect())
}

/// The `fields` payload: single values as `{id}`, multi-selects as a list of them.
fn payload(picked: &[Picked], allowed: &[NeededField]) -> AppResult<Map<String, Value>> {
    let mut out = Map::new();
    for need in allowed {
        let p = picked.iter().find(|p| p.id == need.id);
        let values: Vec<&String> = p.map(|p| p.values.iter().collect()).unwrap_or_default();
        if values.is_empty() || values.iter().any(|v| !need.options.iter().any(|o| &o.id == *v)) {
            return Err(AppError::new("transitionField").with("field", need.name.clone()));
        }
        let one = |v: &String| json!({ "id": v });
        out.insert(need.id.clone(), if need.multiple { Value::Array(values.into_iter().map(one).collect()) } else { one(values[0]) });
    }
    Ok(out)
}

/// Performs a transition. The transition is looked up again, so only what Jira allows right now can be sent.
pub async fn perform(client: &reqwest::Client, base: &str, pat: &str, key: &str, id: &str, picked: &[Picked]) -> AppResult<()> {
    let all = list(client, base, pat, key).await?;
    let t = all.iter().find(|t| t.id == id).ok_or_else(|| AppError::new("transitionGone"))?;
    if t.needs_jira {
        return Err(AppError::new("transitionNeedsJira"));
    }
    let mut body = json!({ "transition": { "id": id } });
    let fields = payload(picked, &t.fields)?;
    if !fields.is_empty() {
        body["fields"] = Value::Object(fields);
    }
    Jira::new(client, base, pat)
        .api
        .send(Method::POST, &format!("{}/rest/api/2/issue/{key}/transitions", crate::util::trim_url(base)), &[], Some(&body))
        .await
        .map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Value {
        json!({
            "id": "31", "name": "Done", "to": { "name": "Closed", "statusCategory": { "key": "done" } },
            "fields": {
                "resolution": { "required": true, "name": "Resolution", "schema": { "type": "resolution" },
                    "allowedValues": [{ "id": "1", "name": "Fixed" }, { "id": "2", "name": "Won't fix" }] },
                "comment": { "required": false, "name": "Comment" },
                "fixVersions": { "required": true, "hasDefaultValue": true, "name": "Fix versions" }
            }
        })
    }

    #[test]
    fn asks_only_for_required_fields_with_values_to_pick() {
        let t = transition(&sample()).unwrap();
        assert_eq!((t.id.as_str(), t.to.as_str(), t.category.as_str(), t.needs_jira), ("31", "Closed", "done", false));
        assert_eq!(t.fields.len(), 1);
        assert_eq!(t.fields[0].options.len(), 2);
    }

    #[test]
    fn a_required_free_text_field_sends_the_user_to_jira() {
        let mut s = sample();
        s["fields"]["customfield_1"] = json!({ "required": true, "name": "Notes", "schema": { "type": "string" } });
        assert!(transition(&s).unwrap().needs_jira);
    }

    #[test]
    fn rejects_a_value_jira_did_not_offer() {
        let t = transition(&sample()).unwrap();
        let ok = payload(&[Picked { id: "resolution".into(), values: vec!["1".into()] }], &t.fields).unwrap();
        assert_eq!(ok["resolution"], json!({ "id": "1" }));
        assert!(payload(&[Picked { id: "resolution".into(), values: vec!["9".into()] }], &t.fields).is_err());
        assert!(payload(&[], &t.fields).is_err());
    }
}
