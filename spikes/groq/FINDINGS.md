# Groq Spike Findings

Date: 2026-10-10. Plan: `ai/plans/phase-1/01-groq-spike.md`.
Raw data: `spikes/groq/results/*.jsonl` (not committed).

Calls made today: 15 (2 in Task 1.1, 11 in `measure`, 2 extra `high` effort
checks). Sample context: `sample-context.md`, a ~1,500-token NPC decision prompt
with a strict JSON schema (`decision-schema.json`).

## Short answer

- **Daily request quotas are separate per model.** Measured, see below.
- **Per-minute token limits are separate per model.** Measured, see below.
- **Daily token quotas: still to confirm** on the Groq console (manual step
  below). Headers do not show tokens per day.
- **Real call size at `low` effort: about 1,900–2,000 tokens**, slightly more
  than the ~1,800 in spec §7.10.
- **Budget verdict:** the §7.10 plan fits **if** daily token quotas are separate
  (each model needs about 120,000 of 200,000 tokens per day at `low` effort).
  If daily token quotas are shared, the two models together need about 234,000,
  which is over 200,000, and the budget must be cut as §7.5 says.
- **Use `reasoning_effort: low`** (or `medium` with more output room). `high`
  breaks JSON at a 1,024-token output limit.

## Limits seen in headers

Same for both models:

| Header | Value | Meaning |
|---|---|---|
| `x-ratelimit-limit-requests` | 1,000 | Requests per day |
| `x-ratelimit-limit-tokens` | 8,000 | Tokens per minute |
| `x-ratelimit-reset-requests` | used × 86.4 s | See "Daily requests refill" |

## Manual step: Groq console limits (developer fills in)

Open https://console.groq.com/settings/limits and copy the values:

| Model | RPM | RPD | TPM | TPD | Shared with the other model? |
|---|---|---|---|---|---|
| `openai/gpt-oss-120b` | | | | | |
| `openai/gpt-oss-20b` | | | | | |

Groq docs (rate limits page, checked 2026-10-10) list 30 RPM, 1K RPD, 8K TPM,
200K TPD for both, but label them as Developer plan base limits. Confirm the
free-tier numbers above.

## Quota separation

Daily requests: called 20b, then 120b three times, then 20b again, back to back.

| Call | Model | Remaining requests (that model) |
|---|---|---|
| 1 | 20b | 999 |
| 2–4 | 120b | 999, 998, 997 |
| 5 | 20b | 998 |

20b dropped by 1 (its own call), not 4. 120b started at 999 after one 20b call.
**Daily request quotas are separate.**

Tokens per minute: after 120b fell to 2,233 tokens left, the next 20b call still
had 4,581 left. **Per-minute token limits are separate.**

## Real token sizes

Successful calls, same ~1,500-token context. Prompt tokens include the system
message and the JSON schema.

| Model | Effort | Calls | Prompt | Completion (avg) | Reasoning (avg) | Total per call | JSON valid |
|---|---|---|---|---|---|---|---|
| 120b | low | 4 | 1,733 | 242 | 151 | ~1,975 | 4/4 |
| 120b | medium | 2 | 1,781 | 614 | 539 | ~2,395 | 2/2 |
| 120b | high (4,096 limit) | 1 | 1,781 | 1,308 | 1,229 | ~3,090 | 1/1 |
| 20b | low | 3 | 1,733 | 189 | 133 | ~1,920 | 3/3 |
| 20b | medium | 2 | 1,781 | 696 | 634 | ~2,480 | 2/2 |
| 20b | high (4,096 limit) | 1 | 1,781 | 3,516 | 3,453 | ~5,300 | 1/1 |

Notes:
- Reasoning tokens are part of completion tokens and count toward limits.
- `medium` and `high` add 48 prompt tokens compared with `low`.
- No cached-token field appeared in `usage`, even for repeated identical
  prompts. Do not plan on caching to save budget.
- Response time: 0.7–2.7 s at low/medium, 3.3–4.1 s at high.

## Reasoning effort and output limit

- `high` with `max_completion_tokens: 1024` failed on both models with HTTP 400
  `json_validate_failed` and an empty `failed_generation`. With 4,096 it
  succeeded. The reasoning used up the output limit before any JSON was written.
- `low` and `medium` never hit the 1,024 limit (largest: 818 tokens, 20b medium).
- **Failed calls still cost quota:** each 400 used one daily request and about
  2,000 tokens from the per-minute bucket.

Suggested Phase 4 settings: `reasoning_effort: low`, `max_completion_tokens:
1024`. If decisions are too shallow, try `medium` with about 1,536.

## Daily requests refill

`x-ratelimit-reset-requests` was always (requests used) × 86.4 s (86.4 s =
1 day / 1,000). The daily request quota looks like a rolling bucket that
refills about one request every 86.4 s, not a midnight reset. For spec §7.10
"save and pause until the quota resets", waiting minutes may be enough for
requests. Daily tokens may behave differently; not measured.

## Budget against spec §7.10

At `low` effort, using the measured ~1,975 (120b) and ~1,920 (20b) tokens per
call:

| Model | Planned calls | Tokens per session | Daily limit | Fits? |
|---|---|---|---|---|
| 120b | ~62 | ~122,000 | 200,000 TPD, 1,000 RPD | Yes |
| 20b | ~60 | ~115,000 | 200,000 TPD, 1,000 RPD | Yes |
| Both, if TPD is shared | ~122 | ~237,000 | 200,000 TPD | No |

The 20b numbers assume interpreter and narration contexts as large as an NPC
decision. They will likely be smaller.

Per-minute: 8,000 tokens per minute allows about 4 calls per minute per model at
`low` effort, as §7.10 expects (3 at `medium`).

The spec is not changed. The developer decides on any spec update.

## Output quality notes (for Phase 4)

- All 13 successful replies were valid JSON and matched the schema.
- `target` was loose free text ("sky", "shelter", "Forest"). Phase 4 schemas
  should limit `target` to known ids (for example an enum built per request).
- Choices were reasonable for the character: mostly "go to the Forest for
  wood" or "repair the shelter now", once "observe the weather".
