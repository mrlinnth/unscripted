// Action durations (A.3 travel modifiers, A.12 Tired work multiplier).
// A duration is fixed when the action starts, using conditions at that moment.

import { fatigueCondition } from "../body";
import type { Character, World } from "../state";
import { isNight } from "../time";
import { weatherAt } from "../weather";

/**
 * Rounds up to whole minutes. The product is first rounded to 6 decimals, so
 * floating-point error (30 × 1.1 = 33.000000000000004) cannot add a minute.
 */
export function roundUpMinutes(value: number): number {
  return Math.ceil(Math.round(value * 1e6) / 1e6);
}

/** Work actions take longer when Tired (A.12). Exhausted counts as at least Tired. */
export function workDuration(world: World, character: Character, baseMinutes: number): number {
  const condition = fatigueCondition(character, world.rules);
  const multiplier = condition === "rested" ? 1 : world.rules.actions.tiredWorkMultiplier;
  return roundUpMinutes(baseMinutes * multiplier);
}

export function carriesWorkingFlashlight(character: Character): boolean {
  return character.inventory.some((item) => item.kind === "flashlight" && item.batteryMinutes > 0);
}

/** Travel time with A.3 modifiers multiplied together, rounded up. */
export function travelDuration(world: World, character: Character, routeMinutes: number): number {
  const { rules } = world;
  const modifiers = rules.travelModifiers;
  let multiplier = 1;
  if (isNight(rules, world.minute) && !carriesWorkingFlashlight(character)) {
    multiplier *= modifiers.nightWithoutFlashlight;
  }
  multiplier *= modifiers.weather[weatherAt(world, world.minute)] ?? 1;
  const condition = fatigueCondition(character, rules);
  if (condition !== "rested") {
    multiplier *= modifiers.fatigue[condition];
  }
  return roundUpMinutes(routeMinutes * multiplier);
}
