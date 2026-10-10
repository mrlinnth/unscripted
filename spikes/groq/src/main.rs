//! Groq gateway spike. See ai/plans/phase-1/01-groq-spike.md.
//!
//! Security rule: the API key is read from GROQ_API_KEY and only ever passed to
//! `bearer_auth`. It is never printed, logged, formatted with `{:?}`, or written
//! to a file. Request headers are never printed.

use std::error::Error;
use std::path::PathBuf;
use std::time::{Duration, Instant};

use serde::Deserialize;
use serde_json::{Value, json};

type AnyResult<T> = Result<T, Box<dyn Error>>;

const SYSTEM_PROMPT: &str = "You decide actions for one character in a survival \
simulation. Use only the information given. Reply with JSON that matches the schema.";

#[derive(Deserialize)]
struct Config {
    base_url: String,
    models: std::collections::BTreeMap<String, String>,
    max_completion_tokens: u32,
    reasoning_effort: String,
    request_timeout_secs: u64,
}

/// Result of one chat completion call. Holds no secrets.
struct CallRecord {
    model: String,
    status: u16,
    rate_headers: Vec<(String, String)>,
    usage: Value,
    finish_reason: String,
    content: String,
    json_valid: bool,
    reasoning_chars: usize,
    elapsed_ms: u128,
    error_body: Option<String>,
}

fn spike_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
}

fn read_file(name: &str) -> AnyResult<String> {
    let path = spike_dir().join(name);
    std::fs::read_to_string(&path)
        .map_err(|e| format!("cannot read {}: {e}", path.display()).into())
}

fn load_config() -> AnyResult<Config> {
    let text = read_file("config.json")?;
    serde_json::from_str(&text).map_err(|e| format!("config.json is invalid: {e}").into())
}

fn api_key() -> AnyResult<String> {
    match std::env::var("GROQ_API_KEY") {
        Ok(key) if !key.trim().is_empty() => Ok(key),
        _ => Err("GROQ_API_KEY is not set. Export it in your shell, then run again.".into()),
    }
}

async fn call_model(
    client: &reqwest::Client,
    config: &Config,
    key: &str,
    model: &str,
    context: &str,
    schema: &Value,
) -> AnyResult<CallRecord> {
    let body = json!({
        "model": model,
        "messages": [
            { "role": "system", "content": SYSTEM_PROMPT },
            { "role": "user", "content": context }
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": { "name": "npc_decision", "strict": true, "schema": schema }
        },
        "max_completion_tokens": config.max_completion_tokens,
        "reasoning_effort": config.reasoning_effort,
    });

    let started = Instant::now();
    let response = client
        .post(&config.base_url)
        .bearer_auth(key)
        .json(&body)
        .timeout(Duration::from_secs(config.request_timeout_secs))
        .send()
        .await?;
    let elapsed_ms = started.elapsed().as_millis();

    let status = response.status().as_u16();
    let mut rate_headers: Vec<(String, String)> = response
        .headers()
        .iter()
        .filter(|(name, _)| {
            let name = name.as_str();
            name.starts_with("x-ratelimit-") || name == "retry-after"
        })
        .map(|(name, value)| {
            let value = value.to_str().unwrap_or("<non-text>").to_string();
            (name.as_str().to_string(), value)
        })
        .collect();
    rate_headers.sort();

    let text = response.text().await?;

    if !(200..300).contains(&status) {
        return Ok(CallRecord {
            model: model.to_string(),
            status,
            rate_headers,
            usage: Value::Null,
            finish_reason: String::new(),
            content: String::new(),
            json_valid: false,
            reasoning_chars: 0,
            elapsed_ms,
            error_body: Some(text),
        });
    }

    let parsed: Value = serde_json::from_str(&text)
        .map_err(|e| format!("response body is not JSON: {e}"))?;
    let choice = &parsed["choices"][0];
    let content = choice["message"]["content"].as_str().unwrap_or("").to_string();
    let reasoning_chars = choice["message"]["reasoning"].as_str().map_or(0, str::len);

    Ok(CallRecord {
        model: model.to_string(),
        status,
        rate_headers,
        usage: parsed["usage"].clone(),
        finish_reason: choice["finish_reason"].as_str().unwrap_or("").to_string(),
        json_valid: serde_json::from_str::<Value>(&content).is_ok(),
        content,
        reasoning_chars,
        elapsed_ms,
        error_body: None,
    })
}

fn print_record(record: &CallRecord) -> AnyResult<()> {
    println!("model:          {}", record.model);
    println!("status:         {}", record.status);
    println!("elapsed:        {} ms", record.elapsed_ms);
    println!("rate headers:");
    if record.rate_headers.is_empty() {
        println!("  (none)");
    }
    for (name, value) in &record.rate_headers {
        println!("  {name}: {value}");
    }
    if let Some(body) = &record.error_body {
        println!("error body:     {body}");
        return Ok(());
    }
    println!("finish_reason:  {}", record.finish_reason);
    println!("json valid:     {}", record.json_valid);
    println!("reasoning:      {} chars", record.reasoning_chars);
    println!("usage:\n{}", serde_json::to_string_pretty(&record.usage)?);
    println!("content:\n{}", record.content);
    Ok(())
}

async fn run_once(model_key: &str) -> AnyResult<()> {
    let config = load_config()?;
    let model = config.models.get(model_key).ok_or_else(|| {
        let known: Vec<&str> = config.models.keys().map(String::as_str).collect();
        format!("unknown model key '{model_key}'. Known: {}", known.join(", "))
    })?;
    let key = api_key()?;
    let context = read_file("sample-context.md")?;
    let schema: Value = serde_json::from_str(&read_file("decision-schema.json")?)
        .map_err(|e| format!("decision-schema.json is invalid: {e}"))?;

    let client = reqwest::Client::new();
    let record = call_model(&client, &config, &key, model, &context, &schema).await?;
    print_record(&record)
}

fn usage_text() -> &'static str {
    "usage: groq-spike once <model-key>   (model keys are in config.json, e.g. 120b, 20b)"
}

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let result = match args.iter().map(String::as_str).collect::<Vec<_>>().as_slice() {
        ["once", model_key] => run_once(model_key).await,
        _ => Err(usage_text().into()),
    };
    if let Err(error) = result {
        eprintln!("error: {error}");
        std::process::exit(1);
    }
}
