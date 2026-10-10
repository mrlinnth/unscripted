// Character body rules: fatigue condition (A.8). Task 4.2 adds the rest.

import type { WorldRules } from "./config";
import type { Character } from "./state";

export type FatigueCondition = "rested" | "tired" | "exhausted";

/** Condition from the fatigue counter (stored in half-points). */
export function fatigueCondition(character: Character, rules: WorldRules): FatigueCondition {
  const counter = character.fatigue / 2;
  if (counter >= rules.fatigue.exhaustedAt) return "exhausted";
  if (counter >= rules.fatigue.tiredAt) return "tired";
  return "rested";
}
