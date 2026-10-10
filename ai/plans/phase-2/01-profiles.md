# Phase 1: NPC Profiles and NPC State

Goal: load the two NPC profiles from config and give the world a place to keep
each NPC's goals, plan, and decisions. No decision logic yet. Read
`ai/plans/phase-2/requirements.md` sections 1, 2, and 6 first.

Depends on: Phase 1 project work (`ai/plans/phase-1/`), all done.

Rules for every task in this file:
- All new engine code lives in `src/engine/npc/`. No React, Mantine, or
  `@tauri-apps/*` imports (the existing `purity.test.ts` must still pass).
- World state stays plain JSON: no classes, no Maps.
- With autonomy off, the event log for any seed and script must stay exactly
  as it is today. T1–T5 must keep passing unchanged.

## Task 1.1: Profile Config and Loader

### Subtasks
- Create `src/engine/config/npcs.json` with:
  - `behavior`: `lowHealth` 50, `idleWaitMinutes` 30, `reviewEveryMinutes`
    180, `shelterTarget` 80, `woodReserve` 1. These are not Appendix A
    numbers, but they live in config, never in code.
  - `npcs`: two entries keyed by character id. `npc1` is Marcus Hale, `npc2`
    is Sarah Okafor. Copy identity text, goals, and starting trust exactly from
    requirements section 1.
  - Each goal: `id`, `priority` (`"high" | "medium" | "low"`). Goal ids:
    `make_camp_safe`, `keep_wood_reserve` (Marcus); `map_island`,
    `keep_flashlight`, `signal_rescue` (Sarah).
  - Each NPC: `identity` (name, age, background, traits, values, skills,
    weaknesses, pastExperiences, fears), `goals`, `trust` (map of character id
    to 0–100), `commitments` (empty array).
- Create `src/engine/npc/profiles.ts`:
  - Types `NpcProfile`, `NpcGoalConfig`, `NpcBehavior`, `NpcConfig`.
  - `loadNpcConfig(overrides?)`: reads the JSON, checks it, returns it. Throws
    a clear error for: missing NPC, unknown goal id, bad priority, trust out of
    0–100 or for an unknown character, a goal listed twice, missing or
    non-positive behavior numbers.
  - Follow the style of `loadWorldRules` in `src/engine/config.ts`.
- Create `src/engine/npc/profiles.test.ts`: the shipped file loads; each
  check above throws; overrides replace values.

### Key Files
- `src/engine/config/npcs.json`
- `src/engine/npc/profiles.ts`
- `src/engine/npc/profiles.test.ts`

### Verification
`npm run typecheck && npm test -- src/engine/npc/profiles.test.ts` passes.

---

## Task 1.2: NPC State in the World

Depends on: Task 1.1

### Subtasks
- In `src/engine/npc/state.ts`, define:
  - `GoalStatus = "active" | "done" | "dropped"`.
  - `NpcGoalState`: `id`, `priority`, `status`.
  - `NpcPlan`: `goalId`, `steps: Action[]`, `index` (current step).
  - `NpcDecision`: `minute`, `action` (JSON), `rule` (`"a"`–`"e"`), `reason`.
  - `NpcState`: `goals`, `plan: NpcPlan | null`, `lastDecision`,
    `lastReviewAt`, `urgentRule` (rule a–c that was true last minute, or
    null), `wreckageSearchedOut` (true once this NPC's own search found
    nothing), `trust`, `commitments`.
- In `src/engine/state.ts`, add to `World`: `autonomy: boolean`,
  `npcBehavior: NpcBehavior`, `npcs: Record<"npc1" | "npc2", NpcState>`.
  Add to `Character`: `seenForecast: { fromHour: number; states:
  WeatherState[] } | null` (starts null).
- In `src/engine/world.ts`, add `autonomy?: boolean` (default false) and
  `npcs?: NpcConfigOverrides` to `CreateWorldOptions`. Build `world.npcs` from
  the profiles: all goals `active`, no plan, `lastReviewAt` 0. Building NPC
  state must not use the random generator.
- In `src/engine/actions/movement.ts`, `observe_weather.complete`: when a
  forecast is shown, also save it to `character.seenForecast`. Do not change
  the `action_completed` result.
- In `src/engine/actions/items.ts` (search): when a search by an NPC finds
  nothing, set that NPC's `wreckageSearchedOut` to true.
- In `src/engine/events.ts`, add event types `npc_decision`, `plan_created`,
  `plan_changed`, `goal_done`, `goal_dropped`. Nothing logs them yet.
- Export the new types from `src/engine/index.ts`, plus a
  `getNpc(world, id)` reader.
- Tests in `src/engine/npc/state.test.ts`: a new world has both NPCs with all
  goals active; autonomy defaults to false; observe weather at the Hilltop
  saves the forecast, elsewhere it doesn't; an NPC's empty search sets the
  flag; the world still survives a JSON round trip unchanged.

### Key Files
- `src/engine/npc/state.ts`
- `src/engine/npc/state.test.ts`
- `src/engine/state.ts`
- `src/engine/world.ts`
- `src/engine/events.ts`
- `src/engine/actions/movement.ts`
- `src/engine/actions/items.ts`
- `src/engine/index.ts`

### Verification
`npm run typecheck && npm test` passes, including T1–T5 with no changes to
their expected values.
