import { describe, expect, it } from "vitest";
import { loadWorldRules } from "../config";
import type { GameEvent } from "../events";
import { cancelAction, createWorld, gameMinuteAt, stepMinutes, submitAction } from "../index";
import type { Character, World } from "../state";
import { roundUpMinutes } from "./duration";

const rules = loadWorldRules();
const at = (day: number, time: string): number => gameMinuteAt(rules, day, time);

/** All-Clear weather with some hours changed: { hourIndex: state }. */
function weather(changes: Record<number, string> = {}): string[] {
  return Array.from({ length: 48 }, (_, h) => changes[h] ?? "clear");
}

function setup(changes: Record<number, string> = {}): World {
  return createWorld(1, { weather: weather(changes) });
}

function place(character: Character, location: string, routes: [string, string][] = []): void {
  character.location = location;
  for (const route of routes) character.knownRoutes.push(route);
  for (const [a, b] of routes) {
    for (const id of [a, b]) {
      if (!character.knownLocations.includes(id)) character.knownLocations.push(id);
    }
  }
}

function lastEvent(world: World): GameEvent | undefined {
  return world.events[world.events.length - 1];
}

function durationOf(character: Character): number | null {
  const current = character.action;
  return current && current.endsAt !== null ? current.endsAt - current.startedAt : null;
}

const TIRED = 500 * 2; // fatigue counter 500, stored in half-points

describe("duration rounding", () => {
  it("rounds up, ignoring floating-point noise", () => {
    expect(roundUpMinutes(30 * 1.1)).toBe(33);
    expect(roundUpMinutes(112.5)).toBe(113);
    expect(roundUpMinutes(40)).toBe(40);
  });
});

describe("move", () => {
  it("matches the A.3 example: Forest to Hilltop at night, Heavy Rain, Tired = 113 min", () => {
    const world = setup({ 11: "heavy_rain" }); // hour 11 = 19:00 on Day 1
    const player = world.characters.player;
    place(player, "forest", [["forest", "hilltop"]]);
    stepMinutes(world, at(1, "19:00"));
    player.fatigue = TIRED; // set after waiting, since idle time adds fatigue

    expect(submitAction(world, "player", { type: "move", to: "hilltop" })).toEqual({ ok: true });
    expect(durationOf(player)).toBe(113);

    stepMinutes(world, 112);
    expect(player.location).toBe("forest");
    stepMinutes(world, 1);
    expect(player.location).toBe("hilltop");
    expect(player.action).toBeNull();
    expect(lastEvent(world)).toMatchObject({ type: "action_completed", actor: "player" });
  });

  it("rejects a move with no known route and uses no time", () => {
    const world = setup();
    const result = submitAction(world, "player", { type: "move", to: "hilltop" });
    expect(result).toEqual({ ok: false, reason: "no known route from beach_camp to hilltop" });
    expect(world.minute).toBe(0);
    expect(world.characters.player.action).toBeNull();
    expect(lastEvent(world)).toEqual({
      minute: 0,
      type: "action_rejected",
      actor: "player",
      data: { action: { type: "move", to: "hilltop" }, reason: "no known route from beach_camp to hilltop" },
    });
  });

  it("rejects a route that exists but is not known yet", () => {
    const world = setup();
    place(world.characters.player, "forest");
    const result = submitAction(world, "player", { type: "move", to: "cave" });
    expect(result.ok).toBe(false);
  });

  it("closes Cave – Hilltop during Storm, but a traveller already on it arrives", () => {
    const world = setup({ 6: "storm" }); // 14:00–14:59 on Day 1
    const { player, npc1 } = world.characters;
    place(player, "cave", [["cave", "hilltop"]]);
    place(npc1, "cave", [["cave", "hilltop"]]);

    stepMinutes(world, at(1, "13:45"));
    expect(submitAction(world, "player", { type: "move", to: "hilltop" }).ok).toBe(true);
    expect(durationOf(player)).toBe(30);

    stepMinutes(world, 15); // 14:00, Storm
    const blocked = submitAction(world, "npc1", { type: "move", to: "hilltop" });
    expect(blocked).toEqual({ ok: false, reason: "route cave – hilltop is closed in storm" });

    stepMinutes(world, 15); // 14:15
    expect(player.location).toBe("hilltop");
    expect(npc1.location).toBe("cave");
  });

  it("uses the Storm travel modifier on open routes", () => {
    const world = setup({ 6: "storm" });
    place(world.characters.player, "forest", [["forest", "hilltop"]]);
    stepMinutes(world, at(1, "14:00"));
    submitAction(world, "player", { type: "move", to: "hilltop" });
    expect(durationOf(world.characters.player)).toBe(60);
  });
});

