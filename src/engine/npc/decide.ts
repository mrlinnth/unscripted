// Decision rules a–e (requirements Phase 2 §3). Given what the NPC can see,
// pick its next action. Reads only the NpcView, never the World. The only
// randomness is the seeded generator, used only to break real ties.

import { actionJson } from "../actions/json";
import type { Action } from "../actions/types";
import type { LocationId } from "../config";
import { nextInt, type Rng } from "../rng";
import { goalPlanners } from "./goals";
import type { NpcGoalId, NpcPriority } from "./profiles";
import type { DecisionRule, GoalStatus, NpcPlan } from "./state";
import { isProtectedFor, nearestProtected, type NpcView } from "./view";

export interface GoalChange {
  id: NpcGoalId;
  status: Exclude<GoalStatus, "active">;
  reason: string;
}

export interface NpcChoice {
  action: Action;
  rule: DecisionRule;
  reason: string;
  /** The plan after this decision (null when not following a goal). */
  plan: NpcPlan | null;
  /** Whether this decision started a plan, replaced one, or neither. */
  planEvent: "created" | "changed" | null;
  /** Goals that became done or dropped. Not yet saved to NPC state. */
  goalChanges: GoalChange[];
}

const PRIORITY_ORDER: Record<NpcPriority, number> = { high: 0, medium: 1, low: 2 };

function sameAction(a: Action, b: Action): boolean {
  return JSON.stringify(actionJson(a)) === JSON.stringify(actionJson(b));
}

function sameSteps(a: Action[], b: Action[]): boolean {
  return a.length === b.length && a.every((step, i) => sameAction(step, b[i] as Action));
}

function excluded(action: Action, exclude: Action[]): boolean {
  return exclude.some((other) => sameAction(action, other));
}

/** Goal done/dropped checks for active goals, in config order. */
function goalChanges(view: NpcView): GoalChange[] {
  const changes: GoalChange[] = [];
  for (const goal of view.npc.goals) {
    if (goal.status !== "active") continue;
    const planner = goalPlanners[goal.id];
    const dropped = planner.isDropped(view);
    if (dropped !== null) {
      changes.push({ id: goal.id, status: "dropped", reason: dropped });
    } else if (planner.isDone(view)) {
      changes.push({ id: goal.id, status: "done", reason: "goal reached" });
    }
  }
  return changes;
}

/** The nearest protected place. Draws from the generator only on a real tie. */
function pickNearest(view: NpcView, rng: Rng): { location: LocationId; path: LocationId[] } | undefined {
  const nearest = nearestProtected(view);
  return nearest.length > 1 ? nearest[nextInt(rng, nearest.length)] : nearest[0];
}

/**
 * Sleep here if protected; else move toward the nearest protected place;
 * else sleep here, since there is nowhere to go.
 */
function restAction(view: NpcView, rng: Rng): { action: Action; to: LocationId | null } {
  const pick = pickNearest(view, rng);
  const next = pick?.path[0];
  if (pick === undefined || next === undefined) return { action: { type: "sleep" }, to: null };
  return { action: { type: "move", to: next }, to: pick.location };
}

/** Rule d: the next step of the highest-priority active goal that has a plan. */
function planStep(
  view: NpcView,
  activeGoals: NpcGoalId[],
  exclude: Action[],
): { action: Action; plan: NpcPlan; planEvent: NpcChoice["planEvent"] } | null {
  const current = view.npc.plan;
  for (const goalId of activeGoals) {
    const steps = goalPlanners[goalId].plan(view);
    const first = steps?.[0];
    if (!steps || !first || excluded(first, exclude)) continue;

    // Keep the current plan if the new steps are what is left of it.
    if (current && current.goalId === goalId) {
      for (let k = current.index; k < current.steps.length; k++) {
        if (sameSteps(current.steps.slice(k), steps)) {
          return { action: first, plan: { ...current, index: k }, planEvent: null };
        }
      }
    }
    return {
      action: first,
      plan: { goalId, steps, index: 0 },
      planEvent: current ? "changed" : "created",
    };
  }
  return null;
}

export function decide(view: NpcView, rng: Rng, exclude: Action[] = []): NpcChoice {
  const changes = goalChanges(view);
  const changed = new Set(changes.map((c) => c.id));
  const activeGoals = view.npc.goals
    .map((goal, order) => ({ goal, order }))
    .filter(({ goal }) => goal.status === "active" && !changed.has(goal.id))
    .sort((a, b) => PRIORITY_ORDER[a.goal.priority] - PRIORITY_ORDER[b.goal.priority] || a.order - b.order)
    .map(({ goal }) => goal.id);

  const base = { goalChanges: changes };
  // Rules a–c leave the plan as it is, so the NPC can pick it up afterwards.
  const keepPlan = { plan: view.npc.plan, planEvent: null };
  const here = view.self.location;
  const fatigue = view.self.fatigue;

  // a. Exhausted, or night and Tired: rest.
  if (fatigue === "exhausted" || (view.night && fatigue === "tired")) {
    const why = fatigue === "exhausted" ? "Exhausted" : "night, Tired";
    const rest = restAction(view, rng);
    if (!excluded(rest.action, exclude)) {
      const reason = rest.to === null ? `sleep: ${why}` : `go to ${rest.to} to sleep: ${why}`;
      return { ...base, ...keepPlan, action: rest.action, rule: "a", reason };
    }
  }

  // b. Bad weather while not protected: take cover.
  const weather = view.weather.current;
  if (view.behavior.coverWeather.includes(weather) && !isProtectedFor(view, here)) {
    const pick = pickNearest(view, rng);
    const next = pick?.path[0];
    if (pick && next !== undefined) {
      const action: Action = { type: "move", to: next };
      if (!excluded(action, exclude)) {
        return { ...base, ...keepPlan, action, rule: "b", reason: `shelter: ${weather}, go to ${pick.location}` };
      }
    }
  }

  // c. Low health: rest under protection.
  if (view.self.health < view.behavior.lowHealth) {
    const rest = restAction(view, rng);
    if (!excluded(rest.action, exclude)) {
      const why = `health ${view.self.health}`;
      const reason = rest.to === null ? `rest: ${why}` : `go to ${rest.to} to rest: ${why}`;
      return { ...base, ...keepPlan, action: rest.action, rule: "c", reason };
    }
  }

  // d. Follow the plan of the highest-priority goal that has one.
  const step = planStep(view, activeGoals, exclude);
  if (step) {
    const reason = `${step.plan.goalId} step ${step.plan.index + 1}: ${step.action.type}`;
    return { ...base, action: step.action, rule: "d", reason, plan: step.plan, planEvent: step.planEvent };
  }

  // e. Nothing to do: wait. Never excluded.
  return {
    ...base,
    action: { type: "wait", minutes: view.behavior.idleWaitMinutes },
    rule: "e",
    reason: "idle",
    plan: null,
    planEvent: null,
  };
}
