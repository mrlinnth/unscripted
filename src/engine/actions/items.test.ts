import { describe, expect, it } from "vitest";
import { createWorld, stepMinutes, submitAction } from "../index";
import type { Character, Item, World } from "../state";
import { createItem, freeSlots } from "./items";

function setup(changes: Record<number, string> = {}): World {
  const weather = Array.from({ length: 48 }, (_, h) => changes[h] ?? "clear");
  return createWorld(1, { weather, searchOrder: ["lighter", "tarp", "flashlight"] });
}

function give(world: World, character: Character, ...kinds: Item["kind"][]): Item[] {
  return kinds.map((kind) => {
    const item = createItem(world, kind);
    character.inventory.push(item);
    return item;
  });
}

function lay(world: World, location: string, kind: Item["kind"]): Item {
  const item = createItem(world, kind);
  world.locations[location]?.items.push(item);
  return item;
}

const ids = (items: Item[]): string[] => items.map((item) => item.id);

describe("carry slots (A.4)", () => {
  it("counts wood and tarp as 1 slot, lighter and flashlight as 0", () => {
    const world = setup();
    const player = world.characters.player;
    expect(freeSlots(world, player)).toBe(2);
    give(world, player, "lighter", "flashlight");
    expect(freeSlots(world, player)).toBe(2);
    give(world, player, "wood", "tarp");
    expect(freeSlots(world, player)).toBe(0);
  });

  it("rejects taking a 1-slot item when full, but allows a 0-slot item", () => {
    const world = setup();
    const player = world.characters.player;
    give(world, player, "wood", "wood");
    const tarp = lay(world, "beach_camp", "tarp");
    const lighter = lay(world, "beach_camp", "lighter");

    expect(submitAction(world, "player", { type: "take", itemId: tarp.id })).toEqual({
      ok: false,
      reason: "no free carry slot",
    });
    expect(submitAction(world, "player", { type: "take", itemId: lighter.id }).ok).toBe(true);
    stepMinutes(world, 1);
    expect(ids(player.inventory)).toContain(lighter.id);
    expect(world.locations.beach_camp?.items.map((i) => i.id)).toEqual([tarp.id]);
  });
});

describe("take, drop, give", () => {
  it("drops an item where the character is", () => {
    const world = setup();
    const player = world.characters.player;
    const [wood] = give(world, player, "wood");
    submitAction(world, "player", { type: "drop", itemId: wood?.id ?? "" });
    stepMinutes(world, 1);
    expect(player.inventory).toEqual([]);
    expect(ids(world.locations.beach_camp?.items ?? [])).toEqual([wood?.id]);
    expect(submitAction(world, "player", { type: "drop", itemId: "nope" }).ok).toBe(false);
  });

  it("gives only to a living character who is present and has room", () => {
    const world = setup();
    const { player, npc1, npc2 } = world.characters;
    const [wood] = give(world, player, "wood");
    const itemId = wood?.id ?? "";

    npc2.location = "forest";
    expect(submitAction(world, "player", { type: "give", itemId, to: "npc2" })).toEqual({
      ok: false,
      reason: "npc2 is not here",
    });
    expect(submitAction(world, "player", { type: "give", itemId, to: "player" }).ok).toBe(false);

    give(world, npc1, "wood", "tarp");
    expect(submitAction(world, "player", { type: "give", itemId, to: "npc1" })).toEqual({
      ok: false,
      reason: "npc1 has no free carry slot",
    });

    npc1.inventory = [];
    npc1.alive = false;
    expect(submitAction(world, "player", { type: "give", itemId, to: "npc1" }).ok).toBe(false);

    npc1.alive = true;
    expect(submitAction(world, "player", { type: "give", itemId, to: "npc1" }).ok).toBe(true);
    stepMinutes(world, 1);
    expect(player.inventory).toEqual([]);
    expect(ids(npc1.inventory)).toEqual([itemId]);
  });

  it("lets only the first of two characters take the same item in the same minute", () => {
    const world = setup();
    const lighter = lay(world, "beach_camp", "lighter");
    submitAction(world, "npc1", { type: "take", itemId: lighter.id });
    submitAction(world, "player", { type: "take", itemId: lighter.id });
    stepMinutes(world, 1);
    expect(ids(world.characters.player.inventory)).toEqual([lighter.id]);
    expect(world.characters.npc1.inventory).toEqual([]);
    const interrupted = world.events.filter((e) => e.type === "action_interrupted");
    expect(interrupted).toMatchObject([{ actor: "npc1", data: { reason: `${lighter.id} is not here` } }]);
  });
});

