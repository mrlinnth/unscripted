import { describe, expect, it } from "vitest";
import { createWorld, stepMinutes, submitAction } from "../index";
import type { Character, Item, World } from "../state";
import { FUEL_UNITS_PER_HOUR, fuelHours } from "./fire";
import { createItem } from "./items";

const HOUR = FUEL_UNITS_PER_HOUR;

function setup(changes: Record<number, string> = {}): World {
  const weather = Array.from({ length: 48 }, (_, h) => changes[h] ?? "clear");
  return createWorld(1, { weather });
}

function wood(world: World, wet = false): Item {
  const item = createItem(world, "wood");
  if (item.kind === "wood") item.wet = wet;
  return item;
}

function pile(world: World, location: string, dry: number, wet = 0): void {
  const items = world.locations[location]?.items;
  for (let i = 0; i < dry; i++) items?.push(wood(world));
  for (let i = 0; i < wet; i++) items?.push(wood(world, true));
}

function atHilltop(world: World): Character {
  const player = world.characters.player;
  player.location = "hilltop";
  return player;
}

function lighter(world: World, character: Character, usesLeft = 3): Item {
  const item = createItem(world, "lighter");
  if (item.kind === "lighter") item.usesLeft = usesLeft;
  character.inventory.push(item);
  return item;
}

function builtFire(world: World, hours = 4): void {
  world.fire = { state: "built", fuel: hours * HOUR, wet: false, dryHours: 0 };
}

function litFire(world: World, hours = 4): void {
  world.fire = { state: "lit", fuel: hours * HOUR, wet: false, dryHours: 0 };
}

describe("build fire (A.6)", () => {
  it("uses 6 dry bundles at the Hilltop and makes a Built fire with 4 hours", () => {
    const world = setup();
    atHilltop(world);
    pile(world, "hilltop", 7);
    expect(submitAction(world, "player", { type: "build_fire" }).ok).toBe(true);
    stepMinutes(world, 60);
    expect(world.fire).toEqual({ state: "built", fuel: 4 * HOUR, wet: false, dryHours: 0 });
    expect(world.locations.hilltop?.items).toHaveLength(1);
    const changed = world.events.filter((e) => e.type === "fire_changed");
    expect(changed).toEqual([
      { minute: 60, type: "fire_changed", data: { from: "none", to: "built", fuelHours: 4, by: "player" } },
    ]);
  });

  it("is rejected with fewer than 6 dry bundles; wet ones do not count", () => {
    const world = setup();
    atHilltop(world);
    pile(world, "hilltop", 5, 3);
    expect(submitAction(world, "player", { type: "build_fire" })).toEqual({
      ok: false,
      reason: "needs 6 dry wood bundles here",
    });
  });

  it("is interrupted when rain wets the pile", () => {
    const world = setup({ 1: "light_rain" });
    atHilltop(world);
    pile(world, "hilltop", 6);
    stepMinutes(world, 30);
    submitAction(world, "player", { type: "build_fire" });
    stepMinutes(world, 31); // wet during 09:00–09:01
    expect(world.characters.player.action).toBeNull();
    expect(world.fire.state).toBe("none");
    const interrupted = world.events.filter((e) => e.type === "action_interrupted");
    expect(interrupted).toMatchObject([{ minute: 61, data: { reason: "needs 6 dry wood bundles here" } }]);
  });
});

describe("add wood", () => {
  it("adds 1 hour per bundle up to the 8-hour cap", () => {
    const world = setup();
    const player = atHilltop(world);
    builtFire(world);
    for (let i = 0; i < 5; i++) {
      player.inventory.push(wood(world));
      expect(submitAction(world, "player", { type: "add_wood" }).ok).toBe(true);
      stepMinutes(world, 5);
    }
    expect(fuelHours(world.fire)).toBe(8);
    expect(player.inventory).toEqual([]);
  });

  it("makes the fire wet when a wet bundle is added, which blocks lighting", () => {
    const world = setup();
    const player = atHilltop(world);
    builtFire(world);
    lighter(world, player);
    player.inventory.push(wood(world, true));
    submitAction(world, "player", { type: "add_wood" });
    stepMinutes(world, 5);
    expect(world.fire.wet).toBe(true);
    expect(submitAction(world, "player", { type: "light_fire" })).toEqual({ ok: false, reason: "fire is wet" });
  });

  it("is rejected with no fire built", () => {
    const world = setup();
    const player = atHilltop(world);
    player.inventory.push(wood(world));
    expect(submitAction(world, "player", { type: "add_wood" })).toEqual({ ok: false, reason: "no fire built" });
  });
});