describe("flashlight", () => {
  function withFlashlight(battery: number): World {
    const world = setup();
    const player = world.characters.player;
    place(player, "forest", [["forest", "hilltop"]]);
    player.inventory.push({ id: "flashlight", kind: "flashlight", batteryMinutes: battery });
    return world;
  }

  function battery(world: World): number {
    const item = world.characters.player.inventory[0];
    return item?.kind === "flashlight" ? item.batteryMinutes : -1;
  }

  it("removes the night penalty and drains during night travel", () => {
    const world = withFlashlight(360);
    stepMinutes(world, at(1, "19:00"));
    submitAction(world, "player", { type: "move", to: "hilltop" });
    expect(durationOf(world.characters.player)).toBe(40);
    stepMinutes(world, 40);
    expect(world.characters.player.location).toBe("hilltop");
    expect(battery(world)).toBe(320);
  });

  it("drains only for the night part of a trip that starts in daylight", () => {
    const world = withFlashlight(360);
    stepMinutes(world, at(1, "18:20"));
    submitAction(world, "player", { type: "move", to: "hilltop" });
    expect(durationOf(world.characters.player)).toBe(40);
    stepMinutes(world, 40);
    expect(battery(world)).toBe(330); // night from 18:30 to 19:00
  });

  it("does not drain during daylight travel", () => {
    const world = withFlashlight(360);
    stepMinutes(world, at(1, "10:00"));
    submitAction(world, "player", { type: "move", to: "hilltop" });
    stepMinutes(world, 40);
    expect(battery(world)).toBe(360);
  });

  it("gives no benefit with an empty battery", () => {
    const world = withFlashlight(0);
    stepMinutes(world, at(1, "19:00"));
    submitAction(world, "player", { type: "move", to: "hilltop" });
    expect(durationOf(world.characters.player)).toBe(60);
    stepMinutes(world, 60);
    expect(battery(world)).toBe(0);
  });

  it("night travel without a flashlight takes ×1.5", () => {
    const world = setup();
    place(world.characters.player, "forest", [["forest", "hilltop"]]);
    stepMinutes(world, at(1, "19:00"));
    submitAction(world, "player", { type: "move", to: "hilltop" });
    expect(durationOf(world.characters.player)).toBe(60);
  });
});

describe("explore", () => {
  it("reveals Cave and both routes only to the explorer", () => {
    const world = setup();
    const { player, npc1 } = world.characters;
    place(player, "forest");
    place(npc1, "forest");

    submitAction(world, "player", { type: "explore" });
    expect(durationOf(player)).toBe(45);
    stepMinutes(world, 45);

    expect(player.knownLocations).toEqual(["beach_camp", "forest", "wreckage", "cave", "hilltop"]);
    expect(player.seenLocations).toEqual([]);
    expect(player.knownRoutes).toContainEqual(["forest", "cave"]);
    expect(player.knownRoutes).toContainEqual(["forest", "hilltop"]);

    expect(npc1.knownLocations).toEqual(["beach_camp", "forest", "wreckage"]);
    expect(npc1.knownRoutes).toHaveLength(2);

    const discoveries = world.events.filter((e) => e.type === "discovery").map((e) => e.data);
    expect(discoveries).toEqual([
      { kind: "location", location: "cave" },
      { kind: "route", from: "forest", to: "cave" },
      { kind: "route", from: "forest", to: "hilltop" },
      { kind: "location", location: "hilltop" },
    ]);
  });

  it("takes 30 minutes and finds nothing when nothing is left or elsewhere", () => {
    const world = setup();
    const player = world.characters.player;
    place(player, "forest");
    submitAction(world, "player", { type: "explore" });
    stepMinutes(world, 45);
    const before = world.events.length;

    submitAction(world, "player", { type: "explore" });
    expect(durationOf(player)).toBe(30);
    stepMinutes(world, 30);
    const newDiscoveries = world.events.slice(before).filter((e) => e.type === "discovery");
    expect(newDiscoveries).toEqual([]);

    const other = setup();
    submitAction(other, "player", { type: "explore" }); // at Beach Camp
    expect(durationOf(other.characters.player)).toBe(30);
  });

  it("takes ×1.25 longer when Tired, rounded up", () => {
    const world = setup();
    const player = world.characters.player;
    place(player, "forest");
    player.fatigue = TIRED;
    submitAction(world, "player", { type: "explore" });
    expect(durationOf(player)).toBe(57); // 45 × 1.25 = 56.25
  });

  it("reveals Cave – Hilltop when exploring the Cave", () => {
    const world = setup();
    const player = world.characters.player;
    place(player, "cave");
    submitAction(world, "player", { type: "explore" });
    expect(durationOf(player)).toBe(30);
    stepMinutes(world, 30);
    expect(player.knownRoutes).toContainEqual(["cave", "hilltop"]);
    expect(player.knownLocations).toContain("hilltop");
  });
});

