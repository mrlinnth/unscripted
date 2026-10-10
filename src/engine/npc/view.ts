// The NPC view: everything an NPC's rules may read (requirements Phase 2 §4).
// Goal planners and decision rules take an NpcView, never the World, so they
// can't read world truth the NPC has no source for. The view is a copy;
// changing it never changes the world.

import { isCancellable } from "../actions/framework";
import type { Action } from "../actions/types";
import { fatigueCondition, isAsleep, type FatigueCondition } from "../body";
import type { LocationId, WeatherState } from "../config";
import { fuelHours } from "../actions/fire";
import { freeSlots } from "../actions/items";
import type { CharacterId, FireState, Item, ItemKind, World } from "../state";
import { CHARACTER_IDS } from "../state";
import { hourIndex, isNight } from "../time";
import { weatherAt } from "../weather";
import type { NpcBehavior, NpcId } from "./profiles";
import type { NpcGoalState, NpcPlan } from "./state";

export interface ViewRoute {
  from: LocationId;
  to: LocationId;
  /** Base route minutes, before travel modifiers. */
  minutes: number;
  /** False if closed in the current weather. */
  open: boolean;
}

export interface NpcView {
  id: NpcId;
  minute: number;
  night: boolean;
  self: {
    location: LocationId;
    fatigue: FatigueCondition;
    health: number;
    alive: boolean;
    asleep: boolean;
    inventory: Item[];
    freeSlots: number;
    action: Action | null;
    actionCancellable: boolean;
  };
  map: {
    knownLocations: LocationId[];
    /** Known to exist, but no known route. */
    seenLocations: LocationId[];
    routes: ViewRoute[];
  };
  weather: {
    current: WeatherState;
    /** Hours from the NPC's own Hilltop observation that are not past yet. */
    forecast: { hour: number; state: WeatherState }[];
  };
  here: {
    items: Item[];
    /** Other living characters at this location. */
    characters: CharacterId[];
    /** Only at the shelter location (Beach Camp). */
    shelter: { value: number; tarpInstalled: boolean } | null;
    /** Only at the signal fire location (Hilltop). */
    fire: { state: FireState; fuelHours: number; wet: boolean } | null;
  };
  npc: {
    goals: NpcGoalState[];
    plan: NpcPlan | null;
    wreckageSearchedOut: boolean;
  };
  behavior: NpcBehavior;
  /** Fixed game rules the planners need, as plain values. */
  rules: {
    carrySlots: number;
    itemSlots: Record<ItemKind, number>;
    shelterLocation: LocationId;
    shelterProtectsAt: number;
    naturalShelters: LocationId[];
    fireLocation: LocationId;
    fireBuildWood: number;
    wreckageLocation: LocationId;
    gatherLocation: LocationId;
    forecastLocation: LocationId;
    workHealthMinimum: number;
  };
}

export function buildNpcView(world: World, id: NpcId): NpcView {
  const { rules } = world;
  const character = world.characters[id];
  const npc = world.npcs[id];
  const location = character.location;
  const weather = weatherAt(world, world.minute);
  const currentHour = hourIndex(world.minute);

  const known = new Set(character.knownRoutes.map(([a, b]) => [a, b].sort().join("|")));
  const routes: ViewRoute[] = rules.routes
    .filter((route) => known.has([route.from, route.to].sort().join("|")))
    .map((route) => ({
      from: route.from,
      to: route.to,
      minutes: route.minutes,
      open: !route.closedIn.includes(weather),
    }));

  const seen = character.seenForecast;
  const forecast = seen
    ? seen.states
        .map((state, i) => ({ hour: seen.fromHour + i, state }))
        .filter((entry) => entry.hour >= currentHour)
    : [];

  const others = CHARACTER_IDS.filter((other) => {
    const c = world.characters[other];
    return other !== id && c.alive && c.location === location;
  });

  const view: NpcView = {
    id,
    minute: world.minute,
    night: isNight(rules, world.minute),
    self: {
      location,
      fatigue: fatigueCondition(character, rules),
      health: character.health,
      alive: character.alive,
      asleep: isAsleep(character),
      inventory: character.inventory,
      freeSlots: freeSlots(world, character),
      action: character.action?.action ?? null,
      actionCancellable: character.action ? isCancellable(character.action.action) : false,
    },
    map: {
      knownLocations: character.knownLocations,
      seenLocations: character.seenLocations,
      routes,
    },
    weather: { current: weather, forecast },
    here: {
      items: world.locations[location]?.items ?? [],
      characters: others,
      shelter:
        location === rules.shelter.location
          ? { value: world.shelter.value, tarpInstalled: world.shelter.tarpInstalled }
          : null,
      fire:
        location === rules.signalFire.location
          ? { state: world.fire.state, fuelHours: fuelHours(world.fire), wet: world.fire.wet }
          : null,
    },
    npc: {
      goals: npc.goals,
      plan: npc.plan,
      wreckageSearchedOut: npc.wreckageSearchedOut,
    },
    behavior: world.npcBehavior,
    rules: {
      carrySlots: rules.carrySlots,
      itemSlots: {
        wood: rules.items.wood.slots,
        lighter: rules.items.lighter.slots,
        tarp: rules.items.tarp.slots,
        flashlight: rules.items.flashlight.slots,
      },
      shelterLocation: rules.shelter.location,
      shelterProtectsAt: rules.shelter.protectsAt,
      naturalShelters: rules.shelter.naturalShelters,
      fireLocation: rules.signalFire.location,
      fireBuildWood: rules.signalFire.buildWood,
      wreckageLocation: rules.wreckage.location,
      gatherLocation: requiredLocation(rules.actions.gather_wood.location, "actions.gather_wood.location"),
      forecastLocation: rules.weather.observeForecastLocation,
      workHealthMinimum: rules.health.workMinimum,
    },
  };
  // One deep copy at the end, so nothing in the view points into the world.
  return structuredClone(view);
}

