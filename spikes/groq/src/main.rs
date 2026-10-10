//! Groq gateway spike. See ai/plans/phase-1/01-groq-spike.md.
//!
//! Security rule: the API key is read from GROQ_API_KEY and only ever passed to
//! `bearer_auth`. It is never printed, logged, formatted with `{:?}`, or written
//! to a file. Request headers are never printed.

use std::collections::BTreeMap;
use std::error::Error;
use std::io::Write as _;
use std::path::PathBuf;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::Deserialize;
use serde_json::{Value, json};

/// Hard cap on API requests (including 429 retries) for one `measure` run.
const MAX_MEASURE_CALLS: usize = 20;
/// Wait for the per-minute token bucket when fewer tokens than this remain.
const MIN_TOKENS_BEFORE_CALL: u64 = 2600;

type AnyResult<T> = Result<T, Box<dyn Error>>;

const SYSTEM_PROMPT: &str = "You decide actions for one character in a survival \
simulation. Use only the information given. Reply with JSON that matches the schema.";

#[derive(Deserialize)]
struct Config {
    base_url: String,
    models: BTreeMap<String, String>,
    max_completion_tokens: u32,
    reasoning_effort: String,
    request_timeout_secs: u64,
}

/// Result of one chat completion call. Holds no secrets.
#[derive(Clone)]
struct CallRecord {
    model: String,
    reasoning_effort: String,
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
    reasoning_effort: &str,
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
        "reasoning_effort": reasoning_effort,
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
            reasoning_effort: reasoning_effort.to_string(),
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
        reasoning_effort: reasoning_effort.to_string(),
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
    println!("effort:         {}", record.reasoning_effort);
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

fn model_id<'a>(config: &'a Config, model_key: &str) -> AnyResult<&'a str> {
    config.models.get(model_key).map(String::as_str).ok_or_else(|| {
        let known: Vec<&str> = config.models.keys().map(String::as_str).collect();
        format!("unknown model key '{model_key}'. Known: {}", known.join(", ")).into()
    })
}

fn load_schema() -> AnyResult<Value> {
    serde_json::from_str(&read_file("decision-schema.json")?)
        .map_err(|e| format!("decision-schema.json is invalid: {e}").into())
}

async fn run_once(model_key: &str) -> AnyResult<()> {
    let config = load_config()?;
    let model = model_id(&config, model_key)?;
    let key = api_key()?;
    let context = read_file("sample-context.md")?;
    let schema = load_schema()?;

    let client = reqwest::Client::new();
    let record = call_model(
        &client,
        &config,
        &key,
        model,
        &config.reasoning_effort,
        &context,
        &schema,
    )
    .await?;
    print_record(&record)
}

fn header<'a>(record: &'a CallRecord, name: &str) -> Option<&'a str> {
    record
        .rate_headers
        .iter()
        .find(|(n, _)| n == name)
        .map(|(_, v)| v.as_str())
}

fn header_u64(record: &CallRecord, name: &str) -> Option<u64> {
    header(record, name).and_then(|v| v.parse().ok())
}

/// Parses Groq reset durations such as "16.117s", "1m26.4s", "2h3m4s", "250ms".
fn parse_reset(text: &str) -> Option<Duration> {
    let mut total = 0.0_f64;
    let mut number = String::new();
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        if c.is_ascii_digit() || c == '.' {
            number.push(c);
            continue;
        }
        let value: f64 = number.parse().ok()?;
        number.clear();
        total += match c {
            'h' => value * 3600.0,
            'm' if chars.peek() == Some(&'s') => {
                chars.next();
                value / 1000.0
            }
            'm' => value * 60.0,
            's' => value,
            _ => return None,
        };
    }
    if !number.is_empty() {
        return None;
    }
    Some(Duration::from_secs_f64(total))
}

fn unix_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis())
}

fn usage_u64(record: &CallRecord, path: &[&str]) -> Option<u64> {
    let mut value = &record.usage;
    for key in path {
        value = value.get(key)?;
    }
    value.as_u64()
}

/// Runs the measurement plan with pacing, 429 handling, and a call cap.
struct Measurer {
    client: reqwest::Client,
    config: Config,
    key: String,
    context: String,
    schema: Value,
    results: std::fs::File,
    calls_made: usize,
    last_by_model: BTreeMap<String, (Instant, CallRecord)>,
    records: Vec<(String, CallRecord)>,
}

