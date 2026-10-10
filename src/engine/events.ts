// Append-only event log (spec §4.2). Events carry game time only, never
// wall-clock time, so the same seed and actions give an identical log.

import type { CharacterId, World } from "./state";

export type GameEventType =
  | "action_started"
  | "action_completed"
  | "action_rejected"
  | "action_interrupted"
  | "action_cancelled"
  | "weather_changed"
  | "fire_changed"
  | "fatigue_changed"
  | "discovery"
  | "item_found"
  | "collapse"
  | "death"
  | "session_ended";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface GameEvent {
  minute: number;
  type: GameEventType;
  /** Present only for events caused by or about one character. */
  actor?: CharacterId;
  data: { [key: string]: JsonValue };
}

export function logEvent(
  world: World,
  type: GameEventType,
  data: { [key: string]: JsonValue } = {},
  actor?: CharacterId,
): GameEvent {
  return logEventAt(world, world.minute, type, data, actor);
}

/**
 * Logs an event at a given minute. Per-minute effects run before the clock
 * moves on, so a change they cause is logged at `world.minute + 1`, the
 * minute it has happened by.
 */
export function logEventAt(
  world: World,
  minute: number,
  type: GameEventType,
  data: { [key: string]: JsonValue } = {},
  actor?: CharacterId,
): GameEvent {
  // Leave `actor` out entirely when absent, so events stay identical after a
  // JSON round trip (save and load).
  const event: GameEvent =
    actor === undefined ? { minute, type, data } : { minute, type, actor, data };
  world.events.push(event);
  return event;
}
