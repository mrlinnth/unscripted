// The simulation clock. `step` advances the world by exactly one minute.
//
// Step order is fixed; tests and determinism rely on it:
//   1. If the session has ended, do nothing.
//   2. Per-minute effects for the minute that just passed (Phase 4).
//   3. minute += 1.
//   4. On the hour: hourly effects for the hour that just ended (Phase 4),
//      then log `weather_changed` if the new hour's weather differs.
//   5. Per character, in CHARACTER_IDS order: re-check, progress, and
//      complete actions (Phase 4).
//   6. If minute reached the session end, set `ended` and log `session_ended`.

import type { WeatherState } from "./config";
import { logEvent } from "./events";
import type { World } from "./state";
import { hourIndex, isOnTheHour, sessionLengthMinutes } from "./time";

/** Weather at a game minute. The session end minute uses the last hour. */
export function weatherAt(world: World, minute: number): WeatherState {
  const index = Math.min(hourIndex(minute), world.weather.length - 1);
  return world.weather[index] as WeatherState;
}

/** Step 2 hook: per-minute effects (fatigue, fuel, battery). Phase 4 fills this in. */
function applyPerMinuteEffects(_world: World): void {}

/** Step 4 hook: hourly effects for the hour that just ended. Phase 4 fills this in. */
function applyHourlyEffects(_world: World, _endedHour: number): void {}

/** Step 5 hook: actions for each character. Phase 4 fills this in. */
function advanceCharacters(_world: World): void {}

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
