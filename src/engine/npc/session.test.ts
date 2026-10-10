import { describe, expect, it } from "vitest";
import { createWorld, stepMinutes, type GameEvent, type World } from "../index";
import { at, weatherPlan } from "../scenarios/harness";
import { sessionLengthMinutes } from "../time";

const SEEDS = [11, 2024, 90210];

function runSession(seed: number): World {
  const world = createWorld(seed, { autonomy: true });
  stepMinutes(world, sessionLengthMinutes(world.rules));
  return world;
}

function eventsOf(world: World, actor: string, type: string): GameEvent[] {
  return world.events.filter((e) => e.actor === actor && e.type === type);
}

/** Actions completed while following a plan (rule d), matched by start minute. */
function completedPlanSteps(world: World, actor: string): number {
  const planStarts = new Set(
    eventsOf(world, actor, "npc_decision")
      .filter((e) => e.data.rule === "d")
      .map((e) => e.minute),
  );
  const started = eventsOf(world, actor, "action_started").filter((e) => planStarts.has(e.minute));
  const completed = eventsOf(world, actor, "action_completed");
  return started.filter((s) =>
    completed.some(
      (c) => c.minute >= s.minute && JSON.stringify(c.data.action) === JSON.stringify(s.data.action),
    ),
  ).length;
}

function completedOf(world: World, actor: string, type: string): number {
  return eventsOf(world, actor, "action_completed").filter(
    (e) => (e.data.action as { type?: string }).type === type,
  ).length;
}

describe.each(SEEDS)("full session, no player input, seed %i", (seed) => {
  const world = runSession(seed);

  it("runs to Day 3 08:00 and ends", () => {
    expect(world.ended).toBe(true);
    expect(world.events[world.events.length - 1]?.type).toBe("session_ended");
  });

  it("has each NPC plan, follow, and change plans on its own", () => {
    for (const id of ["npc1", "npc2"]) {
      expect(eventsOf(world, id, "plan_created").length).toBeGreaterThanOrEqual(1);
      expect(completedPlanSteps(world, id)).toBeGreaterThanOrEqual(1);
      expect(eventsOf(world, id, "plan_changed").length).toBeGreaterThanOrEqual(1);
    }
  });

  it("has Marcus repair the shelter", () => {
    expect(completedOf(world, "npc1", "repair_shelter")).toBeGreaterThanOrEqual(1);
  });

  it("has Sarah learn a route to the Hilltop", () => {
    const routes = eventsOf(world, "npc2", "discovery").filter(
      (e) => e.data.kind === "route" && (e.data.from === "hilltop" || e.data.to === "hilltop"),
    );
    expect(routes.length).toBeGreaterThanOrEqual(1);
  });

  it("logs a rule and a reason for every decision", () => {
    const decisions = world.events.filter((e) => e.type === "npc_decision");
    expect(decisions.length).toBeGreaterThan(0);
    for (const d of decisions) {
      expect(["a", "b", "c", "d", "e"]).toContain(d.data.rule);
      expect(typeof d.data.reason).toBe("string");
      expect(d.data.reason).not.toBe("");
    }
  });

  it("gives an identical log when run again", () => {
    const again = runSession(seed);
    expect(again.events).toEqual(world.events);
  });

  it("never controls the player", () => {
    // The player's body still follows the rules: an idle player tires and
    // collapses at 32 hours (A.8), which the engine starts. Nothing else.
    const controlled = ["npc_decision", "plan_created", "action_started", "action_rejected"];
    const isCollapse = (e: GameEvent): boolean => (e.data.action as { type?: string } | undefined)?.type === "collapse";
    const events = world.events.filter((e) => e.actor === "player" && controlled.includes(e.type) && !isCollapse(e));
    expect(events).toEqual([]);
  });
});

describe("seed 1 (Storms on Day 2 night)", () => {
  it("has no NPC turn back and forth until it collapses", () => {
    // Regression: Sarah used to bounce between Beach Camp (seen unprotected)
    // and the Forest (where the camp looks protected) until she collapsed.
    const world = runSession(1);
    expect(world.events.filter((e) => e.type === "collapse" && e.actor !== "player")).toEqual([]);
  });
});

describe("forced Storm on Day 1 afternoon", () => {
  it("sends both NPCs to protection with rule b, or finds them already protected", () => {
    const from = at(1, "13:00");
    const weather = weatherPlan([{ from, to: from + 3 * 60, state: "storm" }]);
    const world = createWorld(11, { autonomy: true, weather });
    stepMinutes(world, from + 3 * 60 - world.minute);

    for (const id of ["npc1", "npc2"] as const) {
      const ruleB = eventsOf(world, id, "npc_decision").filter((e) => e.minute >= from && e.data.rule === "b");
      const c = world.characters[id];
      const protectedNow = c.location === "cave" || (c.location === "beach_camp" && world.shelter.value >= 30);
      // Either it took cover with rule b, or it was already protected (or
      // travelling there) and never needed to.
      expect(ruleB.length > 0 || protectedNow).toBe(true);
    }
    // At least one NPC was out and took cover.
    const anyB = world.events.some((e) => e.type === "npc_decision" && e.minute >= from && e.data.rule === "b");
    expect(anyB).toBe(true);
  });
});
