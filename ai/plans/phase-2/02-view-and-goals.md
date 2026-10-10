# Phase 2: NPC View and Goal Planners

Goal: build the limited view an NPC decides from, and the five goal planners
that turn goals into plans. Read `ai/plans/phase-2/requirements.md` sections
2 and 4 first.

Depends on: Phase 1 (01-profiles.md).

Rules for every task in this file:
- Goal planners and (later) decision rules take an `NpcView`, never the
  `World`. Files `goals.ts` and `decide.ts` must not import the `World` type.
  This is how "no world truth" is enforced.
- Plans contain only actions from the existing `Action` type (A.12). No new
  actions.
- No randomness in this file's code. Ties are handled in Phase 3.

## Task 2.1: NPC View [DONE]

### Subtasks
- Create `src/engine/npc/view.ts` with `NpcView` and
  `buildNpcView(world, id): NpcView`. It holds only requirements section 4:
  - self: id, location, fatigue condition, health, alive, asleep, inventory,
    current action (type and inputs), and whether the current action can be
    cancelled;
  - map knowledge: known locations, seen locations, known routes with their
    base minutes and whether each is open in the current weather;
  - clock: game minute, night or day;
  - weather: current state; forecast only from `character.seenForecast`, and
    only for hours not yet past;
  - here: items lying at the current location, other characters present (ids
    only), shelter value and tarp installed (only at Beach Camp), fire state,
    fuel hours, and wet (only at the Hilltop);
  - own NPC state: goals, plan, `wreckageSearchedOut`;
  - behavior numbers and the needed rule numbers (carry slots, fire build
    wood, fatigue thresholds) as plain values.
- Return copies, not references, so a planner can't change the world.
- Add `nearestProtected(view): { location, path: LocationId[] } | null`:
  shortest total base route minutes over known, open routes. Protected means
  the Cave, or Beach Camp with shelter 30 or more. When the NPC is away from
  Beach Camp, count Beach Camp as protected (it can't see the value). If it is
  already in a protected place, return it with an empty path. If several are
  equally near, return all of them (Phase 3 picks one with the random
  generator), so the function returns a list.
- Add `pathTo(view, location): LocationId[] | null` over known, open routes,
  for planners.
- Tests in `src/engine/npc/view.test.ts`:
  - the view never contains: items at other locations, `wreckageToFind`, the
    weather sequence, other characters' state, or other NPCs' goals (check
    with `JSON.stringify` on the view);
  - the forecast appears only after the NPC itself observed at the Hilltop;
  - shelter value appears only at Beach Camp;
  - nearest protected place: Beach Camp from the Forest at start; the Cave
    once known and nearer; a route closed by a Storm is skipped; ties return
    both.

### Key Files
- `src/engine/npc/view.ts`
- `src/engine/npc/view.test.ts`

### Verification
`npm run typecheck && npm test -- src/engine/npc/view.test.ts` passes.

---

## Task 2.2: Goal Planners [DONE]

Depends on: Task 2.1

### Subtasks
- Create `src/engine/npc/goals.ts`. For each goal id, a planner with:
  - `isDone(view): boolean`
  - `isDropped(view): string | null` (the reason, or null)
  - `plan(view): Action[] | null` (null when no step is possible right now,
    for example the next step needs a free slot and none is free)
- Planners rebuild from the current view each time. They may use the
  remaining steps of the current plan only as a hint; they must not depend on
  remembered facts other than those in the view.
- `make_camp_safe` (Marcus):
  - Tarp part: if the tarp is installed (seen at Beach Camp) or carried, go
    to Beach Camp and install it. Otherwise go to the Wreckage; if a tarp
    lies there, take it; else search. Tarp part is dropped if
    `wreckageSearchedOut` is true and no tarp is lying there or carried; the
    goal then moves on to repairs.
  - Repair part: while shelter (last seen at Beach Camp) is below
    `shelterTarget`: go to the Forest, gather wood up to free slots (at most
    the number of repairs still needed), go to Beach Camp, repair once per
    bundle.
  - Done when at Beach Camp, shelter is at least `shelterTarget`, and the tarp
    part is done or dropped.
- `keep_wood_reserve` (Marcus): never done. If at Beach Camp and fewer than
  `woodReserve` dry bundles lie there, gather one in the Forest, bring it
  back, and drop it. Otherwise no plan (null).
- `map_island` (Sarah): explore the Forest (reveals Cave and both routes),
  then go to the Cave and explore it. Done when the Cave and both Hilltop
  routes (Forest–Hilltop, Cave–Hilltop) are known.
- `keep_flashlight` (Sarah): go to the Wreckage; take the flashlight if it
  lies there; else search. Done when carrying the flashlight. Dropped when
  `wreckageSearchedOut` is true and no flashlight is lying there or carried.
- `signal_rescue` (Sarah): needs a known route to the Hilltop; until then, no
  plan. Steps: gather wood (fill free slots) → go to the Hilltop → drop it →
  repeat until `buildWood` dry bundles lie there → build → light. If not
  carrying the lighter before lighting, go to the Wreckage: take it if it
  lies there, else search. If it lies anywhere she is, take it. Done when the
  fire is Lit (seen at the Hilltop). Dropped when
  `wreckageSearchedOut` is true and no lighter is seen or carried.
- Planners must respect A.12 rules they can see (free slots, Exhausted, health
  below 30) so they do not plan steps that will certainly be rejected.
- Tests in `src/engine/npc/goals.test.ts`, using `buildNpcView` on small test
  worlds:
  - each goal's first plan at start;
  - each done check and each dropped check;
  - `signal_rescue` gives no plan until a Hilltop route is known;
  - Marcus away from the Wreckage gets a plan that goes there to search, even
    if the tarp already lies there (he can't see it).

### Key Files
- `src/engine/npc/goals.ts`
- `src/engine/npc/goals.test.ts`

### Verification
`npm run typecheck && npm test -- src/engine/npc/goals.test.ts` passes.
