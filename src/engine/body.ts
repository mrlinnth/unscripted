// Character body rules: fatigue (A.8), health (A.9), protection, and death.

import { actionJson } from "./actions/json";
import type { ActivityKind } from "./actions/types";
import type { WorldRules } from "./config";
import { logEvent, logEventAt } from "./events";
import { CHARACTER_IDS, type Character, type World } from "./state";

export type FatigueCondition = "rested" | "tired" | "exhausted";

/** Condition from the fatigue counter (stored in half-points). */
export function fatigueCondition(character: Character, rules: WorldRules): FatigueCondition {
  const counter = character.fatigue / 2;
  if (counter >= rules.fatigue.exhaustedAt) return "exhausted";
  if (counter >= rules.fatigue.tiredAt) return "tired";
  return "rested";
}

/** True if asleep: in a Sleep action or a collapse. */
export function isAsleep(character: Character): boolean {
  const type = character.action?.action.type;
  return type === "sleep" || type === "collapse";
}

/** Under shelter = a natural shelter (Cave), or the camp with shelter at the threshold or more. */
export function isShelteredLocation(world: World, location: string): boolean {
  const { shelter } = world.rules;
  if (shelter.naturalShelters.includes(location)) return true;
  return location === shelter.location && world.shelter.value >= shelter.protectsAt;
}

/** Protection for a character (A.9): being at a sheltered location. */
export function isProtected(world: World, character: Character): boolean {
  return isShelteredLocation(world, character.location);
}

/**
 * Reason a character cannot gather, build, repair, or search right now
 * (A.8 Exhausted, A.9 health below the minimum), or null if they can.
 */
export function workBlockReason(world: World, character: Character): string | null {
  if (fatigueCondition(character, world.rules) === "exhausted") return "too exhausted";
  if (character.health < world.rules.health.workMinimum) return "health too low";
  return null;
}

/** True when the fatigue counter has reached collapse (A.8). */
export function shouldCollapse(character: Character, rules: WorldRules): boolean {
  return character.fatigue / 2 >= rules.fatigue.collapseAt;
}

/** Fatigue change per minute, in half-points, for an activity here (A.8). */
function fatigueDelta(world: World, character: Character, kind: ActivityKind): number {
  const { perMinute, sleepPerMinute } = world.rules.fatigue;
  let rate: number;
  if (kind === "sleep") {
    if (world.rules.shelter.naturalShelters.includes(character.location)) {
      rate = sleepPerMinute.cave;
    } else if (isProtected(world, character)) {
      rate = sleepPerMinute.shelteredCamp;
    } else {
      rate = sleepPerMinute.elsewhere;
    }
  } else {
    rate = perMinute[kind];
  }
  return rate * 2;
}

/** Applies one minute of fatigue for an activity. Logs condition changes. */
export function applyFatigueMinute(world: World, character: Character, kind: ActivityKind): void {
  if (!character.alive) return;
  const before = fatigueCondition(character, world.rules);
  character.fatigue = Math.max(0, character.fatigue + fatigueDelta(world, character, kind));
  const after = fatigueCondition(character, world.rules);
  if (after !== before) {
    logEventAt(world, world.minute + 1, "fatigue_changed", { from: before, to: after }, character.id);
  }
}

function die(world: World, character: Character, cause: string): void {
  character.health = 0;
  character.alive = false;
  const current = character.action;
  if (current) {
    character.action = null;
    logEvent(world, "action_interrupted", { action: actionJson(current.action), reason: "died" }, character.id);
  }
  logEvent(world, "death", { cause }, character.id);
}

/**
 * Hourly health for the hour that just ended (A.9), based on where each
 * character is now: damage outside protection in damaging weather, healing
 * while asleep under protection. Runs before shelter loss for that hour.
 */
export function applyHourlyHealth(world: World, endedHour: number): void {
  const { health } = world.rules;
  const weather = world.weather[endedHour];
  const damaging = weather !== undefined && health.damageWeather.includes(weather);
  for (const id of CHARACTER_IDS) {
    const character = world.characters[id];
    if (!character.alive) continue;
    const isProtectedNow = isProtected(world, character);
    if (damaging && !isProtectedNow) {
      character.health -= health.stormDamagePerHour;
      if (character.health <= 0) {
        die(world, character, `exposure to ${weather}`);
        continue;
      }
    }
    if (isAsleep(character) && isProtectedNow) {
      character.health = Math.min(health.max, character.health + health.sleepHealPerHour);
    }
  }
}
