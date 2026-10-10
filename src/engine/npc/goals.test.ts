import { describe, expect, it } from "vitest";
import { createItem } from "../actions/items";
import { createWorld, type World } from "../index";
import { weatherPlan } from "../scenarios/harness";
import type { ItemKind } from "../state";
import { goalPlanners } from "./goals";
import type { NpcId } from "./profiles";
import { buildNpcView } from "./view";

const { make_camp_safe, keep_wood_reserve, map_island, keep_flashlight, signal_rescue } = goalPlanners;

function knowAll(world: World, id: NpcId): void {
  const c = world.characters[id];
  c.knownLocations = world.rules.locations.map((l) => l.id);
  c.seenLocations = [];
  c.knownRoutes = world.rules.routes.map((r) => [r.from, r.to]);
}

function give(world: World, id: NpcId, kind: ItemKind): string {
  const item = createItem(world, kind);
  world.characters[id].inventory.push(item);
  return item.id;
}

function lay(world: World, location: string, kind: ItemKind, wet = false): string {
  const item = createItem(world, kind);
  if (item.kind === "wood") item.wet = wet;
  world.locations[location]?.items.push(item);
  return item.id;
}

function place(world: World, id: NpcId, location: string): void {
  world.characters[id].location = location;
}

function exhaust(world: World, id: NpcId): void {
  world.characters[id].fatigue = world.rules.fatigue.exhaustedAt * 2;
}

const view = buildNpcView;

describe("make_camp_safe", () => {
  it("first goes to the Wreckage to search, even if the tarp already lies there (he can't see it)", () => {
    const world = createWorld(1);
    lay(world, "wreckage", "tarp");
    expect(make_camp_safe.plan(view(world, "npc1"))).toEqual([
      { type: "move", to: "wreckage" },
      { type: "search" },
    ]);
  });

  it("searches at the Wreckage, takes a tarp it sees, and carries it back to install", () => {
    const world = createWorld(1);
    place(world, "npc1", "wreckage");
    expect(make_camp_safe.plan(view(world, "npc1"))).toEqual([{ type: "search" }]);

    const tarp = lay(world, "wreckage", "tarp");
    expect(make_camp_safe.plan(view(world, "npc1"))).toEqual([{ type: "take", itemId: tarp }]);

    world.locations.wreckage!.items = [];
    give(world, "npc1", "tarp");
    expect(make_camp_safe.plan(view(world, "npc1"))).toEqual([{ type: "move", to: "beach_camp" }]);

    place(world, "npc1", "beach_camp");
    expect(make_camp_safe.plan(view(world, "npc1"))).toEqual([{ type: "install_tarp" }]);
  });

  it("repairs with wood from the Forest once the tarp is installed", () => {
    const world = createWorld(1);
    world.shelter.tarpInstalled = true;
    world.shelter.value = 70;
    expect(make_camp_safe.plan(view(world, "npc1"))).toEqual([{ type: "move", to: "forest" }]);

    place(world, "npc1", "forest");
    expect(make_camp_safe.plan(view(world, "npc1"))).toEqual([
      { type: "gather_wood" },
      { type: "gather_wood" },
      { type: "move", to: "beach_camp" },
    ]);

    place(world, "npc1", "beach_camp");
    give(world, "npc1", "wood");
    expect(make_camp_safe.plan(view(world, "npc1"))).toEqual([{ type: "repair_shelter" }]);
  });

  it("goes back to camp from the Forest with full hands", () => {
    const world = createWorld(1);
    place(world, "npc1", "forest");
    give(world, "npc1", "wood");
    give(world, "npc1", "wood");
    expect(make_camp_safe.plan(view(world, "npc1"))).toEqual([{ type: "move", to: "beach_camp" }]);
  });

  it("moves on to repairs when the Wreckage is searched out without a tarp", () => {
    const world = createWorld(1);
    world.npcs.npc1.wreckageSearchedOut = true;
    place(world, "npc1", "wreckage");
    expect(make_camp_safe.plan(view(world, "npc1"))).toEqual([{ type: "move", to: "beach_camp" }]);

    place(world, "npc1", "beach_camp");
    expect(make_camp_safe.plan(view(world, "npc1"))).toEqual([{ type: "move", to: "forest" }]);
    expect(make_camp_safe.isDropped(view(world, "npc1"))).toBeNull();
  });

  it("is done only at Beach Camp, with the shelter at the target and the tarp part over", () => {
    const world = createWorld(1);
    world.shelter.value = 80;
    expect(make_camp_safe.isDone(view(world, "npc1"))).toBe(false);

    world.shelter.tarpInstalled = true;
    expect(make_camp_safe.isDone(view(world, "npc1"))).toBe(true);

    place(world, "npc1", "forest");
    expect(make_camp_safe.isDone(view(world, "npc1"))).toBe(false);

    place(world, "npc1", "beach_camp");
    world.shelter.tarpInstalled = false;
    world.npcs.npc1.wreckageSearchedOut = true;
    expect(make_camp_safe.isDone(view(world, "npc1"))).toBe(true);
  });

  it("becomes active again when he sees the shelter below the target", () => {
    const world = createWorld(1);
    world.shelter.value = 79;
    expect(make_camp_safe.isUndone?.(view(world, "npc1"))).toBe("shelter down to 79");
    world.shelter.value = 80;
    expect(make_camp_safe.isUndone?.(view(world, "npc1"))).toBeNull();
    // Away from camp he can't see it.
    world.shelter.value = 10;
    place(world, "npc1", "forest");
    expect(make_camp_safe.isUndone?.(view(world, "npc1"))).toBeNull();
  });

  it("repairs with a bundle lying at camp before walking to the Forest", () => {
    const world = createWorld(1);
    world.shelter.tarpInstalled = true;
    world.shelter.value = 50;
    const wood = lay(world, "beach_camp", "wood");
    expect(make_camp_safe.plan(view(world, "npc1"))).toEqual([
      { type: "take", itemId: wood },
      { type: "repair_shelter" },
    ]);
  });

  it("plans no work while Exhausted", () => {
    const world = createWorld(1);
    place(world, "npc1", "forest");
    exhaust(world, "npc1");
    expect(make_camp_safe.plan(view(world, "npc1"))).toBeNull();
  });
});

