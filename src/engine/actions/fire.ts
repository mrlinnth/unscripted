// Signal fire and wet wood (spec A.6).
//
// Fuel is stored in half fuel-minutes, so every burn rate is a whole number:
// 1, 1.5, and 2 fuel-hours per hour are 2, 3, and 4 units per minute.

import { isShelteredLocation, workBlockReason } from "../body";
import { logEventAt, type JsonValue } from "../events";
import type { Character, FireState, Item, SignalFire, World } from "../state";
import { weatherAt } from "../weather";
import { workDuration } from "./duration";
import type { ActionDefs } from "./framework";

type Wood = Extract<Item, { kind: "wood" }>;

/** Units of stored fuel per fuel-hour (60 fuel-minutes × 2 half-units). */
export const FUEL_UNITS_PER_HOUR = 120;

export function fuelHours(fire: SignalFire): number {
  return fire.fuel / FUEL_UNITS_PER_HOUR;
}

function isWood(item: Item): item is Wood {
  return item.kind === "wood";
}

function setFireState(world: World, to: FireState, minute: number, extra: { [key: string]: JsonValue } = {}): void {
  const from = world.fire.state;
  world.fire.state = to;
  logEventAt(world, minute, "fire_changed", { from, to, fuelHours: fuelHours(world.fire), ...extra });
}

function atFire(world: World, character: Character): string | null {
  const location = world.rules.signalFire.location;
  return character.location === location ? null : `must be at ${location}`;
}

function dryBundlesHere(world: World, character: Character): Wood[] {
  return (world.locations[character.location]?.items ?? []).filter(isWood).filter((wood) => !wood.wet);
}

function buildReason(world: World, character: Character): string | null {
  const needed = world.rules.signalFire.buildWood;
  return (
    atFire(world, character) ??
    (world.fire.state !== "none" ? "fire already built" : null) ??
    (dryBundlesHere(world, character).length < needed ? `needs ${needed} dry wood bundles here` : null) ??
    workBlockReason(world, character)
  );
}

/** The bundle Add wood will use: the chosen one, else the first dry, else the first. */
function bundleToAdd(character: Character, itemId: string | undefined): Wood | undefined {
  const wood = character.inventory.filter(isWood);
  if (itemId !== undefined) return wood.find((item) => item.id === itemId);
  return wood.find((item) => !item.wet) ?? wood[0];
}

function addWoodReason(world: World, character: Character, itemId: string | undefined): string | null {
  return (
    atFire(world, character) ??
    (world.fire.state === "none" ? "no fire built" : null) ??
    (bundleToAdd(character, itemId) ? null : "no wood bundle carried")
  );
}

function lighterOf(character: Character): Extract<Item, { kind: "lighter" }> | undefined {
  const lighters = character.inventory.filter((item) => item.kind === "lighter");
  return lighters.find((item) => item.usesLeft > 0) ?? lighters[0];
}

function lightReason(world: World, character: Character): string | null {
  const lighter = lighterOf(character);
  const weather = weatherAt(world, world.minute);
  return (
    atFire(world, character) ??
    (!lighter ? "no lighter carried" : null) ??
    (lighter && lighter.usesLeft <= 0 ? "lighter is used up" : null) ??
    (world.fire.state === "lit" ? "fire already lit" : null) ??
    (world.fire.state !== "built" ? "no fire built" : null) ??
    // Weather before wetness: in a Storm the fire is usually wet too, and the
    // weather is the more direct reason.
    (world.rules.signalFire.lightBlockedWeather.includes(weather) ? `cannot light in ${weather}` : null) ??
    (world.fire.wet ? "fire is wet" : null)
  );
}

