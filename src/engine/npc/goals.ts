// Goal planners (requirements Phase 2 §2). Each goal turns the NPC view into a
// plan: an ordered list of A.12 actions. Planners read only the NpcView, never
// the World.
//
// An NPC sees only its current location, so each planner works from where the
// NPC stands. A plan runs as far as the NPC can see: steps that need an item
// id it can't see yet (Take, Drop) wait until it arrives and replans.

import type { Action } from "../actions/types";
import type { LocationId } from "../config";
import type { Item, ItemKind } from "../state";
import type { NpcGoalId } from "./profiles";
import { pathTo, type NpcView } from "./view";

export interface GoalPlanner {
  /** True when the goal is reached, as far as the NPC can see. */
  isDone(view: NpcView): boolean;
  /** Reason the goal can no longer be reached, or null. */
  isDropped(view: NpcView): string | null;
  /** Steps toward the goal from here, or null if no step is possible now. */
  plan(view: NpcView): Action[] | null;
}

/** map_island is done once this many routes to the Hilltop are known (requirements §1). */
const HILLTOP_ROUTES_TO_FIND = 2;

// --- Helpers ---------------------------------------------------------------

/** Move actions along the path to a location; [] if here; null if unreachable. */
function movesTo(view: NpcView, location: LocationId): Action[] | null {
  const path = pathTo(view, location);
  return path === null ? null : path.map((to): Action => ({ type: "move", to }));
}

function carried(view: NpcView, kind: ItemKind): Item[] {
  return view.self.inventory.filter((item) => item.kind === kind);
}

function lyingHere(view: NpcView, kind: ItemKind): Item[] {
  return view.here.items.filter((item) => item.kind === kind);
}

function dryWoodHere(view: NpcView): number {
  return view.here.items.filter((item) => item.kind === "wood" && !item.wet).length;
}

function at(view: NpcView, location: LocationId): boolean {
  return view.self.location === location;
}

/** Gather, build, repair, and search need: not Exhausted, health at the minimum or more (A.8, A.9). */
function canWork(view: NpcView): boolean {
  return view.self.fatigue !== "exhausted" && view.self.health >= view.rules.workHealthMinimum;
}

/** How many more of an item kind fit in the free carry slots. */
function roomFor(view: NpcView, kind: ItemKind): number {
  const slots = view.rules.itemSlots[kind];
  return slots === 0 ? Infinity : Math.floor(view.self.freeSlots / slots);
}

/** Take actions for every item of a kind lying here that fits. */
function takeAll(view: NpcView, kind: ItemKind): Action[] {
  const room = roomFor(view, kind);
  return lyingHere(view, kind)
    .slice(0, room === Infinity ? undefined : room)
    .map((item): Action => ({ type: "take", itemId: item.id }));
}

/** Gather wood up to the free slots, if work is possible. */
function gatherSteps(view: NpcView): Action[] {
  if (!canWork(view)) return [];
  const room = Math.min(roomFor(view, "wood"), view.rules.carrySlots);
  return Array.from({ length: room }, (): Action => ({ type: "gather_wood" }));
}

/** A plan, or null when it has no steps. */
function orNull(steps: Action[] | null): Action[] | null {
  return steps && steps.length > 0 ? steps : null;
}

/** Steps to search the Wreckage for an item kind: take it if seen, else search. */
function findAtWreckage(view: NpcView, kind: ItemKind): Action[] | null {
  const wreckage = view.rules.wreckageLocation;
  if (!at(view, wreckage)) {
    // Search on arrival, unless already searched out (then just go and look).
    // Arriving is a decision point, so an item seen there is taken instead.
    const moves = movesTo(view, wreckage);
    if (moves === null) return null;
    return view.npc.wreckageSearchedOut ? orNull(moves) : [...moves, { type: "search" }];
  }
  const take = takeAll(view, kind).slice(0, 1);
  if (take.length > 0) return take;
  if (!view.npc.wreckageSearchedOut && canWork(view)) return [{ type: "search" }];
  return null;
}

