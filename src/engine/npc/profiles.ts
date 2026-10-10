// NPC profiles (spec §3.2) and NPC behavior numbers, from config/npcs.json.
// Identity text changes no rules in Phase 2; it is kept for Phase 4 AI context.

import rawNpcs from "../config/npcs.json";
import { deepMerge, type DeepPartial } from "../config";
import type { JsonValue } from "../events";
import { CHARACTER_IDS, type CharacterId } from "../state";

export type NpcId = Exclude<CharacterId, "player">;

export const NPC_IDS: readonly NpcId[] = ["npc1", "npc2"];

export const NPC_GOAL_IDS = [
  "make_camp_safe",
  "keep_wood_reserve",
  "map_island",
  "keep_flashlight",
  "signal_rescue",
] as const;

export type NpcGoalId = (typeof NPC_GOAL_IDS)[number];

export const NPC_PRIORITIES = ["high", "medium", "low"] as const;

export type NpcPriority = (typeof NPC_PRIORITIES)[number];

export interface NpcGoalConfig {
  id: NpcGoalId;
  priority: NpcPriority;
}

export interface NpcIdentity {
  name: string;
  age: number;
  background: string;
  traits: string[];
  values: string[];
  skills: string[];
  weaknesses: string[];
  pastExperiences: string[];
  fears: string[];
}

export interface NpcProfile {
  identity: NpcIdentity;
  goals: NpcGoalConfig[];
  /** Starting trust toward each other character, 0–100. */
  trust: Partial<Record<CharacterId, number>>;
  /** Shared commitments. Always empty in Phase 2. */
  commitments: JsonValue[];
}

export interface NpcBehavior {
  /** Health below this triggers rule c (rest). */
  lowHealth: number;
  /** Length of the rule e wait. */
  idleWaitMinutes: number;
  /** Game minutes between plan reviews (§3.5). */
  reviewEveryMinutes: number;
  /** Shelter value Marcus repairs up to. */
  shelterTarget: number;
  /** Dry wood bundles Marcus keeps at Beach Camp. */
  woodReserve: number;
}

export interface NpcConfig {
  behavior: NpcBehavior;
  npcs: Record<NpcId, NpcProfile>;
}

export type NpcConfigOverrides = DeepPartial<NpcConfig>;

// The JSON import widens goal ids and priorities to `string`, so it can't be
// checked against NpcConfig at compile time. `validateNpcConfig` checks it at
// load instead.
const shippedConfig = rawNpcs as NpcConfig;

/**
 * Loads the shipped NPC config, applies test overrides, and checks it.
 * Throws an error naming the bad key if a check fails.
 */
export function loadNpcConfig(overrides?: NpcConfigOverrides): NpcConfig {
  const merged = deepMerge(structuredClone(shippedConfig), overrides ?? {}) as NpcConfig;
  validateNpcConfig(merged);
  return merged;
}

class NpcConfigError extends Error {
  constructor(key: string, message: string) {
    super(`npcs: ${key}: ${message}`);
    this.name = "NpcConfigError";
  }
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function validateNpcConfig(config: NpcConfig): void {
  const checkPositiveInt = (key: string, value: unknown): void => {
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
      throw new NpcConfigError(key, `must be a whole number above 0, got ${String(value)}`);
    }
  };

  // Behavior.
  const behavior = config.behavior as unknown as Record<string, unknown>;
  const behaviorKeys: (keyof NpcBehavior)[] = [
    "lowHealth",
    "idleWaitMinutes",
    "reviewEveryMinutes",
    "shelterTarget",
    "woodReserve",
  ];
  for (const key of behaviorKeys) {
    checkPositiveInt(`behavior.${key}`, behavior[key]);
  }

  // NPCs: exactly the known NPC ids.
  for (const id of Object.keys(config.npcs)) {
    if (!(NPC_IDS as readonly string[]).includes(id)) {
      throw new NpcConfigError(`npcs.${id}`, `unknown NPC id "${id}"`);
    }
  }
  for (const id of NPC_IDS) {
    const profile = config.npcs[id] as NpcProfile | undefined;
    if (!profile) {
      throw new NpcConfigError(`npcs.${id}`, "missing NPC profile");
    }
    validateProfile(id, profile, checkPositiveInt);
  }
}

function validateProfile(
  id: NpcId,
  profile: NpcProfile,
  checkPositiveInt: (key: string, value: unknown) => void,
): void {
  const key = `npcs.${id}`;

  // Identity.
  const identity = profile.identity as unknown as Record<string, unknown>;
  for (const field of ["name", "background"]) {
    const value = identity[field];
    if (typeof value !== "string" || value.trim() === "") {
      throw new NpcConfigError(`${key}.identity.${field}`, "must be non-empty text");
    }
  }
  checkPositiveInt(`${key}.identity.age`, identity.age);
  for (const field of ["traits", "values", "skills", "weaknesses", "pastExperiences", "fears"]) {
    if (!isStringList(identity[field])) {
      throw new NpcConfigError(`${key}.identity.${field}`, "must be a list of text");
    }
  }

  // Goals.
  if (!Array.isArray(profile.goals) || profile.goals.length === 0) {
    throw new NpcConfigError(`${key}.goals`, "needs at least one goal");
  }
  const seen = new Set<string>();
  profile.goals.forEach((goal, i) => {
    const goalKey = `${key}.goals[${i}]`;
    if (!(NPC_GOAL_IDS as readonly string[]).includes(goal.id)) {
      throw new NpcConfigError(`${goalKey}.id`, `unknown goal id "${goal.id}"`);
    }
    if (seen.has(goal.id)) {
      throw new NpcConfigError(`${goalKey}.id`, `goal "${goal.id}" listed twice`);
    }
    seen.add(goal.id);
    if (!(NPC_PRIORITIES as readonly string[]).includes(goal.priority)) {
      throw new NpcConfigError(`${goalKey}.priority`, `unknown priority "${goal.priority}"`);
    }
  });

  // Trust: a whole number 0–100 for every other character, and nothing else.
  for (const [other, value] of Object.entries(profile.trust)) {
    if (!(CHARACTER_IDS as readonly string[]).includes(other) || other === id) {
      throw new NpcConfigError(`${key}.trust.${other}`, `unknown or own character "${other}"`);
    }
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100) {
      throw new NpcConfigError(`${key}.trust.${other}`, `must be a whole number 0–100, got ${String(value)}`);
    }
  }
  for (const other of CHARACTER_IDS) {
    if (other !== id && profile.trust[other] === undefined) {
      throw new NpcConfigError(`${key}.trust.${other}`, "missing trust value");
    }
  }

  // Commitments.
  if (!Array.isArray(profile.commitments)) {
    throw new NpcConfigError(`${key}.commitments`, "must be a list");
  }
}
