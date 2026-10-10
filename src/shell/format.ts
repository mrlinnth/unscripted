// Display text for the dev shell. Pure functions over world state.

import {
  clockAt,
  dayAt,
  fatigueCondition,
  isAsleep,
  type Action,
  type Character,
  type GameEvent,
  type Item,
  type JsonValue,
  type World,
} from "../engine";

/** "Day 1 08:00" for a game minute. */
export function timeLabel(world: World, minute: number): string {
  return `Day ${dayAt(world.rules, minute)} ${clockAt(world.rules, minute)}`;
}

/** "tired (512)": condition and the A.8 counter (stored in half-points). */
export function fatigueLabel(world: World, character: Character): string {
  return `${fatigueCondition(character, world.rules)} (${character.fatigue / 2})`;
}

export function statusLabel(character: Character): string {
  if (!character.alive) return "dead";
  if (character.action?.action.type === "collapse") return "collapsed";
  if (isAsleep(character)) return "asleep";
  return "awake";
}

export function itemLabel(item: Item): string {
  switch (item.kind) {
    case "wood":
      return `${item.id}${item.wet ? " (wet)" : ""}`;
    case "lighter":
      return `${item.id} (${item.usesLeft} uses)`;
    case "flashlight":
      return `${item.id} (${item.batteryMinutes} min)`;
    case "tarp":
      return item.id;
  }
}

/** "move → hilltop, 12 min left", or "sleep, until rested". */
export function actionLabel(world: World, character: Character): string {
  const current = character.action;
  if (!current) return "—";
  const name = stepLabel(current.action);
  if (current.endsAt === null) return `${name}, until done`;
  return `${name}, ${current.endsAt - world.minute} min left`;
}

/** "move → wreckage", "take → tarp-3", "search": one plan step. */
export function stepLabel(action: Action): string {
  const { type, ...params } = action as { type: string } & Record<string, unknown>;
  const detail = Object.values(params).filter((v) => v !== undefined).join(", ");
  return detail ? `${type} → ${detail}` : type;
}

/** Wood at a location: dry and wet counts. */
export function woodCounts(items: Item[]): { dry: number; wet: number } {
  let dry = 0;
  let wet = 0;
  for (const item of items) {
    if (item.kind !== "wood") continue;
    if (item.wet) wet++;
    else dry++;
  }
  return { dry, wet };
}

function short(value: JsonValue | undefined): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value)) return value.map(short).join(", ");
  const { type, ...rest } = value;
  const parts = Object.values(rest).map(short).filter(Boolean);
  return [type === undefined ? "" : short(type), ...parts].filter(Boolean).join(" ");
}

/** One-line summary of an event's data. */
export function eventSummary(event: GameEvent): string {
  const d = event.data;
  switch (event.type) {
    case "action_started":
      return `${short(d.action)}${d.minutes === null ? "" : ` (${short(d.minutes)} min)`}`;
    case "action_completed": {
      const result = short(d.result);
      return result ? `${short(d.action)} → ${result}` : short(d.action);
    }
    case "action_rejected":
    case "action_interrupted":
      return `${short(d.action)}: ${short(d.reason)}`;
    case "action_cancelled":
      return short(d.action);
    case "weather_changed":
    case "fatigue_changed":
      return `${short(d.from)} → ${short(d.to)}`;
    case "fire_changed":
      return `${short(d.from)} → ${short(d.to)}, ${Number(d.fuelHours).toFixed(2)} h${d.reason ? ` (${short(d.reason)})` : ""}`;
    case "npc_decision":
      return `${short(d.rule)}: ${short(d.reason)}`;
    case "plan_created":
    case "plan_changed": {
      const steps = Array.isArray(d.steps) ? d.steps.map(short).join(" → ") : "";
      return `${short(d.goal)}: ${steps}`;
    }
    case "goal_done":
    case "goal_dropped":
      return `${short(d.goal)} (${short(d.reason)})`;
    default:
      return short(d);
  }
}

/** Mantine color for an event type; undefined means the default color. */
export function eventColor(event: GameEvent): string | undefined {
  switch (event.type) {
    case "action_rejected":
    case "death":
      return "red";
    case "action_interrupted":
    case "collapse":
      return "orange";
    case "fire_changed":
      return "yellow";
    case "discovery":
    case "item_found":
      return "teal";
    case "npc_decision":
      return "blue";
    case "goal_done":
      return "green";
    case "goal_dropped":
      return "orange";
    default:
      return undefined;
  }
}
