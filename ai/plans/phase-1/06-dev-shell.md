# Phase 6: Bare Dev Shell

Goal: one Mantine screen to watch and drive the engine. World truth view, not
the final player UI. Read `ai/plans/phase-1/requirements.md` section 3 first.

Depends on: Phase 4 (04-actions.md). Does not need Phase 5.

Rules for every task in this file:
- React never changes world state directly. It calls engine functions
  (`step`, `submitAction`, `cancelAction`) and renders the result.
- Use Mantine components only. No new packages.
- Keep it simple: plain React state and hooks, no state library.

## Task 6.1: Engine Runner Hook [DONE]

### Subtasks
- Create `src/shell/useEngine.ts`: a hook that owns one world object and
  exposes: the current world snapshot, `speed` (0 = pause, 1, 2, 4),
  `setSpeed`, `submit(action)` for the player, `cancel()`, `skipToActionEnd()`,
  and `newSession()`.
- Real-time loop: at 1×, one game minute per 1.25 real seconds (§2.4: one game
  day = 30 real minutes); 2× and 4× scale it. Use one interval or
  `requestAnimationFrame` that calls `step` the right number of times. Real
  timers live here, never in `src/engine/`.
- Stop the loop when the session ends.
- `skipToActionEnd()`: step until the player's current action finishes (or the
  session ends). Does nothing if the player is idle.
- `newSession()`: create a seed outside the engine (for example
  `crypto.getRandomValues` on a `Uint32Array(1)`) and call `createWorld(seed)`.
- Re-render after steps by keeping a version counter in state (the world object
  is mutated in place).

### Key Files
- `src/shell/useEngine.ts`

### Verification
`npm run typecheck` passes, and `npm test` still passes.

---

## Task 6.2: World Truth View and Event Log [DONE]

Depends on: Task 6.1

### Subtasks
- Create `src/shell/WorldView.tsx`:
  - header: seed, Day and clock time, day/night, current weather, speed;
  - characters table: id, location, fatigue condition and counter, health,
    alive/asleep, inventory, current action with minutes left;
  - locations: items lying there, wood piles (dry/wet counts);
  - shelter value and protecting yes/no; signal fire state, fuel hours, wet.
- Create `src/shell/EventLog.tsx`: newest first, game time, actor, type, short
  data. Rejected and interrupted events stand out (Mantine color).
- Mount both in `src/App.tsx` in a simple Mantine `Grid` or `Stack`.

### Key Files
- `src/shell/WorldView.tsx`
- `src/shell/EventLog.tsx`
- `src/App.tsx`

### Verification
`npm run typecheck` passes. `npm run tauri dev` shows the view with a running
clock at 1× (developer checks by eye).

---

## Task 6.3: Action Controls and Manual T1 [DONE]

Result (2026-10-10): the developer played seed 3489026186 by hand. The
controls worked, but the fire could not be lit: rain from Day 1 16:00 to
Day 2 20:00 kept the wood wet, and every rejection was correct. Accepted as
done by the developer.

Depends on: Task 6.2

### Subtasks
- Create `src/shell/Controls.tsx`:
  - speed buttons: pause, 1×, 2×, 4×; "Skip to end of action"; "Cancel";
    "New session";
  - one button per A.12 action, with inputs where needed: destination
    (`Select` of locations), item (`Select` of items here or carried), target
    character, minutes (`NumberInput` for Wait and optional Sleep);
  - all actions are always shown; the engine decides validity, and a rejection
    shows in the event log.
- Mount in `src/App.tsx`.
- Play T1 by hand at 4× with skip: get the lighter, explore, carry 6 bundles,
  build, and light. Note in the task result the time the fire was lit (seed
  will differ, so weather may differ).

### Key Files
- `src/shell/Controls.tsx`
- `src/App.tsx`

### Verification
`npm run typecheck && npm test` passes, `cargo check --manifest-path src-tauri/Cargo.toml`
passes, and the developer can light the signal fire by hand in `npm run tauri dev`.
