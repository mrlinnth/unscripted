// Phase 1 acceptance tests: spec A.13 scenarios T1–T5.
// The spec's expected values are the target. If the engine disagrees, report
// it; do not change the expected values or the config to make a test pass.

import { describe, expect, it } from "vitest";
import { fatigueCondition } from "../body";
import { createWorld } from "../index";
import { at, runScenario, weatherPlan, type ScenarioOptions, type ScriptStep } from "./harness";

// ---------------------------------------------------------------------------
// T1: Solo fire in clear weather
// ---------------------------------------------------------------------------

/** Player-only T1 script. The lighter is the first item created: "lighter-1". */
function t1Script(): ScriptStep[] {
  const player = (action: ScriptStep["action"]): ScriptStep => ({ actor: "player", action });
  const steps: ScriptStep[] = [
    player({ type: "move", to: "wreckage" }),
    player({ type: "search" }),
    player({ type: "take", itemId: "lighter-1" }),
    player({ type: "move", to: "beach_camp" }),
    player({ type: "move", to: "forest" }),
    player({ type: "explore" }),
  ];
  for (let trip = 1; trip <= 3; trip++) {
    steps.push(
      player({ type: "gather_wood" }),
      player({ type: "gather_wood" }),
      player({ type: "move", to: "hilltop" }),
    );
    // Bundle ids follow item creation order: lighter-1, then wood-2, wood-3, ...
    const first = 2 + (trip - 1) * 2;
    steps.push(
      player({ type: "drop", itemId: `wood-${first}` }),
      player({ type: "drop", itemId: `wood-${first + 1}` }),
    );
    if (trip < 3) steps.push(player({ type: "move", to: "forest" }));
  }
  steps.push(player({ type: "build_fire" }), player({ type: "light_fire" }));
  return steps;
}

function t1Options(seed = 1): ScenarioOptions {
  return {
    seed,
    weather: weatherPlan([]), // all 48 hours Clear
    searchOrder: ["lighter", "tarp", "flashlight"],
    script: t1Script(),
    until: at(1, "20:00"),
  };
}

describe("T1: solo fire in clear weather", () => {
  it("lights the fire between 18:00 and 19:00 on Day 1, with the player Tired", () => {
    const { world, events, unfinished } = runScenario(t1Options());
    expect(unfinished).toEqual([]);

    const lit = events.find((e) => e.type === "fire_changed" && e.data.to === "lit");
    expect(lit).toBeDefined();
    const litAt = lit?.minute ?? -1;
    expect(litAt).toBeGreaterThanOrEqual(at(1, "18:00"));
    expect(litAt).toBeLessThan(at(1, "19:00"));
    // Engine result: lit at Day 1 18:37 (minute 637), fatigue counter 637.
    expect(litAt).toBe(at(1, "18:37"));

    // "Player Tired" at the moment of lighting: fatigue only goes up during
    // T1, so check the condition logged at that minute.
    const conditionAtLighting = events
      .filter((e) => e.type === "fatigue_changed" && e.actor === "player" && e.minute <= litAt)
      .map((e) => e.data.to);
    expect(conditionAtLighting).toEqual(["tired"]);

    // The fire is still lit at the end of the run (20:00).
    expect(world.fire.state).toBe("lit");
    expect(fatigueCondition(world.characters.player, world.rules)).toBe("tired");

    // NPCs stayed inactive.
    expect(events.filter((e) => e.actor === "npc1" || e.actor === "npc2")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// T5: Determinism
// ---------------------------------------------------------------------------

describe("T5: determinism", () => {
  it("gives identical event logs and world states for the same seed and actions", () => {
    const a = runScenario(t1Options(1));
    const b = runScenario(t1Options(1));
    expect(a.events.length).toBeGreaterThan(50);
    expect(a.events).toStrictEqual(b.events);
    expect(a.world).toStrictEqual(b.world);
  });

  it("gives the same log with a different seed when everything is forced", () => {
    const a = runScenario(t1Options(1));
    const b = runScenario(t1Options(987654));
    expect(b.events).toStrictEqual(a.events);
  });

  it("uses the seed when nothing is forced", () => {
    expect(createWorld(1).weather).not.toEqual(createWorld(2).weather);
  });
});
