// Unscripted simulation engine: pure TypeScript, no React, Mantine, or Tauri.
// The world is a plain JSON object; engine functions mutate it in place.

import type { WeatherState } from "./config";
import type { Character, CharacterId, World } from "./state";
import { clockAt, dayAt, isNight } from "./time";
import { weatherAt } from "./weather";

export type { WorldRules, WeatherState, LocationId } from "./config";
export type { GameEvent, GameEventType } from "./events";
export type { Character, CharacterId, Item, ItemKind, World } from "./state";
export { CHARACTER_IDS } from "./state";
export { createWorld, type CreateWorldOptions } from "./world";
export { step, stepMinutes } from "./step";
export { submitAction, cancelAction } from "./actions/framework";
export type { Action, ActionType, SubmitResult } from "./actions/types";
export { gameMinuteAt } from "./time";

export interface GameClock {
  minute: number;
  day: number;
  time: string;
  night: boolean;
}

export function getClock(world: World): GameClock {
  return {
    minute: world.minute,
    day: dayAt(world.rules, world.minute),
    time: clockAt(world.rules, world.minute),
    night: isNight(world.rules, world.minute),
  };
}

export function getWeather(world: World): WeatherState {
  return weatherAt(world, world.minute);
}

export function getCharacter(world: World, id: CharacterId): Readonly<Character> {
  return world.characters[id];
}