impl Measurer {
    /// Waits if this model's per-minute token bucket is too low for another call.
    async fn pace(&self, model: &str) {
        let Some((at, last)) = self.last_by_model.get(model) else {
            return;
        };
        let remaining = header_u64(last, "x-ratelimit-remaining-tokens").unwrap_or(u64::MAX);
        if remaining >= MIN_TOKENS_BEFORE_CALL {
            return;
        }
        let reset = header(last, "x-ratelimit-reset-tokens")
            .and_then(parse_reset)
            .unwrap_or(Duration::from_secs(60));
        let wait = (reset + Duration::from_secs(1)).saturating_sub(at.elapsed());
        if !wait.is_zero() {
            println!("  pacing: {remaining} tokens left for {model}, waiting {:.1}s", wait.as_secs_f64());
            tokio::time::sleep(wait).await;
        }
    }

    async fn call(&mut self, phase: &str, model_key: &str, effort: &str) -> AnyResult<()> {
        let model = model_id(&self.config, model_key)?.to_string();
        for attempt in 1..=3 {
            if self.calls_made >= MAX_MEASURE_CALLS {
                return Err(format!("call cap of {MAX_MEASURE_CALLS} reached").into());
            }
            self.pace(&model).await;
            self.calls_made += 1;
            let record = call_model(
                &self.client,
                &self.config,
                &self.key,
                &model,
                effort,
                &self.context,
                &self.schema,
            )
            .await?;
            self.write_line(phase, model_key, attempt, &record)?;
            println!(
                "  #{:<2} {phase:<6} {model_key:<4} {effort:<6} status {} prompt {} completion {} reasoning {} json {} finish {} rpd-left {} tpm-left {}",
                self.calls_made,
                record.status,
                usage_u64(&record, &["prompt_tokens"]).map_or("-".into(), |v| v.to_string()),
                usage_u64(&record, &["completion_tokens"]).map_or("-".into(), |v| v.to_string()),
                usage_u64(&record, &["completion_tokens_details", "reasoning_tokens"])
                    .map_or("-".into(), |v| v.to_string()),
                record.json_valid,
                if record.finish_reason.is_empty() { "-" } else { &record.finish_reason },
                header(&record, "x-ratelimit-remaining-requests").unwrap_or("-"),
                header(&record, "x-ratelimit-remaining-tokens").unwrap_or("-"),
            );
            let status = record.status;
            let retry_after = header_u64(&record, "retry-after");
            self.last_by_model.insert(model.clone(), (Instant::now(), record.clone()));
            self.records.push((phase.to_string(), record));
            if status != 429 {
                return Ok(());
            }
            let wait = Duration::from_secs(retry_after.unwrap_or(30) + 1);
            println!("  429: waiting {}s before retry", wait.as_secs());
            tokio::time::sleep(wait).await;
        }
        Err(format!("{model_key}: still rate limited after 3 attempts").into())
    }

    fn write_line(&mut self, phase: &str, model_key: &str, attempt: u32, r: &CallRecord) -> AnyResult<()> {
        let headers: BTreeMap<&str, &str> = r
            .rate_headers
            .iter()
            .map(|(n, v)| (n.as_str(), v.as_str()))
            .collect();
        let line = json!({
            "unix_ms": unix_ms(),
            "phase": phase,
            "model_key": model_key,
            "model": r.model,
            "reasoning_effort": r.reasoning_effort,
            "attempt": attempt,
            "status": r.status,
            "elapsed_ms": r.elapsed_ms,
            "rate_headers": headers,
            "usage": r.usage,
            "finish_reason": r.finish_reason,
            "json_valid": r.json_valid,
            "reasoning_chars": r.reasoning_chars,
            "content": r.content,
            "error_body": r.error_body,
        });
        writeln!(self.results, "{line}")?;
        Ok(())
    }
}

/// Last successful call of a model within a phase.
fn last_ok<'a>(records: &'a [(String, CallRecord)], phase: &str, model: &str) -> Option<&'a CallRecord> {
    records
        .iter()
        .rev()
        .find(|(p, r)| p == phase && r.model == model && r.status == 200)
        .map(|(_, r)| r)
}

fn print_quota_check(m: &Measurer) -> AnyResult<()> {
    let id_20b = model_id(&m.config, "20b")?;
    let first_20b = m
        .records
        .iter()
        .find(|(p, r)| p == "quota" && r.model == id_20b && r.status == 200)
        .map(|(_, r)| r);
    let second_20b = last_ok(&m.records, "quota", id_20b);
    let (Some(a), Some(b)) = (first_20b, second_20b) else {
        println!("quota check: not enough successful 20b calls to compare");
        return Ok(());
    };
    let before = header_u64(a, "x-ratelimit-remaining-requests");
    let after = header_u64(b, "x-ratelimit-remaining-requests");
    println!("\nQuota separation check (daily requests, model 20b):");
    println!("  after 1st 20b call: {before:?}");
    println!("  after 3x 120b + 2nd 20b call: {after:?}");
    if let (Some(before), Some(after)) = (before, after) {
        let drop = before.saturating_sub(after);
        let verdict = match drop {
            0 | 1 => "SEPARATE (120b calls did not use 20b's daily requests)",
            4 => "SHARED (120b calls used 20b's daily requests)",
            _ => "UNCLEAR (check refill timing in the results file)",
        };
        println!("  drop: {drop} -> {verdict}");
    }
    Ok(())
}

