// Real-time pacing and skip helpers for the dev shell. Real time lives here,
// never in src/engine/. Pure functions, so they can be tested without React.

import { step, type World } from "../engine";

/** Spec §2.4: one game day (1,440 minutes) = 30 real minutes at 1×. */
export const REAL_MS_PER_GAME_MINUTE = (30 * 60 * 1000) / 1440; // 1250 ms

/** Longest real gap counted in one tick, so a sleeping browser tab does not jump ahead. */
export const MAX_TICK_MS = 1000;

export type Speed = 0 | 1 | 2 | 4;

/**
 * Converts real elapsed time into whole game minutes at a speed. Returns the
 * number of steps to run and the leftover real time to carry to the next tick.
 */
export function stepsForElapsed(
  carriedMs: number,
  elapsedMs: number,
  speed: Speed,
): { steps: number; carriedMs: number } {
  if (speed === 0) return { steps: 0, carriedMs: 0 };
  const total = carriedMs + Math.min(Math.max(elapsedMs, 0), MAX_TICK_MS) * speed;
  const steps = Math.floor(total / REAL_MS_PER_GAME_MINUTE);
  return { steps, carriedMs: total - steps * REAL_MS_PER_GAME_MINUTE };
}

/** Runs up to `count` steps, stopping early at the session end. Returns steps run. */
export function runSteps(world: World, count: number): number {
  let run = 0;
  while (run < count && !world.ended) {
    step(world);
    run++;
  }
  return run;
}

/**
 * Steps until the player's current action ends (completed, interrupted, or
 * replaced by a collapse) or the session ends. Does nothing if the player is idle.
 */
export function skipToActionEnd(world: World): number {
  const current = world.characters.player.action;
  if (!current) return 0;
  let run = 0;
  while (world.characters.player.action === current && !world.ended) {
    step(world);
    run++;
  }
  return run;
}

/** A new random seed, made outside the engine. */
export function newSeed(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] ?? 0;
}
