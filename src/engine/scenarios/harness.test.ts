import { describe, expect, it } from "vitest";
import { at, runScenario, weatherPlan } from "./harness";

describe("at", () => {
  it("converts Day and HH:MM to game minutes", () => {
    expect(at(1, "08:00")).toBe(0);
    expect(at(1, "16:00")).toBe(480);
    expect(at(3, "08:00")).toBe(2880);
  });
});

describe("weatherPlan", () => {
  it("fills 48 hours with the base and applies spans", () => {
    const plan = weatherPlan([{ from: at(1, "14:00"), to: at(1, "17:00"), state: "storm" }]);
    expect(plan).toHaveLength(48);
    expect(plan.slice(5, 10)).toEqual(["clear", "storm", "storm", "storm", "clear"]);
  });

  it("rejects spans that are not on the hour", () => {
    expect(() => weatherPlan([{ from: 30, to: 60, state: "storm" }])).toThrow(/on the hour/);
  });
});

describe("runScenario", () => {
  it("runs one actor's steps in order", () => {
    const { world, events, unfinished } = runScenario({
      seed: 1,
      weather: weatherPlan([]),
      script: [
        { actor: "player", action: { type: "move", to: "forest" } },
        { actor: "player", action: { type: "explore" } },
      ],
      until: at(1, "09:30"),
    });
    expect(unfinished).toEqual([]);
    const started = events.filter((e) => e.type === "action_started").map((e) => [e.minute, e.data.action]);
    expect(started).toEqual([
      [0, { type: "move", to: "forest" }],
      [20, { type: "explore" }],
    ]);
    expect(world.characters.player.knownLocations).toContain("cave");
    expect(world.minute).toBe(at(1, "09:30"));
  });

  it("fails with the reason when a step is rejected", () => {
    expect(() =>
      runScenario({
        seed: 1,
        script: [{ actor: "player", action: { type: "move", to: "hilltop" } }],
        until: 60,
      }),
    ).toThrow("step 1 (player: move) rejected at Day 1 08:00: no known route from beach_camp to hilltop");
  });

  it("accepts an expected rejection and moves on", () => {
    const { events, unfinished } = runScenario({
      seed: 1,
      script: [
        { actor: "player", action: { type: "move", to: "hilltop" }, expectReject: true },
        { actor: "player", action: { type: "wait", minutes: 10 } },
      ],
      until: 10,
    });
    expect(unfinished).toEqual([]);
    expect(events.map((e) => e.type)).toEqual(["action_rejected", "action_started", "action_completed"]);
  });

  it("fails when an expected rejection starts instead", () => {
    expect(() =>
      runScenario({
        seed: 1,
        script: [{ actor: "player", action: { type: "wait", minutes: 5 }, expectReject: true }],
        until: 10,
      }),
    ).toThrow(/expected to be rejected/);
  });

  it("waits for a step's start time and runs actors side by side", () => {
    const { events } = runScenario({
      seed: 1,
      script: [
        { actor: "npc1", action: { type: "wait", minutes: 5 } },
        { actor: "player", action: { type: "wait", minutes: 5 }, at: 30 },
      ],
      until: 40,
    });
    const started = events.filter((e) => e.type === "action_started").map((e) => [e.actor, e.minute]);
    expect(started).toEqual([
      ["npc1", 0],
      ["player", 30],
    ]);
  });

  it("leaves NPCs idle without script steps, and reports unfinished steps", () => {
    const { world, unfinished } = runScenario({
      seed: 1,
      script: [
        { actor: "player", action: { type: "wait", minutes: 60 } },
        { actor: "player", action: { type: "wait", minutes: 5 } },
      ],
      until: 30,
    });
    expect(world.characters.npc1.action).toBeNull();
    expect(world.characters.npc2.location).toBe("beach_camp");
    expect(unfinished).toHaveLength(1);
  });

  it("runs setup before the first step", () => {
    const { world } = runScenario({
      seed: 1,
      setup: (w) => {
        w.shelter.value = 90;
      },
      script: [],
      until: 0,
    });
    expect(world.shelter.value).toBe(90);
  });

  it("gives the same log for the same inputs", () => {
    const run = () =>
      runScenario({
        seed: 42,
        script: [
          { actor: "player", action: { type: "move", to: "forest" } },
          { actor: "player", action: { type: "gather_wood" } },
          { actor: "npc1", action: { type: "move", to: "wreckage" } },
          { actor: "npc1", action: { type: "search" } },
        ],
        until: at(1, "12:00"),
      }).events;
    expect(run()).toStrictEqual(run());
  });
});