fn print_summary(m: &Measurer) {
    println!("\nSummary (successful calls only):");
    println!("  model                 effort  calls  avg prompt  avg completion  avg reasoning  json ok  cut off");
    let mut groups: BTreeMap<(String, String), Vec<&CallRecord>> = BTreeMap::new();
    for (_, r) in &m.records {
        if r.status == 200 {
            groups
                .entry((r.model.clone(), r.reasoning_effort.clone()))
                .or_default()
                .push(r);
        }
    }
    for ((model, effort), rs) in &groups {
        let avg = |path: &[&str]| -> f64 {
            let sum: u64 = rs.iter().filter_map(|r| usage_u64(r, path)).sum();
            sum as f64 / rs.len() as f64
        };
        let json_ok = rs.iter().filter(|r| r.json_valid).count();
        let cut_off = rs.iter().filter(|r| r.finish_reason == "length").count();
        println!(
            "  {model:<21} {effort:<7} {:>5}  {:>10.0}  {:>14.0}  {:>13.0}  {:>4}/{:<2}  {:>7}",
            rs.len(),
            avg(&["prompt_tokens"]),
            avg(&["completion_tokens"]),
            avg(&["completion_tokens_details", "reasoning_tokens"]),
            json_ok,
            rs.len(),
            cut_off,
        );
    }
    let failed = m.records.iter().filter(|(_, r)| r.status != 200).count();
    println!("  total API requests: {}, non-200: {failed}", m.calls_made);
}

async fn run_measure() -> AnyResult<()> {
    let config = load_config()?;
    model_id(&config, "120b")?;
    model_id(&config, "20b")?;
    let key = api_key()?;
    let context = read_file("sample-context.md")?;
    let schema = load_schema()?;

    let results_dir = spike_dir().join("results");
    std::fs::create_dir_all(&results_dir)?;
    let results_path = results_dir.join(format!("{}.jsonl", unix_ms()));
    let results = std::fs::File::create(&results_path)?;

    let mut m = Measurer {
        client: reqwest::Client::new(),
        config,
        key,
        context,
        schema,
        results,
        calls_made: 0,
        last_by_model: BTreeMap::new(),
        records: Vec::new(),
    };

    // 1. Quota separation: 20b, then 3x 120b, then 20b again, back to back.
    //    Daily requests refill about one every 86.4 s, so keep these fast.
    println!("Phase 1: quota separation check");
    m.call("quota", "20b", "low").await?;
    for _ in 0..3 {
        m.call("quota", "120b", "low").await?;
    }
    m.call("quota", "20b", "low").await?;

    // 2. Token sizes by reasoning effort. Low is already covered above.
    println!("Phase 2: token sizes by reasoning effort");
    for effort in ["medium", "high"] {
        for model_key in ["120b", "20b"] {
            let repeats = if effort == "medium" { 2 } else { 1 };
            for _ in 0..repeats {
                m.call("tokens", model_key, effort).await?;
            }
        }
    }

    print_quota_check(&m)?;
    print_summary(&m);
    println!("\nresults: {}", results_path.display());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_groq_reset_durations() {
        assert_eq!(parse_reset("16.117s"), Some(Duration::from_secs_f64(16.117)));
        assert_eq!(parse_reset("1m26.4s"), Some(Duration::from_secs_f64(86.4)));
        assert_eq!(parse_reset("2h3m4s"), Some(Duration::from_secs(7384)));
        assert_eq!(parse_reset("250ms"), Some(Duration::from_millis(250)));
        assert_eq!(parse_reset("12"), None);
        assert_eq!(parse_reset("abc"), None);
    }
}

fn usage_text() -> &'static str {
    "usage: groq-spike once <model-key>   (model keys are in config.json, e.g. 120b, 20b)\n       groq-spike measure"
}

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let result = match args.iter().map(String::as_str).collect::<Vec<_>>().as_slice() {
        ["once", model_key] => run_once(model_key).await,
        ["measure"] => run_measure().await,
        _ => Err(usage_text().into()),
    };
    if let Err(error) = result {
        eprintln!("error: {error}");
        std::process::exit(1);
    }
}
