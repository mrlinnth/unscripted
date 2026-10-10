// Actions a character can attempt (spec A.12). Each case carries its inputs.

import type { LocationId } from "../config";
import type { CharacterId } from "../state";

export type Action =
  | { type: "move"; to: LocationId }
  | { type: "explore" }
  | { type: "gather_wood" }
  | { type: "search" }
  | { type: "take"; itemId: string }
  | { type: "drop"; itemId: string }
  | { type: "give"; itemId: string; to: CharacterId }
  | { type: "build_fire" }
  | { type: "add_wood"; itemId?: string }
  | { type: "light_fire" }
  | { type: "repair_shelter" }
  | { type: "install_tarp" }
  | { type: "observe_weather" }
  | { type: "sleep"; minutes?: number }
  | { type: "wait"; minutes: number }
  /** Internal: started by the engine on collapse (A.8); cannot be chosen. */
  | { type: "collapse" };

export type ActionType = Action["type"];

export type ActionOf<T extends ActionType> = Extract<Action, { type: T }>;

/** How an action counts for fatigue (A.8). */
export type ActivityKind = "work" | "travel" | "interact" | "idle" | "sleep";

export type SubmitResult = { ok: true } | { ok: false; reason: string };
