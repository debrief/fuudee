/**
 * The Phase 1 tracer, driven inside VS Code: open a plot from a catalogue,
 * select tracks, see the tools on offer, fill in a form, run tools, and see
 * the results on the map and in the results panel. Phase 2 adds shared state:
 * current time set by another extension and by a tool.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
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

async function waitFor<T>(what: string, probe: () => T | undefined | Promise<T | undefined>, timeoutMs = 30000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await sleep(200);
  }
}

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension<DebriefApi>("debrief.debrief")!;
  const api = await extension.activate();
  await api.ready;
  const listing = await waitFor("tools", () => {
    if (api.toolsProblem()) throw new Error(`Tools did not start: ${api.toolsProblem()}`);
    return api.tools();
  }, 120000);
  assert.deepEqual(
    listing.tools.map((t) => t.name).sort(),
    ["core.add_note", "core.closest_approach", "core.range_rings", "core.track_summary"],
  );

  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  await vscode.commands.executeCommand("workbench.action.closePanel");
  await vscode.commands.executeCommand("workbench.action.closeAuxiliaryBar");
  await vscode.commands.executeCommand("workbench.view.extension.debrief");

  // Open serial 1 of the sample exercise from the catalogue.
  await vscode.commands.executeCommand("debrief.openPlot", "sample-exercise", "serial-1");
  const opened = await waitFor("plot", () => api.session.current);
  const names = opened.plot.features.flatMap((f) => (f.properties.kind === "plot" ? [] : [f.properties.name]));
  assert.ok(names.includes("BLUE ONE") && names.includes("RED ONE"));
  await waitFor("the map to draw the plot", () => api.mapShowing() === "serial-1" || undefined);
  await sleep(1500); // let the map settle before the picture
  await screenshot("01-sample-serial-open");

  // Shared state (SUB-26, SUB-27): current time starts at the plot's start;
  // another extension sets it, and the map's time control and markers follow.
  const start = api.getState()!.time;
  assert.equal(start.current, start.range.start);
  const heard: string[] = [];
  const listening = api.onDidChangeState((change, origin) => heard.push(`${Object.keys(change).join()}:${origin}`));
  const midway = new Date((Date.parse(start.range.start) + Date.parse(start.range.end)) / 2).toISOString();
  assert.equal(api.setState({ time: { current: midway, range: start.range } }), undefined);
  assert.match(api.setState({ time: { current: "1900-01-01T00:00:00.000Z", range: start.range } }) ?? "", /within the time range/);
  const viewport = await waitFor("the map to report its viewport", () => api.session.viewport);
  assert.deepEqual(api.getState()!.viewport, viewport);
  assert.ok(heard.includes("time:extension"));
  await sleep(1000);
  await screenshot("01b-current-time");

  // --- The time controller (CAP-28): a view at the top of the Debrief sidebar --------
  await waitFor("the time controller in the sidebar", () => api.timeControllerShowing() || undefined);
  // The time window is view state: saved in the plot file (its island), never a step in its history.
  const period = api.session.period()!;
  const base = api.session.current!.base;
  const narrow = { start: "2023-06-15T09:00:00.000Z", end: "2023-06-15T10:00:00.000Z" };
  const checks = api.viewChecks();
  assert.equal(await vscode.commands.executeCommand("debrief.setTimeWindow", narrow), undefined);
  assert.deepEqual(api.getState()!.time.range, narrow);
  assert.deepEqual(api.session.current!.base, base, "no step in the history");
  const plotPath = path.join(opened.store.location, "serial-1", "plot.geojson");
  const island = () => JSON.parse(readFileSync(plotPath, "utf8")).features.find((f: { properties: { kind: string } }) => f.properties.kind === "plot").properties.view;
  assert.deepEqual(island().time_window, narrow);
  await sleep(2500);
  // Debrief's own save is never taken for a colleague's: the plot is not opened again for it.
  assert.equal(api.viewChecks(), checks, "Debrief's own save of the window was checked as a change elsewhere");
  await screenshot("01c-time-window");
  // A colleague's window, written by another process: noticed, shown, and said.
  const theirs = { start: "2023-06-15T10:00:00.000Z", end: "2023-06-15T11:00:00.000Z" };
  execFileSync(process.env.DEBRIEF_PYTHON || "python3", [
    "-c",
    "import sys, json; from pathlib import Path; from debrief_stac import Catalogue; from debrief_schemas import models; " +
      "c = Catalogue.open(Path(sys.argv[1])); view, h = c.read_view('serial-1'); " +
      "c.write_view('serial-1', {'time_window': json.loads(sys.argv[2])}, h, agent=models.AgentRef(kind='person', name='a colleague'))",
    opened.store.location,
    JSON.stringify(theirs),
  ]);
  await waitFor("the colleague's window", () => api.getState()?.time.range.start === theirs.start || undefined);
  assert.deepEqual(api.session.current!.base, base, "the plot's content was not read again as a change");
  // Back to the whole plot, saved over theirs, which Debrief has read since.
  assert.equal(await vscode.commands.executeCommand("debrief.setTimeWindow", period), undefined);
  assert.deepEqual(island().time_window, period);
  // Two windows let go of in quick succession, as two key presses are: the first one's
  // save finishing never puts it back on screen over the second.
  const ranges: string[] = [];
  const watching = api.onDidChangeState((change) => change.time && ranges.push(change.time.range.start));
  const first = { start: "2023-06-15T08:05:00.000Z", end: period.end };
  const second = { start: "2023-06-15T08:10:00.000Z", end: period.end };
  await Promise.all([
    vscode.commands.executeCommand("debrief.setTimeWindow", first),
    vscode.commands.executeCommand("debrief.setTimeWindow", second),
  ]);
  watching.dispose();
  assert.deepEqual(ranges, [first.start, second.start], "the window shown went back to one let go of earlier");
  assert.deepEqual(island().time_window, second);
  assert.equal(await vscode.commands.executeCommand("debrief.setTimeWindow", period), undefined);

  // Select BLUE ONE: the tools for one track are offered; open range rings.
  await vscode.commands.executeCommand("debrief.select", ["track-blue-one"]);
  await waitFor("tools for one track", () => api.offered().includes("core.range_rings") || undefined);
  assert.ok(!api.offered().includes("core.closest_approach"));
  await vscode.commands.executeCommand("debrief.showToolForm", "core.range_rings");
  await sleep(3000);
  await screenshot("02-range-rings-form");

  // Run it: rings appear on the map, and history records the run.
  const before = opened.plot.features.length;
  const problem = await vscode.commands.executeCommand("debrief.runTool", "core.range_rings", {
    spacing: { value: 1, unit: "[nmi_i]" },
    rings: 4,
    at: "2023-06-15T09:30:00.000Z",
  });
  assert.equal(problem, undefined);
  await waitFor("rings", () => (api.session.current?.plot.features.length === before + 5) || undefined);
  assert.equal(api.session.current!.plot.provenance.at(-1)?.tool?.name, "core.range_rings");
  // Nor is a change to the plot's content Debrief made itself.
  const checksAfterRun = api.viewChecks();
  await sleep(2500);
  assert.equal(api.viewChecks(), checksAfterRun, "Debrief's own tool run was checked as a change elsewhere");

  // BLUE ONE and RED ONE: closest approach is offered; run it and see the result.
  // The window first ends before the moment it finds (09:21), so that moment is outside it.
  const early = { start: period.start, end: "2023-06-15T09:00:00.000Z" };
  assert.equal(await vscode.commands.executeCommand("debrief.setTimeWindow", early), undefined);
  await vscode.commands.executeCommand("debrief.select", ["track-blue-one", "track-red-one"]);
  await waitFor("tools for two tracks", () => api.offered().includes("core.closest_approach") || undefined);
  assert.equal(await vscode.commands.executeCommand("debrief.runTool", "core.closest_approach", {}), undefined);
  await waitFor("closest approach line", () =>
    api.session.current?.plot.features.some((f) => f.id.startsWith("cpa-")) || undefined,
  );
  // Closest approach set current time to the moment it found (TL-10).
  await waitFor("closest approach to move current time", () => heard.some((h) => h === "time:tool:core.closest_approach") || undefined);
  assert.notEqual(api.getState()!.time.current, midway);
  listening.dispose();
  // Outside the saved window: shown in a window widened to take it in, never saved (CAP-28).
  const cpaTime = api.getState()!.time.current;
  assert.ok(cpaTime > early.end, "closest approach is after the window");
  const shown = api.getState()!.time.range;
  assert.equal(shown.start, early.start);
  assert.ok(shown.end >= cpaTime && Date.parse(shown.end) - Date.parse(shown.start) <= 2 * 3600000, "widened, to no more than twice");
  assert.deepEqual(api.session.savedWindow, early, "never saved");
  assert.deepEqual(island().time_window, early);
  await sleep(3000);
  await screenshot("03-closest-approach", true);
  // Keep, as the time controller's button does: saved through the normal path.
  assert.equal(await vscode.commands.executeCommand("debrief.setTimeWindow", shown), undefined);
  assert.deepEqual(island().time_window, shown);

  // How tracks outside the window are drawn: the plot's view, never a step in its history (CAP-29).
  // Chosen from the Time view's title menu ("..."): its entries run these commands.
  const baseNow = api.session.current!.base;
  assert.equal(await vscode.commands.executeCommand("debrief.contextTracks.faint"), undefined);
  assert.equal(island().context_tracks, "faint");
  await waitFor("the map to draw context faint", () => api.mapContext() === "faint" || undefined);
  assert.deepEqual(api.session.current!.base, baseNow, "no step in the history");
  // The analyst's setting draws faint as visible on every plot; hidden stays hidden.
  const config = vscode.workspace.getConfiguration("debrief");
  await config.update("map.minimumContextContrast", true, vscode.ConfigurationTarget.Global);
  await waitFor("the setting to draw faint as visible", () => api.mapContext() === "visible" || undefined);
  // The Time view's description says so, beside its title.
  await sleep(1500);
  await screenshot("03b-context-tracks-setting");
  assert.equal(await vscode.commands.executeCommand("debrief.contextTracks.hidden"), undefined);
  await waitFor("context hidden", () => api.mapContext() === "hidden" || undefined);
  await config.update("map.minimumContextContrast", undefined, vscode.ConfigurationTarget.Global);
  assert.equal(await vscode.commands.executeCommand("debrief.contextTracks.visible"), undefined);
  await waitFor("context visible", () => api.mapContext() === "visible" || undefined);
  assert.equal(island().context_tracks, "visible");
  assert.equal(await vscode.commands.executeCommand("debrief.setTimeWindow", period), undefined);

  const tracks = api.session.current!.plot.features.filter((f) => f.properties.kind === "track").map((f) => f.id);
  await vscode.commands.executeCommand("debrief.select", tracks);
  assert.equal(await vscode.commands.executeCommand("debrief.runTool", "core.track_summary", {}), undefined);
  await sleep(3000);
  await screenshot("04-track-summary");

  // A tool that does not apply is refused, with the reason.
  await vscode.commands.executeCommand("debrief.select", ["track-blue-one"]);
  const refused = await vscode.commands.executeCommand<string>("debrief.runTool", "core.closest_approach", {});
  assert.match(refused ?? "", /does not apply to this selection/);

  // --- Phase 2 exit: edit, undo, a Debrief process killed mid-save, recover ---------
  type Step = { seq: number; status: string; tool: string | null; notes?: string[] };
  const steps = () => vscode.commands.executeCommand<Step[]>("debrief.historySteps");
  await vscode.commands.executeCommand("debrief.history.focus");
  await waitFor("history to list the runs", async () => (await steps()).length === 3 || undefined);
  assert.deepEqual((await steps()).map((s) => s.tool), ["debrief-sample", "core.range_rings", "core.closest_approach"]);
  await sleep(1000);
  await screenshot("05-history");

  // Undo closest approach: the line goes, the step stays, marked undone.
  assert.equal(await vscode.commands.executeCommand("debrief.undo"), undefined);
  await waitFor("the line to go", () => !api.session.current?.plot.features.some((f) => f.id.startsWith("cpa-")) || undefined);
  assert.deepEqual((await steps()).map((s) => s.status), ["applied", "applied", "undone"]);
  await sleep(1500);
  await screenshot("06-undone");

  // Another Debrief process saves a change and is killed part-way through.
  const current = api.session.current!;
  const python = process.env.DEBRIEF_PYTHON || "python3";
  const crashed = (() => {
    try {
      execFileSync(python, [path.join(__dirname, "..", "test", "integration", "crash.py"), current.store.location, current.item.id]);
      return 0;
    } catch (error) {
      return (error as { status: number }).status;
    }
  })();
  assert.equal(crashed, 9);
  // It died before its new plot file replaced the old one: the plot file is the old one,
  // whole, so only the change in progress is lost (NFR-10, NFR-11). Reopening says so,
  // and clears what the dead process left beside it.
  const folder = path.join(current.store.location, current.item.id);
  assert.ok(readdirSync(folder).some((name) => name.startsWith(".plot.geojson.") && name.endsWith(".tmp")));
  await vscode.commands.executeCommand("debrief.openPlot", current.store.id, current.item.id);
  await waitFor("the history after the crash", async () => (await steps()).length === 3 || undefined);
  assert.ok(!api.session.current?.plot.features.some((f) => f.id === "note-before-the-crash"));
  assert.deepEqual((await steps()).map((s) => s.status), ["applied", "applied", "undone"]);
  assert.ok(!readdirSync(folder).some((name) => name.endsWith(".tmp")));
  await sleep(1500);
  await screenshot("07-recovered", true);

  // A colleague changes the plot from another process: one plot file, history included,
  // so the watcher sees the history move on and Debrief shows the latest (SUB-28).
  execFileSync(python, [
    "-c",
    "import sys; from pathlib import Path; from debrief_stac import Catalogue, Changes; from debrief_schemas import models; " +
      "c = Catalogue.open(Path(sys.argv[1])); who = models.AgentRef(kind='person', name='a colleague'); " +
      "note = models.AnnotationFeature(type='Feature', id='note-colleague', geometry=None, properties=models.AnnotationProperties(" +
      "kind='annotation', style='note', name='A colleague was here', time='2023-06-15T09:00:00.000Z')); " +
      "c.commit(sys.argv[2], [models.ProvRecord(id='edit-colleague', kind='edit', started_at='2023-06-15T09:00:00.000Z', agent=who, " +
      "notes=['Note added by a colleague'])], Changes(added=[note]))",
    current.store.location,
    current.item.id,
  ]);
  await waitFor("the colleague's note", () => api.session.current?.plot.features.some((f) => f.id === "note-colleague") || undefined);
  await waitFor("the colleague's step", async () => (await steps()).length === 4 || undefined);
  assert.deepEqual((await steps()).map((s) => s.status), ["applied", "applied", "abandoned", "applied"]);
  assert.deepEqual((await steps()).at(-1)?.notes, ["Note added by a colleague"]);

  // --- Colour and hiding (SUB-22): content, so steps in the plot's history ----------
  const feature = (id: string) => ({ feature: { id } });
  const colourOf = (id: string) => {
    const found = api.session.current!.plot.features.find((f) => f.id === id);
    return found?.properties.kind === "track" ? found.properties.style?.colour : undefined;
  };
  const blue = colourOf("track-blue-one");
  // BLUE ONE turns out to be hostile: the analyst colours it red.
  assert.equal(await vscode.commands.executeCommand("debrief.setColour", feature("track-blue-one"), "Red"), undefined);
  assert.notEqual(colourOf("track-blue-one"), blue);
  assert.equal((await steps()).length, 5); // recorded, like any change (the colleague's note is step 4)
  assert.deepEqual((await steps()).at(-1)?.notes, ["Colour of BLUE ONE set to red"]);
  type Row = { kind: string; current: boolean; nextToUndo: boolean; step: { seq: number } };
  const rows = () => vscode.commands.executeCommand<Row[]>("debrief.historyRows");
  assert.deepEqual((await rows())[0], { ...(await rows())[0], current: true, nextToUndo: true });
  await vscode.commands.executeCommand("debrief.history.focus");
  await sleep(1500);
  await screenshot("08-colour-in-history");

  // Hiding is a step too; the map says how many are hidden, with "Show all".
  assert.equal(await vscode.commands.executeCommand("debrief.hide", feature("track-ais-cargo-01")), undefined);
  assert.equal((await steps()).length, 6);
  await waitFor("the map to count the hidden track", () => api.hiddenOnMap() === 1 || undefined);
  await vscode.commands.executeCommand("debrief.outline.focus");
  await sleep(1500);
  await screenshot("09-hidden-on-map");

  // Ctrl+Z is the plot's history: the hiding, then the colour, come back.
  assert.equal(await vscode.commands.executeCommand("debrief.undo"), undefined);
  await waitFor("the map to show nothing hidden", () => api.hiddenOnMap() === 0 || undefined);
  assert.equal(await vscode.commands.executeCommand("debrief.undo"), undefined);
  assert.equal(colourOf("track-blue-one"), blue);
  assert.equal(api.session.current!.base?.current, 4);
  await vscode.commands.executeCommand("debrief.history.focus");
  await sleep(1500);
  await screenshot("10-undo-restored-colour");
  // ...and redo brings them back.
  assert.equal(await vscode.commands.executeCommand("debrief.redo"), undefined);
  assert.equal(await vscode.commands.executeCommand("debrief.redo"), undefined);
  await waitFor("the map to count the hidden track", () => api.hiddenOnMap() === 1 || undefined);

  // "Show all" on the map shows every hidden feature again, as one more step.
  await vscode.commands.executeCommand("debrief.showAllHidden");
  await waitFor("nothing hidden", () => api.hiddenOnMap() === 0 || undefined);
  assert.equal((await steps()).length, 7);

  // --- One file, history included (decision 13 Oct) ---------------------------------
  // The analyst sends serial 1 to a colleague: the plot file alone, no sources beside it.
  const outbox = mkdtempSync(path.join(tmpdir(), "debrief-outbox-"));
  const sent = path.join(outbox, "serial-1-from-ian.geojson");
  copyFileSync(path.join(folder, "plot.geojson"), sent);
  // The colleague adds it to their catalogue (here, the same one): every step comes with it.
  const added = await vscode.commands.executeCommand<{ item?: string; problem?: string }>(
    "debrief.addPlotFile",
    { view: { store: { id: current.store.id } } },
    sent,
  );
  assert.equal(added?.problem, undefined);
  assert.equal(added?.item, "serial-1-from-ian");
  await vscode.commands.executeCommand("debrief.openPlot", current.store.id, added!.item);
  await waitFor("the received plot", () => api.session.current?.item.id === added!.item || undefined);
  await waitFor("its history", async () => (await steps()).length === 8 || undefined);
  const received = await steps();
  assert.deepEqual(received.map((s) => s.tool).slice(0, 3), ["debrief-sample", "core.range_rings", "core.closest_approach"]);
  assert.equal(received.at(-1)?.notes?.[0], "Added from the plot file serial-1-from-ian.geojson");
  assert.match(received.at(-1)?.notes?.[1] ?? "", /^Added to the catalogue /);
  assert.equal(api.hiddenOnMap(), 0);
  // Listed under a title of its own: the plot it came from is in this catalogue too.
  assert.match(api.session.current?.item.properties.title ?? "", / \(from serial-1-from-ian\.geojson\)$/);
  // Ctrl+Z would take back the arrival, which shows nothing, with the sender's last step.
  assert.deepEqual(
    (await rows()).filter((r) => r.nextToUndo).map((r) => r.step.seq),
    [8, 7],
  );
  await vscode.commands.executeCommand("debrief.history.focus");
  await sleep(1500);
  await screenshot("11-received-plot-file", true);
  // ...and undoes a step the sender made with one Ctrl+Z: the sender's "Show all", taken
  // back with the step recording the arrival, so the track the sender had hidden is
  // hidden again.
  assert.equal(await vscode.commands.executeCommand("debrief.undo"), undefined);
  await waitFor("the sender's hidden track", () => api.hiddenOnMap() === 1 || undefined);
  assert.deepEqual((await steps()).slice(-2).map((s) => s.status), ["undone", "undone"]);
  await vscode.commands.executeCommand("debrief.history.focus");
  await sleep(1500);
  await screenshot("12-undid-a-senders-step");
  // The original is untouched.
  await vscode.commands.executeCommand("debrief.openPlot", current.store.id, current.item.id);
  await waitFor("the original", async () => (await steps()).length === 7 || undefined);
}
