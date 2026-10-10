# Phase 4: Dev Shell NPC View

Goal: show what each NPC wants, plans, and just decided, and let the
developer turn autonomy on or off. Read `ai/plans/phase-2/requirements.md`
section 7 first.

Depends on: Phase 3 (03-decisions.md).

Rules for every task in this file:
- React never changes world state directly. It calls engine functions and
  renders the result.
- Use Mantine components only. No new packages.
- The shell shows world truth (it is a debug view). That is fine; only the
  NPC rules are limited.

## Task 4.1: NPC Panel and Autonomy Toggle [DONE]

### Subtasks
- In `src/shell/runner.ts` and `src/shell/useEngine.ts`: `newSession` takes
  an `autonomy` flag and passes it to `createWorld`. Default: on.
- Create `src/shell/NpcPanel.tsx`. One card per NPC, showing:
  - name (from the profile) and character id;
  - goals with priority and status (active, done, dropped) as Mantine badges;
  - the current plan: goal id and step list, with the current step marked;
  - the last decision: game time, rule letter, reason;
  - a note when autonomy is off.
- In `src/shell/Controls.tsx`: an autonomy on/off switch that applies when
  starting a new session. Show the current session's setting next to the
  seed.
- In `src/shell/EventLog.tsx` and `src/shell/format.ts`: short text for the
  new event types (`npc_decision`, `plan_created`, `plan_changed`,
  `goal_done`, `goal_dropped`).
- Mount `NpcPanel` in `src/App.tsx` next to the world view.
- Extend `src/shell/format.test.ts` for the new event text, and
  `src/shell/render.test.tsx` so the panel renders for a new world with
  autonomy on and off.
- Manual check: run `npm run tauri dev`, start a session with autonomy on at
  4×, and watch both NPCs leave Beach Camp, change plans, and take cover when
  bad weather comes. Then start one with autonomy off and confirm NPCs stay
  idle.

### Key Files
- `src/shell/NpcPanel.tsx`
- `src/shell/Controls.tsx`
- `src/shell/EventLog.tsx`
- `src/shell/format.ts`
- `src/shell/format.test.ts`
- `src/shell/render.test.tsx`
- `src/shell/runner.ts`
- `src/shell/useEngine.ts`
- `src/App.tsx`

### Verification
`npm run typecheck && npm test` passes, and `cargo check` in `src-tauri/`
passes. `npm run tauri dev` shows both NPCs acting on their own (developer
checks by eye).
