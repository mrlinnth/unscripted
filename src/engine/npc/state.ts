// Per-NPC state kept in the world: goal status, plan, and decisions
// (requirements Phase 2 §1–3). Plain JSON, like the rest of the world.

import type { Action } from "../actions/types";
import type { JsonObject } from "../actions/json";
import type { JsonValue } from "../events";
import type { CharacterId } from "../state";
import type { NpcConfig, NpcGoalId, NpcId, NpcPriority } from "./profiles";
import { NPC_IDS } from "./profiles";

export type GoalStatus = "active" | "done" | "dropped";

export interface NpcGoalState {
  id: NpcGoalId;
  priority: NpcPriority;
  status: GoalStatus;
}

export interface NpcPlan {
  goalId: NpcGoalId;
  steps: Action[];
  /** Index of the current step in `steps`. */
  index: number;
}

/** Decision rules from requirements §3: a rest, b take cover, c recover, d plan, e wait. */
export type DecisionRule = "a" | "b" | "c" | "d" | "e";

export interface NpcDecision {
  minute: number;
  action: JsonObject;
  rule: DecisionRule;
  reason: string;
}

export interface NpcState {
  goals: NpcGoalState[];
  plan: NpcPlan | null;
  lastDecision: NpcDecision | null;
  lastReviewAt: number;
  /** Urgent rule (a–c) that was true last minute, or null. */
  urgentRule: DecisionRule | null;
  /** True once this NPC's own Wreckage search found nothing. */
  wreckageSearchedOut: boolean;
  trust: Partial<Record<CharacterId, number>>;
  commitments: JsonValue[];
}

/** Starting NPC state from the profiles. Uses no randomness. */
export function createNpcStates(config: NpcConfig): Record<NpcId, NpcState> {
  const states = {} as Record<NpcId, NpcState>;
  for (const id of NPC_IDS) {
    const profile = config.npcs[id];
    states[id] = {
      goals: profile.goals.map((goal) => ({ id: goal.id, priority: goal.priority, status: "active" })),
      plan: null,
      lastDecision: null,
      lastReviewAt: 0,
      urgentRule: null,
      wreckageSearchedOut: false,
      trust: { ...profile.trust },
      commitments: structuredClone(profile.commitments),
    };
  }
  return states;
}

export function isNpc(id: CharacterId): id is NpcId {
  return id !== "player";
}
