// Player controls for the dev shell. Every action is always shown; the engine
// decides validity, and rejections appear in the result line and event log.

import { Button, Group, NumberInput, Paper, SegmentedControl, Select, Stack, Text } from "@mantine/core";
import { useState } from "react";
import type { Action, CharacterId, SubmitResult, World } from "../engine";
import { itemLabel } from "./format";
import type { Speed } from "./runner";
import type { EngineHandle } from "./useEngine";

const SPEEDS: { label: string; value: string }[] = [
  { label: "Pause", value: "0" },
  { label: "1×", value: "1" },
  { label: "2×", value: "2" },
  { label: "4×", value: "4" },
];

const OTHERS: { label: string; value: CharacterId }[] = [
  { label: "npc1", value: "npc1" },
  { label: "npc2", value: "npc2" },
];

/** Items the player could act on: carried items first, then items here. */
export function itemChoices(world: World): { value: string; label: string }[] {
  const player = world.characters.player;
  const carried = player.inventory.map((item) => ({ value: item.id, label: `${itemLabel(item)} — carried` }));
  const here = (world.locations[player.location]?.items ?? []).map((item) => ({
    value: item.id,
    label: `${itemLabel(item)} — here`,
  }));
  return [...carried, ...here];
}

export function Controls({ engine }: { engine: EngineHandle }) {
  const { world } = engine;
  const [destination, setDestination] = useState<string | null>("forest");
  const [itemId, setItemId] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>("npc1");
  const [minutes, setMinutes] = useState<number>(60);
  const [last, setLast] = useState<{ label: string; result: SubmitResult } | null>(null);

  const locations = world.rules.locations.map(({ id, name }) => ({ value: id, label: name }));
  const items = itemChoices(world);

  const run = (label: string, action: Action): void => {
    setLast({ label, result: engine.submit(action) });
  };

  const actionButtons: { label: string; build: () => Action }[] = [
    { label: "Move", build: () => ({ type: "move", to: destination ?? "" }) },
    { label: "Explore", build: () => ({ type: "explore" }) },
    { label: "Gather wood", build: () => ({ type: "gather_wood" }) },
    { label: "Search", build: () => ({ type: "search" }) },
    { label: "Take", build: () => ({ type: "take", itemId: itemId ?? "" }) },
    { label: "Drop", build: () => ({ type: "drop", itemId: itemId ?? "" }) },
    {
      label: "Give",
      build: () => ({ type: "give", itemId: itemId ?? "", to: (target ?? "npc1") as CharacterId }),
    },
    { label: "Build fire", build: () => ({ type: "build_fire" }) },
    {
      // Uses the selected bundle if one is chosen, else the engine picks (dry first).
      label: "Add wood",
      build: () => (itemId?.startsWith("wood-") ? { type: "add_wood", itemId } : { type: "add_wood" }),
    },
    { label: "Light fire", build: () => ({ type: "light_fire" }) },
    { label: "Repair shelter", build: () => ({ type: "repair_shelter" }) },
    { label: "Install tarp", build: () => ({ type: "install_tarp" }) },
    { label: "Observe weather", build: () => ({ type: "observe_weather" }) },
    { label: "Wait", build: () => ({ type: "wait", minutes }) },
    { label: "Sleep (minutes)", build: () => ({ type: "sleep", minutes }) },
    { label: "Sleep until rested", build: () => ({ type: "sleep" }) },
  ];

  return (
    <Paper withBorder p="sm">
      <Stack gap="sm">
        <Group gap="xs">
          <SegmentedControl
            data={SPEEDS}
            value={String(engine.speed)}
            onChange={(value) => engine.setSpeed(Number(value) as Speed)}
            disabled={world.ended}
          />
          <Button variant="light" onClick={engine.skipToActionEnd} disabled={!world.characters.player.action}>
            Skip to end of action
          </Button>
          <Button variant="light" color="orange" onClick={() => setLast({ label: "Cancel", result: engine.cancel() })}>
            Cancel
          </Button>
          <Button variant="subtle" color="gray" onClick={engine.newSession}>
            New session
          </Button>
        </Group>

        <Group gap="xs" grow>
          <Select label="Destination" data={locations} value={destination} onChange={setDestination} />
          <Select
            label="Item"
            data={items}
            value={items.some((i) => i.value === itemId) ? itemId : null}
            onChange={setItemId}
            placeholder={items.length ? "Choose" : "None here"}
            clearable
          />
          <Select label="Give to" data={OTHERS} value={target} onChange={setTarget} />
          <NumberInput
            label="Minutes"
            value={minutes}
            min={1}
            onChange={(value) => setMinutes(typeof value === "number" ? value : Number(value) || 1)}
          />
        </Group>

        <Group gap="xs">
          {actionButtons.map(({ label, build }) => (
            <Button key={label} size="xs" onClick={() => run(label, build())}>
              {label}
            </Button>
          ))}
        </Group>

        {last && (
          <Text size="sm" c={last.result.ok ? "green" : "red"}>
            {last.label}: {last.result.ok ? "started" : last.result.reason}
          </Text>
        )}
      </Stack>
    </Paper>
  );
}
