// Wreckage search order (spec A.5), rolled from the seed at session start,
// right after the weather (see the RNG order note in weather.ts).

import type { ItemId, WorldRules } from "./config";
import { nextInt, type Rng } from "./rng";

/** Returns the Wreckage items in the order searches will find them. */
export function rollSearchOrder(rng: Rng, rules: WorldRules): ItemId[] {
  const order = [...rules.wreckage.items];
  // Fisher–Yates shuffle, from the last position down.
  for (let i = order.length - 1; i > 0; i--) {
    const j = nextInt(rng, i + 1);
    [order[i], order[j]] = [order[j] as ItemId, order[i] as ItemId];
  }
  return order;
}
