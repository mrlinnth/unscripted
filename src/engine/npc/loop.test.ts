import { describe, expect, it } from "vitest";
import { createWorld, stepMinutes, submitAction, type GameEvent, type World } from "../index";
import { weatherPlan } from "../scenarios/harness";
import { sessionLengthMinutes } from "../time";

function eventsOf(world: World, actor: string, type?: string): GameEvent[] {
  return world.events.filter((e) => e.actor === actor && (type === undefined || e.type === type));
}

/** Storm from 09:00 (minute 60) for three hours, clear otherwise. */
const stormAt60 = weatherPlan([{ from: 60, to: 240, state: "storm" }]);

describe("autonomy off", () => {
  it("makes no decisions and never touches the random generator", () => {
    const world = createWorld(5);
    const rngState = world.rngState;
    stepMinutes(world, sessionLengthMinutes(world.rules));
    expect(world.ended).toBe(true);
    expect(world.rngState).toBe(rngState);
    expect(world.events.some((e) => e.type === "npc_decision")).toBe(false);
    expect(world.characters.npc1.location).toBe("beach_camp");
    expect(world.characters.npc2.location).toBe("beach_camp");
  });
});

describe("autonomy on", () => {
  it("has both NPCs act at minute 0", () => {
    const world = createWorld(5, { autonomy: true });
    for (const id of ["npc1", "npc2"] as const) {
      const decisions = eventsOf(world, id, "npc_decision");
      expect(decisions).toHaveLength(1);
      expect(decisions[0]?.minute).toBe(0);
      expect(eventsOf(world, id, "plan_created")).toHaveLength(1);
      expect(world.characters[id].action).not.toBeNull();
      expect(world.npcs[id].lastDecision?.minute).toBe(0);
    }
    expect(world.events.map((e) => [e.actor, e.type])).toEqual([
      ["npc1", "plan_created"],
      ["npc1", "npc_decision"],
      ["npc1", "action_started"],
      ["npc2", "plan_created"],
      ["npc2", "npc_decision"],
      ["npc2", "action_started"],
    ]);
  });

  it("never controls the player", () => {
    const world = createWorld(5, { autonomy: true });
    stepMinutes(world, 600);
    expect(world.events.some((e) => e.actor === "player")).toBe(false);
    expect(world.characters.player.action).toBeNull();
  });

  it("interrupts work when a Storm starts (urgent rule b)", () => {
    const world = createWorld(1, { weather: stormAt60 });
    stepMinutes(world, 40);
    world.characters.npc2.location = "forest";
    expect(submitAction(world, "npc2", { type: "gather_wood" })).toEqual({ ok: true });
    world.npcs.npc2.lastReviewAt = 40;
    world.autonomy = true;

    stepMinutes(world, 20);
    const atStorm = eventsOf(world, "npc2").filter((e) => e.minute === 60);
    expect(atStorm.map((e) => e.type)).toEqual(["npc_decision", "action_cancelled", "action_started"]);
    expect(atStorm[0]?.data).toMatchObject({ rule: "b", action: { type: "move", to: "beach_camp" } });
    expect(world.npcs.npc2.urgentRule).toBe("b");
  });

  it("does not repeat an urgent decision while the condition stays true", () => {
    const world = createWorld(1, { weather: stormAt60 });
    stepMinutes(world, 40);
    world.characters.npc2.location = "forest";
    submitAction(world, "npc2", { type: "gather_wood" });
    world.npcs.npc2.lastReviewAt = 40;
    world.autonomy = true;
    stepMinutes(world, 20);
    const count = eventsOf(world, "npc2", "npc_decision").length;
    // Travelling to camp (20 min): no new decisions until arrival.
    stepMinutes(world, 19);
    expect(eventsOf(world, "npc2", "npc_decision")).toHaveLength(count);
  });

  it("never cancels travel, and decides on arrival", () => {
    const world = createWorld(1, { weather: stormAt60 });
    stepMinutes(world, 45);
    world.characters.npc2.location = "wreckage";
    expect(submitAction(world, "npc2", { type: "move", to: "beach_camp" })).toEqual({ ok: true });
    world.npcs.npc2.lastReviewAt = 45;
    world.autonomy = true;

    stepMinutes(world, 40);
    expect(eventsOf(world, "npc2", "action_cancelled")).toEqual([]);
    // Started in Clear weather, so the duration is the base 30 minutes.
    const arrived = eventsOf(world, "npc2", "action_completed")[0];
    expect(arrived?.minute).toBe(75);
    expect(eventsOf(world, "npc2", "npc_decision")[0]?.minute).toBe(75);
  });

  it("runs a plan review every 3 hours and switches if the plan wants something else", () => {
    const world = createWorld(1);
    expect(submitAction(world, "npc1", { type: "wait", minutes: 400 })).toEqual({ ok: true });
    world.autonomy = true;

    stepMinutes(world, 179);
    expect(eventsOf(world, "npc1", "npc_decision")).toEqual([]);
    stepMinutes(world, 1);
    const atReview = eventsOf(world, "npc1").filter((e) => e.minute === 180);
    expect(atReview.map((e) => e.type)).toEqual([
      "plan_created",
      "npc_decision",
      "action_cancelled",
      "action_started",
    ]);
    expect(world.npcs.npc1.lastReviewAt).toBe(180);
  });

  it("keeps the running action at a review when it still fits", () => {
    const world = createWorld(1);
    world.characters.npc1.fatigue = world.rules.fatigue.exhaustedAt * 2;
    world.autonomy = true;
    world.events = [];
    stepMinutes(world, 1);
    expect(world.characters.npc1.action?.action.type).toBe("sleep");
    const decisions = eventsOf(world, "npc1", "npc_decision").length;

    // Still Exhausted at the review: keep sleeping, no new decision logged.
    world.characters.npc1.fatigue = world.rules.fatigue.exhaustedAt * 2 + 400;
    world.npcs.npc1.lastReviewAt = world.minute - world.npcBehavior.reviewEveryMinutes + 1;
    stepMinutes(world, 1);
    expect(world.characters.npc1.action?.action.type).toBe("sleep");
    expect(eventsOf(world, "npc1", "npc_decision")).toHaveLength(decisions);
    expect(eventsOf(world, "npc1", "action_cancelled")).toEqual([]);
  });

  it("falls through to the next rule when a choice is rejected, without looping", () => {
    // Search is moved to the Forest in the world rules, but the NPC still plans
    // to search at the Wreckage, so the search is rejected there.
    const world = createWorld(1, { rules: { actions: { search: { minutes: 30, location: "forest" } } } });
    world.characters.npc1.location = "wreckage";
    world.autonomy = true;
    stepMinutes(world, 1);
    const types = eventsOf(world, "npc1").map((e) => e.type);
    expect(types).toEqual(["plan_created", "npc_decision", "action_rejected", "plan_changed", "npc_decision", "action_started"]);
    expect(world.characters.npc1.action?.action).toEqual({ type: "move", to: "beach_camp" });
  });

  it("makes no decisions for a dead NPC", () => {
    const world = createWorld(1);
    world.characters.npc1.alive = false;
    world.autonomy = true;
    stepMinutes(world, 400);
    expect(eventsOf(world, "npc1")).toEqual([]);
    expect(eventsOf(world, "npc2", "npc_decision").length).toBeGreaterThan(0);
  });

  it("makes no decisions while collapsed", () => {
    const world = createWorld(1);
    world.characters.npc1.fatigue = world.rules.fatigue.collapseAt * 2;
    stepMinutes(world, 1);
    expect(world.characters.npc1.action?.action.type).toBe("collapse");
    world.autonomy = true;
    world.npcs.npc1.lastReviewAt = -1000;
    stepMinutes(world, 60);
    expect(eventsOf(world, "npc1", "npc_decision")).toEqual([]);
  });

  it("gives identical logs for the same seed", () => {
    const a = createWorld(42, { autonomy: true });
    const b = createWorld(42, { autonomy: true });
    stepMinutes(a, 900);
    stepMinutes(b, 900);
    expect(a.events).toEqual(b.events);
    expect(a.rngState).toBe(b.rngState);
  });
});
