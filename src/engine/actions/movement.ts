// Move, Explore, Wait, and Observe weather (spec A.3, A.4, A.7, A.12).

import type { LocationId, Route, WorldRules } from "../config";
import { logEvent, type JsonValue } from "../events";
import type { Character, World } from "../state";
import { hourIndex, isNight } from "../time";
import { weatherAt } from "../weather";
import { travelDuration, workDuration } from "./duration";
import type { ActionDefs } from "./framework";

function samePair(a: LocationId, b: LocationId, x: LocationId, y: LocationId): boolean {
  return (a === x && b === y) || (a === y && b === x);
}

export function findRoute(rules: WorldRules, a: LocationId, b: LocationId): Route | undefined {
  return rules.routes.find((route) => samePair(a, b, route.from, route.to));
}

export function knowsRoute(character: Character, a: LocationId, b: LocationId): boolean {
  return character.knownRoutes.some(([x, y]) => x !== undefined && y !== undefined && samePair(a, b, x, y));
}

function knowsLocation(character: Character, id: LocationId): boolean {
  return character.knownLocations.includes(id);
}

function learnLocation(world: World, character: Character, id: LocationId): void {
  if (knowsLocation(character, id)) return;
  character.knownLocations.push(id);
  character.seenLocations = character.seenLocations.filter((seen) => seen !== id);
  logEvent(world, "discovery", { kind: "location", location: id }, character.id);
}

/** What exploring here would reveal to this character that it does not know yet. */
function unrevealed(world: World, character: Character): { locations: LocationId[]; routes: LocationId[][] } {
  const rule = world.rules.explore.byLocation[character.location];
  if (!rule) return { locations: [], routes: [] };
  return {
    locations: rule.revealsLocations.filter((id) => !knowsLocation(character, id)),
    routes: rule.revealsRoutes.filter(([a, b]) => a !== undefined && b !== undefined && !knowsRoute(character, a, b)),
  };
}

/** Flashlight battery drains for each night minute of travel (A.4). */
export function drainFlashlights(world: World): void {
  if (!isNight(world.rules, world.minute)) return;
  for (const character of Object.values(world.characters)) {
    if (character.action?.action.type !== "move") continue;
    const flashlight = character.inventory.find(
      (item) => item.kind === "flashlight" && item.batteryMinutes > 0,
    );
    if (flashlight?.kind === "flashlight") {
      flashlight.batteryMinutes -= 1;
    }
  }
}

export const movementActions: ActionDefs = {
  move: {
    kind: "travel",
    cancellable: false,
    validate(world, character, action) {
      const from = character.location;
      if (action.to === from) {
        return `already at ${from}`;
      }
      const route = findRoute(world.rules, from, action.to);
      if (!route || !knowsRoute(character, from, action.to)) {
        return `no known route from ${from} to ${action.to}`;
      }
      const weather = weatherAt(world, world.minute);
      if (route.closedIn.includes(weather)) {
        return `route ${from} – ${action.to} is closed in ${weather}`;
      }
      return null;
    },
    duration(world, character, action) {
      const route = findRoute(world.rules, character.location, action.to) as Route;
      return travelDuration(world, character, route.minutes);
    },
    // No recheck: travel always continues, even if the route closes (A.3).
    complete(_world, character, action) {
      character.location = action.to;
      return { arrived: action.to };
    },
  },

  explore: {
    kind: "work",
    cancellable: true,
    validate() {
      return null;
    },
    duration(world, character) {
      const rule = world.rules.explore.byLocation[character.location];
      const next = unrevealed(world, character);
      const somethingNew = next.locations.length > 0 || next.routes.length > 0;
      const base = rule && somethingNew ? rule.minutes : world.rules.explore.defaultMinutes;
      return workDuration(world, character, base);
    },
    complete(world, character) {
      const next = unrevealed(world, character);
      for (const id of next.locations) {
        learnLocation(world, character, id);
      }
      for (const [a, b] of next.routes) {
        if (a === undefined || b === undefined) continue;
        character.knownRoutes.push([a, b]);
        logEvent(world, "discovery", { kind: "route", from: a, to: b }, character.id);
        learnLocation(world, character, a);
        learnLocation(world, character, b);
      }
      return { discoveries: next.locations.length + next.routes.length };
    },
  },

  wait: {
    kind: "idle",
    cancellable: true,
    validate(_world, _character, action) {
      return Number.isInteger(action.minutes) && action.minutes > 0
        ? null
        : `wait minutes must be a whole number above 0, got ${action.minutes}`;
    },
    duration(_world, _character, action) {
      return action.minutes;
    },
    complete() {
      return {};
    },
  },

  observe_weather: {
    kind: "idle",
    cancellable: true,
    validate() {
      return null;
    },
    duration(world) {
      return world.rules.actions.observe_weather.minutes;
    },
    complete(world, character) {
      const result: { [key: string]: JsonValue } = { weather: weatherAt(world, world.minute) };
      const { observeForecastLocation, observeForecastHours } = world.rules.weather;
      if (character.location === observeForecastLocation) {
        const hour = hourIndex(world.minute);
        const forecast = world.weather.slice(hour + 1, hour + 1 + observeForecastHours);
        result.forecast = forecast;
        character.seenForecast = { fromHour: hour + 1, states: [...forecast] };
      }
      return result;
    },
  },
};
