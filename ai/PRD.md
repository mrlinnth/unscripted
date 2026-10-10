# Product Requirements Document
Generated: 2026-10-10
Confirmed by developer: yes

## Source of Truth

All design details live in [Unscripted.md](Unscripted.md) (design spec v0.3).
This PRD only sets goals, scope, and phases, and links to the spec.

- If this PRD and the spec disagree, the spec wins.
- Never edit `ai/Unscripted.md`. Only the developer changes the spec.

## Overview

Unscripted is a single-player, text-based AI island survival simulation. One
player and two autonomous NPCs (non-player characters) spend two in-game nights
on an island. The player's goal is a signal fire. See spec §1.1–1.5.

## Problem

This is a personal experiment, not a commercial product. It tests whether a few
AI-assisted characters can create believable situations without scripted
stories, within free AI provider limits. See spec §1.4.

## Target Users

The developer, playing and testing on a Linux desktop.

## Current Scope: Phase 2

Phase 1 ("Deterministic World" plus the AI gateway spike, spec §10) is done.
Phase 2 is "Autonomous Characters" (see the Phase 2 section below). Neither
phase has AI in the game. Later phases are planned after Phase 2 is done.

## Core Features (Phase 1)

### Project scaffold
**Scope:** Tauri v2 + React + TypeScript + Mantine app, with Vitest and a
typecheck script set up. Stack is fixed in [CONSTRAINTS.md](CONSTRAINTS.md).
**Dependencies:** None
**Priority:** 1

### World rules config
**Scope:** All Appendix A numbers in one JSON config file, loaded and checked at
startup. The engine hardcodes no rule numbers. Spec: Appendix A.1.
**Dependencies:** Project scaffold
**Priority:** 1

### Simulation core
**Scope:** One-minute game clock with pause/1×/2×/4×, seeded random numbers,
day and night, 48-hour weather sequence rolled from the seed, and an in-memory
append-only event log. Spec: §2.4, §4.2, §7.3, A.2, A.7.
**Dependencies:** World rules config
**Priority:** 2

### World and actions
**Scope:** Locations, routes, travel modifiers, explore and per-character map
knowledge, items and carry slots, Wreckage search, fatigue, health, shelter,
signal fire, wet wood, and the action table with validation and interruption.
Spec: §2.2, §5.2–5.5, A.3–A.6, A.8–A.12.
**Dependencies:** Simulation core
**Priority:** 2

### Scenario tests
**Scope:** Test scenarios T1–T5 as automated tests with fixed seeds and action
lists. Test setup may force weather and search order. Spec: A.13.
**Dependencies:** World and actions
**Priority:** 2

### Bare shell UI
**Scope:** One screen showing raw state (time, weather, location, fatigue,
health, inventory, fire, shelter), action buttons, speed controls, and the event
log. Not the final player UI (spec §5.8 comes in Phase 5).
**Dependencies:** World and actions
**Priority:** 3

### Groq gateway spike
**Scope:** Throwaway Rust command-line program in `spikes/groq/`. It reads the
API key from an environment variable and never prints it. It calls both models,
records rate-limit headers, checks whether the two models have separate daily
quotas, and measures real token counts for a sample ~1,500-token context.
Findings go in a markdown file. Not wired into the app. Spec: §7.5, §7.10, §10.
**Dependencies:** None (can run in parallel)
**Priority:** 1

## Out of Scope (Phase 1)

- Any AI call inside the game (spec §10, Phases 4–5).
- NPC profiles, goals, and behavior (Phase 2).
- Knowledge, beliefs, memory, context selection (Phase 3).
- Real Rust AI gateway, call budget, OS key storage (Phase 4).
- Interpreter, narration, journal, final player UI (Phase 5).
- SQLite saving and loading, debugger, final report, endings (Phase 6).
- Social actions, injuries, wildlife (spec A.1).
- Everything the spec excludes from the MVP (spec §1.3).

## Success Criteria (Phase 1)

- Scenarios T1–T5 pass, and T5 shows identical event logs (spec A.13).
- The spike answers the open questions in spec §7.5 and §10: real limits for
  both models, separate or shared quotas, and real token sizes.

Full pilot success is defined in spec §8.8. It is not a Phase 1 goal.

## Phase 2: Autonomous Characters

Spec: §3, §10 Phase 2. Details: [plans/phase-2/requirements.md](plans/phase-2/requirements.md).

### Core features (Phase 2)

**NPC profiles.** Two NPCs (draft: Marcus Hale and Sarah Okafor) in
`src/engine/config/npcs.json`: identity text, goals, starting trust. Identities
are a draft until the developer approves them in spec §9. Priority 1.
Depends on: Phase 1.

**Goals and plans.** Goals with done and dropped checks, turned into plans made
of A.12 actions. At least one goal per NPC competes with the signal fire.
Priority 1. Depends on: NPC profiles.

**Rule-based decisions.** A fixed rule list (rest, take cover, recover, follow
plan, wait) run at decision points, reading only what the NPC could know.
Seeded tie-breaks, every decision logged. Priority 2. Depends on: Goals and
plans.

**Dev shell NPC view.** Goals, current plan, last decision, autonomy on/off.
Priority 3. Depends on: Rule-based decisions.

### Out of scope (Phase 2)

AI, memory and beliefs, trust changes, social actions, deception, injuries
(developer decision: the spec defines no injury rules), player UI, saving.

### Success criteria (Phase 2)

- A no-input 48-hour session runs to the end with both NPCs planning and
  acting on their own.
- Same seed gives identical event logs, and T1–T5 still pass.

## Phases

Phase order and content follow spec §10. Each phase is tested before the next
one starts.

## Open Design Details

Spec §9 lists open decisions. Phase 1 needs only the Appendix A rows, which are
"Proposed". Two points to settle during Phase 1 planning (spec not edited):

- A.9 says health below 30 blocks build and repair, but A.12 Build fire and
  Repair shelter rows do not list "health 30+". Follow A.9 unless the spec
  changes.
- A.12 Explore has no "not Exhausted" requirement, though A.8 counts explore as
  work. To be decided in feature planning.

## References

- [Unscripted.md](Unscripted.md) — design spec v0.3, source of truth
- [CONSTRAINTS.md](CONSTRAINTS.md) — technical rules and versions
