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
import { isProtectedFor, nearestProtected, pathTo, type NpcView } from "./view";

export interface GoalChange {
  id: NpcGoalId;
  /** "active" means a done goal is active again. */
  status: GoalStatus;
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
  /** Where rules a–c are taking the NPC after this decision, or null. */
  coverTarget: LocationId | null;
}

const PRIORITY_ORDER: Record<NpcPriority, number> = { high: 0, medium: 1, low: 2 };

export function sameAction(a: Action, b: Action): boolean {
  return JSON.stringify(actionJson(a)) === JSON.stringify(actionJson(b));
}

function sameSteps(a: Action[], b: Action[]): boolean {
  return a.length === b.length && a.every((step, i) => sameAction(step, b[i] as Action));
}

function excluded(action: Action, exclude: Action[]): boolean {
  return exclude.some((other) => sameAction(action, other));
}

/**
 * Goal status checks, in config order: active goals may become done or
 * dropped; done goals may become active again. Dropped goals stay dropped.
 */
function goalChanges(view: NpcView): GoalChange[] {
  const changes: GoalChange[] = [];
  for (const goal of view.npc.goals) {
    const planner = goalPlanners[goal.id];
    if (goal.status === "done") {
      const undone = planner.isUndone?.(view) ?? null;
      if (undone !== null) changes.push({ id: goal.id, status: "active", reason: undone });
      continue;
    }
    if (goal.status !== "active") continue;
    const dropped = planner.isDropped(view);
    if (dropped !== null) {
      changes.push({ id: goal.id, status: "dropped", reason: dropped });
    } else if (planner.isDone(view)) {
      changes.push({ id: goal.id, status: "done", reason: "goal reached" });
    }
  }
  return changes;
}

/**
 * Where to take cover: here if protected; else the current cover target if
 * still reachable; else the nearest protected place. Keeping the target stops
 * the NPC turning back halfway (away from Beach Camp it counts the camp as
 * protected, though it may have just seen the shelter too low). Draws from
 * the generator only on a real tie.
 */
function pickNearest(view: NpcView, rng: Rng): { location: LocationId; path: LocationId[] } | undefined {
  const here = view.self.location;
  const target = view.npc.coverTarget;
  if (!isProtectedFor(view, here) && target !== null && target !== here && isProtectedFor(view, target)) {
    const path = pathTo(view, target);
    if (path && path.length > 0) return { location: target, path };
  }
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
  // In cover weather, a protected NPC doesn't leave for a plan step; rule b
  // would only bring it straight back.
  const stayPut =
    view.behavior.coverWeather.includes(view.weather.current) && isProtectedFor(view, view.self.location);
  for (const goalId of activeGoals) {
    const steps = goalPlanners[goalId].plan(view);
    const first = steps?.[0];
    if (!steps || !first || excluded(first, exclude)) continue;
    if (stayPut && first.type === "move") continue;

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

/** Rule a condition: Exhausted, or night and Tired. */
function needsRest(view: NpcView): boolean {
  return view.self.fatigue === "exhausted" || (view.night && view.self.fatigue === "tired");
}

/** Rule b condition: cover weather while not protected here. */
function needsCover(view: NpcView): boolean {
  return view.behavior.coverWeather.includes(view.weather.current) && !isProtectedFor(view, view.self.location);
}

/** Rule c condition: health below the threshold. */
function hasLowHealth(view: NpcView): boolean {
  return view.self.health < view.behavior.lowHealth;
}

/**
 * True when rule a applies only because it is night and the NPC is Tired.
 * That can wait for the current action to end; Exhausted can't.
 */
export function isSoftRest(view: NpcView): boolean {
  return needsRest(view) && view.self.fatigue !== "exhausted";
}

/**
 * The first urgent rule (a–c) whose condition is true now, or null. Night and
 * Tired is not urgent: it would cut off work in progress (a fire nearly built).
 */
export function urgentRule(view: NpcView): DecisionRule | null {
  if (view.self.fatigue === "exhausted") return "a";
  if (needsCover(view)) return "b";
  if (hasLowHealth(view)) return "c";
  return null;
}

export function decide(view: NpcView, rng: Rng, exclude: Action[] = []): NpcChoice {
  const changes = goalChanges(view);
  const statusAfter = (goal: { id: NpcGoalId; status: GoalStatus }): GoalStatus =>
    changes.find((c) => c.id === goal.id)?.status ?? goal.status;
  const activeGoals = view.npc.goals
    .map((goal, order) => ({ goal, order }))
    .filter(({ goal }) => statusAfter(goal) === "active")
    .sort((a, b) => PRIORITY_ORDER[a.goal.priority] - PRIORITY_ORDER[b.goal.priority] || a.order - b.order)
    .map(({ goal }) => goal.id);

  // Rules d and e clear the cover target; a–c set their own.
  const base = { goalChanges: changes, coverTarget: null };
  // Rules a–c leave the plan as it is, so the NPC can pick it up afterwards.
  const keepPlan = { plan: view.npc.plan, planEvent: null };
  // a. Exhausted, or night and Tired: rest.
  if (needsRest(view)) {
    const why = view.self.fatigue === "exhausted" ? "Exhausted" : "night, Tired";
    const rest = restAction(view, rng);
    if (!excluded(rest.action, exclude)) {
      const reason = rest.to === null ? `sleep: ${why}` : `go to ${rest.to} to sleep: ${why}`;
      return { ...base, ...keepPlan, action: rest.action, rule: "a", reason, coverTarget: rest.to };
    }
  }

  // b. Bad weather while not protected: take cover.
  const weather = view.weather.current;
  if (needsCover(view)) {
    const pick = pickNearest(view, rng);
    const next = pick?.path[0];
    if (pick && next !== undefined) {
      const action: Action = { type: "move", to: next };
      if (!excluded(action, exclude)) {
        const reason = `shelter: ${weather}, go to ${pick.location}`;
        return { ...base, ...keepPlan, action, rule: "b", reason, coverTarget: pick.location };
      }
    }
  }

  // c. Low health: rest under protection.
  if (hasLowHealth(view)) {
    const rest = restAction(view, rng);
    if (!excluded(rest.action, exclude)) {
      const why = `health ${view.self.health}`;
      const reason = rest.to === null ? `rest: ${why}` : `go to ${rest.to} to rest: ${why}`;
      return { ...base, ...keepPlan, action: rest.action, rule: "c", reason, coverTarget: rest.to };
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
