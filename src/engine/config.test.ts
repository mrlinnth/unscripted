import { describe, expect, it } from "vitest";
import { loadWorldRules } from "./config";

describe("loadWorldRules", () => {
  it("loads the shipped rules with Appendix A values", () => {
    const rules = loadWorldRules();
    expect(rules.locations).toHaveLength(5);
    expect(rules.routes).toHaveLength(5);
    expect(rules.carrySlots).toBe(2);
    expect(rules.signalFire.buildWood).toBe(6);
    expect(rules.fatigue.tiredAt).toBe(480);
    expect(rules.starting.shelter).toBe(40);
  });

  it("has no Beach Camp – Hilltop route (A.3)", () => {
    const rules = loadWorldRules();
    const direct = rules.routes.find(
      (r) =>
        (r.from === "beach_camp" && r.to === "hilltop") ||
        (r.from === "hilltop" && r.to === "beach_camp"),
    );
    expect(direct).toBeUndefined();
  });

  it("applies an override to one value and keeps the rest", () => {
    const rules = loadWorldRules({ signalFire: { buildWood: 3 } });
    expect(rules.signalFire.buildWood).toBe(3);
    expect(rules.signalFire.maxFuelHours).toBe(8);
  });

  it("does not change the shipped rules when overriding", () => {
    loadWorldRules({ carrySlots: 5, starting: { shelter: 10 } });
    const rules = loadWorldRules();
    expect(rules.carrySlots).toBe(2);
    expect(rules.starting.shelter).toBe(40);
  });

  it("replaces arrays instead of merging them", () => {
    const rules = loadWorldRules({ wreckage: { items: ["tarp"] } });
    expect(rules.wreckage.items).toEqual(["tarp"]);
  });

  it("rejects a route to an unknown location", () => {
    const base = loadWorldRules();
    expect(() =>
      loadWorldRules({
        routes: [...base.routes, { from: "forest", to: "volcano", minutes: 10, closedIn: [] }],
      }),
    ).toThrow(/routes\[5\]\.to: unknown location "volcano"/);
  });

  it("rejects a rate that is not a multiple of 0.5", () => {
    expect(() => loadWorldRules({ fatigue: { perMinute: { idle: 0.3 } } })).toThrow(
      /fatigue\.perMinute\.idle: must be a multiple of 0\.5/,
    );
    expect(() => loadWorldRules({ signalFire: { burnPerHour: { light_rain: 1.2 } } })).toThrow(
      /signalFire\.burnPerHour\.light_rain/,
    );
  });

  it("rejects fatigue thresholds out of order", () => {
    expect(() => loadWorldRules({ fatigue: { exhaustedAt: 400 } })).toThrow(/fatigue: thresholds/);
  });

  it("rejects an unknown weather state", () => {
    expect(() => loadWorldRules({ starting: { firstHourWeather: "snow" } })).toThrow(
      /starting\.firstHourWeather: unknown weather state "snow"/,
    );
  });
});