/** True when the NPC searched the Wreckage out and sees no item of this kind here or carried. */
function lostAtWreckage(view: NpcView, kind: ItemKind): boolean {
  return (
    view.npc.wreckageSearchedOut &&
    at(view, view.rules.wreckageLocation) &&
    lyingHere(view, kind).length === 0 &&
    carried(view, kind).length === 0
  );
}

// --- make_camp_safe (Marcus) -----------------------------------------------
// Tarp part: find the tarp at the Wreckage and install it. Repair part: bring
// wood from the Forest and repair until the shelter reaches the target.

function tarpPartOver(view: NpcView): boolean {
  // Only known at Beach Camp, where the shelter is visible.
  if (view.here.shelter === null) return false;
  if (view.here.shelter.tarpInstalled) return true;
  return view.npc.wreckageSearchedOut && carried(view, "tarp").length === 0 && lyingHere(view, "tarp").length === 0;
}

const makeCampSafe: GoalPlanner = {
  isDone(view) {
    const shelter = view.here.shelter;
    return shelter !== null && shelter.value >= view.behavior.shelterTarget && tarpPartOver(view);
  },
  isDropped() {
    return null;
  },
  plan(view) {
    const camp = view.rules.shelterLocation;
    const tarps = carried(view, "tarp");

    if (at(view, camp) && view.here.shelter) {
      if (tarps.length > 0 && !view.here.shelter.tarpInstalled) return [{ type: "install_tarp" }];
      const tarpHere = takeAll(view, "tarp").slice(0, 1);
      if (tarpHere.length > 0 && !view.here.shelter.tarpInstalled) return [...tarpHere, { type: "install_tarp" }];
      if (!tarpPartOver(view)) return findAtWreckage(view, "tarp");
      if (view.here.shelter.value >= view.behavior.shelterTarget) return null;
      if (!canWork(view)) return null;
      const wood = carried(view, "wood");
      if (wood.length > 0) return [{ type: "repair_shelter" }];
      return orNull(movesTo(view, view.rules.gatherLocation));
    }

    if (tarps.length > 0) return orNull(movesTo(view, camp));

    if (at(view, view.rules.wreckageLocation)) {
      const found = findAtWreckage(view, "tarp");
      if (found) return found;
      // Searched out with no tarp here: go back and start repairs.
      return orNull(movesTo(view, camp));
    }

    if (at(view, view.rules.gatherLocation)) {
      const gather = roomFor(view, "wood") > 0 ? gatherSteps(view) : [];
      const back = movesTo(view, camp) ?? [];
      if (carried(view, "wood").length === 0 && gather.length === 0) return null;
      return orNull([...gather, ...back]);
    }

    return orNull(movesTo(view, camp));
  },
};

// --- keep_wood_reserve (Marcus) --------------------------------------------
// Keep a few dry wood bundles lying at Beach Camp. Never done.

const keepWoodReserve: GoalPlanner = {
  isDone() {
    return false;
  },
  isDropped() {
    return null;
  },
  plan(view) {
    const camp = view.rules.shelterLocation;
    const wood = carried(view, "wood");

    if (at(view, camp)) {
      const missing = view.behavior.woodReserve - dryWoodHere(view);
      if (missing <= 0) return null;
      const dry = wood.filter((item) => item.kind === "wood" && !item.wet).slice(0, missing);
      if (dry.length > 0) return dry.map((item): Action => ({ type: "drop", itemId: item.id }));
      return orNull(movesTo(view, view.rules.gatherLocation));
    }

    if (at(view, view.rules.gatherLocation) && wood.length === 0) {
      const gather = gatherSteps(view).slice(0, 1);
      if (gather.length === 0) return null;
      return [...gather, ...(movesTo(view, camp) ?? [])];
    }

    return orNull(movesTo(view, camp));
  },
};

// --- map_island (Sarah) ----------------------------------------------------
// Explore the Forest (reveals the Cave and routes), then explore the Cave.

