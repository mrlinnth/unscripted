# Phase 1 Requirements: Deterministic World + Groq Spike

Confirmed by developer: 2026-10-10

Source of truth: [Unscripted.md](../../Unscripted.md) §10 Phase 1 and Appendix A.
If this file and the spec disagree, the spec wins. Stack and rules:
[CONSTRAINTS.md](../../CONSTRAINTS.md).

## Overview

Phase 1 builds the island world with no AI inside the game:

1. A Groq spike (a small throwaway test program) to measure real AI limits.
2. A pure TypeScript engine that runs the Appendix A rules from a seed.
3. Tests for scenarios T1–T5 (A.13), plus a few extra rule tests.
4. A bare Tauri + React + Mantine dev shell to watch and drive the engine.

The engine is the authority. Same seed and same actions must give an identical
event log.

## 1. Groq Gateway Spike

Goal: answer the open questions in spec §7.5, §7.10, and §10.

- Standalone Rust command-line program in `spikes/groq/`. Not part of the app.
- Reads the API key from the `GROQ_API_KEY` environment variable. Never prints,
  logs, or writes the key.
- Model IDs come from a config value (likely `openai/gpt-oss-120b` and
  `openai/gpt-oss-20b`; confirm in the Groq docs).
- Sample context: a hand-written NPC decision prompt of about 1,500 tokens
  (made-up NPC identity, state, goals, recent events), asking for a JSON reply.
- Calls each model a few times (total about 10–20 calls).
- For each call, records:
  - All `x-ratelimit-*` headers and `retry-after` if present.
  - `usage` from the response: prompt, completion, and cached tokens.
  - Whether the reply is valid JSON.
  - Response time.
- Daily request quota check: read model B's `x-ratelimit-remaining-requests`,
  call model A, then read model B again. If B did not drop, request quotas are
  separate.
- Daily token quota check (manual): headers only show tokens per minute, so
  read tokens per day for both models on the Groq console limits page.
- Output: `spikes/groq/FINDINGS.md` with the measured limits, whether quotas are
  separate, real token sizes, and whether the §7.10 budget holds or must be
  halved.

## 2. Engine

### General

- Pure TypeScript in `src/engine/`. No React, Mantine, or Tauri imports.
- All Appendix A numbers come from one JSON config file. Tests may pass their
  own config or overrides.
- No `Math.random`, `Date.now`, `new Date()`, or real timers in the engine. One
  seeded random number generator.
- Fatigue and fire fuel are stored as whole numbers in small units, so rounding
  can never break determinism.
- The engine advances by explicit step calls of one in-game minute. Real-time
  speed lives in the UI.

### World and characters

- Five locations and five routes as in A.3. No Beach Camp – Hilltop route.
- Three characters start at Beach Camp: the player and two unnamed NPCs.
  All follow the same physics. NPCs act only when a test or the shell gives
  them an action; otherwise they wait.
- Starting conditions as in A.11.
- Per-character map knowledge as in A.3. Explore reveals only to the explorer.

### Clock and weather

- Starts Day 1 08:00. Ends Day 3 08:00. After the end, the clock stops and all
  actions are rejected.
- Day and night as in A.2.
- The 48-hour weather sequence is rolled from the seed at session start (A.7).
  First hour is Clear.
- Tests can force the weather sequence and the Wreckage search order (A.13).

### Actions

- Action table as in A.12.
- An action's duration is fixed when it starts, using the modifiers at that
  moment. Fractional minutes round up.
- Validation failure: rejected before it starts, costs no time, logged.
- Interruption: each minute, re-check the action's own A.12 requirements. If
  one fails, the action stops and partial work is lost. Examples: wood becomes
  wet during Build, Heavy Rain during Light, becoming Exhausted while gathering,
  health falling below 30.
- Travel always continues to the destination, even if the route closes.
- Collapse and death stop any action. Collapse during travel happens on arrival.
- The player can cancel any action except travel. Partial work is lost.
- Sleep takes an optional length. Without one, it ends when fatigue reaches 0.
  Collapse sleep ends when fatigue is below 480 (A.8).
- Health below 30 blocks gather, build, repair, and search (A.9 applies even
  where an A.12 row leaves it out).
- Explore is allowed while Exhausted (neither A.8 nor A.12 blocks it).

### Physical rules

- Fatigue as in A.8. Take, drop, and give count as +1 per minute, like work.
- Health as in A.9. At 0 the character dies and can no longer act. The world
  continues.
- Shelter as in A.10.
- Items, carry slots, lighter uses, and flashlight battery as in A.4.
- Wreckage search as in A.5.
- Signal fire, fuel, and wet wood as in A.6.
- Hourly effects (storm damage, shelter loss, wood drying) are applied on the
  hour, based on where each character and item is at that moment.

### Event log

- Append-only and in memory.
- Records: action started, completed, rejected, interrupted, and cancelled;
  weather change; fire state change; fatigue condition change; discovery; item
  found; collapse; death; session end.
- Each entry has game time, never wall-clock time.

### Seed

- The engine takes the seed as input. The shell creates a new seed outside the
  engine and shows it.

## 3. Bare Dev Shell

- One Tauri + React + Mantine screen. It is not the final UI.
- World truth view: all characters (location, fatigue, health, inventory,
  current action), all locations and items, fire, shelter, weather, and the
  event log.
- Player action buttons, with inputs where needed (destination, item, minutes).
- Speed controls: pause, 1×, 2×, 4×. At 1×, one game minute takes 1.25 real
  seconds (30 real minutes per game day, §2.4).
- A "skip to end of current action" button.
- The seed is shown at session start.

## Acceptance Criteria

- T1–T5 from A.13 pass as Vitest tests with the exact expected values.
- T5 compares two full event logs for exact equality.
- Extra tests cover: wet wood and drying, the 8-hour fuel cap, the lighter's
  3 uses, flashlight battery, carry slots, and rejected actions costing no time.
- `npm run typecheck && npm test` passes, and `cargo check` in `src-tauri/`
  passes.
- The shell runs with `npm run tauri dev` and can play T1 by hand.
- `spikes/groq/FINDINGS.md` exists and answers all spike questions.

## Out of Scope

- AI calls inside the game.
- NPC profiles, goals, and behavior.
- Knowledge, beliefs, memory.
- Limited player view, journal, narration, suggested actions.
- SQLite, save and load, OS key storage, final report.
- Social actions, injuries, wildlife (A.1).
