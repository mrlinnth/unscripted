# Phase 3: Engine Core

Goal: config, seeded randomness, weather, world state, clock, and event log.
No actions yet. Read spec Appendix A (A.1–A.7, A.11) and
`ai/plans/phase-1/requirements.md` section 2 first.

Depends on: Phase 2 (02-scaffold.md).

Rules for every task in this file:
- Engine code lives in `src/engine/` and must pass `src/engine/purity.test.ts`.
- No Appendix A number appears in engine code. All come from the config.
- Strict TypeScript, no `any`, explicit return types on exported functions.

## Task 3.1: World Rules Config [DONE]

### Subtasks
- Create `src/engine/config/world-rules.json` holding every Appendix A number in
  the spec's own units (minutes, hours, per-minute rates, multipliers):
  day/night times (A.2), locations, routes with minutes and notes like
  "closed during Storm" as data (A.3), travel modifiers (A.3), starting map
  knowledge (A.3), explore table (A.3), items and carry slots (A.4), lighter
  uses and flashlight battery (A.4), search duration (A.5), signal fire numbers
  (A.6), weather states, stay chance, Storm max length, first-hour weather
  (A.7), fatigue rates and thresholds (A.8), health numbers (A.9), shelter
  numbers (A.10), starting conditions (A.11), action durations and Tired work
  multiplier (A.12), session start and end time (§2.4).
- Create `src/engine/config.ts` with TypeScript types for the config, a
  `loadWorldRules(overrides?)` function that deep-merges test overrides onto the
  JSON, and checks that run at load:
  - every route connects two known locations;
  - thresholds are in increasing order;
  - every value the engine stores in half-units (fatigue rates, fuel burn rates)
    becomes a whole number when doubled, so integer math stays exact
    (see Task 3.3 and Task 4.5).
  Throw a clear error naming the bad key if a check fails.
- Tests in `src/engine/config.test.ts`: the shipped JSON loads; an override
  changes one value; a bad route and a non-integer half-unit rate both throw.

### Key Files
- `src/engine/config/world-rules.json`
- `src/engine/config.ts`
- `src/engine/config.test.ts`

### Verification
`npx vitest run src/engine/config.test.ts` passes, and `npm run typecheck` passes.

---

## Task 3.2: Seeded RNG, Weather, and Search Order

Depends on: Task 3.1

### Subtasks
- Create `src/engine/rng.ts`: a small seeded generator (mulberry32 on a 32-bit
  unsigned integer seed). Functions: `createRng(seed)`, `next()` returning
  [0, 1), and `nextInt(maxExclusive)`. The generator state is a plain number
  stored in world state, so it can be saved later.
- Create `src/engine/weather.ts` with `rollWeather(rng, rules)` returning 48
  hourly states (A.7):
  - hour 0 is the configured first-hour weather (Clear);
  - each next hour: stay with the configured chance (80%), else move one step,
    up or down with equal chance; Clear can only move up, Storm only down;
  - a Storm that has lasted the configured max (3 hours) moves to Heavy Rain.
- Create `rollSearchOrder(rng, rules)` (same file or `src/engine/wreckage.ts`)
  returning the three Wreckage items in a seeded order (A.5).
- Fix the order of RNG calls: weather first, then search order. Document it in
  a comment, because changing it changes every seeded result.
- Tests in `src/engine/weather.test.ts`:
  - same seed gives the same sequence and order; different seeds usually differ;
  - over many seeds: hour 0 always Clear, every change is one step, no Storm
    longer than 3 hours, Clear never moves down, Storm never moves up.

### Key Files
- `src/engine/rng.ts`
- `src/engine/weather.ts`
- `src/engine/weather.test.ts`

### Verification
`npx vitest run src/engine/weather.test.ts` passes.

---

## Task 3.3: World State, Clock, and Event Log

Depends on: Task 3.2

### Subtasks
- Create `src/engine/state.ts` with world state types:
  - `minute`: whole minutes since Day 1 08:00 (0 to 2880);
  - weather sequence (48 states) and RNG state;
  - locations; Wreckage items left to find (seeded order) and items lying at
    each location; wood piles per location; shelter value; signal fire
    (state None/Built/Lit, fuel, wet flag);
  - characters: `player`, `npc1`, `npc2` in that fixed order; each with
    location, fatigue (stored in half-points, so +0.5 is 1 and +1 is 2),
    health, alive flag, asleep flag, inventory, known locations, known routes,
    current action (empty for now);
  - `ended` flag.
- Create `src/engine/events.ts`: an append-only event list. Each event has
  `minute`, `type`, optional `actor`, and a plain JSON `data` object. Never put
  wall-clock time in an event. Event types needed in Phase 1: `action_started`,
  `action_completed`, `action_rejected`, `action_interrupted`,
  `action_cancelled`, `weather_changed`, `fire_changed`, `fatigue_changed`
  (condition, not counter), `discovery`, `item_found`, `collapse`, `death`,
  `session_ended`.
- Create `src/engine/time.ts`: helpers for day number, clock time (HH:MM),
  hour index, and `isNight(minute, rules)` using A.2.
- Create `src/engine/world.ts` with `createWorld(seed, options?)` building the
  A.11 starting state and A.3 starting knowledge for all three characters.
  `options` lets tests override config, force the weather sequence, and force
  the search order (A.13).
- Create `src/engine/step.ts` with `step(world)` advancing exactly one minute.
  Fix this order (document it in a comment; tests rely on it):
  1. If `ended`, do nothing.
  2. Per-minute effects for the minute that just passed (filled in by Phase 4).
  3. `minute += 1`.
  4. If on the hour: hourly effects for the hour that just ended (Phase 4), then
     if the weather differs from the previous hour, log `weather_changed`.
  5. Per character in fixed order: re-check, progress, and complete actions
     (Phase 4).
  6. If `minute` equals the end time, set `ended` and log `session_ended`.
  Leave clear hook functions for steps 2, 4, and 5 that Phase 4 fills in.
- Export a small public API from `src/engine/index.ts`: `createWorld`, `step`,
  `stepMinutes(world, n)`, and read-only getters. Engine functions mutate the
  world object passed in; keep it plain JSON (no classes, no Maps), so it can be
  saved later and compared in tests.
- Tests in `src/engine/world.test.ts`: starting state matches A.11; starting
  knowledge matches A.3; stepping 2880 minutes ends the session at Day 3 08:00
  with exactly one `session_ended`; `isNight` is correct at 06:00, 18:29,
  18:30, 05:59; weather events appear only on the hour.

### Key Files
- `src/engine/state.ts`
- `src/engine/events.ts`
- `src/engine/time.ts`
- `src/engine/world.ts`
- `src/engine/step.ts`
- `src/engine/index.ts`
- `src/engine/world.test.ts`

### Verification
`npm run typecheck && npm test` passes.
