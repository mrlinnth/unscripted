import { describe, expect, it } from "vitest";
import { createItem } from "../engine/actions/items";
import { createWorld, stepMinutes, submitAction, type GameEvent } from "../engine";
import {
  actionLabel,
  eventColor,
  eventSummary,
  fatigueLabel,
  itemLabel,
  statusLabel,
  stepLabel,
  timeLabel,
  woodCounts,
} from "./format";

describe("format", () => {
  it("labels time, fatigue, and status", () => {
    const world = createWorld(1);
    expect(timeLabel(world, 0)).toBe("Day 1 08:00");
    expect(timeLabel(world, 2880)).toBe("Day 3 08:00");
    world.characters.player.fatigue = 1025;
    expect(fatigueLabel(world, world.characters.player)).toBe("tired (512.5)");
    expect(statusLabel(world.characters.player)).toBe("awake");
    world.characters.npc1.alive = false;
    expect(statusLabel(world.characters.npc1)).toBe("dead");
  });

  it("labels items and wood counts", () => {
    const world = createWorld(1);
    const lighter = createItem(world, "lighter");
    const wood = createItem(world, "wood");
    if (wood.kind === "wood") wood.wet = true;
    expect(itemLabel(lighter)).toBe("lighter-1 (3 uses)");
    expect(itemLabel(wood)).toBe("wood-2 (wet)");
    expect(woodCounts([wood, createItem(world, "wood"), lighter])).toEqual({ dry: 1, wet: 1 });
  });

  it("labels the current action with minutes left", () => {
    const world = createWorld(1);
    const player = world.characters.player;
    expect(actionLabel(world, player)).toBe("—");
    submitAction(world, "player", { type: "move", to: "forest" });
    stepMinutes(world, 5);
    expect(actionLabel(world, player)).toBe("move → forest, 15 min left");
    submitAction(world, "npc1", { type: "sleep" });
    expect(actionLabel(world, world.characters.npc1)).toBe("sleep, until done");
  });

  it("summarises and colours events", () => {
    const rejected: GameEvent = {
      minute: 0,
      type: "action_rejected",
      actor: "player",
      data: { action: { type: "move", to: "hilltop" }, reason: "no known route" },
    };
    expect(eventSummary(rejected)).toBe("move hilltop: no known route");
    expect(eventColor(rejected)).toBe("red");

    const fire: GameEvent = {
      minute: 91,
      type: "fire_changed",
      data: { from: "lit", to: "built", fuelHours: 1.9667, reason: "put out by heavy_rain" },
    };
    expect(eventSummary(fire)).toBe("lit → built, 1.97 h (put out by heavy_rain)");

    const started: GameEvent = {
      minute: 0,
      type: "action_started",
      actor: "player",
      data: { action: { type: "sleep" }, minutes: null },
    };
    expect(eventSummary(started)).toBe("sleep");
    expect(eventColor(started)).toBeUndefined();
  });

  it("summarizes NPC events", () => {
    const decision: GameEvent = {
      minute: 0,
      type: "npc_decision",
      actor: "npc1",
      data: { action: { type: "move", to: "wreckage" }, rule: "d", reason: "make_camp_safe step 1: move" },
    };
    expect(eventSummary(decision)).toBe("d: make_camp_safe step 1: move");
    expect(eventColor(decision)).toBe("blue");

    const plan: GameEvent = {
      minute: 0,
      type: "plan_changed",
      actor: "npc1",
      data: { goal: "make_camp_safe", steps: [{ type: "move", to: "wreckage" }, { type: "search" }] },
    };
    expect(eventSummary(plan)).toBe("make_camp_safe: move wreckage → search");

    const done: GameEvent = {
      minute: 0,
      type: "goal_done",
      actor: "npc2",
      data: { goal: "map_island", reason: "goal reached" },
    };
    expect(eventSummary(done)).toBe("map_island (goal reached)");
    expect(eventColor(done)).toBe("green");
    expect(eventColor({ ...done, type: "goal_dropped" })).toBe("orange");
  });

  it("labels plan steps", () => {
    expect(stepLabel({ type: "move", to: "wreckage" })).toBe("move → wreckage");
    expect(stepLabel({ type: "search" })).toBe("search");
    expect(stepLabel({ type: "sleep" })).toBe("sleep");
  });
});
