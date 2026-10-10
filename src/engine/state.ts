// World state types. The world is plain JSON (no classes, no Maps), so it can
// be saved, cloned, and compared in tests. Engine functions mutate it in place.

import type { Action } from "./actions/types";
import type { LocationId, RoutePair, WeatherState, WorldRules } from "./config";
import type { GameEvent } from "./events";

export type CharacterId = "player" | "npc1" | "npc2";

/** Fixed character order. Every per-character loop uses this order. */
export const CHARACTER_IDS: readonly CharacterId[] = ["player", "npc1", "npc2"];

export type ItemKind = "wood" | "lighter" | "tarp" | "flashlight";

/** `dryHours` counts consecutive Clear/Cloudy hours while wet (A.6). */
export type Item =
  | { id: string; kind: "wood"; wet: boolean; dryHours: number }
  | { id: string; kind: "lighter"; usesLeft: number }
  | { id: string; kind: "tarp" }
  | { id: string; kind: "flashlight"; batteryMinutes: number };

export type FireState = "none" | "built" | "lit";

export interface SignalFire {
  state: FireState;
  /** Fuel in half fuel-minutes (1 fuel-hour = 120 units). */
  fuel: number;
  wet: boolean;
  dryHours: number;
}

export interface Shelter {
  value: number;
  tarpInstalled: boolean;
}

export interface LocationState {
  /** Items lying here, including loose wood bundles. */
  items: Item[];
}

/** The action a character is doing. Its duration is fixed when it starts. */
export interface CurrentAction {
  action: Action;
  startedAt: number;
  /** Game minute it completes, or null if it ends on a condition (Sleep). */
  endsAt: number | null;
}

export interface Character {
  id: CharacterId;
  location: LocationId;
  /** Fatigue in half-points: +0.5 per minute is 1, +1 per minute is 2. */
  fatigue: number;
  health: number;
  alive: boolean;
  inventory: Item[];
  knownLocations: LocationId[];
  /** Known to exist (seen from afar) but not reachable by a known route. */
  seenLocations: LocationId[];
  knownRoutes: RoutePair[];
  action: CurrentAction | null;
}

export interface World {
  seed: number;
  rules: WorldRules;
  /** Whole minutes since session start (Day 1 08:00). */
  minute: number;
  ended: boolean;
  rngState: number;
  /** One state per session hour (A.7). */
  weather: WeatherState[];
  /** Wreckage items not yet found, in the order searches find them (A.5). */
  wreckageToFind: ItemKind[];
  locations: Record<LocationId, LocationState>;
  shelter: Shelter;
  fire: SignalFire;
  characters: Record<CharacterId, Character>;
  events: GameEvent[];
  /** Counter for new item ids, so ids are deterministic. */
  nextItemId: number;
}
