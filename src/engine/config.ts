// World rules config (spec Appendix A). Every rule number the engine uses comes
// from config/world-rules.json, loaded and checked here. Values use the spec's
// own units: minutes, hours, and per-minute or per-hour rates.

import rawRules from "./config/world-rules.json";

export type LocationId = string;
export type WeatherState = string;
export type ItemId = string;
export type ClockTime = string; // "HH:MM"
// A plain array (not a tuple) so the JSON import type-checks; length 2 is
// checked at load.
export type RoutePair = LocationId[];

export interface Route {
  from: LocationId;
  to: LocationId;
  minutes: number;
  closedIn: WeatherState[];
}

export interface ActionRule {
  minutes: number;
  location?: LocationId;
}

export interface ExploreRule {
  minutes: number;
  revealsLocations: LocationId[];
  revealsRoutes: RoutePair[];
}

export interface WorldRules {
  session: {
    start: { day: number; time: ClockTime };
    end: { day: number; time: ClockTime };
  };
  dayNight: { daylightStart: ClockTime; nightStart: ClockTime };
  locations: { id: LocationId; name: string }[];
  routes: Route[];
  travelModifiers: {
    nightWithoutFlashlight: number;
    weather: Record<WeatherState, number>;
    fatigue: { tired: number; exhausted: number };
  };
  startingKnowledge: {
    knownLocations: LocationId[];
    seenLocations: LocationId[];
    knownRoutes: RoutePair[];
  };
  explore: {
    defaultMinutes: number;
    byLocation: Record<LocationId, ExploreRule>;
  };
  carrySlots: number;
  items: {
    wood: { name: string; slots: number };
    lighter: { name: string; slots: number; uses: number };
    tarp: { name: string; slots: number };
    flashlight: { name: string; slots: number; batteryMinutes: number };
  };
  wreckage: { location: LocationId; items: ItemId[] };
  signalFire: {
    location: LocationId;
    buildWood: number;
    startFuelHours: number;
    addFuelHours: number;
    maxFuelHours: number;
    burnPerHour: Record<WeatherState, number>;
    goOutWeather: WeatherState[];
    goOutBelowHours: number;
    lightBlockedWeather: WeatherState[];
  };
  wetWood: {
    wetWeather: WeatherState[];
    dryWeather: WeatherState[];
    dryAfterHours: number;
  };
  weather: {
    states: WeatherState[];
    stayChance: number;
    stormMaxHours: number;
    observeForecastLocation: LocationId;
    observeForecastHours: number;
  };
  fatigue: {
    perMinute: { work: number; travel: number; interact: number; idle: number };
    sleepPerMinute: { shelteredCamp: number; cave: number; elsewhere: number };
    tiredAt: number;
    exhaustedAt: number;
    collapseAt: number;
    collapseWakeBelow: number;
  };
  health: {
    max: number;
    stormDamagePerHour: number;
    sleepHealPerHour: number;
    workMinimum: number;
  };
  shelter: {
    location: LocationId;
    naturalShelters: LocationId[];
    max: number;
    protectsAt: number;
    repairAmount: number;
    repairWood: number;
    tarpAmount: number;
    lossPerHour: Record<WeatherState, number>;
  };
  actions: {
    tiredWorkMultiplier: number;
    gather_wood: ActionRule;
    search: ActionRule;
    take: ActionRule;
    drop: ActionRule;
    give: ActionRule;
    build_fire: ActionRule;
    add_wood: ActionRule;
    light_fire: ActionRule;
    repair_shelter: ActionRule;
    install_tarp: ActionRule;
    observe_weather: ActionRule;
  };
  starting: {
    location: LocationId;
    fatigue: number;
    health: number;
    shelter: number;
    firstHourWeather: WeatherState;
  };
}

// Compile-time check that the shipped JSON has the WorldRules shape: a missing
// or misspelled key fails `npm run typecheck`.
const shippedRules: WorldRules = rawRules;

export type RulesOverrides = DeepPartial<WorldRules>;

type DeepPartial<T> = T extends unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Merges objects key by key. Arrays and plain values in `overrides` replace the base. */
function deepMerge(base: unknown, overrides: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(overrides)) {
    return overrides === undefined ? base : overrides;
  }
  const result: PlainObject = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    result[key] = deepMerge(base[key], value);
  }
  return result;
}

/**
 * Loads the shipped world rules, applies test overrides, and checks them.
 * Throws an error naming the bad key if a check fails.
 */
