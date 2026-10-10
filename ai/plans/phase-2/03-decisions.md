# Phase 3: Decisions

Goal: pick each NPC's next action with rules a–e, run the rules at decision
points inside `step`, and prove a full no-input session works. Read
`ai/plans/phase-2/requirements.md` section 3 and the acceptance criteria
first.

Depends on: Phase 2 (02-view-and-goals.md).

Rules for every task in this file:
- `decide.ts` takes an `NpcView`, never the `World` (see 02-view-and-goals.md).
- The only randomness is the world's seeded generator (`world.rngState`, via
  `src/engine/rng.ts`). It is used only for tie-breaks, and only when
  autonomy is on.
- With autonomy off, `step` behaves exactly as today. T1–T5 stay unchanged.

## Task 3.1: Decision Rules a–e [DONE]

### Subtasks
- Create `src/engine/npc/decide.ts` with
  `decide(view, rng, exclude: Action[]): NpcChoice`, where `NpcChoice` is
  `{ action, rule: "a" | "b" | "c" | "d" | "e", reason, plan?: NpcPlan,
  goalChanges: { id, status, reason }[] }`.
- First, update goals: mark goals done or dropped using the planners.
  Return the changes; do not change state here.
- Then check in order, first match wins:
  - **a.** Exhausted, or night and Tired → if in a protected place, sleep (no
    minutes); else move along the path to the nearest protected place.
  - **b.** Heavy Rain or Storm and not protected → move toward the nearest
    protected place. Skip if none is reachable.
  - **c.** Health below `lowHealth` → same as a.
  - **d.** Highest-priority active goal with a plan: use the current plan's
    next step if it still matches the new plan; otherwise use the new plan
    (`plan_changed`). If the top goal has no plan right now, try the next goal.
  - **e.** `wait` for `idleWaitMinutes`.
- "Move toward" = a `move` to the first location on the path.
- Ties in `nearestProtected` are broken with `nextInt(rng, ties.length)`.
  Draw from the generator only when there is a real tie.
- `exclude`: choices rejected earlier this minute. If a rule's choice is in
  `exclude`, fall through to the next rule. `wait` is never excluded.
- Reasons are short and fixed in form, for example `sleep: Exhausted`,
  `shelter: Storm`, `rest: health 42`, `make_camp_safe step 2: gather_wood`,
  `idle`.
- Tests in `src/engine/npc/decide.test.ts`: one test per rule a–e; rule
  order (Exhausted in a Storm picks a); night and Rested does not trigger a;
  a goal finishing moves to the next goal; the tie-break uses the generator
  and the same state gives the same pick; an excluded choice falls through.

### Key Files
- `src/engine/npc/decide.ts`
- `src/engine/npc/decide.test.ts`

### Verification
`npm run typecheck && npm test -- src/engine/npc/decide.test.ts` passes.

---

## Task 3.2: Decision Loop in Step

Depends on: Task 3.1

### Subtasks
- Create `src/engine/npc/loop.ts` with `runNpcDecisions(world)`. For `npc1`
  then `npc2` (`CHARACTER_IDS` order), skip if autonomy is off, the session
  ended, the NPC is dead, or it is collapsed. Otherwise check decision points:
  - **Idle**: no current action (it completed, was rejected, interrupted, or
    cancelled, or the session just started).
  - **Urgent**: rule a, b, or c is true now and was not true last minute
    (`urgentRule`). Update `urgentRule` every minute.
  - **Review**: `reviewEveryMinutes` have passed since `lastReviewAt`.
- At a decision point, call `decide`. If the NPC is busy:
  - keep the current action if it already serves the choice (same action
    type and inputs, or sleeping for rule a/c, or moving toward a protected
    place for rule b);
  - otherwise cancel it if it can be cancelled; travel can't, so the NPC
    decides again on arrival.
- Submit the choice with `submitAction`. If rejected, call `decide` again
  with the rejected choice added to `exclude`. Rule e's `wait` always ends
  the loop.
- Apply the choice: save goal changes, plan, `lastDecision`; set
  `lastReviewAt` on review and on any new plan. Log in this order:
  `goal_done` / `goal_dropped`, `plan_created` / `plan_changed`, then
  `npc_decision` (`{ action, rule, reason }`, actor = NPC), then the normal
  `action_started` from `submitAction`.
- Save the generator state back to `world.rngState` after decisions.
- In `src/engine/step.ts`, add step 5b: `runNpcDecisions(world)` after
  `advanceCharacters`, before the session-end check. Update the step-order
  comment at the top of the file.
- In `src/engine/world.ts`, when autonomy is on, run `runNpcDecisions` once at
  minute 0, so NPCs start acting at session start.
- Tests in `src/engine/npc/loop.test.ts`:
  - autonomy off: the T1 script gives the same log as before, and
    `world.rngState` doesn't change;
  - autonomy on: both NPCs act at minute 0; a Storm starting while Sarah is
    gathering interrupts via urgent rule b; travel is never cancelled; the
    3-hour review fires; a rejected choice doesn't loop; dead and collapsed
    NPCs make no decisions;
  - the player is never controlled by the loop.

### Key Files
- `src/engine/npc/loop.ts`
- `src/engine/npc/loop.test.ts`
- `src/engine/step.ts`
- `src/engine/world.ts`

### Verification
`npm run typecheck && npm test` passes, including T1–T5 unchanged.

---

## Task 3.3: Full-Session Tests

Depends on: Task 3.2

### Subtasks
- Create `src/engine/npc/session.test.ts`. For 3 fixed seeds, with autonomy
  on and no player input, step from Day 1 08:00 to Day 3 08:00 and check:
  - no thrown errors; the session ends with `session_ended`;
  - each NPC has at least one `plan_created`, at least one completed action
    from a plan step, and at least one `plan_changed`;
  - Marcus completes at least one `repair_shelter`;
  - Sarah learns a Hilltop route (a `discovery` event with her as actor);
  - every `npc_decision` has a rule a–e and a non-empty reason.
- Determinism: for each seed, run twice and compare the full event logs with
  `toEqual`.
- One scenario with forced weather (use `weatherPlan` from
  `src/engine/scenarios/harness.ts`): a Storm on Day 1 afternoon sends both
  NPCs to protection (rule b decisions logged).
- If a seed fails an acceptance check, fix the planner or rule, not the test.
  If a fix needs a requirements change, stop and ask the developer.
- Print nothing during tests. Keep the run under a few seconds.

### Key Files
- `src/engine/npc/session.test.ts`
- `src/engine/npc/goals.ts` (only if fixes are needed)
- `src/engine/npc/decide.ts` (only if fixes are needed)

### Verification
`npm run typecheck && npm test` passes, and `cargo check` in `src-tauri/`
passes.
