// Items, carry slots, Take, Drop, Give, Search, and Gather wood
// (spec A.4, A.5, A.12).

import { workBlockReason } from "../body";
import { logEvent } from "../events";
import { isNpc } from "../npc/state";
import type { Character, Item, ItemKind, World } from "../state";
import { weatherAt } from "../weather";
import { workDuration } from "./duration";
import type { ActionDefs } from "./framework";

export function slotsOf(world: World, item: Item): number {
  return world.rules.items[item.kind].slots;
}

export function freeSlots(world: World, character: Character): number {
  const used = character.inventory.reduce((sum, item) => sum + slotsOf(world, item), 0);
  return world.rules.carrySlots - used;
}

function hasRoomFor(world: World, character: Character, item: Item): boolean {
  return slotsOf(world, item) <= freeSlots(world, character);
}

/** Creates a new item with a deterministic id and starting values from config. */
export function createItem(world: World, kind: ItemKind): Item {
  const id = `${kind}-${world.nextItemId}`;
  world.nextItemId += 1;
  const { items } = world.rules;
  switch (kind) {
    case "wood":
      return { id, kind, wet: false, dryHours: 0 };
    case "lighter":
      return { id, kind, usesLeft: items.lighter.uses };
    case "tarp":
      return { id, kind };
    case "flashlight":
      return { id, kind, batteryMinutes: items.flashlight.batteryMinutes };
  }
}

function itemHere(world: World, character: Character, itemId: string): Item | undefined {
  return world.locations[character.location]?.items.find((item) => item.id === itemId);
}

function itemCarried(character: Character, itemId: string): Item | undefined {
  return character.inventory.find((item) => item.id === itemId);
}

/** Moves an item out of a list by id and returns it. */
function removeById(list: Item[], itemId: string): Item | undefined {
  const index = list.findIndex((item) => item.id === itemId);
  return index === -1 ? undefined : list.splice(index, 1)[0];
}

function wrongPlace(character: Character, required: string | undefined): string | null {
  return required !== undefined && character.location !== required
    ? `must be at ${required}`
    : null;
}

function takeReason(world: World, character: Character, itemId: string): string | null {
  const item = itemHere(world, character, itemId);
  if (!item) return `${itemId} is not here`;
  if (!hasRoomFor(world, character, item)) return "no free carry slot";
  return null;
}

function dropReason(character: Character, itemId: string): string | null {
  return itemCarried(character, itemId) ? null : `not carrying ${itemId}`;
}

function giveReason(world: World, character: Character, itemId: string, to: string): string | null {
  const item = itemCarried(character, itemId);
  if (!item) return `not carrying ${itemId}`;
  const receiver = Object.values(world.characters).find((c) => c.id === to);
  if (!receiver || receiver.id === character.id) return `cannot give to ${to}`;
  if (!receiver.alive) return `${to} is dead`;
  if (receiver.location !== character.location) return `${to} is not here`;
  if (!hasRoomFor(world, receiver, item)) return `${to} has no free carry slot`;
  return null;
}

function searchReason(world: World, character: Character): string | null {
  return wrongPlace(character, world.rules.actions.search.location) ?? workBlockReason(world, character);
}

function gatherReason(world: World, character: Character): string | null {
  const rule = world.rules.actions.gather_wood;
  return (
    wrongPlace(character, rule.location) ??
    (freeSlots(world, character) < world.rules.items.wood.slots ? "no free carry slot" : null) ??
    workBlockReason(world, character)
  );
}

export const itemActions: ActionDefs = {
  take: {
    kind: "interact",
    cancellable: true,
    validate: (world, character, action) => takeReason(world, character, action.itemId),
    recheck: (world, character, action) => takeReason(world, character, action.itemId),
    duration: (world) => world.rules.actions.take.minutes,
    complete(world, character, action) {
      const item = removeById(world.locations[character.location]?.items ?? [], action.itemId);
      if (item) character.inventory.push(item);
      return {};
    },
  },

  drop: {
    kind: "interact",
    cancellable: true,
    validate: (_world, character, action) => dropReason(character, action.itemId),
    recheck: (_world, character, action) => dropReason(character, action.itemId),
    duration: (world) => world.rules.actions.drop.minutes,
    complete(world, character, action) {
      const item = removeById(character.inventory, action.itemId);
      if (item) world.locations[character.location]?.items.push(item);
      return {};
    },
  },

  give: {
    kind: "interact",
    cancellable: true,
    validate: (world, character, action) => giveReason(world, character, action.itemId, action.to),
    recheck: (world, character, action) => giveReason(world, character, action.itemId, action.to),
    duration: (world) => world.rules.actions.give.minutes,
    complete(world, character, action) {
      const item = removeById(character.inventory, action.itemId);
      if (item) world.characters[action.to].inventory.push(item);
      return {};
    },
  },

  search: {
    kind: "work",
    cancellable: true,
    validate: (world, character) => searchReason(world, character),
    recheck: (world, character) => searchReason(world, character),
    duration: (world, character) => workDuration(world, character, world.rules.actions.search.minutes),
    complete(world, character) {
      const kind = world.wreckageToFind.shift();
      if (kind === undefined) {
        if (isNpc(character.id)) world.npcs[character.id].wreckageSearchedOut = true;
        return { found: null };
      }
      const item = createItem(world, kind);
      world.locations[character.location]?.items.push(item);
      logEvent(world, "item_found", { item: item.id, kind }, character.id);
      return { found: item.id };
    },
  },

  gather_wood: {
    kind: "work",
    cancellable: true,
    validate: (world, character) => gatherReason(world, character),
    recheck: (world, character) => gatherReason(world, character),
    duration: (world, character) => workDuration(world, character, world.rules.actions.gather_wood.minutes),
    complete(world, character) {
      const bundle = createItem(world, "wood");
      if (bundle.kind === "wood") {
        // Wood gathered in rain is wet straight away (A.6; the Forest has no shelter).
        bundle.wet = world.rules.wetWood.wetWeather.includes(weatherAt(world, world.minute));
      }
      character.inventory.push(bundle);
      return { item: bundle.id };
    },
  },
};
