# Phase 1: Groq Gateway Spike

Goal: answer spec §7.5, §7.10, and §10 with real numbers. Throwaway code, not
part of the app. Read `ai/plans/phase-1/requirements.md` section 1 first.

This file does not depend on any other plan file.

Facts checked in Groq docs on 2026-10-10 (re-check if anything fails):
- Endpoint: `https://api.groq.com/openai/v1/chat/completions` (OpenAI-compatible).
- Headers: `x-ratelimit-limit-requests` and `x-ratelimit-remaining-requests` are
  per DAY. `x-ratelimit-limit-tokens` and `x-ratelimit-remaining-tokens` are per
  MINUTE. `retry-after` only on HTTP 429. There is no tokens-per-day header.
- Cached tokens do not count toward rate limits.
- Both gpt-oss models support `response_format` with
  `{ "type": "json_schema", "json_schema": { "name", "strict": true, "schema" } }`.
- gpt-oss request options: `reasoning_effort` (`low` / `medium` / `high`),
  `include_reasoning` (default true), `max_completion_tokens` (default 1024).

## Task 1.1: Spike Setup and First Call

### Subtasks
- Create a standalone Cargo binary project in `spikes/groq/` (its own
  `Cargo.toml`, not part of any workspace with `src-tauri/`).
- Add dependencies from `ai/CONSTRAINTS.md` only: `reqwest` 0.13, `tokio` 1.53,
  `serde` 1.0, `serde_json` 1.0. Check each crate's docs on docs.rs for the
  feature names needed (JSON bodies, async main). Do not add other crates.
- Create `spikes/groq/config.json` with: base URL, the two model IDs
  (`openai/gpt-oss-120b`, `openai/gpt-oss-20b`; confirm on the Groq models
  page), `max_completion_tokens`, and `reasoning_effort`.
- Write `spikes/groq/sample-context.md`: a hand-written NPC decision prompt of
  about 1,500 tokens following spec §4.4 and §4.5 order (made-up identity,
  physical state, goals, plan, known map, recent observations and events). End
  with an instruction to reply with a JSON decision.
- Write `spikes/groq/decision-schema.json`: a small JSON schema for the reply
  (for example `action`, `target`, `reason`, `plan_change`).
- In `src/main.rs`: read `GROQ_API_KEY` from the environment. If missing, exit
  with a clear message. Never print, log, format with `{:?}`, or write the key
  or the `Authorization` header anywhere.
- Implement one subcommand `once <model-key>` that sends the sample context
  with the schema as `response_format` and prints: HTTP status, all
  `x-ratelimit-*` headers, `retry-after` if present, the full `usage` object,
  `finish_reason`, elapsed time, and whether the content parses as JSON.
- Add `spikes/groq/target/` and `spikes/groq/results/` to the root `.gitignore`
  (create `.gitignore` if it does not exist yet).

### Key Files
- `spikes/groq/Cargo.toml`
- `spikes/groq/src/main.rs`
- `spikes/groq/config.json`
- `spikes/groq/sample-context.md`
- `spikes/groq/decision-schema.json`
- `.gitignore`

### Verification
- `cargo check --manifest-path spikes/groq/Cargo.toml` passes.
- The developer runs `cargo run --manifest-path spikes/groq/Cargo.toml -- once 120b`
  with `GROQ_API_KEY` set, and sees headers, usage, and valid JSON.
- `grep -rn "gsk_" spikes/groq/` finds nothing (no key committed).
- Running the command without `GROQ_API_KEY` exits with a clear message and no panic.

---

## Task 1.2: Measurements and Findings

Depends on: Task 1.1

### Subtasks
- Add a subcommand `measure` that runs a fixed plan and writes every call's
  record (time, model, reasoning effort, status, headers, usage, finish_reason,
  JSON valid, elapsed ms) as JSON lines to `spikes/groq/results/<timestamp>.jsonl`.
  Total calls: 20 or fewer.
- Quota separation check in `measure`:
  1. Call model 20b once; save its `x-ratelimit-remaining-requests` (R20).
  2. Call model 120b three times.
  3. Call model 20b again; compare its remaining-requests to R20.
  If it dropped by 1 only (its own call), daily request quotas are separate. If
  it dropped by 4, they are shared. Record the result.
- Token size check: run the sample context on each model with
  `reasoning_effort` `low` and `medium` (2–3 calls each). Record prompt,
  completion, and cached tokens, plus any reasoning token detail the `usage`
  object contains. Note whether `finish_reason` is `length` (output cut off).
- If HTTP 429 happens, record `retry-after`, wait that long, and continue.
- Print a short summary table at the end (per model: calls, average prompt
  tokens, average completion tokens, JSON valid rate).
- Manual step for the developer: open the Groq console limits page and copy
  RPM, RPD, TPM, and TPD for both models into the findings.
- Write `spikes/groq/FINDINGS.md` with:
  - Measured limits per model (from headers and the console page).
  - Whether daily request quotas are separate (from the check) and whether
    daily token quotas are separate (from the console page).
  - Real token sizes per call, and how they compare to the ~1,800 tokens per
    call assumed in spec §7.10.
  - Which `reasoning_effort` and `max_completion_tokens` keep JSON complete.
  - A clear answer: does the §7.10 session budget hold, or must it be halved
    (§7.5)? Do not edit the spec; the developer decides on spec changes.

### Key Files
- `spikes/groq/src/main.rs`
- `spikes/groq/FINDINGS.md`

### Verification
- The developer runs `cargo run --manifest-path spikes/groq/Cargo.toml -- measure`.
- A results file exists in `spikes/groq/results/` and contains no API key
  (`grep -c "gsk_" spikes/groq/results/*.jsonl` prints 0).
- `spikes/groq/FINDINGS.md` answers every question listed above.
