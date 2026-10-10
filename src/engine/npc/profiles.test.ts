import { describe, expect, it } from "vitest";
import { loadNpcConfig, type NpcConfigOverrides, type NpcGoalId, type NpcPriority } from "./profiles";

describe("loadNpcConfig", () => {
  it("loads the shipped profiles", () => {
    const config = loadNpcConfig();
    expect(config.behavior).toEqual({
      lowHealth: 50,
      idleWaitMinutes: 30,
      reviewEveryMinutes: 180,
      shelterTarget: 80,
      woodReserve: 1,
      coverWeather: ["heavy_rain", "storm"],
    });
    expect(config.npcs.npc1.identity.name).toBe("Marcus Hale");
    expect(config.npcs.npc2.identity.name).toBe("Sarah Okafor");
    expect(config.npcs.npc1.goals.map((g) => g.id)).toEqual(["make_camp_safe", "keep_wood_reserve"]);
    expect(config.npcs.npc2.goals.map((g) => g.id)).toEqual([
      "map_island",
      "keep_flashlight",
      "signal_rescue",
    ]);
    expect(config.npcs.npc1.trust).toEqual({ npc2: 40, player: 40 });
    expect(config.npcs.npc2.trust).toEqual({ npc1: 50, player: 50 });
    expect(config.npcs.npc1.commitments).toEqual([]);
  });

  it("applies an override and keeps the rest", () => {
    const config = loadNpcConfig({ behavior: { lowHealth: 40 }, npcs: { npc2: { identity: { age: 35 } } } });
    expect(config.behavior.lowHealth).toBe(40);
    expect(config.behavior.shelterTarget).toBe(80);
    expect(config.npcs.npc2.identity.age).toBe(35);
    expect(config.npcs.npc2.identity.name).toBe("Sarah Okafor");
  });

  it("does not change the shipped config when overriding", () => {
    loadNpcConfig({ behavior: { woodReserve: 3 } });
    expect(loadNpcConfig().behavior.woodReserve).toBe(1);
  });

  it("replaces the goal list instead of merging it", () => {
    const config = loadNpcConfig({ npcs: { npc1: { goals: [{ id: "map_island", priority: "low" }] } } });
    expect(config.npcs.npc1.goals).toEqual([{ id: "map_island", priority: "low" }]);
  });

  it("rejects a missing or non-positive behavior number", () => {
    expect(() => loadNpcConfig({ behavior: { idleWaitMinutes: 0 } })).toThrow(
      /behavior\.idleWaitMinutes: must be a whole number above 0/,
    );
    expect(() => loadNpcConfig({ behavior: { reviewEveryMinutes: 1.5 } })).toThrow(
      /behavior\.reviewEveryMinutes/,
    );
    const missing = { behavior: { lowHealth: null } } as unknown as NpcConfigOverrides;
    expect(() => loadNpcConfig(missing)).toThrow(/behavior\.lowHealth: must be a whole number above 0, got null/);
  });

  it("rejects an empty or non-text cover weather list", () => {
    expect(() => loadNpcConfig({ behavior: { coverWeather: [] } })).toThrow(
      /behavior\.coverWeather: must be a non-empty list/,
    );
    const bad = { behavior: { coverWeather: [3] } } as unknown as NpcConfigOverrides;
    expect(() => loadNpcConfig(bad)).toThrow(/behavior\.coverWeather/);
  });

  it("rejects a missing NPC", () => {
    const overrides = { npcs: { npc2: null } } as unknown as NpcConfigOverrides;
    expect(() => loadNpcConfig(overrides)).toThrow(/npcs\.npc2: missing NPC profile/);
  });

  it("rejects an unknown NPC id", () => {
    const overrides = { npcs: { npc3: {} } } as unknown as NpcConfigOverrides;
    expect(() => loadNpcConfig(overrides)).toThrow(/npcs\.npc3: unknown NPC id "npc3"/);
  });

  it("rejects an unknown goal id", () => {
    const goals = [{ id: "build_raft" as NpcGoalId, priority: "high" as NpcPriority }];
    expect(() => loadNpcConfig({ npcs: { npc1: { goals } } })).toThrow(
      /npcs\.npc1\.goals\[0\]\.id: unknown goal id "build_raft"/,
    );
  });

  it("rejects a bad priority", () => {
    const goals = [{ id: "map_island" as NpcGoalId, priority: "urgent" as NpcPriority }];
    expect(() => loadNpcConfig({ npcs: { npc2: { goals } } })).toThrow(
      /npcs\.npc2\.goals\[0\]\.priority: unknown priority "urgent"/,
    );
  });

  it("rejects a goal listed twice", () => {
    expect(() =>
      loadNpcConfig({
        npcs: {
          npc2: {
            goals: [
              { id: "map_island", priority: "high" },
              { id: "map_island", priority: "low" },
            ],
          },
        },
      }),
    ).toThrow(/npcs\.npc2\.goals\[1\]\.id: goal "map_island" listed twice/);
  });

  it("rejects an empty goal list", () => {
    expect(() => loadNpcConfig({ npcs: { npc1: { goals: [] } } })).toThrow(
      /npcs\.npc1\.goals: needs at least one goal/,
    );
  });

  it("rejects trust out of 0–100", () => {
    expect(() => loadNpcConfig({ npcs: { npc1: { trust: { player: 101 } } } })).toThrow(
      /npcs\.npc1\.trust\.player: must be a whole number 0–100, got 101/,
    );
    expect(() => loadNpcConfig({ npcs: { npc2: { trust: { npc1: -1 } } } })).toThrow(
      /npcs\.npc2\.trust\.npc1/,
    );
  });

  it("rejects trust for an unknown character or for itself", () => {
    const unknown = { npcs: { npc1: { trust: { npc9: 50 } } } } as unknown as NpcConfigOverrides;
    expect(() => loadNpcConfig(unknown)).toThrow(/npcs\.npc1\.trust\.npc9: unknown or own character/);
    expect(() => loadNpcConfig({ npcs: { npc1: { trust: { npc1: 50 } } } })).toThrow(
      /npcs\.npc1\.trust\.npc1: unknown or own character/,
    );
  });

  it("rejects bad identity fields", () => {
    expect(() => loadNpcConfig({ npcs: { npc1: { identity: { name: " " } } } })).toThrow(
      /npcs\.npc1\.identity\.name: must be non-empty text/,
    );
    expect(() => loadNpcConfig({ npcs: { npc1: { identity: { age: 0 } } } })).toThrow(
      /npcs\.npc1\.identity\.age/,
    );
    const badTraits = { npcs: { npc2: { identity: { traits: "curious" } } } } as unknown as NpcConfigOverrides;
    expect(() => loadNpcConfig(badTraits)).toThrow(/npcs\.npc2\.identity\.traits: must be a list of text/);
  });
});
