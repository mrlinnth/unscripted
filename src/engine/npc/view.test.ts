import { describe, expect, it } from "vitest";
import { createItem } from "../actions/items";
import { createWorld, stepMinutes, submitAction, type World } from "../index";
import { weatherPlan } from "../scenarios/harness";
import { buildNpcView, nearestProtected, pathTo } from "./view";

/** Teaches an NPC the whole map (all locations and routes). */
function knowAll(world: World, id: "npc1" | "npc2"): void {
  const c = world.characters[id];
  c.knownLocations = world.rules.locations.map((l) => l.id);
  c.seenLocations = [];
  c.knownRoutes = world.rules.routes.map((r) => [r.from, r.to]);
}

describe("buildNpcView", () => {
  it("shows own state, map knowledge, and the current weather", () => {
    const world = createWorld(1);
    const view = buildNpcView(world, "npc2");
    expect(view.id).toBe("npc2");
    expect(view.self).toMatchObject({
      location: "beach_camp",
      fatigue: "rested",
      health: 100,
      alive: true,
      asleep: false,
      inventory: [],
      freeSlots: 2,
      action: null,
      actionCancellable: false,
    });
    expect(view.map.knownLocations).toEqual(["beach_camp", "forest", "wreckage"]);
    expect(view.map.seenLocations).toEqual(["hilltop"]);
    expect(view.map.routes).toEqual([
      { from: "beach_camp", to: "forest", minutes: 20, open: true },
      { from: "beach_camp", to: "wreckage", minutes: 30, open: true },
    ]);
    expect(view.weather).toEqual({ current: "clear", forecast: [] });
    expect(view.here.characters).toEqual(["player", "npc1"]);
    expect(view.npc.goals.map((g) => g.id)).toEqual(["map_island", "keep_flashlight", "signal_rescue"]);
  });

  it("never contains hidden world truth", () => {
    const world = createWorld(2, { searchOrder: ["flashlight", "lighter", "tarp"] });
    // A uniquely named item lying at the Wreckage, away from the NPC.
    const hidden = createItem(world, "lighter");
    hidden.id = "hidden-lighter-at-wreckage";
    world.locations.wreckage?.items.push(hidden);
    // Other characters' private state.
    world.characters.player.knownLocations.push("cave");
    // A marker value no real rule produces, so it can't match by chance.
    world.characters.npc2.health = 4242;
    world.npcs.npc2.plan = { goalId: "signal_rescue", steps: [{ type: "explore" }], index: 0 };

    const view = buildNpcView(world, "npc1");
    const json = JSON.stringify(view);
    expect(json).not.toContain("hidden-lighter-at-wreckage");
    expect(json).not.toContain("wreckageToFind");
    expect(json).not.toContain("searchOrder");
    expect(json).not.toContain("signal_rescue");
    expect(json).not.toContain("4242");
    expect(view.map.knownLocations).not.toContain("cave");
    // The rolled weather sequence is not in the view.
    expect(json).not.toContain(JSON.stringify(world.weather));
    expect(view.weather.forecast).toEqual([]);
    // Other characters appear only as ids.
    expect(view.here.characters).toEqual(["player", "npc2"]);
  });

  it("shows items lying at the current location", () => {
    const world = createWorld(2);
    const item = createItem(world, "tarp");
    world.locations.wreckage?.items.push(item);
    world.characters.npc1.location = "wreckage";
    expect(buildNpcView(world, "npc1").here.items).toEqual([item]);
    expect(buildNpcView(world, "npc2").here.items).toEqual([]);
  });

  it("shows the forecast only after the NPC itself observed at the Hilltop", () => {
    const world = createWorld(3, { weather: weatherPlan([{ from: 60, to: 180, state: "cloudy" }]) });
    world.characters.npc2.location = "hilltop";
    world.characters.player.location = "hilltop";
    submitAction(world, "player", { type: "observe_weather" });
    stepMinutes(world, 15);
    expect(buildNpcView(world, "npc2").weather.forecast).toEqual([]);

    submitAction(world, "npc2", { type: "observe_weather" });
    stepMinutes(world, 15);
    expect(buildNpcView(world, "npc2").weather.forecast).toEqual([
      { hour: 1, state: "cloudy" },
      { hour: 2, state: "cloudy" },
    ]);

    // Hours that have passed drop out.
    stepMinutes(world, 120 - world.minute);
    expect(buildNpcView(world, "npc2").weather.forecast).toEqual([{ hour: 2, state: "cloudy" }]);
    stepMinutes(world, 60);
    expect(buildNpcView(world, "npc2").weather.forecast).toEqual([]);
  });

  it("shows shelter only at Beach Camp and the fire only at the Hilltop", () => {
    const world = createWorld(4);
    expect(buildNpcView(world, "npc1").here.shelter).toEqual({ value: 40, tarpInstalled: false });
    expect(buildNpcView(world, "npc1").here.fire).toBeNull();

    world.characters.npc1.location = "forest";
    expect(buildNpcView(world, "npc1").here.shelter).toBeNull();

    world.characters.npc1.location = "hilltop";
    expect(buildNpcView(world, "npc1").here.shelter).toBeNull();
    expect(buildNpcView(world, "npc1").here.fire).toEqual({ state: "none", fuelHours: 0, wet: false });
  });

  it("is a copy: changing the view never changes the world", () => {
    const world = createWorld(5);
    world.characters.npc1.inventory.push(createItem(world, "wood"));
    const before = structuredClone(world);
    const view = buildNpcView(world, "npc1");
    view.self.inventory.pop();
    view.map.knownLocations.push("cave");
    view.npc.goals[0]!.status = "done";
    view.behavior.lowHealth = 1;
    expect(world).toStrictEqual(before);
  });

  it("marks the current action and whether it can be cancelled", () => {
    const world = createWorld(6);
    submitAction(world, "npc1", { type: "move", to: "forest" });
    let view = buildNpcView(world, "npc1");
    expect(view.self.action).toEqual({ type: "move", to: "forest" });
    expect(view.self.actionCancellable).toBe(false);

    stepMinutes(world, 20);
    submitAction(world, "npc1", { type: "gather_wood" });
    view = buildNpcView(world, "npc1");
    expect(view.self.actionCancellable).toBe(true);
  });
});

