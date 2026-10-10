import { describe, expect, it } from "vitest";
import { createItem } from "../actions/items";
import { createWorld, type World } from "../index";
import { createRng } from "../rng";
import { gameMinuteAt } from "../time";
import { weatherPlan } from "../scenarios/harness";
import { decide } from "./decide";
import type { NpcId } from "./profiles";
import { buildNpcView } from "./view";

function knowAll(world: World, id: NpcId): void {
  const c = world.characters[id];
  c.knownLocations = world.rules.locations.map((l) => l.id);
  c.seenLocations = [];
  c.knownRoutes = world.rules.routes.map((r) => [r.from, r.to]);
}

function setFatigue(world: World, id: NpcId, condition: "tired" | "exhausted"): void {
  const at = condition === "tired" ? world.rules.fatigue.tiredAt : world.rules.fatigue.exhaustedAt;
  world.characters[id].fatigue = at * 2;
}

function decideFor(world: World, id: NpcId, exclude = [] as Parameters<typeof decide>[2]) {
  return decide(buildNpcView(world, id), createRng(1), exclude);
}

/** Routes where the Forest is 20 minutes from both Beach Camp and the Cave. */
const tieRoutes = [
  { from: "beach_camp", to: "forest", minutes: 20, closedIn: [] },
  { from: "beach_camp", to: "wreckage", minutes: 30, closedIn: [] },
  { from: "forest", to: "cave", minutes: 20, closedIn: [] },
  { from: "forest", to: "hilltop", minutes: 40, closedIn: [] },
  { from: "cave", to: "hilltop", minutes: 30, closedIn: ["storm"] },
];

describe("rule a: rest when Exhausted, or at night when Tired", () => {
  it("sleeps here when here is protected", () => {
    const world = createWorld(1);
    setFatigue(world, "npc1", "exhausted");
    expect(decideFor(world, "npc1")).toMatchObject({
      action: { type: "sleep" },
      rule: "a",
      reason: "sleep: Exhausted",
    });
  });

  it("moves toward the nearest protected place when here is not", () => {
    const world = createWorld(1);
    world.characters.npc1.location = "forest";
    setFatigue(world, "npc1", "exhausted");
    expect(decideFor(world, "npc1")).toMatchObject({
      action: { type: "move", to: "beach_camp" },
      rule: "a",
      reason: "go to beach_camp to sleep: Exhausted",
    });
  });

  it("applies at night when Tired, but not at night when Rested or by day when Tired", () => {
    const world = createWorld(1);
    setFatigue(world, "npc1", "tired");
    expect(decideFor(world, "npc1").rule).toBe("d");

    world.minute = gameMinuteAt(world.rules, 1, "20:00");
    expect(decideFor(world, "npc1")).toMatchObject({ rule: "a", reason: "sleep: night, Tired" });

    world.characters.npc1.fatigue = 0;
    expect(decideFor(world, "npc1").rule).toBe("d");
  });

  it("keeps the current plan for later", () => {
    const world = createWorld(1);
    const plan = { goalId: "make_camp_safe" as const, steps: [{ type: "search" as const }], index: 0 };
    world.npcs.npc1.plan = plan;
    setFatigue(world, "npc1", "exhausted");
    expect(decideFor(world, "npc1")).toMatchObject({ rule: "a", plan, planEvent: null });
  });
});

describe("cover target", () => {
  it("is set when rule a sends the NPC somewhere, and cleared when it sleeps", () => {
    const world = createWorld(1);
    world.characters.npc1.location = "forest";
    setFatigue(world, "npc1", "exhausted");
    expect(decideFor(world, "npc1").coverTarget).toBe("beach_camp");
    world.characters.npc1.location = "beach_camp";
    expect(decideFor(world, "npc1").coverTarget).toBeNull();
  });

  it("keeps heading for the Cave instead of turning back to a camp it saw unprotected", () => {
    const world = createWorld(1);
    knowAll(world, "npc2");
    world.shelter.value = 0;
    setFatigue(world, "npc2", "exhausted");

    // At camp: sees the shelter too low, heads for the Cave.
    expect(decideFor(world, "npc2")).toMatchObject({ action: { type: "move", to: "forest" }, coverTarget: "cave" });

    // In the Forest the camp looks nearer (20 vs 25 min), but she keeps going.
    world.characters.npc2.location = "forest";
    world.npcs.npc2.coverTarget = "cave";
    expect(decideFor(world, "npc2")).toMatchObject({ action: { type: "move", to: "cave" }, coverTarget: "cave" });

    // Without the target she would turn back.
    world.npcs.npc2.coverTarget = null;
    expect(decideFor(world, "npc2").action).toEqual({ type: "move", to: "beach_camp" });
  });

  it("is dropped when the target can no longer be reached", () => {
    const world = createWorld(1, { weather: weatherPlan([], "storm") });
    knowAll(world, "npc2");
    const sarah = world.characters.npc2;
    sarah.knownRoutes = sarah.knownRoutes.filter(([a, b]) => !(a === "forest" && b === "cave"));
    sarah.location = "hilltop";
    world.npcs.npc2.coverTarget = "cave";
    // Cave – Hilltop is closed in a Storm and she knows no other way to the
    // Cave: pick fresh (Beach Camp via Forest).
    expect(decideFor(world, "npc2")).toMatchObject({ rule: "b", coverTarget: "beach_camp" });
  });

  it("is cleared by rule d", () => {
    const world = createWorld(1);
    world.npcs.npc1.coverTarget = "beach_camp";
    expect(decideFor(world, "npc1")).toMatchObject({ rule: "d", coverTarget: null });
  });
});

