import { describe, expect, it } from "vitest";
import { isProtected } from "../body";
import { createWorld, stepMinutes, submitAction } from "../index";
import type { Item, World } from "../state";
import { createItem } from "./items";

function setup(changes: Record<number, string> = {}, shelter?: number): World {
  const weather = Array.from({ length: 48 }, (_, h) => changes[h] ?? "clear");
  return createWorld(1, {
    weather,
    ...(shelter === undefined ? {} : { rules: { starting: { shelter } } }),
  });
}

function carry(world: World, kind: Item["kind"]): Item {
  const item = createItem(world, kind);
  world.characters.player.inventory.push(item);
  return item;
}

describe("repair shelter (A.10)", () => {
  it("uses one wood bundle and adds 20 after 60 minutes", () => {
    const world = setup();
    carry(world, "wood");
    expect(submitAction(world, "player", { type: "repair_shelter" }).ok).toBe(true);
    stepMinutes(world, 59);
    expect(world.shelter.value).toBe(40);
    stepMinutes(world, 1);
    expect(world.shelter.value).toBe(60);
    expect(world.characters.player.inventory).toEqual([]);
  });

  it("accepts wet wood and caps at 100", () => {
    const world = setup({}, 95);
    const wood = carry(world, "wood");
    if (wood.kind === "wood") wood.wet = true;
    submitAction(world, "player", { type: "repair_shelter" });
    stepMinutes(world, 60);
    expect(world.shelter.value).toBe(100);
  });

  it("is rejected without wood, away from camp, Exhausted, or health under 30", () => {
    const world = setup();
    const player = world.characters.player;
    expect(submitAction(world, "player", { type: "repair_shelter" })).toEqual({
      ok: false,
      reason: "no wood bundle carried",
    });
    carry(world, "wood");
    player.location = "forest";
    expect(submitAction(world, "player", { type: "repair_shelter" })).toEqual({
      ok: false,
      reason: "must be at beach_camp",
    });
    player.location = "beach_camp";
    player.fatigue = 720 * 2;
    expect(submitAction(world, "player", { type: "repair_shelter" })).toEqual({
      ok: false,
      reason: "too exhausted",
    });
    player.fatigue = 0;
    player.health = 29;
    expect(submitAction(world, "player", { type: "repair_shelter" })).toEqual({
      ok: false,
      reason: "health too low",
    });
  });

  it("keeps the wood and adds nothing when interrupted", () => {
    const world = setup();
    const player = world.characters.player;
    carry(world, "wood");
    player.fatigue = 715 * 2; // Tired: 75 minutes; Exhausted after 5
    submitAction(world, "player", { type: "repair_shelter" });
    expect(player.action?.endsAt).toBe(75);
    stepMinutes(world, 5);
    expect(player.action).toBeNull();
    expect(world.shelter.value).toBe(40);
    expect(player.inventory).toHaveLength(1);
  });
});

describe("install tarp (A.10)", () => {
  it("adds 30 once and uses up the tarp", () => {
    const world = setup();
    carry(world, "tarp");
    submitAction(world, "player", { type: "install_tarp" });
    stepMinutes(world, 30);
    expect(world.shelter).toEqual({ value: 70, tarpInstalled: true });
    expect(world.characters.player.inventory).toEqual([]);

    carry(world, "tarp");
    expect(submitAction(world, "player", { type: "install_tarp" })).toEqual({
      ok: false,
      reason: "tarp already installed",
    });
  });

  it("is rejected without a tarp", () => {
    const world = setup();
    expect(submitAction(world, "player", { type: "install_tarp" })).toEqual({
      ok: false,
      reason: "no tarp carried",
    });
  });
});

describe("weather loss and protection", () => {
  it("loses 10 per Storm hour: 40 to 10 over three hours (as in T2)", () => {
    const world = setup({ 6: "storm", 7: "storm", 8: "storm" }); // 14:00–17:00
    stepMinutes(world, 7 * 60); // 15:00
    expect(world.shelter.value).toBe(30);
    stepMinutes(world, 2 * 60); // 17:00
    expect(world.shelter.value).toBe(10);
    expect(isProtected(world, world.characters.player)).toBe(false);
  });

  it("loses 2 per Heavy Rain hour and never goes below 0", () => {
    const world = setup({ 0: "heavy_rain", 1: "heavy_rain" }, 3);
    stepMinutes(world, 60);
    expect(world.shelter.value).toBe(1);
    stepMinutes(world, 60);
    expect(world.shelter.value).toBe(0);
  });

  it("protects at 30 and stops protecting below 30", () => {
    const world = setup({}, 30);
    expect(isProtected(world, world.characters.player)).toBe(true);
    world.shelter.value = 29;
    expect(isProtected(world, world.characters.player)).toBe(false);
    world.characters.player.location = "cave";
    expect(isProtected(world, world.characters.player)).toBe(true);
  });

  it("checks health against the shelter as it was during the hour", () => {
    // Shelter 40 → 30 → 20 → 10 at 15:00, 16:00, 17:00. Health uses the value
    // before each hour's loss, so damage starts only for the 16:00–17:00 hour.
    const world = setup({ 6: "storm", 7: "storm", 8: "storm" });
    stepMinutes(world, 9 * 60); // 17:00
    expect(world.characters.player.health).toBe(95);
  });
});