function requiredLocation(location: LocationId | undefined, key: string): LocationId {
  if (location === undefined) {
    throw new Error(`world-rules: ${key} is required for NPC planning`);
  }
  return location;
}

/**
 * Protected per A.9, as far as this NPC can tell: a known natural shelter, or
 * the shelter location with enough shelter. Away from the shelter location the
 * NPC can't see the value, so it counts as protected.
 */
export function isProtectedFor(view: NpcView, location: LocationId): boolean {
  if (!view.map.knownLocations.includes(location)) return false;
  if (view.rules.naturalShelters.includes(location)) return true;
  if (location !== view.rules.shelterLocation) return false;
  if (location !== view.self.location || view.here.shelter === null) return true;
  return view.here.shelter.value >= view.rules.shelterProtectsAt;
}

/** Shortest base minutes from here to every reachable location, over known, open routes. */
function shortestPaths(view: NpcView): Map<LocationId, { minutes: number; path: LocationId[] }> {
  const best = new Map<LocationId, { minutes: number; path: LocationId[] }>();
  best.set(view.self.location, { minutes: 0, path: [] });
  const done = new Set<LocationId>();
  for (;;) {
    // Pick the closest unfinished location. Ties keep the first found, which
    // depends only on route order, so the result is deterministic.
    let current: LocationId | null = null;
    for (const [location, entry] of best) {
      if (done.has(location)) continue;
      if (current === null || entry.minutes < (best.get(current)?.minutes ?? Infinity)) {
        current = location;
      }
    }
    if (current === null) return best;
    done.add(current);
    const from = best.get(current) as { minutes: number; path: LocationId[] };
    for (const route of view.map.routes) {
      if (!route.open) continue;
      const next = route.from === current ? route.to : route.to === current ? route.from : null;
      if (next === null || done.has(next)) continue;
      const minutes = from.minutes + route.minutes;
      const old = best.get(next);
      if (!old || minutes < old.minutes) {
        best.set(next, { minutes, path: [...from.path, next] });
      }
    }
  }
}

/**
 * Path (locations after here, in order) to a location over known, open routes.
 * Empty if already there; null if it can't be reached.
 */
export function pathTo(view: NpcView, location: LocationId): LocationId[] | null {
  return shortestPaths(view).get(location)?.path ?? null;
}

/**
 * The nearest protected places, by base route minutes. If here is protected,
 * returns only here with an empty path. Several entries mean a tie; the
 * caller picks one with the seeded random generator. Empty if none is
 * reachable.
 */
export function nearestProtected(view: NpcView): { location: LocationId; path: LocationId[] }[] {
  if (isProtectedFor(view, view.self.location)) {
    return [{ location: view.self.location, path: [] }];
  }
  let bestMinutes = Infinity;
  let nearest: { location: LocationId; path: LocationId[] }[] = [];
  for (const [location, entry] of shortestPaths(view)) {
    if (!isProtectedFor(view, location)) continue;
    if (entry.minutes < bestMinutes) {
      bestMinutes = entry.minutes;
      nearest = [{ location, path: entry.path }];
    } else if (entry.minutes === bestMinutes) {
      nearest.push({ location, path: entry.path });
    }
  }
  return nearest;
}
