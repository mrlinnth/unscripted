# Phase 2 Requirements: Autonomous Characters

Confirmed by developer: 2026-10-10

Source of truth: [Unscripted.md](../../Unscripted.md) §3 and §10 Phase 2.
If this file and the spec disagree, the spec wins. Stack and rules:
[CONSTRAINTS.md](../../CONSTRAINTS.md). Builds on
[Phase 1](../phase-1/requirements.md).

## Overview

Phase 2 makes the two NPCs act on their own, with no AI:

1. NPC profiles (identity, goals, starting trust) in a config file.
2. Goals that turn into plans made of normal actions from the A.12 table.
3. A rule-based decision maker that picks each NPC's next action.
4. Dev shell views of each NPC's goals, plan, and last decision.

NPCs use the same actions and physics as the player. The engine is still the
authority, and the simulation is still deterministic from the seed.

Spec §9 lists character identities as Open. The profiles below are a draft
the developer accepted for building. The developer approves them in the spec.

## 1. NPC Profiles

- Stored in `src/engine/config/npcs.json`. Loaded and checked at startup, like
  `world-rules.json`. Tests may pass their own profiles.
- Fields:
  - Identity (text only): name, age, background, traits, values, skills,
    weaknesses, past experiences, fears.
  - Goals (see section 2).
  - Starting trust toward each other character, 0–100.
  - Commitments: an empty list for now.
- Identity text changes no rules. Skills give no bonuses. It is stored for
  Phase 4 AI context.
- Trust and commitments are stored but never change in Phase 2.

### Marcus Hale, 52: retired boat mechanic

- Background: ran a small fishing-boat repair yard for 25 years. Lost a boat
  and a crewman in a storm years ago.
- Traits: practical, stubborn, careful, trusts what he can build with his hands.
- Values: safety first, look after people close by, finish what you start.
- Skills: repairs, rope work, reading the sea.
- Weaknesses: impatient with plans he didn't make, slow to trust strangers.
- Fear: being caught outside in a storm.
- Goals:
  1. **Make Beach Camp safe** (high). Find the tarp at the Wreckage, install
     it, then repair the shelter to 80 or more. Competes with the signal fire
     for wood and Wreckage searches. Becomes active again when he sees the
     shelter below 80. Repairs use a bundle lying at camp first, if any.
  2. **Keep wood in reserve** (low). After goal 1 is done, keep 1 dry wood
     bundle at Beach Camp.
- Starting trust: Sarah 40, player 40.

### Sarah Okafor, 34: field geologist

- Background: on the trip to survey coastal rock. Used to working alone in
  remote places.
- Traits: curious, independent, restless, confident.
- Values: knowledge, freedom to act on her own, being useful.
- Skills: maps, navigation, reading terrain.
- Weaknesses: takes risks, doesn't ask for help.
- Fear: being stuck and doing nothing.
- Goals:
  1. **Map the island** (high). Explore the Forest and the Cave until she
     knows the Cave and both Hilltop routes. Competes with the signal fire for
     time.
  2. **Keep the flashlight** (medium). Search the Wreckage until the
     flashlight is found, then take it and keep it.
  3. **Signal for rescue** (low). Once she knows a route to the Hilltop:
     get the lighter first (take it if she sees it, else search the
     Wreckage), then gather wood, carry it to the Hilltop, build the fire,
     and light it. Lighter first, because she can't see the fire once she
     leaves the Hilltop, so fetching it mid-way would make her turn back.
     Once enough wood lies at the Hilltop but some is wet, she waits for it
     to dry instead of hauling more. Never done: once the fire is lit she
     tends it. She adds wood while it fits under the fuel cap (dry bundles
     first, so the fire stays dry), and fetches more from the Forest while
     her hands are free. A lit fire needs no lighter, so the goal is not
     dropped for a missing one. If she finds the fire out, she rebuilds it.
- Starting trust: Marcus 50, player 50.

## 2. Goals and Plans

- A goal has an id, a priority (high, medium, low), a "done" check, and a rule
  that builds a plan for it.
- A plan is an ordered list of actions from the A.12 table. Example: Move to
  Forest → Gather wood → Move to Beach Camp → Repair shelter.
- A goal is done when its check passes. A done goal becomes active again
  (logged as `goal_reopened`) only when the NPC can see it is no longer met:
  Marcus at camp with the shelter below 80. Other goals stay done.
  `keep_wood_reserve` and `signal_rescue` are never done.
- A goal is dropped when it becomes impossible. Example: the Wreckage has
  nothing left and the tarp was never found. Dropping is logged.
- Plans use only what the NPC is allowed to read (section 4). Example: Sarah
  can't plan a move to the Hilltop until she knows a route.

## 3. Decisions

### When an NPC decides

An NPC chooses its next action only at a decision point:

