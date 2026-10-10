// Seeded random number generator (mulberry32). The state is a plain number in a
// plain object, so it can live in world state, be saved, and be compared.
// This is the only source of randomness in the engine.

export interface Rng {
  state: number;
}

const UINT32_RANGE = 4294967296; // 2^32

export function createRng(seed: number): Rng {
  if (!Number.isInteger(seed) || seed < 0 || seed >= UINT32_RANGE) {
    throw new Error(`seed must be a whole number from 0 to 2^32 - 1, got ${seed}`);
  }
  return { state: seed };
}

/** Returns a number in [0, 1) and advances the state. */
export function nextFloat(rng: Rng): number {
  const a = (rng.state + 0x6d2b79f5) | 0;
  rng.state = a >>> 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / UINT32_RANGE;
}

/** Returns a whole number in [0, maxExclusive) and advances the state. */
export function nextInt(rng: Rng, maxExclusive: number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new Error(`maxExclusive must be a whole number above 0, got ${maxExclusive}`);
  }
  return Math.floor(nextFloat(rng) * maxExclusive);
}
