// Game time helpers. Game time is whole minutes since the session start.

import type { ClockTime, WorldRules } from "./config";

export const MINUTES_PER_HOUR = 60;
export const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

/** "HH:MM" to minutes since midnight. */
export function clockToMinutes(time: ClockTime): number {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours ?? 0) * MINUTES_PER_HOUR + (minutes ?? 0);
}

/** Minutes since Day 1 00:00 for a day and clock time. */
function absoluteMinutes(day: number, time: ClockTime): number {
  return (day - 1) * MINUTES_PER_DAY + clockToMinutes(time);
}

function sessionStartAbsolute(rules: WorldRules): number {
  return absoluteMinutes(rules.session.start.day, rules.session.start.time);
}

/** Session length in minutes, from session start to session end. */
export function sessionLengthMinutes(rules: WorldRules): number {
  const { end } = rules.session;
  return absoluteMinutes(end.day, end.time) - sessionStartAbsolute(rules);
}

/** Number of hourly weather slots in a session (A.7: one state per hour). */
export function sessionHours(rules: WorldRules): number {
  return Math.ceil(sessionLengthMinutes(rules) / MINUTES_PER_HOUR);
}

/** Game minute for a day and clock time, e.g. (rules, 3, "08:00") is 2880. */
export function gameMinuteAt(rules: WorldRules, day: number, time: ClockTime): number {
  return absoluteMinutes(day, time) - sessionStartAbsolute(rules);
}

/** Day number (1, 2, 3) at a game minute. */
export function dayAt(rules: WorldRules, minute: number): number {
  return Math.floor((sessionStartAbsolute(rules) + minute) / MINUTES_PER_DAY) + 1;
}

/** Minutes since midnight at a game minute. */
function minuteOfDay(rules: WorldRules, minute: number): number {
  return (sessionStartAbsolute(rules) + minute) % MINUTES_PER_DAY;
}

/** Clock time "HH:MM" at a game minute. */
export function clockAt(rules: WorldRules, minute: number): ClockTime {
  const m = minuteOfDay(rules, minute);
  const hh = String(Math.floor(m / MINUTES_PER_HOUR)).padStart(2, "0");
  const mm = String(m % MINUTES_PER_HOUR).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Index of the session hour a game minute falls in (0 for the first hour). */
export function hourIndex(minute: number): number {
  return Math.floor(minute / MINUTES_PER_HOUR);
}

/** True at the start of a session hour (minute 60, 120, ...). */
export function isOnTheHour(minute: number): boolean {
  return minute % MINUTES_PER_HOUR === 0;
}

/** Night per A.2: from nightStart up to (not including) daylightStart. */
export function isNight(rules: WorldRules, minute: number): boolean {
  const m = minuteOfDay(rules, minute);
  const nightStart = clockToMinutes(rules.dayNight.nightStart);
  const daylightStart = clockToMinutes(rules.dayNight.daylightStart);
  return m >= nightStart || m < daylightStart;
}
