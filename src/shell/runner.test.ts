import { describe, expect, it } from "vitest";
import { createWorld, submitAction } from "../engine";
import { MAX_TICK_MS, REAL_MS_PER_GAME_MINUTE, newSeed, runSteps, skipToActionEnd, stepsForElapsed } from "./runner";

describe("stepsForElapsed", () => {
  it("runs one game minute per 1.25 real seconds at 1×", () => {
    expect(REAL_MS_PER_GAME_MINUTE).toBe(1250);
    expect(stepsForElapsed(0, 1000, 1)).toEqual({ steps: 0, carriedMs: 1000 });
    expect(stepsForElapsed(1000, 250, 1)).toEqual({ steps: 1, carriedMs: 0 });
  });

  it("scales with speed", () => {
    expect(stepsForElapsed(0, 625, 2).steps).toBe(1);
    expect(stepsForElapsed(0, 1000, 4)).toEqual({ steps: 3, carriedMs: 250 });
  });

  it("does nothing when paused and caps long gaps", () => {
    expect(stepsForElapsed(500, 1000, 0)).toEqual({ steps: 0, carriedMs: 0 });
    expect(stepsForElapsed(0, 60_000, 4).steps).toBe(Math.floor((MAX_TICK_MS * 4) / 1250));
  });

  it("adds up to 48 game minutes per real minute at 1× over many ticks", () => {
    let carried = 0;
    let steps = 0;
    for (let i = 0; i < 600; i++) {
      const r = stepsForElapsed(carried, 100, 1);
      carried = r.carriedMs;
      steps += r.steps;
    }
    expect(steps).toBe(48);
  });
});

describe("runSteps and skipToActionEnd", () => {
  it("stops at the session end", () => {
    const world = createWorld(1);
    expect(runSteps(world, 5000)).toBe(2880);
    expect(world.ended).toBe(true);
  });

  it("skips to the end of the player's action, and does nothing when idle", () => {
    const world = createWorld(1);
    expect(skipToActionEnd(world)).toBe(0);
    submitAction(world, "player", { type: "move", to: "forest" });
    expect(skipToActionEnd(world)).toBe(20);
    expect(world.characters.player.location).toBe("forest");
    expect(world.characters.player.action).toBeNull();
  });

  it("stops when the action is interrupted", () => {
    const world = createWorld(1);
    world.characters.player.location = "forest";
    world.characters.player.fatigue = 715 * 2;
    submitAction(world, "player", { type: "gather_wood" });
    expect(skipToActionEnd(world)).toBe(5);
  });
});

describe("newSeed", () => {
  it("returns a valid 32-bit seed", () => {
    const seed = newSeed();
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(2 ** 32);
    expect(() => createWorld(seed)).not.toThrow();
  });
});
