// Action framework: submit, cancel, per-minute recheck, and completion.
//
// Each action is a plain object (ActionDef) with: validate, duration,
// optional recheck, optional isDone, and complete. A rejected action costs no
// time and is logged. Each minute, a running action re-checks its own
// requirements; if one fails it stops and partial work is lost (A.12).

import { applyFatigueMinute, shouldCollapse } from "../body";
import { logEvent } from "../events";
import { CHARACTER_IDS, type Character, type CharacterId, type World } from "../state";
import { actionJson, type JsonObject } from "./json";
import { drainFlashlights, movementActions } from "./movement";
import { restActions } from "./rest";
import type { Action, ActionOf, ActionType, ActivityKind, SubmitResult } from "./types";

export interface ActionDef<A extends Action> {
  kind: ActivityKind;
  cancellable: boolean;
  /** Returns a reason to reject, or null if the action can start. */
  validate(world: World, character: Character, action: A): string | null;
  /** Minutes the action takes, fixed at start; null if it ends on a condition. */
  duration(world: World, character: Character, action: A): number | null;
  /** Returns a reason to interrupt, or null to continue. */
  recheck?(world: World, character: Character, action: A): string | null;
  /** For actions that end on a condition: true when finished. */
  isDone?(world: World, character: Character, action: A): boolean;
  /** Applies the effect. The returned object goes into `action_completed`. */
  complete(world: World, character: Character, action: A): JsonObject;
}

export type ActionDefs = { [T in ActionType]?: ActionDef<ActionOf<T>> };

const actionDefs: ActionDefs = {
  ...movementActions,
  ...restActions,
};

function defFor(type: ActionType): ActionDef<Action> | undefined {
  return actionDefs[type] as ActionDef<Action> | undefined;
}

function reject(world: World, id: CharacterId, action: JsonObject, reason: string): SubmitResult {
  logEvent(world, "action_rejected", { action, reason }, id);
  return { ok: false, reason };
}

function start(world: World, character: Character, action: Action, def: ActionDef<Action>): void {
  const minutes = def.duration(world, character, action);
  character.action = {
    action,
    startedAt: world.minute,
    endsAt: minutes === null ? null : world.minute + minutes,
  };
  logEvent(world, "action_started", { action: actionJson(action), minutes }, character.id);
}

function interrupt(world: World, character: Character, reason: string): void {
  const current = character.action;
  if (!current) return;
  character.action = null;
  logEvent(world, "action_interrupted", { action: actionJson(current.action), reason }, character.id);
}

/** How the character's current activity counts for fatigue. */
export function activityKind(character: Character): ActivityKind {
  const current = character.action;
  return current ? (defFor(current.action.type)?.kind ?? "idle") : "idle";
}

export function submitAction(world: World, id: CharacterId, action: Action): SubmitResult {
  const character = world.characters[id];
  const def = defFor(action.type);

  let reason: string | null = null;
  if (world.ended) reason = "the session has ended";
  else if (!character.alive) reason = "character is dead";
  else if (character.action) reason = `busy: ${character.action.action.type}`;
  else if (!def) reason = `${action.type} is not available yet`;
  else reason = def.validate(world, character, action);

  if (reason !== null || !def) {
    return reject(world, id, actionJson(action), reason ?? "unknown action");
  }
  start(world, character, action, def);
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

/** Step 2 hook: per-minute effects of each character's activity. */
export function applyActionMinuteEffects(world: World): void {
  drainFlashlights(world);
  for (const id of CHARACTER_IDS) {
    const character = world.characters[id];
    applyFatigueMinute(world, character, activityKind(character));
  }
}

/** Collapse (A.8): stop the action and fall asleep here. Travel collapses on arrival. */
function checkCollapse(world: World, character: Character): void {
  if (!shouldCollapse(character, world.rules)) return;
  const type = character.action?.action.type;
  if (type === "move" || type === "collapse") return;
  interrupt(world, character, "collapsed");
  logEvent(world, "collapse", {}, character.id);
  const collapse: Action = { type: "collapse" };
  start(world, character, collapse, defFor("collapse") as ActionDef<Action>);
}

/** Step 5 hook: per character in fixed order, recheck, complete, then collapse. */
export function advanceActions(world: World): void {
  for (const id of CHARACTER_IDS) {
    const character = world.characters[id];
    if (!character.alive) continue;
    const current = character.action;
    const def = current ? defFor(current.action.type) : undefined;

    if (current && def) {
      const reason = def.recheck?.(world, character, current.action) ?? null;
      if (reason !== null) {
        interrupt(world, character, reason);
      } else {
        const timeUp = current.endsAt !== null && world.minute >= current.endsAt;
        if (timeUp || def.isDone?.(world, character, current.action)) {
          character.action = null;
          const result = def.complete(world, character, current.action);
          logEvent(world, "action_completed", { action: actionJson(current.action), result }, id);
        }
      }
    }

    checkCollapse(world, character);
  }
}
