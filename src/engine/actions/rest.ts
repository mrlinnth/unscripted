// Sleep and collapse (spec A.8, A.12). Fatigue and healing while asleep are
// applied by body.ts; these actions only decide when sleep ends.

import type { ActionDefs } from "./framework";

export const restActions: ActionDefs = {
  sleep: {
    kind: "sleep",
    cancellable: true,
    validate(_world, _character, action) {
      if (action.minutes === undefined) return null;
      return Number.isInteger(action.minutes) && action.minutes > 0
        ? null
        : `sleep minutes must be a whole number above 0, got ${action.minutes}`;
    },
    duration(_world, _character, action) {
      // Without a length, sleep ends when fatigue reaches 0 (isDone).
      return action.minutes ?? null;
    },
    isDone(_world, character, action) {
      return action.minutes === undefined && character.fatigue === 0;
    },
    complete() {
      return {};
    },
  },

  collapse: {
    kind: "sleep",
    cancellable: false,
    validate() {
      return "collapse cannot be chosen";
    },
    duration() {
      return null;
    },
    isDone(world, character) {
      return character.fatigue / 2 < world.rules.fatigue.collapseWakeBelow;
    },
    complete() {
      return {};
    },
  },
};
