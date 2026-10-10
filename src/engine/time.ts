// Game time helpers. Game time is whole minutes since the session start.

import type { ClockTime, WorldRules } from "./config";

export const MINUTES_PER_HOUR = 60;
export const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

/** "HH:MM" to minutes since midnight. */
export function clockToMinutes(time: ClockTime): number {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours ?? 0) * MINUTES_PER_HOUR + (minutes ?? 0);
}

/** Session length in minutes, from session start to session end. */
export function sessionLengthMinutes(rules: WorldRules): number {
  const { start, end } = rules.session;
  const startAbs = (start.day - 1) * MINUTES_PER_DAY + clockToMinutes(start.time);
  const endAbs = (end.day - 1) * MINUTES_PER_DAY + clockToMinutes(end.time);
  return endAbs - startAbs;
}

/** Number of hourly weather slots in a session (A.7: one state per hour). */
export function sessionHours(rules: WorldRules): number {
  return Math.ceil(sessionLengthMinutes(rules) / MINUTES_PER_HOUR);
}
