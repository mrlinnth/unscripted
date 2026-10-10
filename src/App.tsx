import { Container, Grid, Group, SegmentedControl, Stack, Title } from "@mantine/core";
import { EventLog } from "./shell/EventLog";
import type { Speed } from "./shell/runner";
import { useEngine } from "./shell/useEngine";
import { WorldHeader, WorldView } from "./shell/WorldView";

const SPEEDS: { label: string; value: string }[] = [
  { label: "Pause", value: "0" },
  { label: "1×", value: "1" },
  { label: "2×", value: "2" },
  { label: "4×", value: "4" },
];

function App() {
  const engine = useEngine();
  const { world } = engine;

  return (
    <Container size="xl" py="md">
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={2}>Unscripted</Title>
          <SegmentedControl
            data={SPEEDS}
            value={String(engine.speed)}
            onChange={(value) => engine.setSpeed(Number(value) as Speed)}
            disabled={world.ended}
          />
        </Group>
        <WorldHeader world={world} speed={engine.speed} />
        <Grid>
          <Grid.Col span={{ base: 12, lg: 7 }}>
            <WorldView world={world} />
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 5 }}>
            <EventLog world={world} />
          </Grid.Col>
        </Grid>
      </Stack>
    </Container>
  );
}

export default App;
