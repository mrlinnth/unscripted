// Smoke test: the dev shell renders to HTML without errors. Uses react-dom's
// server renderer, so no browser or extra package is needed. Effects (the
// real-time loop) do not run in a server render.

import { MantineProvider } from "@mantine/core";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import App from "../App";
import { createWorld, stepMinutes, submitAction } from "../engine";
import { EventLog } from "./EventLog";
import { WorldView } from "./WorldView";

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
});