describe("nearestProtected", () => {
  it("is Beach Camp from the Forest at start", () => {
    const world = createWorld(1);
    world.characters.npc1.location = "forest";
    expect(nearestProtected(buildNpcView(world, "npc1"))).toEqual([
      { location: "beach_camp", path: ["beach_camp"] },
    ]);
  });

  it("is here, with an empty path, when here is protected", () => {
    const world = createWorld(1);
    expect(nearestProtected(buildNpcView(world, "npc1"))).toEqual([{ location: "beach_camp", path: [] }]);
  });

  it("skips Beach Camp when the NPC is there and sees the shelter below 30", () => {
    const world = createWorld(1);
    world.shelter.value = 20;
    // Only Beach Camp is known as a shelter, and it is not protecting.
    expect(nearestProtected(buildNpcView(world, "npc1"))).toEqual([]);
    knowAll(world, "npc1");
    expect(nearestProtected(buildNpcView(world, "npc1"))).toEqual([
      { location: "cave", path: ["forest", "cave"] },
    ]);
  });

  it("counts Beach Camp as protected when away, even if the shelter is low", () => {
    const world = createWorld(1);
    world.shelter.value = 0;
    world.characters.npc1.location = "wreckage";
    expect(nearestProtected(buildNpcView(world, "npc1"))).toEqual([
      { location: "beach_camp", path: ["beach_camp"] },
    ]);
  });

  it("picks the Cave once known and nearer", () => {
    const world = createWorld(1);
    knowAll(world, "npc1");
    world.characters.npc1.location = "hilltop";
    expect(nearestProtected(buildNpcView(world, "npc1"))).toEqual([{ location: "cave", path: ["cave"] }]);
  });

  it("skips a route closed by a Storm", () => {
    const world = createWorld(1, { weather: weatherPlan([], "storm") });
    knowAll(world, "npc1");
    world.characters.npc1.location = "hilltop";
    // Cave – Hilltop is closed: Cave via Forest is 65 min, Beach Camp via Forest is 60.
    expect(nearestProtected(buildNpcView(world, "npc1"))).toEqual([
      { location: "beach_camp", path: ["forest", "beach_camp"] },
    ]);
  });

  it("returns every place in a tie", () => {
    const world = createWorld(1, {
      rules: {
        routes: [
          { from: "beach_camp", to: "forest", minutes: 20, closedIn: [] },
          { from: "beach_camp", to: "wreckage", minutes: 30, closedIn: [] },
          { from: "forest", to: "cave", minutes: 20, closedIn: [] },
          { from: "forest", to: "hilltop", minutes: 40, closedIn: [] },
          { from: "cave", to: "hilltop", minutes: 30, closedIn: ["storm"] },
        ],
      },
    });
    knowAll(world, "npc1");
    world.characters.npc1.location = "forest";
    const nearest = nearestProtected(buildNpcView(world, "npc1"));
    expect(nearest).toHaveLength(2);
    expect(nearest).toEqual(
      expect.arrayContaining([
        { location: "beach_camp", path: ["beach_camp"] },
        { location: "cave", path: ["cave"] },
      ]),
    );
  });
});

describe("pathTo", () => {
  it("finds paths over known routes only", () => {
    const world = createWorld(1);
    const view = buildNpcView(world, "npc2");
    expect(pathTo(view, "beach_camp")).toEqual([]);
    expect(pathTo(view, "wreckage")).toEqual(["wreckage"]);
    expect(pathTo(view, "hilltop")).toBeNull();
    expect(pathTo(view, "cave")).toBeNull();

    knowAll(world, "npc2");
    expect(pathTo(buildNpcView(world, "npc2"), "hilltop")).toEqual(["forest", "hilltop"]);
  });
});