describe("wait and observe weather", () => {
  it("waits the chosen minutes and rejects bad minutes", () => {
    const world = setup();
    submitAction(world, "player", { type: "wait", minutes: 20 });
    expect(durationOf(world.characters.player)).toBe(20);
    expect(submitAction(world, "npc1", { type: "wait", minutes: 0 }).ok).toBe(false);
  });

  it("shows the next 2 hours at the Hilltop and only the current state elsewhere", () => {
    const world = setup({ 1: "cloudy", 2: "light_rain" });
    place(world.characters.player, "hilltop");
    submitAction(world, "player", { type: "observe_weather" });
    submitAction(world, "npc1", { type: "observe_weather" }); // at Beach Camp
    stepMinutes(world, 15);
    const results = world.events
      .filter((e) => e.type === "action_completed")
      .map((e) => ({ actor: e.actor, result: e.data.result }));
    expect(results).toEqual([
      { actor: "player", result: { weather: "clear", forecast: ["cloudy", "light_rain"] } },
      { actor: "npc1", result: { weather: "clear" } },
    ]);
  });
});

describe("framework", () => {
  it("cancels a Wait but not a Move", () => {
    const world = setup();
    submitAction(world, "player", { type: "wait", minutes: 30 });
    expect(cancelAction(world, "player")).toEqual({ ok: true });
    expect(world.characters.player.action).toBeNull();
    expect(lastEvent(world)?.type).toBe("action_cancelled");

    submitAction(world, "player", { type: "move", to: "forest" });
    expect(cancelAction(world, "player")).toEqual({ ok: false, reason: "move cannot be cancelled" });
    expect(world.characters.player.action?.action.type).toBe("move");

    expect(cancelAction(world, "npc1")).toEqual({ ok: false, reason: "nothing to cancel" });
  });

  it("rejects a new action while busy, dead, or after the session ended", () => {
    const world = setup();
    submitAction(world, "player", { type: "wait", minutes: 30 });
    expect(submitAction(world, "player", { type: "explore" })).toEqual({ ok: false, reason: "busy: wait" });

    world.characters.npc1.alive = false;
    expect(submitAction(world, "npc1", { type: "explore" })).toEqual({ ok: false, reason: "character is dead" });

    stepMinutes(world, 3000);
    expect(submitAction(world, "npc2", { type: "explore" })).toEqual({
      ok: false,
      reason: "the session has ended",
    });
  });

  it("rejects actions that are not built yet", () => {
    const world = setup();
    expect(submitAction(world, "player", { type: "search" })).toEqual({
      ok: false,
      reason: "search is not available yet",
    });
  });

  it("runs characters in fixed order and logs start and completion", () => {
    const world = setup();
    submitAction(world, "npc2", { type: "wait", minutes: 5 });
    submitAction(world, "player", { type: "wait", minutes: 5 });
    stepMinutes(world, 5);
    const completed = world.events.filter((e) => e.type === "action_completed").map((e) => e.actor);
    expect(completed).toEqual(["player", "npc2"]);
    expect(world.events[0]).toEqual({
      minute: 0,
      type: "action_started",
      actor: "npc2",
      data: { action: { type: "wait", minutes: 5 }, minutes: 5 },
    });
  });
});
