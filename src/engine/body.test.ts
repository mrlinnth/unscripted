import { describe, expect, it } from "vitest";
import { fatigueCondition, isAsleep, workBlockReason } from "./body";
import { cancelAction, createWorld, stepMinutes, submitAction } from "./index";
import type { World } from "./state";

/** All-Clear weather with some hours changed: { hourIndex: state }. */
function setup(changes: Record<number, string> = {}): World {
  const weather = Array.from({ length: 48 }, (_, h) => changes[h] ?? "clear");
  return createWorld(1, { weather });
}

/** Sets the fatigue counter (A.8 units); stored in half-points. */
function setCounter(world: World, id: "player" | "npc1" | "npc2", counter: number): void {
  world.characters[id].fatigue = counter * 2;
}

const counter = (world: World, id: "player" | "npc1" | "npc2" = "player"): number =>
  world.characters[id].fatigue / 2;

function events(world: World, type: string): World["events"] {
  return world.events.filter((e) => e.type === type);
}

describe("fatigue per minute (A.8)", () => {
  it("adds +0.5 when idle or waiting, +1 when working or travelling", () => {
    const world = setup();
    submitAction(world, "npc1", { type: "wait", minutes: 10 });
    submitAction(world, "npc2", { type: "explore" }); // work
    submitAction(world, "player", { type: "move", to: "forest" }); // travel, 20 min
    stepMinutes(world, 10);
    expect(counter(world, "npc1")).toBe(5);
    expect(counter(world, "npc2")).toBe(10);
    expect(counter(world, "player")).toBe(10);
    stepMinutes(world, 10);
    expect(counter(world, "npc1")).toBe(10); // idle after the wait: still +0.5
  });

  it("recovers −2 at camp with shelter 30+, −1.5 in the Cave, −1 elsewhere", () => {
    const world = setup();
    world.characters.npc1.location = "cave";
    world.characters.npc2.location = "forest";
    for (const id of ["player", "npc1", "npc2"] as const) {
      setCounter(world, id, 100);
      submitAction(world, id, { type: "sleep", minutes: 10 });
    }
    stepMinutes(world, 10);
    expect(counter(world, "player")).toBe(80);
    expect(counter(world, "npc1")).toBe(85);
    expect(counter(world, "npc2")).toBe(90);
  });

  it("sleeps at the 'elsewhere' rate at camp when shelter is below 30", () => {
    const world = createWorld(1, { rules: { starting: { shelter: 20 } } });
    setCounter(world, "player", 100);
    submitAction(world, "player", { type: "sleep", minutes: 10 });
    stepMinutes(world, 10);
    expect(counter(world)).toBe(90);
  });

  it("never goes below 0", () => {
    const world = setup();
    setCounter(world, "player", 5);
    submitAction(world, "player", { type: "sleep", minutes: 10 });
    stepMinutes(world, 10);
    expect(counter(world)).toBe(0);
  });

  it("logs condition changes at 480 and 720", () => {
    const world = setup();
    setCounter(world, "player", 479);
    submitAction(world, "player", { type: "explore" });
    stepMinutes(world, 1);
    expect(fatigueCondition(world.characters.player, world.rules)).toBe("tired");
    expect(events(world, "fatigue_changed")).toEqual([
      { minute: 1, type: "fatigue_changed", actor: "player", data: { from: "rested", to: "tired" } },
    ]);

    setCounter(world, "npc1", 719);
    submitAction(world, "npc1", { type: "explore" });
    stepMinutes(world, 1);
    expect(fatigueCondition(world.characters.npc1, world.rules)).toBe("exhausted");
  });
});

describe("collapse (A.8)", () => {
  it("collapses at 960, sleeps where they are, and wakes below 480", () => {
    const world = setup();
    setCounter(world, "player", 959);
    submitAction(world, "player", { type: "explore" });
    stepMinutes(world, 1);

    const player = world.characters.player;
    expect(counter(world)).toBe(960);
    expect(player.action?.action.type).toBe("collapse");
    expect(isAsleep(player)).toBe(true);
    expect(events(world, "action_interrupted").map((e) => e.data.reason)).toEqual(["collapsed"]);
    expect(events(world, "collapse")).toHaveLength(1);

    // Cannot act or cancel while collapsed.
    expect(submitAction(world, "player", { type: "wait", minutes: 5 }).ok).toBe(false);
    expect(cancelAction(world, "player")).toEqual({ ok: false, reason: "collapse cannot be cancelled" });

    // At camp with shelter 40: −2 per minute. 960 → below 480 after 241 minutes.
    stepMinutes(world, 240);
    expect(player.action?.action.type).toBe("collapse");
    stepMinutes(world, 1);
    expect(player.action).toBeNull();
    expect(counter(world)).toBe(478);
  });

  it("collapses on arrival when the counter is reached while travelling", () => {
    const world = setup();
    setCounter(world, "player", 955);
    submitAction(world, "player", { type: "move", to: "forest" }); // 20 min (Exhausted ×1.5 = 30)
    stepMinutes(world, 10);
    expect(counter(world)).toBeGreaterThanOrEqual(960);
    expect(world.characters.player.action?.action.type).toBe("move");
    stepMinutes(world, 20);
    expect(world.characters.player.location).toBe("forest");
    expect(world.characters.player.action?.action.type).toBe("collapse");
  });

  it("cannot be chosen as an action", () => {
    const world = setup();
    expect(submitAction(world, "player", { type: "collapse" })).toEqual({
      ok: false,
      reason: "collapse cannot be chosen",
    });
  });
});

