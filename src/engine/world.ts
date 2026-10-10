// Creates a new world in its starting state (spec A.3, A.11).

import { loadWorldRules, type RulesOverrides, type WeatherState, type WorldRules } from "./config";
import { loadNpcConfig, type NpcConfigOverrides } from "./npc/profiles";
import { createNpcStates } from "./npc/state";
import { createRng } from "./rng";
import {
  CHARACTER_IDS,
  type Character,
  type CharacterId,
  type ItemKind,
  type LocationState,
  type World,
} from "./state";
import { sessionHours } from "./time";
import { rollWeather } from "./weather";
import { rollSearchOrder } from "./wreckage";

export interface CreateWorldOptions {
  /** Config overrides, for tests. */
  rules?: RulesOverrides;
  /** Forced hourly weather, replacing the rolled sequence (A.13). */
  weather?: WeatherState[];
  /** Forced Wreckage search order, replacing the rolled order (A.13). */
  searchOrder?: ItemKind[];
  /** NPCs act on their own when true. Default false (Phase 1 behavior). */
  autonomy?: boolean;
  /** NPC config overrides, for tests. */
  npcs?: NpcConfigOverrides;
}

export function createWorld(seed: number, options: CreateWorldOptions = {}): World {
  const rules = loadWorldRules(options.rules);
  const npcConfig = loadNpcConfig(options.npcs);
  const rng = createRng(seed);

  // Always roll in the fixed order (weather, then search order), even when a
  // value is forced, so the RNG state does not depend on what tests force.
  const rolledWeather = rollWeather(rng, rules);
  const rolledOrder = rollSearchOrder(rng, rules) as ItemKind[];

  const weather = options.weather ?? rolledWeather;
  checkForcedWeather(weather, rules);
  const wreckageToFind = options.searchOrder ?? rolledOrder;
  checkForcedSearchOrder(wreckageToFind, rules);

  const locations: Record<string, LocationState> = {};
  for (const location of rules.locations) {
    locations[location.id] = { items: [] };
  }

  const characters = {} as Record<CharacterId, Character>;
  for (const id of CHARACTER_IDS) {
    characters[id] = createCharacter(id, rules);
  }

  return {
    seed,
    rules,
    minute: 0,
    ended: false,
    rngState: rng.state,
    weather: [...weather],
    wreckageToFind: [...wreckageToFind],
    locations,
    shelter: { value: rules.starting.shelter, tarpInstalled: false },
    fire: { state: "none", fuel: 0, wet: false, dryHours: 0 },
    characters,
    autonomy: options.autonomy ?? false,
    npcBehavior: npcConfig.behavior,
    npcs: createNpcStates(npcConfig),
    events: [],
    nextItemId: 1,
  };
}

function createCharacter(id: CharacterId, rules: WorldRules): Character {
  const knowledge = rules.startingKnowledge;
  // Each character gets its own copies: knowledge is private (A.3).
  return {
    id,
    location: rules.starting.location,
    fatigue: rules.starting.fatigue * 2,
    health: rules.starting.health,
    alive: true,
    inventory: [],
    knownLocations: [...knowledge.knownLocations],
    seenLocations: [...knowledge.seenLocations],
    knownRoutes: knowledge.knownRoutes.map((pair) => [...pair]),
    action: null,
    seenForecast: null,
  };
}

function checkForcedWeather(weather: WeatherState[], rules: WorldRules): void {
  const hours = sessionHours(rules);
  if (weather.length !== hours) {
    throw new Error(`forced weather must have ${hours} hourly states, got ${weather.length}`);
  }
  weather.forEach((state, i) => {
    if (!rules.weather.states.includes(state)) {
      throw new Error(`forced weather[${i}]: unknown weather state "${state}"`);
    }
  });
}

function checkForcedSearchOrder(order: ItemKind[], rules: WorldRules): void {
  order.forEach((item, i) => {
    if (!rules.wreckage.items.includes(item)) {
      throw new Error(`forced searchOrder[${i}]: "${item}" is not a Wreckage item`);
    }
  });
}