function hilltopRoutesKnown(view: NpcView): number {
  const hilltop = view.rules.fireLocation;
  return view.map.routes.filter((route) => route.from === hilltop || route.to === hilltop).length;
}

function sheltersKnown(view: NpcView): boolean {
  return view.rules.naturalShelters.every((id) => view.map.knownLocations.includes(id));
}

const mapIsland: GoalPlanner = {
  isDone(view) {
    return sheltersKnown(view) && hilltopRoutesKnown(view) >= HILLTOP_ROUTES_TO_FIND;
  },
  isDropped() {
    return null;
  },
  plan(view) {
    // Explore is allowed while Exhausted (requirements Phase 1 §2).
    const target = sheltersKnown(view)
      ? view.rules.naturalShelters.find((id) => pathTo(view, id) !== null)
      : view.rules.gatherLocation;
    if (target === undefined) return null;
    const moves = movesTo(view, target);
    if (moves === null) return null;
    return [...moves, { type: "explore" }];
  },
};

// --- keep_flashlight (Sarah) -----------------------------------------------

const keepFlashlight: GoalPlanner = {
  isDone(view) {
    return carried(view, "flashlight").length > 0;
  },
  isDropped(view) {
    return lostAtWreckage(view, "flashlight") ? "flashlight not found at the Wreckage" : null;
  },
  plan(view) {
    return findAtWreckage(view, "flashlight");
  },
};

// --- signal_rescue (Sarah) -------------------------------------------------
// Once a route to the Hilltop is known: get the lighter first, then haul dry
// wood to the Hilltop, build, and light. Getting the lighter first means she
// never turns back halfway between the Hilltop and the Wreckage (she can't see
// the fire once she leaves).

function signalSteps(view: NpcView, toHilltop: Action[]): Action[] | null {
  const hilltop = view.rules.fireLocation;
  const wood = carried(view, "wood");

  if (at(view, hilltop) && view.here.fire) {
    const fire = view.here.fire;
    if (fire.state === "lit") return null;
    if (fire.state === "built") {
      if (fire.wet || view.rules.lightBlockedWeather.includes(view.weather.current)) return null;
      return [{ type: "light_fire" }];
    }
    // No fire yet.
    if (dryWoodHere(view) >= view.rules.fireBuildWood) {
      return canWork(view) ? [{ type: "build_fire" }] : null;
    }
    const drops = wood.map((item): Action => ({ type: "drop", itemId: item.id }));
    if (drops.length > 0) return drops;
    return orNull(movesTo(view, view.rules.gatherLocation));
  }

  if (at(view, view.rules.gatherLocation) && roomFor(view, "wood") > 0) {
    const gather = gatherSteps(view);
    if (gather.length > 0) return [...gather, ...toHilltop];
  }

  if (wood.length > 0) return orNull(toHilltop);
  return orNull(movesTo(view, view.rules.gatherLocation));
}

const signalRescue: GoalPlanner = {
  isDone(view) {
    return view.here.fire?.state === "lit";
  },
  isDropped(view) {
    return lostAtWreckage(view, "lighter") ? "lighter not found at the Wreckage" : null;
  },
  plan(view) {
    const toHilltop = movesTo(view, view.rules.fireLocation);
    if (toHilltop === null) return null;

    if (carried(view, "lighter").length === 0) {
      // Take a lighter whenever she sees one; otherwise fetch it first.
      const takeLighter = takeAll(view, "lighter").slice(0, 1);
      if (takeLighter.length === 0) return findAtWreckage(view, "lighter");
      return [...takeLighter, ...(signalSteps(view, toHilltop) ?? [])];
    }
    return signalSteps(view, toHilltop);
  },
};

export const goalPlanners: Record<NpcGoalId, GoalPlanner> = {
  make_camp_safe: makeCampSafe,
  keep_wood_reserve: keepWoodReserve,
  map_island: mapIsland,
  keep_flashlight: keepFlashlight,
  signal_rescue: signalRescue,
};
