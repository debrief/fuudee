/**
 * The Phase 1 tracer, driven inside VS Code: open a plot from a catalogue,
 * select tracks, see the tools on offer, fill in a form, run tools, and see
 * the results on the map and in the results panel.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import * as vscode from "vscode";
import type { DebriefApi } from "../../src/extension.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function screenshot(name: string, keepNotifications = false): Promise<void> {
  const folder = process.env.DEBRIEF_SCREENSHOTS;
  if (!folder || !process.env.DISPLAY) return;
  if (!keepNotifications) await vscode.commands.executeCommand("notifications.clearAll");
  await sleep(500);
  // The window does not fill the virtual screen; trim the empty border.
  execFileSync("import", ["-window", "root", "-trim", "+repage", path.join(folder, `${name}.png`)]);
}

async function waitFor<T>(what: string, probe: () => T | undefined, timeoutMs = 30000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = probe();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await sleep(200);
  }
}

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension<DebriefApi>("debrief.debrief")!;
  const api = await extension.activate();
  await api.ready;
  const listing = await waitFor("tools", () => api.tools());
  assert.deepEqual(
    listing.tools.map((t) => t.name).sort(),
    ["core.add_note", "core.closest_approach", "core.range_rings", "core.track_summary"],
  );

  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  await vscode.commands.executeCommand("workbench.action.closePanel");
  await vscode.commands.executeCommand("workbench.action.closeAuxiliaryBar");
  await vscode.commands.executeCommand("workbench.view.extension.debrief");

  // Open the plot from the catalogue.
  await vscode.commands.executeCommand("debrief.openPlot", "exercise-clear-water", "serial-1");
  const opened = await waitFor("plot", () => api.session.current);
  assert.equal(opened.plot.features.length, 3);
  await sleep(4000);
  await screenshot("01-plot-open");

  // Select one track: the tools for one track are offered.
  await vscode.commands.executeCommand("debrief.select", ["track-nelson"]);
  await sleep(1500);
  await vscode.commands.executeCommand("debrief.showToolForm", "core.range_rings");
  await sleep(3000);
  await screenshot("02-range-rings-form");

  // Run it: rings appear on the map, and history records the run.
  const problem = await vscode.commands.executeCommand("debrief.runTool", "core.range_rings", {
    spacing: { value: 1.5, unit: "[nmi_i]" },
    rings: 3,
    at: "1995-12-12T05:40:00.000Z",
  });
  assert.equal(problem, undefined);
  const withRings = await waitFor("rings", () => api.session.current?.plot.features.length === 6 || undefined);
  assert.ok(withRings);
  assert.equal(api.session.current!.plot.provenance.at(-1)?.tool?.name, "core.range_rings");

  // Two tracks: closest approach is offered; run it and see the result.
  await vscode.commands.executeCommand("debrief.select", ["track-nelson", "track-blue"]);
  await sleep(1500);
  await sleep(1500);
  await screenshot("03-rings-and-two-tracks-selected");
  assert.equal(await vscode.commands.executeCommand("debrief.runTool", "core.closest_approach", {}), undefined);
  await waitFor("closest approach line", () =>
    api.session.current?.plot.features.some((f) => f.id.startsWith("cpa-")) || undefined,
  );
  await sleep(3000);
  await screenshot("04-closest-approach", true);

  await vscode.commands.executeCommand("debrief.select", ["track-nelson", "track-blue", "track-trawler-7"]);
  assert.equal(await vscode.commands.executeCommand("debrief.runTool", "core.track_summary", {}), undefined);
  await sleep(3000);
  await screenshot("05-track-summary");

  // A tool that does not apply is refused, with the reason.
  await vscode.commands.executeCommand("debrief.select", ["track-nelson"]);
  const refused = await vscode.commands.executeCommand<string>("debrief.runTool", "core.closest_approach", {});
  assert.match(refused ?? "", /does not apply to this selection/);
}
