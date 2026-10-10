# Phase 4: Actions and Physical Rules

Goal: all A.12 actions and the A.4–A.10 physical rules, each with unit tests.
Read spec Appendix A and `ai/plans/phase-1/requirements.md` section 2 first.

Depends on: Phase 3 (03-engine-core.md).

Rules for every task in this file:
- All numbers from the config. Engine code passes `purity.test.ts`.
- An action's duration is fixed when it starts, using modifiers at that moment.
  Fractional minutes round up.
- A rejected action costs no time and logs `action_rejected` with a reason.
- Each minute, an action re-checks its own A.12 requirements. If one fails, it
  stops, logs `action_interrupted`, and partial work is lost. Travel never
  stops.
- Tests use `createWorld` with forced weather and search order. No randomness
  in tests except through a fixed seed.

## Task 4.1: Action Framework, Move, Explore, Wait, Observe Weather

### Subtasks
- Create `src/engine/actions/types.ts`: an `Action` union type with one case per
  A.12 action and its inputs (destination, item, target character, minutes).
- Create `src/engine/actions/framework.ts`:
  - `submitAction(world, characterId, action)`: reject if the session ended,
    the character is dead, asleep from collapse, or already busy; otherwise
    validate, compute duration, set current action, log `action_started`.
  - `cancelAction(world, characterId)`: cancel anything except Move; log
    `action_cancelled`.
  - The step hook from Task 3.3 step 5: per character, re-check requirements,
    then complete when `minute` reaches start + duration and apply the effect.
  - Each action is defined by: validate, duration, recheck, complete. Keep it a
    plain object per action, not a class hierarchy.
- Duration helper: base minutes × modifiers, rounded up. Work actions get the
  Tired work multiplier. Move gets the travel modifiers (A.3): night without
  active flashlight, Heavy Rain or Storm, Tired, Exhausted.
- Move: needs a known route from here; route must be open (Cave – Hilltop closed
  during Storm). Location changes on completion. Travel continues even if the
  route closes.
- Flashlight (A.4): counts as active at the start of a Move if carried, battery
  above 0, and it is night. Battery drains 1 minute per night minute of travel
  (per-minute hook). At 0 it stops working; duration already fixed.
- Explore: duration and reveals from the A.3 table, only for the explorer.
  Log `discovery` for each new location or route. Nothing new: 30 minutes.
- Wait: chosen minutes. Observe weather: 15 minutes; on completion, log the
  current state, and at Hilltop also the next 2 hours (true values from the
  weather sequence).
- Export `submitAction` and `cancelAction` from `src/engine/index.ts`.
- Tests in `src/engine/actions/movement.test.ts`:
  - A.3 example: Forest to Hilltop at night, Heavy Rain, Tired = 113 minutes;
  - no route Beach Camp – Hilltop (rejected, no time used);
  - Cave – Hilltop rejected during Storm; a character already on it arrives;
  - flashlight removes night penalty and drains only during night travel;
    empty battery gives no benefit;
  - Explore Forest reveals Cave and both routes only to the explorer;
  - cancel works for Wait and is rejected for Move.

### Key Files
- `src/engine/actions/types.ts`
- `src/engine/actions/framework.ts`
- `src/engine/actions/movement.ts`
- `src/engine/step.ts`
- `src/engine/index.ts`
- `src/engine/actions/movement.test.ts`

### Verification
`npx vitest run src/engine/actions` passes, and `npm run typecheck` passes.

---

## Task 4.2: Fatigue, Health, Sleep, Collapse, Death

Depends on: Task 4.1

### Subtasks
- Create `src/engine/body.ts`.
- Per-minute fatigue (A.8), in half-points: work and travel +1; take, drop, give
  +1; idle, wait, observe +0.5; sleep −2 at Beach Camp with shelter at 30+,
  −1.5 in the Cave, −1 anywhere else. Never below 0. Log `fatigue_changed` when
  the condition (Rested / Tired / Exhausted) changes.
- Exhausted blocks gather, build, repair, search (validation and per-minute
  recheck).
- Collapse at the configured counter (960): stop the current action (log
  `action_interrupted`), log `collapse`, and start a collapse sleep where they
  are. If traveling, collapse happens on arrival. Collapse sleep ends when the
  counter is below 480 and cannot be cancelled.
- Sleep action: optional minutes. Without minutes, it ends when fatigue is 0.
  It can be cancelled.
- Hourly health (on the hour, based on where the character is at that moment):
  −5 if the hour that just ended was Storm and the character is outside
  protection; +2 if asleep under protection (cap 100). Protection = Cave, or
  Beach Camp with shelter 30+.
- Health below 30 blocks gather, build, repair, search (A.9 also for build and
  repair). At 0: log `death`, stop the action, character can no longer act.
  Dead characters get no fatigue changes.
- Tests in `src/engine/body.test.ts`: fatigue rates per activity; condition
  changes at 480 / 720 / 960 counter; collapse and wake below 480; sleep without
  minutes ends at 0; storm health loss outside and none in the Cave; sleep
  healing under protection; death stops actions and rejects new ones.

