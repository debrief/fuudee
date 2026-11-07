/**
 * The smoke suite, short and in order, always run: the extension activates (its first
 * walkthrough opening once), its tools are listed, serial 1 opens from the catalogue, and
 * current time and the viewport are shared with other extensions (SUB-26, SUB-27).
 */
import assert from "node:assert/strict";
import * as vscode from "vscode";
import type { DebriefApi } from "../../src/extension.js";
import { debrief, feature, helpers, openSerial1, screenshot, sleep, waitFor } from "./fixture.js";
import { firstRunWalkthrough } from "./walkthroughs.js";

export function smoke(): void {
  feature("smoke", () => {
    let api: DebriefApi;

    test("activates, the first walkthrough opening on the first activation only", async () => {
      api = await debrief();
      // Before anything closes the editors: the first walkthrough opened on this first activation, once only.
      await firstRunWalkthrough(api, helpers);
    });

    test("lists the tools", () => {
      assert.deepEqual(
        api.tools()!.tools.map((t) => t.name).sort(),
        ["core.add_note", "core.closest_approach", "core.range_rings", "core.track_summary"],
      );
    });

    test("opens serial 1 of the sample exercise from the catalogue", async () => {
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
      await vscode.commands.executeCommand("workbench.action.closePanel");
      await vscode.commands.executeCommand("workbench.action.closeAuxiliaryBar");
      await vscode.commands.executeCommand("workbench.view.extension.debrief");
      const opened = await openSerial1({ fresh: false });
      const names = opened.plot.features.flatMap((f) => (f.properties.kind === "plot" || f.properties.kind === "narrative" ? [] : [(f.properties as { name?: string }).name]));
      assert.ok(names.includes("BLUE ONE") && names.includes("RED ONE"));
      await sleep(1500); // let the map settle before the picture
      await screenshot("01-sample-serial-open");
    });

    test("shares current time and the viewport with another extension", async () => {
      // Shared state (SUB-26, SUB-27): current time starts at the plot's start;
      // another extension sets it, and the map's time control and markers follow.
      const start = api.getState()!.time;
      assert.equal(start.current, start.range.start);
      const heard: string[] = [];
      const listening = api.onDidChangeState((change, origin) => heard.push(`${Object.keys(change).join()}:${origin}`));
      try {
        const midway = new Date((Date.parse(start.range.start) + Date.parse(start.range.end)) / 2).toISOString();
        assert.equal(api.setState({ time: { current: midway, range: start.range } }), undefined);
        assert.match(api.setState({ time: { current: "1900-01-01T00:00:00.000Z", range: start.range } }) ?? "", /within the time range/);
        const viewport = await waitFor("the map to report its viewport", () => api.session.viewport);
        assert.deepEqual(api.getState()!.viewport, viewport);
        assert.ok(heard.includes("time:extension"));
      } finally {
        listening.dispose();
      }
      await sleep(1000);
      await screenshot("01b-current-time");
    });
  });
}
