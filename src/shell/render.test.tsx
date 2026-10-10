// Smoke test: the dev shell renders to HTML without errors. Uses react-dom's
// server renderer, so no browser or extra package is needed. Effects (the
// real-time loop) do not run in a server render.

import { MantineProvider } from "@mantine/core";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import App from "../App";
import { createWorld, stepMinutes, submitAction } from "../engine";
import { createItem } from "../engine/actions/items";
import { itemChoices } from "./Controls";
import { EventLog } from "./EventLog";
import { NpcPanel } from "./NpcPanel";
import { WorldHeader, WorldView } from "./WorldView";

describe("dev shell render", () => {
  it("renders the app at session start", () => {
    const html = renderToString(
      <MantineProvider>
        <App />
      </MantineProvider>,
    );
    expect(html).toContain("Unscripted");
    expect(html).toContain("Day <!-- -->1<!-- --> <!-- -->08:00");
    expect(html).toContain("paused");
    expect(html).toContain("Beach Camp");
    expect(html).toContain("autonomy on");
    expect(html).toContain("Marcus Hale");
    expect(html).toContain("NPC autonomy (new session)");
    for (const label of ["Move", "Gather wood", "Build fire", "Light fire", "Sleep until rested", "Skip to end of action"]) {
      expect(html).toContain(label);
    }
  });

  it("lists carried items first, then items here", () => {
    const world = createWorld(1);
    world.characters.player.inventory.push(createItem(world, "lighter"));
    world.locations.beach_camp?.items.push(createItem(world, "wood"));
    world.locations.forest?.items.push(createItem(world, "tarp"));
    expect(itemChoices(world)).toEqual([
      { value: "lighter-1", label: "lighter-1 (3 uses) — carried" },
      { value: "wood-2", label: "wood-2 — here" },
    ]);
  });

  it("renders a busy world: actions, items, fire, and events", () => {
    const world = createWorld(1);
    world.characters.player.location = "wreckage";
    submitAction(world, "player", { type: "search" });
    submitAction(world, "npc1", { type: "move", to: "hilltop" }); // rejected
    stepMinutes(world, 45);
    world.fire = { state: "lit", fuel: 300, wet: true, dryHours: 0 };

    const html = renderToString(
      <MantineProvider>
        <WorldView world={world} />
        <EventLog world={world} />
      </MantineProvider>,
    );
    expect(html).toContain("item_found");
    expect(html).toContain("action_rejected");
    expect(html).toContain("no known route from beach_camp to hilltop");
    expect(html).toContain(">2.50<"); // 300 units = 2.5 fuel-hours
  });

  it("renders the NPC panel with autonomy on: names, goals, plan, and last decision", () => {
    const world = createWorld(1, { autonomy: true });
    const html = renderToString(
      <MantineProvider>
        <NpcPanel world={world} />
      </MantineProvider>,
    );
    expect(html).toContain("Marcus Hale");
    expect(html).toContain("Sarah Okafor");
    expect(html).toContain("make_camp_safe");
    expect(html).toContain("signal_rescue");
    expect(html).toContain("move → wreckage");
    expect(html).toContain("← now");
    expect(html).toContain("rule <!-- -->d");
    expect(html).not.toContain("Autonomy is off");
  });

  it("renders the NPC panel with autonomy off", () => {
    const world = createWorld(1);
    const html = renderToString(
      <MantineProvider>
        <NpcPanel world={world} />
        <WorldHeader world={world} speed={0} />
      </MantineProvider>,
    );
    expect(html).toContain("Autonomy is off");
    expect(html).toContain("none yet");
    expect(html).toContain("autonomy off");
  });
});