export function loadWorldRules(overrides?: RulesOverrides): WorldRules {
  const merged = deepMerge(structuredClone(shippedRules), overrides ?? {}) as WorldRules;
  validateWorldRules(merged);
  return merged;
}

class RulesError extends Error {
  constructor(key: string, message: string) {
    super(`world-rules: ${key}: ${message}`);
    this.name = "RulesError";
  }
}

export function validateWorldRules(rules: WorldRules): void {
  const locationIds = new Set<string>();
  rules.locations.forEach((location, i) => {
    if (locationIds.has(location.id)) {
      throw new RulesError(`locations[${i}].id`, `duplicate location "${location.id}"`);
    }
    locationIds.add(location.id);
  });
  const weatherStates = new Set(rules.weather.states);
  const itemIds = new Set(Object.keys(rules.items));

  const checkLocation = (key: string, id: LocationId): void => {
    if (!locationIds.has(id)) {
      throw new RulesError(key, `unknown location "${id}"`);
    }
  };
  const checkWeather = (key: string, state: WeatherState): void => {
    if (!weatherStates.has(state)) {
      throw new RulesError(key, `unknown weather state "${state}"`);
    }
  };
  const checkPositiveInt = (key: string, value: number): void => {
    if (!Number.isInteger(value) || value <= 0) {
      throw new RulesError(key, `must be a whole number above 0, got ${value}`);
    }
  };
  // Fatigue and fire fuel are stored in half-units, so these rates must be
  // whole numbers when doubled to keep integer math exact.
  const checkHalfUnit = (key: string, value: number): void => {
    if (!Number.isInteger(value * 2)) {
      throw new RulesError(key, `must be a multiple of 0.5 (stored in half-units), got ${value}`);
    }
  };
  const checkTime = (key: string, time: ClockTime): void => {
    const match = /^(\d{2}):(\d{2})$/.exec(time);
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
      throw new RulesError(key, `must be a time "HH:MM", got "${time}"`);
    }
  };

  // Session and day/night.
  checkTime("session.start.time", rules.session.start.time);
  checkTime("session.end.time", rules.session.end.time);
  checkTime("dayNight.daylightStart", rules.dayNight.daylightStart);
  checkTime("dayNight.nightStart", rules.dayNight.nightStart);

  // Routes.
  const routeKeys = new Set<string>();
  const routeKey = (a: LocationId, b: LocationId): string => [a, b].sort().join("|");
  rules.routes.forEach((route, i) => {
    checkLocation(`routes[${i}].from`, route.from);
    checkLocation(`routes[${i}].to`, route.to);
    if (route.from === route.to) {
      throw new RulesError(`routes[${i}]`, "a route must connect two different locations");
    }
    const key = routeKey(route.from, route.to);
    if (routeKeys.has(key)) {
      throw new RulesError(`routes[${i}]`, `duplicate route ${route.from} – ${route.to}`);
    }
    routeKeys.add(key);
    checkPositiveInt(`routes[${i}].minutes`, route.minutes);
    route.closedIn.forEach((state, j) => checkWeather(`routes[${i}].closedIn[${j}]`, state));
  });
  const checkRoute = (key: string, pair: RoutePair): void => {
    const [a, b] = pair;
    if (pair.length !== 2 || a === undefined || b === undefined) {
      throw new RulesError(key, "must be a pair of two location ids");
    }
    checkLocation(`${key}[0]`, a);
    checkLocation(`${key}[1]`, b);
    if (!routeKeys.has(routeKey(a, b))) {
      throw new RulesError(key, `no route ${a} – ${b}`);
    }
  };

  // Travel modifiers.
  Object.keys(rules.travelModifiers.weather).forEach((state) =>
    checkWeather(`travelModifiers.weather.${state}`, state),
  );

  // Starting knowledge and explore.
  rules.startingKnowledge.knownLocations.forEach((id, i) =>
    checkLocation(`startingKnowledge.knownLocations[${i}]`, id),
  );
  rules.startingKnowledge.seenLocations.forEach((id, i) =>
    checkLocation(`startingKnowledge.seenLocations[${i}]`, id),
  );
  rules.startingKnowledge.knownRoutes.forEach((pair, i) =>
    checkRoute(`startingKnowledge.knownRoutes[${i}]`, pair),
  );
  checkPositiveInt("explore.defaultMinutes", rules.explore.defaultMinutes);
  for (const [id, explore] of Object.entries(rules.explore.byLocation)) {
    const key = `explore.byLocation.${id}`;
    checkLocation(key, id);
    checkPositiveInt(`${key}.minutes`, explore.minutes);
    explore.revealsLocations.forEach((loc, i) => checkLocation(`${key}.revealsLocations[${i}]`, loc));
    explore.revealsRoutes.forEach((pair, i) => checkRoute(`${key}.revealsRoutes[${i}]`, pair));
  }

  // Items and wreckage.
  checkPositiveInt("carrySlots", rules.carrySlots);
  checkLocation("wreckage.location", rules.wreckage.location);
  rules.wreckage.items.forEach((item, i) => {
    if (!itemIds.has(item)) {
      throw new RulesError(`wreckage.items[${i}]`, `unknown item "${item}"`);
    }
  });

  // Signal fire and wet wood.
  const fire = rules.signalFire;
  checkLocation("signalFire.location", fire.location);
  for (const state of rules.weather.states) {
    const rate = fire.burnPerHour[state];
    if (rate === undefined) {
      throw new RulesError(`signalFire.burnPerHour.${state}`, "missing burn rate");
    }
    checkHalfUnit(`signalFire.burnPerHour.${state}`, rate);
  }
  Object.keys(fire.burnPerHour).forEach((state) =>
    checkWeather(`signalFire.burnPerHour.${state}`, state),
  );
  fire.goOutWeather.forEach((s, i) => checkWeather(`signalFire.goOutWeather[${i}]`, s));
  fire.lightBlockedWeather.forEach((s, i) => checkWeather(`signalFire.lightBlockedWeather[${i}]`, s));
  if (fire.startFuelHours > fire.maxFuelHours) {
    throw new RulesError("signalFire.startFuelHours", "must not be above maxFuelHours");
  }
  rules.wetWood.wetWeather.forEach((s, i) => checkWeather(`wetWood.wetWeather[${i}]`, s));
  rules.wetWood.dryWeather.forEach((s, i) => checkWeather(`wetWood.dryWeather[${i}]`, s));

  // Weather.
  if (rules.weather.states.length < 2) {
    throw new RulesError("weather.states", "needs at least two states");
  }
  if (rules.weather.stayChance < 0 || rules.weather.stayChance > 1) {
    throw new RulesError("weather.stayChance", "must be between 0 and 1");
  }
  checkPositiveInt("weather.stormMaxHours", rules.weather.stormMaxHours);
  checkLocation("weather.observeForecastLocation", rules.weather.observeForecastLocation);

  // Fatigue.
  const fatigue = rules.fatigue;
  for (const [name, rate] of Object.entries(fatigue.perMinute)) {
    checkHalfUnit(`fatigue.perMinute.${name}`, rate);
  }
  for (const [name, rate] of Object.entries(fatigue.sleepPerMinute)) {
    checkHalfUnit(`fatigue.sleepPerMinute.${name}`, rate);
  }
  if (!(fatigue.tiredAt < fatigue.exhaustedAt && fatigue.exhaustedAt < fatigue.collapseAt)) {
    throw new RulesError(
      "fatigue",
      "thresholds must increase: tiredAt < exhaustedAt < collapseAt",
    );
  }
  if (fatigue.collapseWakeBelow > fatigue.collapseAt) {
    throw new RulesError("fatigue.collapseWakeBelow", "must not be above collapseAt");
  }

  // Shelter.
  checkLocation("shelter.location", rules.shelter.location);
  rules.shelter.naturalShelters.forEach((id, i) => checkLocation(`shelter.naturalShelters[${i}]`, id));
  Object.keys(rules.shelter.lossPerHour).forEach((state) =>
    checkWeather(`shelter.lossPerHour.${state}`, state),
  );

  // Actions.
  for (const [name, rule] of Object.entries(rules.actions)) {
    if (typeof rule === "number") {
      continue;
    }
    checkPositiveInt(`actions.${name}.minutes`, rule.minutes);
    if (rule.location !== undefined) {
      checkLocation(`actions.${name}.location`, rule.location);
    }
  }

  // Starting conditions.
  checkLocation("starting.location", rules.starting.location);
  checkWeather("starting.firstHourWeather", rules.starting.firstHourWeather);
  if (rules.starting.health > rules.health.max) {
    throw new RulesError("starting.health", "must not be above health.max");
  }
  if (rules.starting.shelter > rules.shelter.max) {
    throw new RulesError("starting.shelter", "must not be above shelter.max");
  }
}
