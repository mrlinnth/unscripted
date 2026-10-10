# Phase 5: Scenario Tests (A.13)

Goal: T1–T5 from spec A.13 pass as Vitest acceptance tests.

Depends on: Phase 4 (04-actions.md).

Important rule for every task in this file: the spec's expected values are the
target. If the engine gives a different result, stop and report what the engine
produces and why. Do not change the expected values, the config, or the spec to
make a test pass. The developer decides.

## Task 5.1: Scenario Harness [DONE]

### Subtasks
- Create `src/engine/scenarios/harness.ts` with
  `runScenario({ seed, weather?, searchOrder?, configOverrides?, script, until })`:
  - builds the world with `createWorld` and the forced values;
  - `script` is a list of `{ actor, action }` steps; the next step for an actor
    is submitted as soon as that actor has no current action;
  - a rejected step fails the run with the rejection reason (so typos in
    scripts show up), unless the step is marked `expectReject: true`;
  - steps until `until` (a minute or Day/HH:MM helper) and returns the world and
    event log.
- Helpers: `at(day, "HH:MM")` to convert to minutes, and
  `weatherPlan([{ from, to, state }])` to build a 48-hour forced sequence.
- NPCs do nothing unless the script gives them actions.
- Tests in `src/engine/scenarios/harness.test.ts`: a two-step script runs in
  order; a bad step fails with its reason; `at(1, "08:00")` is 0 and
  `at(3, "08:00")` is 2880.

### Key Files
- `src/engine/scenarios/harness.ts`
- `src/engine/scenarios/harness.test.ts`

### Verification
`npx vitest run src/engine/scenarios/harness.test.ts` passes.

---

## Task 5.2: T1 Solo Fire and T5 Determinism

Depends on: Task 5.1

### Subtasks
- Create `src/engine/scenarios/t1-t5.test.ts`.
- T1 setup: all 48 hours Clear; search order lighter first; NPCs inactive.
- T1 script (player): Move to Wreckage, Search, Take lighter, Move to Beach
  Camp, Move to Forest, Explore, then three trips of (Gather, Gather, Move to
  Hilltop, Drop, Drop, Move to Forest) with the last trip ending at Hilltop,
  then Build fire, Light fire.
- T1 expected: fire Lit with the lighting completed between Day 1 18:00 and
  19:00; player condition Tired at that moment.
- T5: run T1 twice with the same seed and script. Compare the full event logs
  with `toStrictEqual`. Also compare the final world states.
- T5 extra check: a different seed with the same forced setup gives the same
  log (everything is forced), and a different seed with no forced weather gives
  a different weather sequence (proves the seed is used).

### Key Files
- `src/engine/scenarios/t1-t5.test.ts`

### Verification
`npx vitest run src/engine/scenarios/t1-t5.test.ts -t "T1|T5"` passes.

---

## Task 5.3: T2 Storm, T3 Fire Against Rain, T4 Exhaustion

Depends on: Task 5.2

### Subtasks
- T2 setup: Clear until Day 1 14:00, Storm 14:00 to 17:00, then Clear. Player
  moves to the Forest and waits there.
- T2 expected: Cave – Hilltop route closed during the Storm (a Move on it is
  rejected; use an NPC or test config to give a character that knows the route,
  without changing A.3 numbers); player health 85 at 17:00; shelter 10 at 17:00
  and no longer protecting; Light fire rejected during the Storm (set up a Built
  fire and a lighter at Hilltop through world setup options).
- T3 setup: fire Lit at Hilltop with 4 hours of fuel; Heavy Rain starts 1 hour
  later. Use world setup options or a short script to reach this state.
- T3 expected: fire goes out about 30 minutes after the rain starts (assert the
  exact minute the engine produces is within 25–35 minutes, and record it in a
  comment); state Built and wet; fuel just under 2 hours.
- T4 setup: player travels and gathers without rest from Day 1 08:00 (for
  example, repeated Gather / Drop at the Forest plus Moves).
- T4 expected: Tired at Day 1 16:00; Exhausted at 20:00; Gather rejected after
  20:00; collapse at about Day 2 00:00 (assert within a few minutes, record the
  exact minute in a comment).
- If world setup options are missing for T2/T3 (pre-placed fire or items), add
  a small `setup(world)` callback to `runScenario` rather than new engine API.

### Key Files
- `src/engine/scenarios/t1-t5.test.ts`
- `src/engine/scenarios/harness.ts`

### Verification
`npm run typecheck && npm test` passes, with all of T1–T5 green.
