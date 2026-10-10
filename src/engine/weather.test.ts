import { describe, expect, it } from "vitest";
import { loadWorldRules } from "./config";
import { createRng, nextFloat, nextInt } from "./rng";
import { rollWeather } from "./weather";
import { rollSearchOrder } from "./wreckage";

const rules = loadWorldRules();
const states = rules.weather.states;
const SEEDS = Array.from({ length: 500 }, (_, i) => i * 7919 + 1);

function roll(seed: number): { weather: string[]; order: string[] } {
  const rng = createRng(seed);
  const weather = rollWeather(rng, rules);
  const order = rollSearchOrder(rng, rules);
  return { weather, order };
}

describe("rng", () => {
  it("gives the same numbers for the same seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 10 }, () => nextFloat(a));
    const seqB = Array.from({ length: 10 }, () => nextFloat(b));
    expect(seqA).toEqual(seqB);
    expect(a.state).toBe(b.state);
  });

  it("stays in range", () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const f = nextFloat(rng);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = nextInt(rng, 3);
      expect([0, 1, 2]).toContain(n);
    }
  });

  it("rejects bad seeds and bounds", () => {
    expect(() => createRng(-1)).toThrow();
    expect(() => createRng(1.5)).toThrow();
    expect(() => createRng(2 ** 32)).toThrow();
    expect(() => nextInt(createRng(1), 0)).toThrow();
  });
});

describe("rollWeather", () => {
  it("is the same for the same seed and differs across seeds", () => {
    expect(roll(123)).toEqual(roll(123));
    const distinct = new Set(SEEDS.slice(0, 20).map((s) => roll(s).weather.join(",")));
    expect(distinct.size).toBeGreaterThan(1);
  });

  it("follows A.7 for many seeds", () => {
    let transitions = 0;
    let stays = 0;
    for (const seed of SEEDS) {
      const { weather } = roll(seed);
      expect(weather).toHaveLength(48);
      expect(weather[0]).toBe("clear");

      let stormRun = 0;
      for (let h = 0; h < weather.length; h++) {
        const now = states.indexOf(weather[h] as string);
        expect(now).toBeGreaterThanOrEqual(0);
        stormRun = weather[h] === "storm" ? stormRun + 1 : 0;
        expect(stormRun).toBeLessThanOrEqual(3);
        if (h === 0) continue;
        const prev = states.indexOf(weather[h - 1] as string);
        expect(Math.abs(now - prev)).toBeLessThanOrEqual(1);
        if (weather[h - 1] === "clear") expect(now).toBeGreaterThanOrEqual(prev);
        if (weather[h - 1] === "storm") expect(now).toBeLessThanOrEqual(prev);
        transitions++;
        if (now === prev) stays++;
      }
    }
    // About 80% stay (a little less because of forced Storm exits).
    const stayRate = stays / transitions;
    expect(stayRate).toBeGreaterThan(0.75);
    expect(stayRate).toBeLessThan(0.85);
  });

  it("ends a Storm after the maximum and moves to Heavy Rain", () => {
    const always = loadWorldRules({
      weather: { stayChance: 1 },
      starting: { firstHourWeather: "storm" },
    });
    const weather = rollWeather(createRng(1), always);
    expect(weather.slice(0, 5)).toEqual(["storm", "storm", "storm", "heavy_rain", "heavy_rain"]);
  });

  it("moves Clear only up when it must move", () => {
    const never = loadWorldRules({ weather: { stayChance: 0 } });
    const weather = rollWeather(createRng(1), never);
    expect(weather[1]).toBe("cloudy");
  });
});

describe("rollSearchOrder", () => {
  it("returns all three items once, same for the same seed", () => {
    const { order } = roll(99);
    expect([...order].sort()).toEqual(["flashlight", "lighter", "tarp"]);
    expect(roll(99).order).toEqual(order);
  });

  it("puts each item first for some seeds", () => {
    const firsts = new Set(SEEDS.slice(0, 50).map((s) => roll(s).order[0]));
    expect(firsts).toEqual(new Set(["flashlight", "lighter", "tarp"]));
  });

  it("uses the RNG after the weather (fixed call order)", () => {
    const rng = createRng(5);
    rollWeather(rng, rules);
    const afterWeather = rollSearchOrder(rng, rules);
    expect(afterWeather).toEqual(roll(5).order);
  });
});