describe("light fire", () => {
  it("lights a Built, dry fire and uses one lighter use only on success", () => {
    const world = setup({ 0: "heavy_rain" });
    const player = atHilltop(world);
    builtFire(world);
    world.fire.wet = false;
    const item = lighter(world, player);

    // Rejected in Heavy Rain: no use lost. (The fire also gets wet: dry it again.)
    expect(submitAction(world, "player", { type: "light_fire" })).toEqual({
      ok: false,
      reason: "cannot light in heavy_rain",
    });
    expect(item.kind === "lighter" && item.usesLeft).toBe(3);

    stepMinutes(world, 60);
    world.fire.wet = false;
    expect(submitAction(world, "player", { type: "light_fire" }).ok).toBe(true);
    stepMinutes(world, 10);
    expect(world.fire.state).toBe("lit");
    expect(item.kind === "lighter" && item.usesLeft).toBe(2);
  });

  it("is rejected in Storm and with a used-up lighter", () => {
    const world = setup({ 0: "storm" });
    const player = atHilltop(world);
    builtFire(world);
    lighter(world, player, 1);
    expect(submitAction(world, "player", { type: "light_fire" })).toEqual({
      ok: false,
      reason: "cannot light in storm",
    });

    const calm = setup();
    const p2 = atHilltop(calm);
    builtFire(calm);
    lighter(calm, p2, 0);
    expect(submitAction(calm, "player", { type: "light_fire" })).toEqual({
      ok: false,
      reason: "lighter is used up",
    });
  });

  it("is interrupted when Heavy Rain starts during lighting", () => {
    const world = setup({ 1: "heavy_rain" });
    const player = atHilltop(world);
    builtFire(world);
    const item = lighter(world, player);
    stepMinutes(world, 55);
    submitAction(world, "player", { type: "light_fire" });
    stepMinutes(world, 5);
    expect(world.fire.state).toBe("built");
    expect(item.kind === "lighter" && item.usesLeft).toBe(3);
    const interrupted = world.events.filter((e) => e.type === "action_interrupted");
    expect(interrupted).toMatchObject([{ minute: 60, data: { reason: "cannot light in heavy_rain" } }]);
  });
});

describe("burning (A.6)", () => {
  it.each([
    ["clear", 3],
    ["cloudy", 3],
    ["light_rain", 2.5],
    ["heavy_rain", 2],
  ])("in %s, a 4-hour fire has %d hours after one hour", (weather, expected) => {
    const world = setup({ 0: weather });
    litFire(world);
    stepMinutes(world, 60);
    expect(fuelHours(world.fire)).toBe(expected);
    expect(world.fire.state).toBe("lit");
  });

  it("returns to None when fuel runs out", () => {
    const world = setup();
    world.fire = { state: "lit", fuel: 10, wet: false, dryHours: 0 };
    stepMinutes(world, 5);
    expect(world.fire.state).toBe("none");
    expect(world.events.filter((e) => e.type === "fire_changed")).toEqual([
      { minute: 5, type: "fire_changed", data: { from: "lit", to: "none", fuelHours: 0, reason: "burned out" } },
    ]);
  });

  it("goes out below 2 hours in Heavy Rain, keeps its fuel, and becomes wet (T3 shape)", () => {
    const world = setup({ 1: "heavy_rain", 2: "heavy_rain" });
    litFire(world, 4);
    stepMinutes(world, 60); // Clear hour: 3 hours left
    stepMinutes(world, 30); // Heavy Rain: exactly 2 hours, still lit
    expect(world.fire.state).toBe("lit");
    stepMinutes(world, 1);
    expect(world.fire.state).toBe("built");
    expect(world.fire.wet).toBe(true);
    expect(fuelHours(world.fire)).toBeCloseTo(1.967, 3);
    const out = world.events.filter((e) => e.type === "fire_changed");
    expect(out).toMatchObject([{ minute: 91, data: { from: "lit", to: "built", reason: "put out by heavy_rain" } }]);
  });
});

describe("wet wood (A.6)", () => {
  it("stays dry under shelter at camp and in the Cave, gets wet elsewhere", () => {
    const world = setup({ 0: "light_rain" });
    const { player, npc1, npc2 } = world.characters;
    player.inventory.push(wood(world)); // at camp, shelter 40
    npc1.location = "cave";
    npc1.inventory.push(wood(world));
    npc2.location = "forest";
    npc2.inventory.push(wood(world));
    pile(world, "beach_camp", 1);
    pile(world, "hilltop", 1);
    stepMinutes(world, 1);

    const wet = (item: Item | undefined): boolean => item?.kind === "wood" && item.wet;
    expect(wet(player.inventory[0])).toBe(false);
    expect(wet(npc1.inventory[0])).toBe(false);
    expect(wet(npc2.inventory[0])).toBe(true);
    expect(wet(world.locations.beach_camp?.items[0])).toBe(false);
    expect(wet(world.locations.hilltop?.items[0])).toBe(true);
  });

  it("gets wet at camp once shelter is below 30", () => {
    const world = createWorld(1, {
      weather: Array.from({ length: 48 }, (_, h) => (h === 0 ? "light_rain" : "clear")),
      rules: { starting: { shelter: 20 } },
    });
    pile(world, "beach_camp", 1);
    stepMinutes(world, 1);
    expect(world.locations.beach_camp?.items[0]).toMatchObject({ wet: true });
  });

  it("dries after 2 Clear hours, not after 1", () => {
    const world = setup({ 0: "light_rain" });
    pile(world, "forest", 1);
    stepMinutes(world, 60); // wet during the rain hour
    expect(world.locations.forest?.items[0]).toMatchObject({ wet: true });
    stepMinutes(world, 60);
    expect(world.locations.forest?.items[0]).toMatchObject({ wet: true, dryHours: 1 });
    stepMinutes(world, 60);
    expect(world.locations.forest?.items[0]).toMatchObject({ wet: false, dryHours: 0 });
  });

  it("resets the drying count when rain comes back", () => {
    const world = setup({ 0: "light_rain", 2: "light_rain" });
    pile(world, "forest", 1);
    stepMinutes(world, 4 * 60); // rain, clear, rain, clear
    expect(world.locations.forest?.items[0]).toMatchObject({ wet: true, dryHours: 1 });
  });

  it("wets a Built fire in rain and dries it after 2 Clear hours", () => {
    const world = setup({ 0: "light_rain" });
    builtFire(world);
    stepMinutes(world, 60);
    expect(world.fire.wet).toBe(true);
    stepMinutes(world, 120);
    expect(world.fire.wet).toBe(false);
  });
});
