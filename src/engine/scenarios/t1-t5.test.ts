// Phase 1 acceptance tests: spec A.13 scenarios T1–T5.
// The spec's expected values are the target. If the engine disagrees, report
// it; do not change the expected values or the config to make a test pass.

import { describe, expect, it } from "vitest";
import { FUEL_UNITS_PER_HOUR, fuelHours } from "../actions/fire";
import { createItem } from "../actions/items";
import { fatigueCondition, isAsleep, isProtected } from "../body";
import { createWorld, step, submitAction } from "../index";
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
// T2: Storm effects
// ---------------------------------------------------------------------------

describe("T2: storm effects", () => {
  const storm = weatherPlan([{ from: at(1, "14:00"), to: at(1, "17:00"), state: "storm" }]);

  const result = runScenario({
    seed: 1,
    weather: storm,
    // npc2 waits at the Hilltop with a Built fire and a lighter, to try lighting.
    setup: (world) => {
      world.characters.npc2.location = "hilltop";
      world.characters.npc2.inventory.push(createItem(world, "lighter"));
      world.fire = { state: "built", fuel: 4 * FUEL_UNITS_PER_HOUR, wet: false, dryHours: 0 };
    },
    script: [
      // The player goes to the Forest and stays outside there.
      { actor: "player", action: { type: "move", to: "forest" } },
      { actor: "player", action: { type: "wait", minutes: 600 } },
      // npc1 learns the Cave – Hilltop route by exploring (no A.3 changes).
      { actor: "npc1", action: { type: "move", to: "forest" } },
      { actor: "npc1", action: { type: "explore" } },
      { actor: "npc1", action: { type: "move", to: "cave" } },
      { actor: "npc1", action: { type: "explore" } },
      { actor: "npc1", action: { type: "move", to: "hilltop" }, at: at(1, "14:00"), expectReject: true },
      { actor: "npc1", action: { type: "move", to: "hilltop" }, at: at(1, "17:00") },
      // Lighting during the Storm.
      { actor: "npc2", action: { type: "light_fire" }, at: at(1, "15:00"), expectReject: true },
    ],
    until: at(1, "17:00"),
  });
  const { world, events } = result;

  const rejections = (actor: string): unknown[] =>
    events.filter((e) => e.type === "action_rejected" && e.actor === actor).map((e) => [e.minute, e.data.reason]);

  it("ran the whole script", () => {
    expect(result.unfinished).toEqual([]);
  });

  it("closes Cave – Hilltop during the Storm and opens it after", () => {
    expect(rejections("npc1")).toEqual([[at(1, "14:00"), "route cave – hilltop is closed in storm"]]);
    const started = events.filter((e) => e.type === "action_started" && e.actor === "npc1");
    expect(started[started.length - 1]).toMatchObject({
      minute: at(1, "17:00"),
      data: { action: { type: "move", to: "hilltop" } },
    });
  });

  it("leaves the player at health 85 at 17:00", () => {
    expect(world.characters.player.location).toBe("forest");
    expect(world.characters.player.health).toBe(85);
  });

  it("leaves the shelter at 10 at 17:00, no longer protecting", () => {
    expect(world.shelter.value).toBe(10);
    const atCamp = { ...world.characters.player, location: "beach_camp" };
    expect(isProtected(world, atCamp)).toBe(false);
  });

  it("rejects lighting during the Storm", () => {
    expect(rejections("npc2")).toEqual([[at(1, "15:00"), "cannot light in storm"]]);
    expect(world.fire.state).toBe("built");
  });
});

// ---------------------------------------------------------------------------
// T3: Fire against rain
// ---------------------------------------------------------------------------

describe("T3: fire against rain", () => {
  const rainStart = at(1, "09:00");
  const { world, events } = runScenario({
    seed: 1,
    weather: weatherPlan([{ from: rainStart, to: at(1, "12:00"), state: "heavy_rain" }]),
    setup: (w) => {
      w.fire = { state: "lit", fuel: 4 * FUEL_UNITS_PER_HOUR, wet: false, dryHours: 0 };
    },
    script: [],
    until: at(1, "10:00"),
  });

  it("goes out about 30 minutes after the rain starts", () => {
    const out = events.find((e) => e.type === "fire_changed" && e.data.to === "built");
    const minutesAfterRain = (out?.minute ?? -1) - rainStart;
    expect(minutesAfterRain).toBeGreaterThanOrEqual(25);
    expect(minutesAfterRain).toBeLessThanOrEqual(35);
    // Engine result: out 31 minutes after the rain starts (09:31). After the
    // Clear hour 3 hours are left; double burn reaches exactly 2 hours at
    // 09:30, and the fire goes out the next minute, once fuel is below 2.
    expect(minutesAfterRain).toBe(31);
  });

  it("returns to Built and wet with just under 2 hours of fuel", () => {
    expect(world.fire.state).toBe("built");
    expect(world.fire.wet).toBe(true);
    expect(fuelHours(world.fire)).toBeLessThan(2);
    expect(fuelHours(world.fire)).toBeGreaterThan(1.9);
  });
});

// ---------------------------------------------------------------------------
// T4: Exhaustion
// ---------------------------------------------------------------------------

describe("T4: exhaustion", () => {
  // A driver loop rather than a fixed script: the player never rests. In the
  // Forest they gather and drop; once gathering is rejected they keep
  // exploring (still work, +1 per minute) until they collapse.
  const world = createWorld(1, { weather: weatherPlan([]) });
  const player = world.characters.player;
  const gatherRejections: { minute: number; reason: string }[] = [];
  submitAction(world, "player", { type: "move", to: "forest" });
  while (world.minute < at(2, "02:00") && !isAsleep(player)) {
    if (player.action === null) {
      const bundle = player.inventory[0];
      if (bundle) {
        submitAction(world, "player", { type: "drop", itemId: bundle.id });
      } else {
        const gather = submitAction(world, "player", { type: "gather_wood" });
        if (!gather.ok) {
          gatherRejections.push({ minute: world.minute, reason: gather.reason });
          submitAction(world, "player", { type: "explore" });
        }
      }
    }
    step(world);
  }

  const conditionChanges = world.events
    .filter((e) => e.type === "fatigue_changed" && e.actor === "player")
    .map((e) => [e.minute, e.data.to]);

  it("is Tired at 16:00 and Exhausted at 20:00", () => {
    expect(conditionChanges).toEqual([
      [at(1, "16:00"), "tired"],
      [at(1, "20:00"), "exhausted"],
    ]);
  });

  it("rejects gathering after 20:00", () => {
    expect(gatherRejections[0]).toEqual({ minute: at(1, "20:00"), reason: "too exhausted" });
  });

  it("collapses into sleep at about 00:00 on Day 2", () => {
    const collapse = world.events.find((e) => e.type === "collapse");
    const minute = collapse?.minute ?? -1;
    expect(Math.abs(minute - at(2, "00:00"))).toBeLessThanOrEqual(5);
    // Engine result: collapse at exactly Day 2 00:00 (counter 960), because
    // every minute from 08:00 was +1 (travel, gather, drop, explore).
    expect(minute).toBe(at(2, "00:00"));
    expect(isAsleep(player)).toBe(true);
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
