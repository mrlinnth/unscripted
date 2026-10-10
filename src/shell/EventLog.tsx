// Event log panel: newest first. Rejected and interrupted events stand out.

import { Paper, ScrollArea, Table, Text, Title } from "@mantine/core";
import type { World } from "../engine";
import { eventColor, eventSummary, timeLabel } from "./format";

/** Only the newest events are rendered, to keep the panel fast. */
const MAX_ROWS = 300;

export function EventLog({ world }: { world: World }) {
  const events = world.events.slice(-MAX_ROWS).reverse();
  return (
    <Paper withBorder p="sm">
      <Title order={4} mb="xs">
        Event log ({world.events.length})
      </Title>
      <ScrollArea h={600}>
        <Table fz="xs" verticalSpacing={2}>
          <Table.Tbody>
            {events.map((event, i) => {
              const color = eventColor(event);
              return (
                <Table.Tr key={world.events.length - i}>
                  <Table.Td style={{ whiteSpace: "nowrap" }}>{timeLabel(world, event.minute)}</Table.Td>
                  <Table.Td>{event.actor ?? ""}</Table.Td>
                  <Table.Td>
                    <Text size="xs" c={color} fw={color ? 600 : undefined}>
                      {event.type}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c={color}>
                      {eventSummary(event)}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Paper>
  );
}
