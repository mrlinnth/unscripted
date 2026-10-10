import { describe, expect, it } from "vitest";
import { loadWorldRules } from "./config";
import { CHARACTER_IDS, createWorld, gameMinuteAt, getClock, getWeather, step, stepMinutes } from "./index";
import { clockAt, dayAt, isNight } from "./time";

const rules = loadWorldRules();
const allClear = Array.from({ length: 48 }, () => "clear");

describe("createWorld", () => {
  it("matches the A.11 starting conditions", () => {
    const world = createWorld(1);
    expect(getClock(world)).toEqual({ minute: 0, day: 1, time: "08:00", night: false });
    expect(world.weather[0]).toBe("clear");
    expect(world.weather).toHaveLength(48);
    expect(world.shelter).toEqual({ value: 40, tarpInstalled: false });
    expect(world.fire).toEqual({ state: "none", fuel: 0, wet: false, dryHours: 0 });
    expect([...world.wreckageToFind].sort()).toEqual(["flashlight", "lighter", "tarp"]);
    expect(world.ended).toBe(false);
    expect(world.events).toEqual([]);
    for (const id of CHARACTER_IDS) {
      const c = world.characters[id];
      expect(c.location).toBe("beach_camp");
      expect(c.fatigue).toBe(0);
      expect(c.health).toBe(100);
      expect(c.alive).toBe(true);
      expect(c.inventory).toEqual([]);
      expect(c.action).toBeNull();
    }
    for (const location of Object.values(world.locations)) {
      expect(location.items).toEqual([]);
    }
  });

  it("gives every character the A.3 starting knowledge, as private copies", () => {
    const world = createWorld(1);
    for (const id of CHARACTER_IDS) {
      const c = world.characters[id];
      expect(c.knownLocations).toEqual(["beach_camp", "forest", "wreckage"]);
      expect(c.seenLocations).toEqual(["hilltop"]);
      expect(c.knownRoutes).toEqual([
        ["beach_camp", "forest"],
        ["beach_camp", "wreckage"],
      ]);
    }
    world.characters.player.knownLocations.push("cave");
    world.characters.player.knownRoutes[0]?.push("x");
    expect(world.characters.npc1.knownLocations).not.toContain("cave");
    expect(world.characters.npc1.knownRoutes[0]).toEqual(["beach_camp", "forest"]);
    expect(rules.startingKnowledge.knownLocations).not.toContain("cave");
  });

  it("is identical for the same seed and plain JSON", () => {
    const a = createWorld(77);
    expect(createWorld(77)).toStrictEqual(a);
    expect(JSON.parse(JSON.stringify(a))).toStrictEqual(a);
  });

  it("uses forced weather and search order but keeps the same RNG state", () => {
    const forced = createWorld(5, { weather: allClear, searchOrder: ["lighter", "tarp", "flashlight"] });
    expect(forced.weather).toEqual(allClear);
    expect(forced.wreckageToFind).toEqual(["lighter", "tarp", "flashlight"]);
    expect(forced.rngState).toBe(createWorld(5).rngState);
  });

  it("rejects bad forced values", () => {
    expect(() => createWorld(1, { weather: ["clear"] })).toThrow(/48 hourly states/);
    expect(() => createWorld(1, { weather: [...allClear.slice(1), "snow"] })).toThrow(/unknown weather/);
  });

  it("applies config overrides", () => {
    const world = createWorld(1, { rules: { starting: { shelter: 10 } } });
    expect(world.shelter.value).toBe(10);
  });
});

describe("time helpers", () => {
  it("converts game minutes to day and clock", () => {
    expect(gameMinuteAt(rules, 1, "08:00")).toBe(0);
    expect(gameMinuteAt(rules, 2, "00:00")).toBe(960);
    expect(gameMinuteAt(rules, 3, "08:00")).toBe(2880);
    expect(dayAt(rules, 959)).toBe(1);
    expect(dayAt(rules, 960)).toBe(2);
    expect(clockAt(rules, 2879)).toBe("07:59");
  });

  it("follows A.2 for day and night", () => {
    expect(isNight(rules, gameMinuteAt(rules, 2, "06:00"))).toBe(false);
    expect(isNight(rules, gameMinuteAt(rules, 1, "18:29"))).toBe(false);
    expect(isNight(rules, gameMinuteAt(rules, 1, "18:30"))).toBe(true);
    expect(isNight(rules, gameMinuteAt(rules, 2, "05:59"))).toBe(true);
  });
});

describe("step", () => {
  it("advances one minute at a time", () => {
    const world = createWorld(1);
    step(world);
    expect(getClock(world).time).toBe("08:01");
    stepMinutes(world, 59);
    expect(getClock(world).time).toBe("09:00");
  });

  it("ends the session at Day 3 08:00 with exactly one session_ended", () => {
    const world = createWorld(1);
    stepMinutes(world, 5000);
    expect(world.minute).toBe(2880);
    expect(getClock(world)).toMatchObject({ day: 3, time: "08:00" });
    expect(world.ended).toBe(true);
    step(world);
    expect(world.minute).toBe(2880);
    const ended = world.events.filter((e) => e.type === "session_ended");
    expect(ended).toEqual([{ minute: 2880, type: "session_ended", data: {} }]);
  });

  it("logs weather changes only on the hour, matching the sequence", () => {
    const world = createWorld(3);
    stepMinutes(world, 2880);
    const changes = world.events.filter((e) => e.type === "weather_changed");
    let expected = 0;
    for (let h = 1; h < world.weather.length; h++) {
      if (world.weather[h] !== world.weather[h - 1]) expected++;
    }
    expect(changes).toHaveLength(expected);
    for (const event of changes) {
      expect(event.minute % 60).toBe(0);
      const hour = event.minute / 60;
      expect(event.data).toEqual({ from: world.weather[hour - 1], to: world.weather[hour] });
    }
  });

  it("reports the current weather from the hourly sequence", () => {
    const weather = [...allClear];
    weather[2] = "cloudy";
    const world = createWorld(1, { weather });
    stepMinutes(world, 119);
    expect(getWeather(world)).toBe("clear");
    step(world);
    expect(getWeather(world)).toBe("cloudy");
    expect(world.events[world.events.length - 1]).toEqual({
      minute: 120,
      type: "weather_changed",
      data: { from: "clear", to: "cloudy" },
    });
  });

  it("gives an identical event log for the same seed", () => {
    const a = createWorld(9);
    const b = createWorld(9);
    stepMinutes(a, 2880);
    stepMinutes(b, 2880);
    expect(a.events).toStrictEqual(b.events);
  });
});