describe("keep_wood_reserve", () => {
  it("is never done", () => {
    const world = createWorld(1);
    lay(world, "beach_camp", "wood");
    expect(keep_wood_reserve.isDone(view(world, "npc1"))).toBe(false);
    expect(keep_wood_reserve.isDropped(view(world, "npc1"))).toBeNull();
  });

  it("fetches one bundle when camp has no dry wood", () => {
    const world = createWorld(1);
    lay(world, "beach_camp", "wood", true);
    expect(keep_wood_reserve.plan(view(world, "npc1"))).toEqual([{ type: "move", to: "forest" }]);

    place(world, "npc1", "forest");
    expect(keep_wood_reserve.plan(view(world, "npc1"))).toEqual([
      { type: "gather_wood" },
      { type: "move", to: "beach_camp" },
    ]);

    place(world, "npc1", "beach_camp");
    const wood = give(world, "npc1", "wood");
    expect(keep_wood_reserve.plan(view(world, "npc1"))).toEqual([{ type: "drop", itemId: wood }]);
  });

  it("has no plan at camp when the reserve is there", () => {
    const world = createWorld(1);
    lay(world, "beach_camp", "wood");
    expect(keep_wood_reserve.plan(view(world, "npc1"))).toBeNull();
  });

  it("heads home from anywhere else", () => {
    const world = createWorld(1);
    knowAll(world, "npc1");
    place(world, "npc1", "cave");
    expect(keep_wood_reserve.plan(view(world, "npc1"))).toEqual([
      { type: "move", to: "forest" },
      { type: "move", to: "beach_camp" },
    ]);
  });
});

describe("map_island", () => {
  it("explores the Forest first, then the Cave", () => {
    const world = createWorld(1);
    expect(map_island.plan(view(world, "npc2"))).toEqual([{ type: "move", to: "forest" }, { type: "explore" }]);

    const sarah = world.characters.npc2;
    place(world, "npc2", "forest");
    sarah.knownLocations.push("cave", "hilltop");
    sarah.seenLocations = [];
    sarah.knownRoutes.push(["forest", "cave"], ["forest", "hilltop"]);
    expect(map_island.isDone(view(world, "npc2"))).toBe(false);
    expect(map_island.plan(view(world, "npc2"))).toEqual([{ type: "move", to: "cave" }, { type: "explore" }]);
  });

  it("is done when the Cave and both Hilltop routes are known", () => {
    const world = createWorld(1);
    expect(map_island.isDone(view(world, "npc2"))).toBe(false);
    knowAll(world, "npc2");
    expect(map_island.isDone(view(world, "npc2"))).toBe(true);
  });

  it("explores even while Exhausted", () => {
    const world = createWorld(1);
    exhaust(world, "npc2");
    expect(map_island.plan(view(world, "npc2"))).toEqual([{ type: "move", to: "forest" }, { type: "explore" }]);
  });
});

