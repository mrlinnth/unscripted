// NPC panel for the dev shell: each NPC's goals, current plan, and last
// decision. Reads world state only; the NPC rules themselves stay limited.

import { Badge, Group, List, Paper, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { NPC_IDS, loadNpcConfig, type GoalStatus, type NpcId, type World } from "../engine";
import { stepLabel, timeLabel } from "./format";

// Shipped profiles, for display names. The shell never overrides them.
const PROFILES = loadNpcConfig().npcs;

const STATUS_COLOR: Record<GoalStatus, string> = { active: "blue", done: "green", dropped: "gray" };

function NpcCard({ world, id }: { world: World; id: NpcId }) {
  const npc = world.npcs[id];
  const plan = npc.plan;
  const decision = npc.lastDecision;
  return (
    <Paper withBorder p="sm">
      <Stack gap="xs">
        <Group gap="xs">
          <Title order={5}>{PROFILES[id].identity.name}</Title>
          <Text size="sm" c="dimmed">
            {id}
          </Text>
        </Group>

        <Group gap={4}>
          {npc.goals.map((goal) => (
            <Badge key={goal.id} color={STATUS_COLOR[goal.status]} variant={goal.status === "active" ? "light" : "filled"}>
              {goal.id} · {goal.priority} · {goal.status}
            </Badge>
          ))}
        </Group>

        <div>
          <Text size="sm" fw={600}>
            Plan{plan ? `: ${plan.goalId}` : ""}
          </Text>
          {plan ? (
            <List size="sm" type="ordered">
              {plan.steps.map((step, i) => (
                <List.Item key={i}>
                  <Text size="sm" fw={i === plan.index ? 700 : undefined} c={i < plan.index ? "dimmed" : undefined}>
                    {stepLabel(step)}
                    {i === plan.index ? "  ← now" : ""}
                  </Text>
                </List.Item>
              ))}
            </List>
          ) : (
            <Text size="sm" c="dimmed">
              none
            </Text>
          )}
        </div>

        <div>
          <Text size="sm" fw={600}>
            Last decision
          </Text>
          {decision ? (
            <Text size="sm">
              {timeLabel(world, decision.minute)} · rule {decision.rule} · {decision.reason}
            </Text>
          ) : (
            <Text size="sm" c="dimmed">
              none yet
            </Text>
          )}
        </div>
      </Stack>
    </Paper>
  );
}

export function NpcPanel({ world }: { world: World }) {
  return (
    <Stack gap="xs">
      <Group gap="xs">
        <Title order={4}>NPCs</Title>
        {!world.autonomy && (
          <Text size="sm" c="dimmed">
            Autonomy is off: NPCs act only when given actions.
          </Text>
        )}
      </Group>
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        {NPC_IDS.map((id) => (
          <NpcCard key={id} world={world} id={id} />
        ))}
      </SimpleGrid>
    </Stack>
  );
}