export const fireActions: ActionDefs = {
  build_fire: {
    kind: "work",
    cancellable: true,
    validate: (world, character) => buildReason(world, character),
    recheck: (world, character) => buildReason(world, character),
    duration: (world, character) => workDuration(world, character, world.rules.actions.build_fire.minutes),
    complete(world, character) {
      const pile = world.locations[character.location]?.items ?? [];
      const used = new Set(dryBundlesHere(world, character).slice(0, world.rules.signalFire.buildWood));
      const remaining = pile.filter((item) => !(isWood(item) && used.has(item)));
      pile.splice(0, pile.length, ...remaining);
      world.fire.fuel = world.rules.signalFire.startFuelHours * FUEL_UNITS_PER_HOUR;
      world.fire.wet = false;
      world.fire.dryHours = 0;
      setFireState(world, "built", world.minute, { by: character.id });
      return { fuelHours: fuelHours(world.fire) };
    },
  },

  add_wood: {
    kind: "work",
    cancellable: true,
    validate: (world, character, action) => addWoodReason(world, character, action.itemId),
    recheck: (world, character, action) => addWoodReason(world, character, action.itemId),
    duration: (world, character) => workDuration(world, character, world.rules.actions.add_wood.minutes),
    complete(world, character, action) {
      const bundle = bundleToAdd(character, action.itemId);
      if (bundle) {
        character.inventory.splice(character.inventory.indexOf(bundle), 1);
        const { addFuelHours, maxFuelHours } = world.rules.signalFire;
        const max = maxFuelHours * FUEL_UNITS_PER_HOUR;
        // Up to the maximum; a bundle added to a full fire is still used.
        world.fire.fuel = Math.min(max, world.fire.fuel + addFuelHours * FUEL_UNITS_PER_HOUR);
        if (bundle.wet) {
          world.fire.wet = true;
          world.fire.dryHours = 0;
        }
      }
      return { fuelHours: fuelHours(world.fire), wet: world.fire.wet };
    },
  },

  light_fire: {
    // Not "work" in A.8: counts like take/drop/give, with no Tired multiplier
    // and no Exhausted or health block.
    kind: "interact",
    cancellable: true,
    validate: (world, character) => lightReason(world, character),
    recheck: (world, character) => lightReason(world, character),
    duration: (world) => world.rules.actions.light_fire.minutes,
    complete(world, character) {
      const lighter = lighterOf(character);
      if (lighter) lighter.usesLeft -= 1; // only on success (A.4)
      setFireState(world, "lit", world.minute, { by: character.id });
      return { fuelHours: fuelHours(world.fire) };
    },
  },
};

/** Per-minute burn for the minute that just passed (A.6). */
export function applyFireMinute(world: World): void {
  const fire = world.fire;
  if (fire.state !== "lit") return;
  const rules = world.rules.signalFire;
  const weather = weatherAt(world, world.minute);
  const after = world.minute + 1;
  fire.fuel = Math.max(0, fire.fuel - (rules.burnPerHour[weather] ?? 0) * 2);

  if (fire.fuel === 0) {
    fire.wet = false;
    fire.dryHours = 0;
    setFireState(world, "none", after, { reason: "burned out" });
  } else if (rules.goOutWeather.includes(weather) && fire.fuel < rules.goOutBelowHours * FUEL_UNITS_PER_HOUR) {
    fire.wet = true;
    fire.dryHours = 0;
    setFireState(world, "built", after, { reason: `put out by ${weather}` });
  }
}

/** All wood bundles in the world, with the location each one is at. */
function allWood(world: World): { wood: Wood; location: string }[] {
  const found: { wood: Wood; location: string }[] = [];
  for (const [location, state] of Object.entries(world.locations)) {
    for (const item of state.items) if (isWood(item)) found.push({ wood: item, location });
  }
  for (const character of Object.values(world.characters)) {
    for (const item of character.inventory) if (isWood(item)) found.push({ wood: item, location: character.location });
  }
  return found;
}

/** Wood not under shelter becomes wet in Light Rain or worse (A.6), checked each minute. */
export function applyWetWoodMinute(world: World): void {
  const weather = weatherAt(world, world.minute);
  if (!world.rules.wetWood.wetWeather.includes(weather)) return;
  for (const { wood, location } of allWood(world)) {
    if (!isShelteredLocation(world, location)) {
      wood.wet = true;
      wood.dryHours = 0;
    }
  }
  const fire = world.fire;
  if (fire.state === "built" && !isShelteredLocation(world, world.rules.signalFire.location)) {
    fire.wet = true;
    fire.dryHours = 0;
  }
}

/** Wet wood and a wet fire dry after enough consecutive Clear/Cloudy hours (A.6). */
export function applyHourlyDrying(world: World, endedHour: number): void {
  const { dryWeather, dryAfterHours } = world.rules.wetWood;
  const weather = world.weather[endedHour];
  const dryHour = weather !== undefined && dryWeather.includes(weather);
  const dry = (thing: { wet: boolean; dryHours: number }): void => {
    if (!thing.wet) return;
    thing.dryHours = dryHour ? thing.dryHours + 1 : 0;
    if (thing.dryHours >= dryAfterHours) {
      thing.wet = false;
      thing.dryHours = 0;
    }
  };
  for (const { wood } of allWood(world)) dry(wood);
  dry(world.fire);
}
