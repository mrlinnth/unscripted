import { describe, expect, it } from "vitest";
import { createWorld, getNpc, stepMinutes, submitAction } from "../index";

describe("NPC state in the world", () => {
  it("starts both NPCs with all goals active and no plan", () => {
    const world = createWorld(1);
    expect(getNpc(world, "npc1").goals).toEqual([
      { id: "make_camp_safe", priority: "high", status: "active" },
      { id: "keep_wood_reserve", priority: "low", status: "active" },
    ]);
    expect(getNpc(world, "npc2").goals.map((g) => g.id)).toEqual([
      "map_island",
      "keep_flashlight",
      "signal_rescue",
    ]);
    for (const id of ["npc1", "npc2"] as const) {
      const npc = getNpc(world, id);
      expect(npc.plan).toBeNull();
      expect(npc.lastDecision).toBeNull();
      expect(npc.lastReviewAt).toBe(0);
      expect(npc.urgentRule).toBeNull();
      expect(npc.wreckageSearchedOut).toBe(false);
      expect(npc.commitments).toEqual([]);
    }
    expect(getNpc(world, "npc1").trust).toEqual({ npc2: 40, player: 40 });
    expect(world.npcBehavior.lowHealth).toBe(50);
  });

  it("defaults autonomy to false", () => {
    expect(createWorld(1).autonomy).toBe(false);
    expect(createWorld(1, { autonomy: true }).autonomy).toBe(true);
  });

  it("does not use the random generator to build NPC state", () => {
    expect(createWorld(9, { autonomy: true }).rngState).toBe(createWorld(9).rngState);
  });

  it("applies NPC config overrides", () => {
    const world = createWorld(1, { npcs: { behavior: { lowHealth: 40 } } });
    expect(world.npcBehavior.lowHealth).toBe(40);
  });

  it("saves the forecast seen at the Hilltop", () => {
    const world = createWorld(3);
    const sarah = world.characters.npc2;
    sarah.location = "hilltop";
    expect(sarah.seenForecast).toBeNull();
    expect(submitAction(world, "npc2", { type: "observe_weather" })).toEqual({ ok: true });
    stepMinutes(world, 15);
    // Observed during hour 0, so the forecast covers hours 1 and 2.
    expect(sarah.seenForecast).toEqual({ fromHour: 1, states: world.weather.slice(1, 3) });
  });

  it("saves no forecast when observing elsewhere", () => {
    const world = createWorld(3);
    submitAction(world, "npc2", { type: "observe_weather" });
    stepMinutes(world, 15);
    expect(world.characters.npc2.seenForecast).toBeNull();
  });

  it("marks the Wreckage searched out after an NPC's empty search", () => {
    const world = createWorld(4, { searchOrder: [] });
    world.characters.npc1.location = "wreckage";
    world.characters.player.location = "wreckage";
    submitAction(world, "npc1", { type: "search" });
    submitAction(world, "player", { type: "search" });
    stepMinutes(world, 30);
    expect(getNpc(world, "npc1").wreckageSearchedOut).toBe(true);
    expect(getNpc(world, "npc2").wreckageSearchedOut).toBe(false);
  });

  it("does not mark the Wreckage searched out when a search finds an item", () => {
    const world = createWorld(4, { searchOrder: ["tarp"] });
    world.characters.npc1.location = "wreckage";
    submitAction(world, "npc1", { type: "search" });
    stepMinutes(world, 30);
    expect(getNpc(world, "npc1").wreckageSearchedOut).toBe(false);
  });

  it("survives a JSON round trip unchanged", () => {
    const world = createWorld(5, { autonomy: true });
    expect(JSON.parse(JSON.stringify(world))).toStrictEqual(world);
  });
});
