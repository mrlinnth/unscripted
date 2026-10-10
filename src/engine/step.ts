// The simulation clock. `step` advances the world by exactly one minute.
//
// Step order is fixed; tests and determinism rely on it:
//   1. If the session has ended, do nothing.
//   2. Per-minute effects for the minute that just passed: flashlight
//      battery, fatigue, fire burn, then wet wood.
//   3. minute += 1.
//   4. On the hour: hourly effects for the hour that just ended (health,
//      shelter loss, drying), then log `weather_changed` if the new hour's
//      weather differs.
//   5. Per character, in CHARACTER_IDS order: re-check, complete, and
//      collapse.
//   5b. If autonomy is on: NPC decisions, npc1 then npc2 (npc/loop.ts).
//   6. If minute reached the session end, set `ended` and log `session_ended`.

import { applyFireMinute, applyHourlyDrying, applyWetWoodMinute } from "./actions/fire";
import { advanceActions, applyActionMinuteEffects } from "./actions/framework";
import { applyHourlyShelterLoss } from "./actions/shelter";
import { applyHourlyHealth } from "./body";
import type { WeatherState } from "./config";
import { logEvent } from "./events";
import { runNpcDecisions } from "./npc/loop";
import type { World } from "./state";
import { hourIndex, isOnTheHour, sessionLengthMinutes } from "./time";

/** Step 2: per-minute effects for the minute that just passed. */
function applyPerMinuteEffects(world: World): void {
  applyActionMinuteEffects(world);
  applyFireMinute(world);
  applyWetWoodMinute(world);
}

/**
 * Step 4: hourly effects for the hour that just ended. Health runs first, so
 * protection uses the shelter as it was during that hour.
 */
function applyHourlyEffects(world: World, endedHour: number): void {
  applyHourlyHealth(world, endedHour);
  applyHourlyShelterLoss(world, endedHour);
  applyHourlyDrying(world, endedHour);
}

/** Step 5: actions for each character. */
function advanceCharacters(world: World): void {
  advanceActions(world);
}

export function step(world: World): void {
  if (world.ended) {
    return;
  }

  applyPerMinuteEffects(world);
  world.minute += 1;

  const endMinute = sessionLengthMinutes(world.rules);
  if (isOnTheHour(world.minute)) {
    const hour = hourIndex(world.minute);
    applyHourlyEffects(world, hour - 1);
    if (world.minute < endMinute) {
      const from = world.weather[hour - 1] as WeatherState;
      const to = world.weather[hour] as WeatherState;
      if (from !== to) {
        logEvent(world, "weather_changed", { from, to });
      }
    }
  }

  advanceCharacters(world);

  // Not at the end minute: the session is over and every action would be rejected.
  if (world.minute < endMinute) {
    runNpcDecisions(world);
  }

  if (world.minute >= endMinute) {
    world.ended = true;
    logEvent(world, "session_ended");
  }
}

/** Steps `count` minutes, stopping early if the session ends. */
export function stepMinutes(world: World, count: number): void {
  for (let i = 0; i < count && !world.ended; i++) {
    step(world);
  }
}
