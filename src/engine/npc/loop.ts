// NPC decision loop (requirements Phase 2 §3). Runs once per minute after
// actions advance (step 5b), and once at session start. For each NPC it checks
// for a decision point, asks the rules for a choice, and submits it through
// the normal action framework, so NPCs follow exactly the player's rules.

import { cancelAction, isCancellable, submitAction } from "../actions/framework";
import { actionJson } from "../actions/json";
import type { Action } from "../actions/types";
import { logEvent } from "../events";
import type { World } from "../state";
import { decide, sameAction, urgentRule, type NpcChoice } from "./decide";
import { NPC_IDS, type NpcId } from "./profiles";
import { buildNpcView } from "./view";

/** A rejected choice falls through to the next rule; wait ends it. This is a safety cap. */
const MAX_TRIES = 10;

export function runNpcDecisions(world: World): void {
  if (!world.autonomy || world.ended) return;
  // One generator for the whole pass, saved back at the end.
  const rng = { state: world.rngState };
  for (const id of NPC_IDS) {
    decideFor(world, id, rng);
  }
  world.rngState = rng.state;
}

function decideFor(world: World, id: NpcId, rng: { state: number }): void {
  const character = world.characters[id];
  const npc = world.npcs[id];
  if (!character.alive) return;

  // Travel and collapse can't be cancelled: decide on arrival or waking.
  const current = character.action?.action;
  if (current && !isCancellable(current)) return;

  const urgent = urgentRule(buildNpcView(world, id));
  const newUrgent = urgent !== null && urgent !== npc.urgentRule;
  npc.urgentRule = urgent;
  const review = world.minute - npc.lastReviewAt >= world.npcBehavior.reviewEveryMinutes;
  if (current && !newUrgent && !review) return;
  if (review) npc.lastReviewAt = world.minute;

  const exclude: Action[] = [];
  for (let tries = 0; tries < MAX_TRIES; tries++) {
    const choice = decide(buildNpcView(world, id), rng, exclude);
    const running = character.action?.action;

    if (running && servesChoice(running, choice)) {
      // Keep doing it. Save goal and plan changes, but log no decision.
      applyChoice(world, id, choice, false);
      return;
    }
    applyChoice(world, id, choice, true);
    if (running) cancelAction(world, id);
    if (submitAction(world, id, choice.action).ok) return;
    exclude.push(choice.action);
  }
}

/** True if the running action already does what the choice asks. */
function servesChoice(running: Action, choice: NpcChoice): boolean {
  if (sameAction(running, choice.action)) return true;
  // Already asleep for a rest rule (a or c), even if sleep length differs.
  return (choice.rule === "a" || choice.rule === "c") && running.type === "sleep" && choice.action.type === "sleep";
}

/**
 * Saves the choice to NPC state and logs it, in order: goal changes, plan
 * events, then the decision. The action's own events follow from submitAction.
 */
function applyChoice(world: World, id: NpcId, choice: NpcChoice, logDecision: boolean): void {
  const npc = world.npcs[id];

  for (const change of choice.goalChanges) {
    const goal = npc.goals.find((g) => g.id === change.id);
    if (!goal) continue;
    goal.status = change.status;
    logEvent(world, change.status === "done" ? "goal_done" : "goal_dropped", { goal: change.id, reason: change.reason }, id);
  }

  if (choice.planEvent !== null && choice.plan !== null) {
    logEvent(
      world,
      choice.planEvent === "created" ? "plan_created" : "plan_changed",
      { goal: choice.plan.goalId, steps: choice.plan.steps.map(actionJson) },
      id,
    );
    npc.lastReviewAt = world.minute;
  }
  npc.plan = choice.plan;
  npc.coverTarget = choice.coverTarget;

  if (!logDecision) return;
  npc.lastDecision = { minute: world.minute, action: actionJson(choice.action), rule: choice.rule, reason: choice.reason };
  logEvent(world, "npc_decision", { action: actionJson(choice.action), rule: choice.rule, reason: choice.reason }, id);
}
