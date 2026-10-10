# Project Constraints
Generated: 2026-10-10
Confirmed by developer: yes

## Project

Unscripted: a single-player, text-based AI island survival simulation, built as
a personal experiment. Design spec: [Unscripted.md](Unscripted.md). The spec
wins over this file and over the PRD. Never edit the spec.

## Fixed Technical Decisions

- Tauri v2 desktop app, Linux first (Debian 13).
- React + TypeScript frontend. Mantine for UI components.
- Game simulation engine in TypeScript, independent of React.
- AI requests and the API key live only in the Rust layer. The key is stored in
  secure OS storage and never reaches the webview, logs, or the debugger.
- SQLite for all persistence. Rust owns SQLite (rusqlite) and exposes a few
  typed Tauri commands. The TS engine never touches the database directly.
- AI provider: Groq free tier, OpenAI-compatible API. Models gpt-oss-120b (NPC
  decisions) and gpt-oss-20b (interpreter, narration). Model names are config
  values. Exact Groq model IDs are confirmed by the spike.
- All Appendix A numbers are read from one config file, never hardcoded.
- Simulation must be deterministic from a seed. Same seed and same actions must
  give an identical event log.
- Simplest solution that meets the current phase. No speculative abstraction.

## Stack & Versions

Checked on npm, crates.io, rust-lang.org, and nodejs.org on 2026-10-10. Rule:
use the latest stable major only if its first stable release is at least 3
months old.

| Package / Framework | Version | Notes |
|---|---|---|
| Rust | 1.99 stable | |
| Node.js | 24 LTS (Krypton) | Target. 22.12+ also works (the VPS runs 22.13; accepted by the developer) |
| tauri (crate) | 2.12 | v2 since Oct 2024 |
| tauri-build (crate) | 2.7 | |
| @tauri-apps/api | 2.12 | |
| @tauri-apps/cli | 2.12 | |
| create-tauri-app | 4.7 | Scaffold only |
| react, react-dom | 19.3 | |
| @types/react, @types/react-dom | 19.3 | Dev only. Type definitions for React; came with the Tauri template |
| typescript | 7.0 | Released Jul 8 2026. Native port, same type checking as 6.0 |
| @mantine/core, @mantine/hooks | 9.7 | Peer: react ^19.2 |
| vite | 8.3 | |
| @vitejs/plugin-react | 6.1 | Peer: vite ^8 |
| vitest | 4.1 | Not 5.x: 5.0.0 released Sep 3 2026, under 3 months. Supports vite ^8 |
| reqwest (crate) | 0.13 | Groq spike only in Phase 1 |
| tokio (crate) | 1.53 | Groq spike only in Phase 1 |
| serde, serde_json (crates) | 1.0 | |
| rusqlite (crate) | 0.40 | Not used in Phase 1. Recheck version when first added |
| keyring (crate) | 4.2 | Not used in Phase 1 (OS key storage, Phase 4). Recheck when first added |

Do not add packages beyond this list without asking. Do not invent package
names or config options; check official docs.

## Language Standards

- **TypeScript**: strict mode on. No `any`. Explicit return types on exported
  engine functions.
- **Rust**: edition from the Tauri template. No `unwrap()` on input from outside
  the program (network, files, user input) in app code. Spike code may be
  rougher.
- **CSS**: Mantine components and props. No extra CSS framework.

## Coding Conventions

- Engine lives in `src/engine/`. It must not import React, Mantine, or
  `@tauri-apps/*`. It runs in plain Node under Vitest.
- React does not change world state directly. It sends actions to the engine
  and renders engine state (spec §7.2).
- Determinism: inside the engine, no `Math.random`, `Date.now`, `new Date()`,
  or real timers. Use one seeded random number generator. Game time is whole
  in-game minutes. Event log entries have no wall-clock fields.
- The engine clock is advanced by explicit step calls. Real-time pacing (1×,
  2×, 4×) lives outside the engine, in the UI layer.
- World rules config: one JSON file (for example
  `src/engine/config/world-rules.json`), loaded and checked at startup. Tests
  may pass their own config or overrides.
- Rust layer is thin: secrets, network, database, OS access. Game rules stay in
  TypeScript.
- API key: never logged, printed, sent to the webview, or committed. The spike
  reads it from an environment variable only.
- Abstractions: only when there is clear reuse or complexity. No speculative
  abstraction.
- Naming: React and TypeScript standard naming; Rust standard naming.
- File structure: Tauri template defaults (`src/`, `src-tauri/`). Spike code in
  `spikes/groq/`, outside the app.

## Verification

Command: `npm run typecheck && npm test`, plus `cargo check` in `src-tauri/`.
For the spike: `cargo check` in `spikes/groq/`.
Expected: no type errors, all Vitest tests pass, Rust builds.

If a plan file specifies its own verification, use that instead for those tasks.

## Workflow

Autonomous: no. Skills stop at confirmation gates. Destructive actions and
pushes always require confirmation.

## Explicit Exclusions

- Never edit `ai/Unscripted.md`.
- No AI calls inside the game in Phase 1.
- No SQLite in Phase 1 (event log is in memory).
- No hardcoded Appendix A numbers.
- No API key outside the Rust layer.
- No TypeScript SQLite libraries or `tauri-plugin-sql`. Rust owns SQLite.

## Plan File Format

Plan files live in `ai/plans/<feature-name>/`, sorted by filename
(e.g. `01-setup.md`, `02-auth.md`). Each feature gets its own subdirectory.

Tasks use this heading format (H2, bare ID — no brackets):
## Task N.N: Title

When a task is completed, append ` [DONE]` to the heading:
## Task N.N: Title [DONE]