- Its current action completes, is rejected, or is interrupted.
- An urgent need starts (rules a–c below become true). Night and Tired
  (part of rule a) is not urgent: it waits for the current action to end,
  so it doesn't cut off work in progress. Exhausted is urgent.
- 3 in-game hours have passed since its last plan review (§3.5).

Between decision points it keeps doing its current action. A collapsed or
dead NPC makes no decisions.

### Decision rules (checked in order, first match wins)

- **a.** Exhausted, or night (A.2) and Tired → go to the nearest known
  protected place and sleep.
- **b.** Heavy Rain or Storm while not protected → go to the nearest known
  protected place.
- **c.** Health below 50 → go to the nearest known protected place and sleep.
- **d.** Otherwise → the next step of the plan for the highest-priority goal
  that is not done or dropped. If there is no plan, or the next step is
  blocked, build a new plan. In Heavy Rain or Storm, a protected NPC skips
  plan steps that would move it out (rule b would bring it straight back).
- **e.** Nothing left to do → wait 30 minutes.

"Protected" means the Cave, or Beach Camp with shelter at 30 or more (A.9).
"Nearest" means the shortest travel time over routes the NPC knows. If the
NPC is already in a protected place, it does not move.

Once rule a, b, or c picks a protected place, the NPC keeps heading there
until it arrives, unless it can no longer reach it. Without this it can turn
back halfway: away from Beach Camp it counts the camp as protected, even right
after seeing the shelter too low there (found in Task 3.3, seed 1).

- Ties (for example, two places with the same travel time) are broken with the
  session's seeded random generator.
- If the chosen action is rejected, the NPC reaches a new decision point. To
  avoid loops, an NPC never makes the same rejected choice twice in the same
  minute; it falls through to the next rule.

### Decision log

- Each decision is an event-log entry: NPC, game time, chosen action, rule
  (a–e), and a short reason. Examples: `sleep: Exhausted`,
  `move Forest: plan make-camp-safe step 2`.
- Plan created, plan changed, goal done, and goal dropped are also logged.

## 4. What Rules May Read

Rules read only what the NPC could know. They never read world truth beyond
this list:

- The NPC's own fatigue condition, health, inventory, location, and current
  action.
- The NPC's own map knowledge (A.3).
- The current weather. The sky is visible everywhere.
- The forecast for the next 2 hours, only after the NPC itself did Observe
  weather at the Hilltop, and only for the hours it saw.
- Items, fire state, shelter value, and characters at the NPC's current
  location.
- One fact from its own actions: whether its own Wreckage search found
  nothing (needed to drop goals that wait on Wreckage items).
- Away from Beach Camp, the NPC can't see the shelter value, so it counts
  Beach Camp as protected. The real value applies on arrival.

They do not read: other locations' items, the Wreckage search order, the
weather sequence, or other characters' state or goals. Knowledge that lasts
after leaving a place (memory) comes in Phase 3.

## 5. Items

- NPCs may take shared items their goals need (tarp, flashlight, lighter,
  wood), with the normal Take action and carry slots.
- NPCs do not give items to anyone in Phase 2.

## 6. Autonomy Switch

- A session option turns NPC autonomy on or off.
- Off: NPCs act only when given actions, exactly as in Phase 1. The scenario
  harness uses off, so T1–T5 are unchanged.
- On: the default in the dev shell.

## 7. Dev Shell

- For each NPC: goals with status (active, done, dropped), the current plan
  with the current step marked, and the last decision with its rule and reason.
- An autonomy on/off choice at session start.

## Acceptance Criteria

- With autonomy on and no player input, a full session runs from Day 1 08:00 to
  Day 3 08:00 with no errors.
- Each NPC, on its own, creates a plan, completes at least one plan step, and
  changes its plan at least once.
- In that session, Marcus uses wood on the shelter, and Sarah explores and
  learns a Hilltop route.
- Two runs with the same seed, profiles, and player actions give identical
  event logs, including all NPC decisions.
- Unit tests for each rule a–e, for goal done and goal dropped, and for the
  tie-break.
- Tests show rules only read the section 4 list. Example: an NPC away from the
  Wreckage does not plan around items lying there.
- T1–T5 still pass.
- `npm run typecheck && npm test` passes, and `cargo check` in `src-tauri/`
  passes.
- The shell runs with `npm run tauri dev` and shows both NPCs acting on their
  own.

## Out of Scope

- AI calls of any kind (Phase 4).
- Private observations, beliefs, memory, context selection (Phase 3).
- Trust changes, conversations, requests, refusals, commitments, social
  actions (Phase 4).
- Deception (after the pilot, §3.8).
- Injuries. A.9 mentions them for Phase 2, but the spec defines no rules for
  them. Left out by developer decision.
- Player identity, limited player view, final UI (Phase 5).
- SQLite, save and load, endings, final report (Phase 6).
