import { Container, Grid, Stack, Title } from "@mantine/core";
import { Controls } from "./shell/Controls";
import { EventLog } from "./shell/EventLog";
import { NpcPanel } from "./shell/NpcPanel";
import { useEngine } from "./shell/useEngine";
import { WorldHeader, WorldView } from "./shell/WorldView";

function App() {
  const engine = useEngine();
  const { world } = engine;

  return (
    <Container size="xl" py="md">
      <Stack gap="md">
        <Title order={2}>Unscripted</Title>
        <WorldHeader world={world} speed={engine.speed} />
        <Grid>
          <Grid.Col span={{ base: 12, lg: 7 }}>
            <Stack gap="md">
              <Controls engine={engine} />
              <NpcPanel world={world} />
              <WorldView world={world} />
            </Stack>
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
