// React hook that owns one world and drives it in real time. React never
// changes world state directly: it calls engine functions and re-renders.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelAction,
  createWorld,
  submitAction,
  type Action,
  type SubmitResult,
  type World,
} from "../engine";
import { newSeed, runSteps, skipToActionEnd, stepsForElapsed, type Speed } from "./runner";

const TICK_MS = 100;

export interface EngineHandle {
  /** The live world. It is mutated in place; `version` changes after each update. */
  world: Readonly<World>;
  version: number;
  speed: Speed;
  setSpeed: (speed: Speed) => void;
  submit: (action: Action) => SubmitResult;
  cancel: () => SubmitResult;
  skipToActionEnd: () => void;
  /** Starts a new session with a new seed. `autonomy`: NPCs act on their own. */
  newSession: (autonomy: boolean) => void;
}

export function useEngine(): EngineHandle {
  const [world, setWorld] = useState<World>(() => createWorld(newSeed(), { autonomy: true }));
  const [version, setVersion] = useState(0);
  const [speed, setSpeed] = useState<Speed>(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  // Real-time loop: one interval, carrying leftover time between ticks.
  const carried = useRef(0);
  useEffect(() => {
    if (speed === 0 || world.ended) return;
    carried.current = 0;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const result = stepsForElapsed(carried.current, now - last, speed);
      last = now;
      carried.current = result.carriedMs;
      if (result.steps > 0 && runSteps(world, result.steps) > 0) bump();
      if (world.ended) setSpeed(0);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [speed, world, bump]);

  const submit = useCallback(
    (action: Action): SubmitResult => {
      const result = submitAction(world, "player", action);
      bump();
      return result;
    },
    [world, bump],
  );

  const cancel = useCallback((): SubmitResult => {
    const result = cancelAction(world, "player");
    bump();
    return result;
  }, [world, bump]);

  const skip = useCallback(() => {
    if (skipToActionEnd(world) > 0) bump();
  }, [world, bump]);

  const newSession = useCallback(
    (autonomy: boolean) => {
      setSpeed(0);
      setWorld(createWorld(newSeed(), { autonomy }));
      bump();
    },
    [bump],
  );

  return { world, version, speed, setSpeed, submit, cancel, skipToActionEnd: skip, newSession };
}
