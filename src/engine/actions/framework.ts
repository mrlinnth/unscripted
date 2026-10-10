// Action framework: submit, cancel, per-minute recheck, and completion.
//
// Each action is a plain object (ActionDef) with: validate, duration,
// optional recheck, and complete. A rejected action costs no time and is
// logged. Each minute, a running action re-checks its own requirements; if
// one fails it stops and partial work is lost (A.12).

import { logEvent, type JsonValue } from "../events";
import { CHARACTER_IDS, type Character, type CharacterId, type World } from "../state";
import { drainFlashlights, movementActions } from "./movement";
import type { Action, ActionOf, ActionType, ActivityKind, SubmitResult } from "./types";

type JsonObject = { [key: string]: JsonValue };

export interface ActionDef<A extends Action> {
  kind: ActivityKind;
  cancellable: boolean;
  /** Returns a reason to reject, or null if the action can start. */
  validate(world: World, character: Character, action: A): string | null;
  /** Minutes the action takes, fixed at start; null if it ends on a condition. */
  duration(world: World, character: Character, action: A): number | null;
  /** Returns a reason to interrupt, or null to continue. */
  recheck?(world: World, character: Character, action: A): string | null;
  /** Applies the effect. The returned object goes into `action_completed`. */
  complete(world: World, character: Character, action: A): JsonObject;
}

export type ActionDefs = { [T in ActionType]?: ActionDef<ActionOf<T>> };

const actionDefs: ActionDefs = {
  ...movementActions,
};

function defFor(type: ActionType): ActionDef<Action> | undefined {
  return actionDefs[type] as ActionDef<Action> | undefined;
}

/** The action as a plain JSON object for event data (undefined fields dropped). */
function actionJson(action: Action): JsonObject {
  const json: JsonObject = {};
  for (const [key, value] of Object.entries(action)) {
    if (value !== undefined) json[key] = value as JsonValue;
  }
  return json;
}

function reject(world: World, id: CharacterId, action: JsonObject, reason: string): SubmitResult {
  logEvent(world, "action_rejected", { action, reason }, id);
  return { ok: false, reason };
}

/** How the character's current activity counts for fatigue. */
export function activityKind(character: Character): ActivityKind {
  const current = character.action;
  return current ? (defFor(current.action.type)?.kind ?? "idle") : "idle";
}

export function submitAction(world: World, id: CharacterId, action: Action): SubmitResult {
  const character = world.characters[id];
  const json = actionJson(action);
  const def = defFor(action.type);

  let reason: string | null = null;
  if (world.ended) reason = "the session has ended";
  else if (!character.alive) reason = "character is dead";
  else if (character.asleep) reason = "character is asleep";
  else if (character.action) reason = `busy: ${character.action.action.type}`;
  else if (!def) reason = `${action.type} is not available yet`;
  else reason = def.validate(world, character, action);

  if (reason !== null || !def) {
    return reject(world, id, json, reason ?? "unknown action");
  }

  const minutes = def.duration(world, character, action);
  character.action = {
    action,
    startedAt: world.minute,
    endsAt: minutes === null ? null : world.minute + minutes,
  };
  logEvent(world, "action_started", { action: json, minutes }, id);
  return { ok: true };
}

export function cancelAction(world: World, id: CharacterId): SubmitResult {
  const character = world.characters[id];
  const cancel = { type: "cancel" };
  const current = character.action;
  if (!current) {
    return reject(world, id, cancel, "nothing to cancel");
  }
  if (!defFor(current.action.type)?.cancellable) {
    return reject(world, id, cancel, `${current.action.type} cannot be cancelled`);
  }
  character.action = null;
  logEvent(world, "action_cancelled", { action: actionJson(current.action) }, id);
  return { ok: true };
}

/** Step 2 hook: per-minute effects of running actions. */
export function applyActionMinuteEffects(world: World): void {
  drainFlashlights(world);
}

/** Step 5 hook: per character in fixed order, recheck then complete. */
export function advanceActions(world: World): void {
  for (const id of CHARACTER_IDS) {
    const character = world.characters[id];
    const current = character.action;
    if (!current) continue;
    const def = defFor(current.action.type);
    if (!def) continue;

    const reason = def.recheck?.(world, character, current.action) ?? null;
    if (reason !== null) {
      character.action = null;
      logEvent(world, "action_interrupted", { action: actionJson(current.action), reason }, id);
      continue;
    }

    if (current.endsAt !== null && world.minute >= current.endsAt) {
      character.action = null;
      const result = def.complete(world, character, current.action);
      logEvent(world, "action_completed", { action: actionJson(current.action), result }, id);
    }
  }
}