describe("sleep", () => {
  it("without minutes ends when fatigue reaches 0", () => {
    const world = setup();
    setCounter(world, "player", 10);
    submitAction(world, "player", { type: "sleep" });
    stepMinutes(world, 4);
    expect(world.characters.player.action?.action.type).toBe("sleep");
    stepMinutes(world, 1);
    expect(counter(world)).toBe(0);
    expect(world.characters.player.action).toBeNull();
    expect(events(world, "action_completed")).toHaveLength(1);
  });

  it("with minutes ends on time and can be cancelled", () => {
    const world = setup();
    submitAction(world, "player", { type: "sleep", minutes: 30 });
    stepMinutes(world, 30);
    expect(world.characters.player.action).toBeNull();

    submitAction(world, "player", { type: "sleep" });
    expect(cancelAction(world, "player")).toEqual({ ok: true });
    expect(submitAction(world, "player", { type: "sleep", minutes: 0 }).ok).toBe(false);
  });
});

describe("health (A.9)", () => {
  it("loses 5 per Storm hour outside protection and none in the Cave or sheltered camp", () => {
    const world = setup({ 1: "storm", 2: "storm", 3: "storm" }); // 09:00–12:00
    world.characters.player.location = "forest";
    world.characters.npc1.location = "cave";
    stepMinutes(world, 120); // 10:00
    expect(world.characters.player.health).toBe(95);
    stepMinutes(world, 120); // 12:00
    expect(world.characters.player.health).toBe(85);
    expect(world.characters.npc1.health).toBe(100);
    expect(world.characters.npc2.health).toBe(100); // camp, shelter 40
  });

  it("heals 2 per hour while asleep under protection, capped at 100", () => {
    const world = setup();
    const { player, npc1, npc2 } = world.characters;
    player.health = 90;
    npc1.health = 90;
    npc1.location = "forest";
    npc2.health = 99;
    for (const id of ["player", "npc1", "npc2"] as const) {
      submitAction(world, id, { type: "sleep", minutes: 120 });
    }
    stepMinutes(world, 120);
    expect(player.health).toBe(94);
    expect(npc1.health).toBe(90); // not protected
    expect(npc2.health).toBe(100);
  });

  it("dies at 0: stops the action, rejects new ones, no more fatigue", () => {
    const world = setup({ 1: "storm" });
    const player = world.characters.player;
    player.location = "forest";
    player.health = 5;
    stepMinutes(world, 60);
    submitAction(world, "player", { type: "wait", minutes: 120 });
    stepMinutes(world, 1);
    expect(player.alive).toBe(true);
    const fatigueBefore = player.fatigue;
    stepMinutes(world, 59); // 10:00, end of the Storm hour

    expect(player.alive).toBe(false);
    expect(player.health).toBe(0);
    expect(player.action).toBeNull();
    const atTen = world.events.filter((e) => e.minute === 120);
    expect(atTen.map((e) => e.type)).toEqual(["action_interrupted", "death", "weather_changed"]);
    expect(atTen[0]?.data.reason).toBe("died");
    expect(atTen[1]?.data).toEqual({ cause: "exposure to storm" });

    const deadFatigue = player.fatigue;
    expect(deadFatigue).toBeGreaterThan(fatigueBefore);
    stepMinutes(world, 30);
    expect(player.fatigue).toBe(deadFatigue);
    expect(submitAction(world, "player", { type: "wait", minutes: 5 })).toEqual({
      ok: false,
      reason: "character is dead",
    });
  });
});

describe("work blocks", () => {
  it("blocks work when Exhausted or health is below 30", () => {
    const world = setup();
    const player = world.characters.player;
    expect(workBlockReason(world, player)).toBeNull();
    setCounter(world, "player", 720);
    expect(workBlockReason(world, player)).toBe("too exhausted");
    setCounter(world, "player", 0);
    player.health = 29;
    expect(workBlockReason(world, player)).toBe("health too low");
  });
});