describe("rule b: take cover in bad weather", () => {
  it("moves toward cover in a Storm when not protected", () => {
    const world = createWorld(1, { weather: weatherPlan([], "storm") });
    world.characters.npc2.location = "forest";
    expect(decideFor(world, "npc2")).toMatchObject({
      action: { type: "move", to: "beach_camp" },
      rule: "b",
      reason: "shelter: storm, go to beach_camp",
    });
  });

  it("also applies in Heavy Rain, but not in Light Rain", () => {
    const heavy = createWorld(1, { weather: weatherPlan([], "heavy_rain") });
    heavy.characters.npc2.location = "forest";
    expect(decideFor(heavy, "npc2").rule).toBe("b");

    const light = createWorld(1, { weather: weatherPlan([], "light_rain") });
    light.characters.npc2.location = "forest";
    expect(decideFor(light, "npc2").rule).toBe("d");
  });

  it("does not apply when already protected", () => {
    const world = createWorld(1, { weather: weatherPlan([], "storm") });
    expect(decideFor(world, "npc2").rule).not.toBe("b");
  });

  it("is skipped when no protected place can be reached", () => {
    const world = createWorld(1, { weather: weatherPlan([], "storm") });
    world.shelter.value = 0;
    // At Beach Camp, sees the shelter is too low, and knows no Cave.
    expect(decideFor(world, "npc2").rule).toBe("d");
  });
});

describe("rule c: rest when health is low", () => {
  it("rests under protection when health is below the threshold", () => {
    const world = createWorld(1);
    world.characters.npc1.health = 42;
    expect(decideFor(world, "npc1")).toMatchObject({
      action: { type: "sleep" },
      rule: "c",
      reason: "rest: health 42",
    });

    world.characters.npc1.location = "forest";
    expect(decideFor(world, "npc1")).toMatchObject({
      action: { type: "move", to: "beach_camp" },
      rule: "c",
      reason: "go to beach_camp to rest: health 42",
    });
  });

  it("does not apply at the threshold", () => {
    const world = createWorld(1);
    world.characters.npc1.health = 50;
    expect(decideFor(world, "npc1").rule).toBe("d");
  });
});

describe("rule order", () => {
  it("picks rule a over b and c when Exhausted in a Storm with low health", () => {
    const world = createWorld(1, { weather: weatherPlan([], "storm") });
    world.characters.npc1.location = "forest";
    world.characters.npc1.health = 20;
    setFatigue(world, "npc1", "exhausted");
    expect(decideFor(world, "npc1").rule).toBe("a");
  });

  it("picks rule b over c", () => {
    const world = createWorld(1, { weather: weatherPlan([], "storm") });
    world.characters.npc1.location = "forest";
    world.characters.npc1.health = 20;
    expect(decideFor(world, "npc1").rule).toBe("b");
  });
});