describe("keep_flashlight", () => {
  it("goes to the Wreckage, searches, and takes the flashlight", () => {
    const world = createWorld(1);
    expect(keep_flashlight.plan(view(world, "npc2"))).toEqual([
      { type: "move", to: "wreckage" },
      { type: "search" },
    ]);

    place(world, "npc2", "wreckage");
    expect(keep_flashlight.plan(view(world, "npc2"))).toEqual([{ type: "search" }]);

    const flashlight = lay(world, "wreckage", "flashlight");
    expect(keep_flashlight.plan(view(world, "npc2"))).toEqual([{ type: "take", itemId: flashlight }]);
  });

  it("is done when carrying the flashlight", () => {
    const world = createWorld(1);
    expect(keep_flashlight.isDone(view(world, "npc2"))).toBe(false);
    give(world, "npc2", "flashlight");
    expect(keep_flashlight.isDone(view(world, "npc2"))).toBe(true);
  });

  it("is dropped when the Wreckage is searched out and no flashlight is there", () => {
    const world = createWorld(1);
    world.npcs.npc2.wreckageSearchedOut = true;
    // Away from the Wreckage she can't tell yet, so she goes to look (no search).
    expect(keep_flashlight.isDropped(view(world, "npc2"))).toBeNull();
    expect(keep_flashlight.plan(view(world, "npc2"))).toEqual([{ type: "move", to: "wreckage" }]);

    place(world, "npc2", "wreckage");
    expect(keep_flashlight.isDropped(view(world, "npc2"))).toBe("flashlight not found at the Wreckage");

    lay(world, "wreckage", "flashlight");
    expect(keep_flashlight.isDropped(view(world, "npc2"))).toBeNull();
  });
});

