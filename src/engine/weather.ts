// Weather sequence (spec A.7), rolled once from the seed at session start.
//
// RNG call order at session start is fixed: rollWeather first, then
// rollSearchOrder (wreckage.ts). Changing the order, or the number of draws
// per hour, changes every seeded result.

import type { WeatherState, WorldRules } from "./config";
import { nextFloat, type Rng } from "./rng";
import { sessionHours } from "./time";

/**
 * Returns one weather state per session hour. Hour 0 is the configured first
 * hour. Each later hour uses exactly one RNG draw, even when the move is forced.
 */
export function rollWeather(rng: Rng, rules: WorldRules): WeatherState[] {
  const { states, stayChance, stormMaxHours } = rules.weather;
  const top = states.length - 1;
  const hours = sessionHours(rules);

  let index = states.indexOf(rules.starting.firstHourWeather);
  let topRun = index === top ? 1 : 0;
  const sequence: WeatherState[] = [states[index] as WeatherState];

  for (let hour = 1; hour < hours; hour++) {
    const draw = nextFloat(rng);
    if (index === top && topRun >= stormMaxHours) {
      index = top - 1; // Storm lasted its maximum: moves to Heavy Rain.
    } else if (draw >= stayChance) {
      if (index === 0) {
        index = 1; // Clear can only move up.
      } else if (index === top) {
        index = top - 1; // Storm can only move down.
      } else {
        // The part of the draw above stayChance picks the direction, 50/50.
        const direction = (draw - stayChance) / (1 - stayChance);
        index += direction < 0.5 ? -1 : 1;
      }
    }
    topRun = index === top ? topRun + 1 : 0;
    sequence.push(states[index] as WeatherState);
  }
  return sequence;
}