describe("search (A.5)", () => {
  it("finds items in the forced order, then nothing", () => {
    const world = setup();
    const player = world.characters.player;
    player.location = "wreckage";
    const found: unknown[] = [];
    for (let i = 0; i < 4; i++) {
      expect(submitAction(world, "player", { type: "search" }).ok).toBe(true);
      stepMinutes(world, 30);
      const last = world.events[world.events.length - 1];
      found.push(last?.data.result);
    }
    const kinds = world.locations.wreckage?.items.map((item) => item.kind);
    expect(kinds).toEqual(["lighter", "tarp", "flashlight"]);
    expect(found[3]).toEqual({ found: null });
    expect(world.events.filter((e) => e.type === "item_found").map((e) => e.data.kind)).toEqual([
      "lighter",
      "tarp",
      "flashlight",
    ]);
  });

  it("leaves a found item at the Wreckage until someone takes it", () => {
    const world = setup();
    const { player, npc1 } = world.characters;
    player.location = "wreckage";
    npc1.location = "wreckage";
    submitAction(world, "player", { type: "search" });
    stepMinutes(world, 30);
    const lighter = world.locations.wreckage?.items[0];
    expect(lighter?.kind).toBe("lighter");
    expect(lighter?.kind === "lighter" && lighter.usesLeft).toBe(3);

    submitAction(world, "npc1", { type: "take", itemId: lighter?.id ?? "" });
    stepMinutes(world, 1);
    expect(npc1.inventory.map((i) => i.kind)).toEqual(["lighter"]);
    expect(world.locations.wreckage?.items).toEqual([]);
  });

  it("is rejected away from the Wreckage, when Exhausted, or with health under 30", () => {
    const world = setup();
    const player = world.characters.player;
    expect(submitAction(world, "player", { type: "search" })).toEqual({
      ok: false,
      reason: "must be at wreckage",
    });
    player.location = "wreckage";
    player.fatigue = 720 * 2;
    expect(submitAction(world, "player", { type: "search" })).toEqual({ ok: false, reason: "too exhausted" });
    player.fatigue = 0;
    player.health = 29;
    expect(submitAction(world, "player", { type: "search" })).toEqual({ ok: false, reason: "health too low" });
  });
});

describe("gather wood", () => {
  it("adds one dry bundle after 30 minutes in the Forest", () => {
    const world = setup();
    const player = world.characters.player;
    player.location = "forest";
    submitAction(world, "player", { type: "gather_wood" });
    stepMinutes(world, 29);
    expect(player.inventory).toEqual([]);
    stepMinutes(world, 1);
    expect(player.inventory).toMatchObject([{ kind: "wood", wet: false }]);
  });

  it("gives a wet bundle when gathered in rain", () => {
    const world = setup({ 0: "light_rain" });
    const player = world.characters.player;
    player.location = "forest";
    submitAction(world, "player", { type: "gather_wood" });
    stepMinutes(world, 30);
    expect(player.inventory).toMatchObject([{ kind: "wood", wet: true }]);
  });

  it("is rejected when full, Exhausted, health under 30, or outside the Forest", () => {
    const world = setup();
    const player = world.characters.player;
    expect(submitAction(world, "player", { type: "gather_wood" }).ok).toBe(false);
    player.location = "forest";
    give(world, player, "wood", "wood");
    expect(submitAction(world, "player", { type: "gather_wood" })).toEqual({
      ok: false,
      reason: "no free carry slot",
    });
    player.inventory = [];
    player.fatigue = 720 * 2;
    expect(submitAction(world, "player", { type: "gather_wood" })).toEqual({ ok: false, reason: "too exhausted" });
    player.fatigue = 0;
    player.health = 29;
    expect(submitAction(world, "player", { type: "gather_wood" })).toEqual({ ok: false, reason: "health too low" });
  });

  it("is interrupted on becoming Exhausted and adds no bundle", () => {
    const world = setup();
    const player = world.characters.player;
    player.location = "forest";
    player.fatigue = 715 * 2; // Tired: gather takes 38 minutes
    submitAction(world, "player", { type: "gather_wood" });
    expect(player.action?.endsAt).toBe(38);
    stepMinutes(world, 5); // +1 per minute: 720 = Exhausted
    expect(player.action).toBeNull();
    expect(player.inventory).toEqual([]);
    const interrupted = world.events.filter((e) => e.type === "action_interrupted");
    expect(interrupted).toMatchObject([{ minute: 5, data: { reason: "too exhausted" } }]);
  });
});