describe("signal_rescue", () => {
  it("has no plan until a route to the Hilltop is known", () => {
    const world = createWorld(1);
    expect(signal_rescue.plan(view(world, "npc2"))).toBeNull();
    knowAll(world, "npc2");
    expect(signal_rescue.plan(view(world, "npc2"))).not.toBeNull();
  });

  it("gets the lighter first", () => {
    const world = createWorld(1);
    knowAll(world, "npc2");
    expect(signal_rescue.plan(view(world, "npc2"))).toEqual([
      { type: "move", to: "wreckage" },
      { type: "search" },
    ]);

    place(world, "npc2", "wreckage");
    expect(signal_rescue.plan(view(world, "npc2"))).toEqual([{ type: "search" }]);
  });

  it("takes a lighter she sees and carries on with the fire", () => {
    const world = createWorld(1);
    knowAll(world, "npc2");
    place(world, "npc2", "forest");
    const lighter = lay(world, "forest", "lighter");
    expect(signal_rescue.plan(view(world, "npc2"))).toEqual([
      { type: "take", itemId: lighter },
      { type: "gather_wood" },
      { type: "gather_wood" },
      { type: "move", to: "hilltop" },
    ]);
  });

  it("hauls wood to the Hilltop, builds, and lights", () => {
    const world = createWorld(1);
    knowAll(world, "npc2");
    give(world, "npc2", "lighter");
    expect(signal_rescue.plan(view(world, "npc2"))).toEqual([{ type: "move", to: "forest" }]);

    place(world, "npc2", "hilltop");
    const a = give(world, "npc2", "wood");
    const b = give(world, "npc2", "wood");
    expect(signal_rescue.plan(view(world, "npc2"))).toEqual([
      { type: "drop", itemId: a },
      { type: "drop", itemId: b },
    ]);

    world.characters.npc2.inventory = world.characters.npc2.inventory.filter((i) => i.kind !== "wood");
    expect(signal_rescue.plan(view(world, "npc2"))).toEqual([{ type: "move", to: "forest" }]);

    for (let i = 0; i < world.rules.signalFire.buildWood; i++) lay(world, "hilltop", "wood");
    expect(signal_rescue.plan(view(world, "npc2"))).toEqual([{ type: "build_fire" }]);

    world.fire.state = "built";
    expect(signal_rescue.plan(view(world, "npc2"))).toEqual([{ type: "light_fire" }]);

    // Lit is not done: she keeps the fire burning.
    world.fire.state = "lit";
    expect(signal_rescue.isDone(view(world, "npc2"))).toBe(false);
  });

  it("does not build with wet wood, and waits for it to dry instead of hauling more", () => {
    const world = createWorld(1);
    knowAll(world, "npc2");
    give(world, "npc2", "lighter");
    place(world, "npc2", "hilltop");
    for (let i = 0; i < world.rules.signalFire.buildWood; i++) lay(world, "hilltop", "wood", true);
    expect(signal_rescue.plan(view(world, "npc2"))).toBeNull();
  });

  it("keeps hauling while there is not enough wood here, wet or dry", () => {
    const world = createWorld(1);
    knowAll(world, "npc2");
    give(world, "npc2", "lighter");
    place(world, "npc2", "hilltop");
    for (let i = 0; i < world.rules.signalFire.buildWood - 1; i++) lay(world, "hilltop", "wood", true);
    expect(signal_rescue.plan(view(world, "npc2"))).toEqual([{ type: "move", to: "forest" }]);
  });

  describe("tending a lit fire", () => {
    /** Sarah at the Hilltop with a lit fire of the given fuel hours (1 h = 120 units). */
    function litFire(fuelHours: number): World {
      const world = createWorld(1);
      knowAll(world, "npc2");
      place(world, "npc2", "hilltop");
      world.fire = { state: "lit", fuel: fuelHours * 120, wet: false, dryHours: 0 };
      return world;
    }

    it("adds carried wood while there is room, dry bundles first", () => {
      const world = litFire(5);
      const wet = createItem(world, "wood");
      if (wet.kind === "wood") wet.wet = true;
      world.characters.npc2.inventory.push(wet);
      const dry = give(world, "npc2", "wood");
      expect(signal_rescue.plan(view(world, "npc2"))).toEqual([
        { type: "add_wood", itemId: dry },
        { type: "add_wood", itemId: wet.id },
      ]);
    });

    it("adds only as many bundles as fit under the fuel cap", () => {
      const world = litFire(6.5);
      const a = give(world, "npc2", "wood");
      give(world, "npc2", "wood");
      expect(signal_rescue.plan(view(world, "npc2"))).toEqual([{ type: "add_wood", itemId: a }]);
    });

    it("takes wood lying here and adds it", () => {
      const world = litFire(3);
      const wood = lay(world, "hilltop", "wood");
      expect(signal_rescue.plan(view(world, "npc2"))).toEqual([
        { type: "take", itemId: wood },
        { type: "add_wood", itemId: wood },
      ]);
    });

    it("fetches more wood when the fire is full and her hands are free", () => {
      const world = litFire(7.5);
      expect(signal_rescue.plan(view(world, "npc2"))).toEqual([{ type: "move", to: "forest" }]);
    });

    it("waits when the fire is full and her hands are full", () => {
      const world = litFire(7.5);
      give(world, "npc2", "wood");
      give(world, "npc2", "wood");
      expect(signal_rescue.plan(view(world, "npc2"))).toBeNull();
    });

    it("needs no lighter, and is not dropped for a missing lighter", () => {
      const world = litFire(3);
      world.npcs.npc2.wreckageSearchedOut = true;
      expect(signal_rescue.isDropped(view(world, "npc2"))).toBeNull();
      expect(signal_rescue.plan(view(world, "npc2"))).toEqual([{ type: "move", to: "forest" }]);
    });
  });

  it("does not plan to light in Heavy Rain or with a wet fire", () => {
    const world = createWorld(1, { weather: weatherPlan([], "heavy_rain") });
    knowAll(world, "npc2");
    give(world, "npc2", "lighter");
    place(world, "npc2", "hilltop");
    world.fire.state = "built";
    expect(signal_rescue.plan(view(world, "npc2"))).toBeNull();

    const clear = createWorld(1);
    knowAll(clear, "npc2");
    give(clear, "npc2", "lighter");
    place(clear, "npc2", "hilltop");
    clear.fire.state = "built";
    clear.fire.wet = true;
    expect(signal_rescue.plan(view(clear, "npc2"))).toBeNull();
  });

  it("is dropped when the Wreckage is searched out and no lighter is there", () => {
    const world = createWorld(1);
    knowAll(world, "npc2");
    world.npcs.npc2.wreckageSearchedOut = true;
    expect(signal_rescue.isDropped(view(world, "npc2"))).toBeNull();
    place(world, "npc2", "wreckage");
    expect(signal_rescue.isDropped(view(world, "npc2"))).toBe("lighter not found at the Wreckage");
  });
});
