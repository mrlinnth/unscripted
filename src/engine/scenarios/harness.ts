// Scenario harness for the A.13 tests: a fixed seed, forced weather and search
// order, and a script of actions. The same inputs must give the same log.

import type { Action } from "../actions/types";
import { loadWorldRules, type RulesOverrides, type WeatherState } from "../config";
import type { GameEvent } from "../events";
import { createWorld, getClock, step, submitAction } from "../index";
import { CHARACTER_IDS, type CharacterId, type ItemKind, type World } from "../state";
import { gameMinuteAt, MINUTES_PER_HOUR, sessionHours } from "../time";

const shippedRules = loadWorldRules();

/** Game minute for a day and clock time, using the shipped session start. */
export function at(day: number, time: string): number {
  return gameMinuteAt(shippedRules, day, time);
}

export interface WeatherSpan {
  /** Game minute on the hour, inclusive. */
  from: number;
  /** Game minute on the hour, exclusive. */
  to: number;
  state: WeatherState;
}

/** A full forced weather sequence: `base` everywhere except the given spans. */
export function weatherPlan(spans: WeatherSpan[], base: WeatherState = "clear"): WeatherState[] {
  const plan: WeatherState[] = Array.from({ length: sessionHours(shippedRules) }, () => base);
  for (const span of spans) {
    if (span.from % MINUTES_PER_HOUR !== 0 || span.to % MINUTES_PER_HOUR !== 0) {
      throw new Error(`weather spans must start and end on the hour (got ${span.from}–${span.to})`);
    }
    for (let hour = span.from / MINUTES_PER_HOUR; hour < span.to / MINUTES_PER_HOUR; hour++) {
      plan[hour] = span.state;
    }
  }
  return plan;
}

export interface ScriptStep {
  actor: CharacterId;
  action: Action;
  /** Do not submit before this game minute. */
  at?: number;
  /** The step must be rejected; the script then moves on. */
  expectReject?: boolean;
}

export interface ScenarioOptions {
  seed: number;
  weather?: WeatherState[];
  searchOrder?: ItemKind[];
  configOverrides?: RulesOverrides;
  /** Changes the world before the first step (for example a pre-placed fire). */
  setup?: (world: World) => void;
  script: ScriptStep[];
  /** Run until this game minute (or the session end). */
  until: number;
}

export interface ScenarioResult {
  world: World;
  events: GameEvent[];
  /** Script steps that were never submitted. */
  unfinished: ScriptStep[];
}

function describeStep(step: ScriptStep, index: number): string {
  return `step ${index + 1} (${step.actor}: ${step.action.type})`;
}

/**
 * Runs a script. Each actor's steps run in order: the next one is submitted as
 * soon as that actor has no current action. Actors are checked in the fixed
 * character order. A rejected step throws, unless marked `expectReject`.
 */
export function runScenario(options: ScenarioOptions): ScenarioResult {
  const world = createWorld(options.seed, {
    ...(options.weather ? { weather: options.weather } : {}),
    ...(options.searchOrder ? { searchOrder: options.searchOrder } : {}),
    ...(options.configOverrides ? { rules: options.configOverrides } : {}),
  });
  options.setup?.(world);

  const queues = new Map<CharacterId, { step: ScriptStep; index: number }[]>();
  options.script.forEach((s, index) => {
    const queue = queues.get(s.actor) ?? [];
    queue.push({ step: s, index });
    queues.set(s.actor, queue);
  });

  const submitReady = (): void => {
    for (const id of CHARACTER_IDS) {
      const queue = queues.get(id);
      while (queue && queue.length > 0 && world.characters[id].action === null) {
        const next = queue[0];
        if (!next || (next.step.at !== undefined && world.minute < next.step.at)) break;
        queue.shift();
        const result = submitAction(world, id, next.step.action);
        const clock = getClock(world);
        const when = `Day ${clock.day} ${clock.time}`;
        if (next.step.expectReject && result.ok) {
          throw new Error(`${describeStep(next.step, next.index)} was expected to be rejected at ${when}`);
        }
        if (!next.step.expectReject && !result.ok) {
          throw new Error(`${describeStep(next.step, next.index)} rejected at ${when}: ${result.reason}`);
        }
        if (result.ok) break; // the actor is busy now
      }
    }
  };

  for (;;) {
    submitReady();
    if (world.minute >= options.until || world.ended) break;
    step(world);
  }

  const unfinished = [...queues.values()].flat().map((entry) => entry.step);
  return { world, events: world.events, unfinished };
}