### Key Files
- `src/engine/body.ts`
- `src/engine/step.ts`
- `src/engine/actions/framework.ts`
- `src/engine/body.test.ts`

### Verification
`npx vitest run src/engine/body.test.ts` passes, and `npm run typecheck` passes.

---

## Task 4.3: Items, Search, Gather Wood

Depends on: Task 4.2

### Subtasks
- Create `src/engine/actions/items.ts`.
- Carry slots (A.4): 2 per character. Wood bundle uses 1, tarp 1, lighter 0,
  flashlight 0. Each wood bundle is its own item with a wet flag.
- Take (1 min): item at this location, free slot if needed. Drop (1 min): item
  stays here (wood goes to the location's pile). Give (1 min): other living
  character present, receiver has a free slot if needed.
- Search (Wreckage, 30 min): not Exhausted, health 30+. On completion, the next
  item in the seeded order lies at the Wreckage; log `item_found`. After all
  three, a search finds nothing.
- Gather wood (Forest, 30 min): free slot, not Exhausted, health 30+. Adds one
  dry bundle (wet if current weather is Light Rain or worse; see Task 4.5).
- Tests in `src/engine/actions/items.test.ts`: carry slot limits including
  0-slot items; search order follows forced order and the fourth search finds
  nothing; found item visible at Wreckage until taken; give needs presence;
  gather rejected when full, Exhausted, or health under 30; gather interrupted
  when becoming Exhausted mid-action and no bundle is added.

### Key Files
- `src/engine/actions/items.ts`
- `src/engine/actions/framework.ts`
- `src/engine/actions/items.test.ts`

### Verification
`npx vitest run src/engine/actions/items.test.ts` passes, and `npm run typecheck` passes.

---

## Task 4.4: Shelter

Depends on: Task 4.3

### Subtasks
- Create `src/engine/actions/shelter.ts`.
- Repair shelter (Beach Camp, 60 min): 1 wood bundle carried, not Exhausted,
  health 30+. Consumes the bundle, shelter +20 (cap 100).
- Install tarp (Beach Camp, 30 min): tarp carried, not yet installed. Shelter
  +30 once; the tarp is used up.
- Hourly loss (on the hour, for the hour that just ended): Storm −10, Heavy Rain
  −2. Never below 0.
- One shared helper `isProtected(world, characterId)` used by body and fire
  rules: Cave, or Beach Camp with shelter at 30+.
- Tests in `src/engine/actions/shelter.test.ts`: repair and tarp values; tarp
  only once; storm and heavy rain loss; protection turns off below 30.

### Key Files
- `src/engine/actions/shelter.ts`
- `src/engine/body.ts`
- `src/engine/actions/shelter.test.ts`

### Verification
`npx vitest run src/engine/actions/shelter.test.ts` passes, and `npm run typecheck` passes.

---

## Task 4.5: Signal Fire and Wet Wood

Depends on: Task 4.4

### Subtasks
- Create `src/engine/actions/fire.ts`.
- Store fuel in half fuel-minutes so all burn rates are whole numbers: 1, 1.5,
  and 2 fuel-hours per hour become 2, 3, and 4 units per minute.
- Build fire (Hilltop, 60 min): 6 dry bundles in the Hilltop pile, not
  Exhausted, health 30+. On completion: remove 6 bundles, state Built, 4 hours
  of fuel; log `fire_changed`.
- Add wood (Hilltop, 5 min): wood carried, fire Built or Lit. +1 hour, max 8
  hours. Adding a wet bundle makes the fire wet.
- Light fire (Hilltop, 10 min): lighter carried with uses left, fire Built and
  not wet, weather not Heavy Rain or Storm. On success: state Lit, lighter loses
  one use; log `fire_changed`. Recheck each minute (rain starting interrupts).
- Per-minute burn while Lit: Clear/Cloudy 2 units, Light Rain 3, Heavy Rain or
  Storm 4. At 0 fuel: state None. During Heavy Rain or Storm, if fuel falls
  below 2 hours: goes out, state Built, keeps fuel, becomes wet.
- Wet wood (A.6), checked each minute: any bundle (carried, in a pile, or in a
  Built fire) not under shelter becomes wet while weather is Light Rain or
  worse. Under shelter = Beach Camp with shelter 30+, or the Cave.
- Drying, checked on the hour: each wet bundle or wet fire tracks consecutive
  Clear/Cloudy hours; after 2 it becomes dry. Any other weather resets the
  count.
- Tests in `src/engine/actions/fire.test.ts`:
  - build needs 6 dry bundles; wet bundles block build;
  - fuel cap at 8 hours;
  - lighter loses a use only on success, and is unusable after 3;
  - light rejected in Heavy Rain and Storm;
  - burn rates for each weather; fire returns to None at 0 fuel;
  - goes out below 2 hours in Heavy Rain, keeps fuel, becomes wet;
  - wood at Beach Camp under shelter 30+ stays dry in rain; carried wood gets
    wet; wet wood dries after 2 Clear hours and not after 1.

### Key Files
- `src/engine/actions/fire.ts`
- `src/engine/step.ts`
- `src/engine/actions/fire.test.ts`

### Verification
`npm run typecheck && npm test` passes.