describe("rule d: follow the plan", () => {
  it("creates a plan for the top goal", () => {
    const world = createWorld(1);
    expect(decideFor(world, "npc1")).toEqual({
      action: { type: "move", to: "wreckage" },
      rule: "d",
      reason: "make_camp_safe step 1: move",
      plan: {
        goalId: "make_camp_safe",
        steps: [{ type: "move", to: "wreckage" }, { type: "search" }],
        index: 0,
      },
      planEvent: "created",
      goalChanges: [],
      coverTarget: null,
    });
  });

  it("keeps the current plan when the new steps are what is left of it", () => {
    const world = createWorld(1);
    world.npcs.npc1.plan = decideFor(world, "npc1").plan;
    world.characters.npc1.location = "wreckage";
    expect(decideFor(world, "npc1")).toMatchObject({
      action: { type: "search" },
      reason: "make_camp_safe step 2: search",
      plan: { index: 1 },
      planEvent: null,
    });
  });

  it("changes the plan when the steps differ", () => {
    const world = createWorld(1);
    world.npcs.npc1.plan = decideFor(world, "npc1").plan;
    world.characters.npc1.location = "wreckage";
    const tarp = createItem(world, "tarp");
    world.locations.wreckage!.items.push(tarp);
    expect(decideFor(world, "npc1")).toMatchObject({
      action: { type: "take", itemId: tarp.id },
      plan: { goalId: "make_camp_safe", steps: [{ type: "take", itemId: tarp.id }], index: 0 },
      planEvent: "changed",
    });
  });

  it("moves to the next goal when the top goal is done", () => {
    const world = createWorld(1);
    world.shelter.value = 80;
    world.shelter.tarpInstalled = true;
    expect(decideFor(world, "npc1")).toMatchObject({
      goalChanges: [{ id: "make_camp_safe", status: "done", reason: "goal reached" }],
      action: { type: "move", to: "forest" },
      reason: "keep_wood_reserve step 1: move",
    });
  });

  it("reports a dropped goal and moves on", () => {
    const world = createWorld(1);
    knowAll(world, "npc2");
    world.characters.npc2.location = "wreckage";
    world.npcs.npc2.wreckageSearchedOut = true;
    world.npcs.npc2.goals[0]!.status = "done";
    const choice = decideFor(world, "npc2");
    expect(choice.goalChanges).toEqual([
      { id: "keep_flashlight", status: "dropped", reason: "flashlight not found at the Wreckage" },
      { id: "signal_rescue", status: "dropped", reason: "lighter not found at the Wreckage" },
    ]);
    expect(choice.rule).toBe("e");
  });

  it("tries a lower goal when the top goal has no plan right now", () => {
    const world = createWorld(1);
    // Sarah: map_island done; keep_flashlight goes to the Wreckage.
    knowAll(world, "npc2");
    world.npcs.npc2.goals[0]!.status = "done";
    expect(decideFor(world, "npc2").reason).toBe("keep_flashlight step 1: move");
  });
});

describe("rule e: wait", () => {
  it("waits when no goal has a plan", () => {
    const world = createWorld(1);
    world.npcs.npc1.goals[0]!.status = "done";
    const wood = createItem(world, "wood");
    world.locations.beach_camp!.items.push(wood);
    expect(decideFor(world, "npc1")).toMatchObject({
      action: { type: "wait", minutes: 30 },
      rule: "e",
      reason: "idle",
      plan: null,
      planEvent: null,
    });
  });
});

describe("tie-break", () => {
  it("uses the seeded generator on a tie, and the same state gives the same pick", () => {
    const world = createWorld(1, { rules: { routes: tieRoutes } });
    knowAll(world, "npc1");
    world.characters.npc1.location = "forest";
    setFatigue(world, "npc1", "exhausted");
    const view = buildNpcView(world, "npc1");

    const picks = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      const a = createRng(seed);
      const b = createRng(seed);
      const first = decide(view, a);
      expect(decide(view, b)).toEqual(first);
      expect(a.state).not.toBe(seed);
      picks.add(JSON.stringify(first.action));
    }
    // Both places get picked for some seed.
    expect(picks).toEqual(
      new Set([JSON.stringify({ type: "move", to: "beach_camp" }), JSON.stringify({ type: "move", to: "cave" })]),
    );
  });

  it("does not draw from the generator without a tie", () => {
    const world = createWorld(1);
    world.characters.npc1.location = "forest";
    setFatigue(world, "npc1", "exhausted");
    const rng = createRng(7);
    decide(buildNpcView(world, "npc1"), rng);
    expect(rng.state).toBe(7);
  });
});

describe("exclude", () => {
  it("falls through to the next rule when a choice was rejected", () => {
    const world = createWorld(1);
    setFatigue(world, "npc1", "exhausted");
    const choice = decideFor(world, "npc1", [{ type: "sleep" }]);
    expect(choice.rule).toBe("d");
    expect(choice.action).toEqual({ type: "move", to: "wreckage" });
  });

  it("falls through to wait, which is never excluded", () => {
    const world = createWorld(1);
    // Both goals' first steps rejected: make_camp_safe and keep_wood_reserve.
    const choice = decideFor(world, "npc1", [
      { type: "move", to: "wreckage" },
      { type: "move", to: "forest" },
      { type: "wait", minutes: 30 },
    ]);
    expect(choice).toMatchObject({ rule: "e", action: { type: "wait", minutes: 30 } });
  });
});
