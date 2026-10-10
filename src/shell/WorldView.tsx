// World truth view for the dev shell: everything, including what the player
// could not know. Not the final player UI (spec §5.8 comes in Phase 5).

import { Badge, Group, Paper, SimpleGrid, Stack, Table, Text, Title } from "@mantine/core";
import {
  CHARACTER_IDS,
  fuelHours,
  getClock,
  getWeather,
  isProtected,
  type World,
} from "../engine";
import { actionLabel, fatigueLabel, itemLabel, statusLabel, woodCounts } from "./format";
import type { Speed } from "./runner";

export function WorldHeader({ world, speed }: { world: World; speed: Speed }) {
  const clock = getClock(world);
  return (
    <Group gap="sm">
      <Title order={3}>
        Day {clock.day} {clock.time}
      </Title>
      <Badge color={clock.night ? "indigo" : "yellow"}>{clock.night ? "night" : "day"}</Badge>
      <Badge variant="light">{getWeather(world)}</Badge>
      <Badge variant="outline">{speed === 0 ? "paused" : `${speed}×`}</Badge>
      {world.ended && <Badge color="red">session ended</Badge>}
      <Text size="sm" c="dimmed">
        seed {world.seed}
      </Text>
      <Badge variant="dot" color={world.autonomy ? "green" : "gray"}>
        {world.autonomy ? "autonomy on" : "autonomy off"}
      </Badge>
    </Group>
  );
}

function CharactersTable({ world }: { world: World }) {
  return (
    <Table striped withTableBorder fz="sm">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Character</Table.Th>
          <Table.Th>Location</Table.Th>
          <Table.Th>Fatigue</Table.Th>
          <Table.Th>Health</Table.Th>
          <Table.Th>Status</Table.Th>
          <Table.Th>Inventory</Table.Th>
          <Table.Th>Action</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {CHARACTER_IDS.map((id) => {
          const c = world.characters[id];
          return (
            <Table.Tr key={id}>
              <Table.Td>{id}</Table.Td>
              <Table.Td>{c.location}</Table.Td>
              <Table.Td>{fatigueLabel(world, c)}</Table.Td>
              <Table.Td>{c.health}</Table.Td>
              <Table.Td>{statusLabel(c)}</Table.Td>
              <Table.Td>{c.inventory.map(itemLabel).join(", ") || "—"}</Table.Td>
              <Table.Td>{actionLabel(world, c)}</Table.Td>
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
  );
}

function LocationsTable({ world }: { world: World }) {
  return (
    <Table striped withTableBorder fz="sm">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Location</Table.Th>
          <Table.Th>Wood (dry / wet)</Table.Th>
          <Table.Th>Other items</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {world.rules.locations.map(({ id, name }) => {
          const items = world.locations[id]?.items ?? [];
          const wood = woodCounts(items);
          const others = items.filter((item) => item.kind !== "wood").map(itemLabel);
          return (
            <Table.Tr key={id}>
              <Table.Td>{name}</Table.Td>
              <Table.Td>
                {wood.dry} / {wood.wet}
              </Table.Td>
              <Table.Td>{others.join(", ") || "—"}</Table.Td>
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
  );
}

function ShelterAndFire({ world }: { world: World }) {
  const shelterLocation = world.rules.shelter.location;
  const protecting = isProtected(world, { ...world.characters.player, location: shelterLocation });
  const fire = world.fire;
  return (
    <SimpleGrid cols={2}>
      <Paper withBorder p="sm">
        <Text fw={600}>Shelter</Text>
        <Text size="sm">
          {world.shelter.value} / {world.rules.shelter.max}
          {world.shelter.tarpInstalled ? ", tarp installed" : ""}
        </Text>
        <Badge color={protecting ? "green" : "red"} variant="light">
          {protecting ? "protecting" : "not protecting"}
        </Badge>
      </Paper>
      <Paper withBorder p="sm">
        <Text fw={600}>Signal fire</Text>
        <Text size="sm">
          {fire.state}, {fuelHours(fire).toFixed(2)} h fuel
        </Text>
        <Group gap="xs">
          <Badge color={fire.state === "lit" ? "orange" : "gray"} variant="light">
            {fire.state}
          </Badge>
          {fire.wet && <Badge color="blue" variant="light">wet</Badge>}
        </Group>
      </Paper>
    </SimpleGrid>
  );
}

export function WorldView({ world }: { world: World }) {
  return (
    <Stack gap="md">
      <CharactersTable world={world} />
      <LocationsTable world={world} />
      <ShelterAndFire world={world} />
    </Stack>
  );
}
