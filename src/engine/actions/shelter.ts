// Beach Camp shelter: Repair, Install tarp, and hourly weather loss (spec A.10).

import { workBlockReason } from "../body";
import type { Character, World } from "../state";
import { workDuration } from "./duration";
import type { ActionDefs } from "./framework";

function atShelter(world: World, character: Character): string | null {
  const location = world.rules.shelter.location;
  return character.location === location ? null : `must be at ${location}`;
}

function woodCarried(character: Character): number {
  return character.inventory.filter((item) => item.kind === "wood").length;
}

function repairReason(world: World, character: Character): string | null {
  const needed = world.rules.shelter.repairWood;
  return (
    atShelter(world, character) ??
    (woodCarried(character) < needed ? "no wood bundle carried" : null) ??
    workBlockReason(world, character)
  );
}

function tarpReason(world: World, character: Character): string | null {
  if (world.shelter.tarpInstalled) return "tarp already installed";
  return (
    atShelter(world, character) ??
    (character.inventory.some((item) => item.kind === "tarp") ? null : "no tarp carried")
  );
}

function addShelter(world: World, amount: number): void {
  world.shelter.value = Math.min(world.rules.shelter.max, world.shelter.value + amount);
}

/** Hourly loss for the hour that just ended (A.10). Runs after health. */
export function applyHourlyShelterLoss(world: World, endedHour: number): void {
  const weather = world.weather[endedHour];
  const loss = weather === undefined ? 0 : (world.rules.shelter.lossPerHour[weather] ?? 0);
  world.shelter.value = Math.max(0, world.shelter.value - loss);
}

export const shelterActions: ActionDefs = {
  repair_shelter: {
    kind: "work",
    cancellable: true,
    validate: (world, character) => repairReason(world, character),
    recheck: (world, character) => repairReason(world, character),
    duration: (world, character) => workDuration(world, character, world.rules.actions.repair_shelter.minutes),
    complete(world, character) {
      // Uses the first carried bundles; wet wood is fine for repairs.
      for (let i = 0; i < world.rules.shelter.repairWood; i++) {
        const index = character.inventory.findIndex((item) => item.kind === "wood");
        if (index !== -1) character.inventory.splice(index, 1);
      }
      addShelter(world, world.rules.shelter.repairAmount);
      return { shelter: world.shelter.value };
    },
  },

  install_tarp: {
    // Not "work" in A.8, and A.12 gives no Exhausted or health requirement:
    // counts like take/drop/give, with no Tired multiplier.
    kind: "interact",
    cancellable: true,
    validate: (world, character) => tarpReason(world, character),
    recheck: (world, character) => tarpReason(world, character),
    duration: (world) => world.rules.actions.install_tarp.minutes,
    complete(world, character) {
      const index = character.inventory.findIndex((item) => item.kind === "tarp");
      if (index !== -1) character.inventory.splice(index, 1);
      world.shelter.tarpInstalled = true;
      addShelter(world, world.rules.shelter.tarpAmount);
      return { shelter: world.shelter.value };
    },
  },
};
