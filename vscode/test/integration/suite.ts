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
import type { AnnotationProperties } from "@debrief/schemas";
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
  const names = opened.plot.features.flatMap((f) => (f.properties.kind === "plot" || f.properties.kind === "narrative" ? [] : [f.properties.name]));
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

  await playTheTote(api, island, period);

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

  // --- Annotations: shapes, labels and notes, each a step (CAP-03 to CAP-05) ------------
  type Done = { problem?: string; feature?: string };
  const annotation = (id: string) => {
    const found = api.session.current!.plot.features.find((f) => f.id === id);
    return found?.properties.kind === "annotation" ? (found as { properties: AnnotationProperties }) : undefined;
  };
  // The results of earlier tools are not needed here: more room for the map.
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) if (tab.label.startsWith("Results")) await vscode.window.tabGroups.close(tab);
  }
  // The form opens beside the map, a circle in the middle of the map.
  await vscode.commands.executeCommand("debrief.addAnnotation");
  await waitFor("the annotation form", async () => (await vscode.commands.executeCommand<string | undefined>("debrief.annotationFormOpen")) === "" || undefined);
  await sleep(2500);
  await screenshot("13-add-annotation-form");
  await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
  // What the form sends, as an agent would: positions in the analyst's notation.
  const circle = await vscode.commands.executeCommand<Done>("debrief.addAnnotation", {
    shape: "circle",
    name: "Exclusion zone",
    positions: [[-75.5, 37.0]],
    radius: { value: 4, unit: "km" },
  });
  assert.equal(circle.problem, undefined);
  assert.equal(circle.feature, "annotation-exclusion-zone");
  assert.deepEqual((await steps()).at(-1)?.notes, ["Circle 'Exclusion zone' added"]);
  const restyled = await vscode.commands.executeCommand<Done>("debrief.editAnnotation", "annotation-exclusion-zone", {
    appearance: { colour: "#e01c3e", line_style: "solid", line_width: 3, fill_colour: "#e01c3e", fill_opacity: 0.2 },
  });
  assert.equal(restyled.problem, undefined);
  assert.deepEqual((await steps()).at(-1)?.notes, ["Style of Circle 'Exclusion zone' changed"]);
  // Ctrl+Z takes the style back, as any change; redo brings it again.
  assert.equal(await vscode.commands.executeCommand("debrief.undo"), undefined);
  assert.equal(annotation("annotation-exclusion-zone")?.properties.appearance ?? undefined, undefined);
  assert.equal(await vscode.commands.executeCommand("debrief.redo"), undefined);
  assert.equal(annotation("annotation-exclusion-zone")?.properties.appearance?.line_style, "solid");
  for (const spec of [
    { shape: "ellipse", name: "Search area", positions: ["36°52.200'N 075°40.800'W"], semi_major: { value: 5, unit: "[nmi_i]" }, semi_minor: { value: 2, unit: "[nmi_i]" }, orientation: { value: 60, unit: "deg" }, appearance: { colour: "#0064bd", line_style: "dotted", line_width: 2 } },
    { shape: "area", name: "Transit lane", positions: [[-75.8, 37.05], [-75.55, 37.1], [-75.45, 37.02], [-75.75, 36.97]], appearance: { colour: "#00a000", fill_colour: "#00a000", fill_opacity: 0.1, label_position: "below" } },
    { shape: "label", name: "Datum buoy", text: "Datum buoy D7", positions: ["N36 52.2 W75 21.0"], appearance: { label_size: 15 } },
    { shape: "note", name: "Contact gained", text: "Contact gained on the towed array.", time: "2023-06-15T10:15:00.000Z" },
  ]) {
    const done = await vscode.commands.executeCommand<Done>("debrief.addAnnotation", spec);
    assert.equal(done.problem, undefined, spec.name);
  }
  // Chart furniture: the north arrow, one more step.
  assert.equal((await vscode.commands.executeCommand<Done>("debrief.toggleNorthArrow")).problem, undefined);
  assert.deepEqual((await steps()).at(-1)?.notes, ["North arrow added"]);
  // A description that cannot be made is refused, in plain words, and nothing changes.
  const stepsBefore = (await steps()).length;
  const noSize = await vscode.commands.executeCommand<Done>("debrief.addAnnotation", { shape: "circle", name: "No size", positions: [[-75.5, 37]] });
  assert.match(noSize.problem ?? "", /radius/);
  assert.equal((await steps()).length, stepsBefore);
  await vscode.commands.executeCommand("debrief.outline.focus");
  await sleep(2000);
  await screenshot("14-annotations-on-the-map");

  // The Timeline: time-only annotations in time order; choosing one moves current time to it.
  type Entries = { entries: string[]; current?: string };
  const listed = await vscode.commands.executeCommand<Entries>("debrief.timelineEntries");
  assert.ok(listed.entries.includes("annotation-contact-gained"));
  await vscode.commands.executeCommand("debrief.timeline.focus");
  assert.equal(await vscode.commands.executeCommand("debrief.goToTime", "annotation-contact-gained"), undefined);
  assert.equal(api.session.time?.current, "2023-06-15T10:15:00.000Z");
  assert.equal((await vscode.commands.executeCommand<Entries>("debrief.timelineEntries")).current, "annotation-contact-gained");
  await vscode.commands.executeCommand("debrief.timeline.focus");
  await sleep(2000);
  await screenshot("15-timeline");

  // The narrative in the Timeline (CAP-20): the sample's log is narrative entries, one step each
  // to add, change and delete; a REP file's narrative read into the plot as one step; the entry
  // current time is at shown on the map beside its track.
  {
    await waitFor("the Timeline view", () => api.timelineShowing() || undefined);
    const narrativeOf = () => api.session.current!.plot.features.filter((f) => f.properties.kind === "narrative");
    const logged = narrativeOf();
    assert.ok(logged.length > 20, "the sample's log is narrative entries");
    assert.ok(!api.session.current!.plot.features.some((f) => f.properties.kind === "annotation" && f.properties.style === "note" && f.properties.name === "BLUE ONE"), "not notes");
    const contact = logged.find((f) => f.properties.kind === "narrative" && f.properties.text.startsWith("Bow sonar contact"))!;
    assert.ok(listed.entries.includes(contact.id) || (await vscode.commands.executeCommand<Entries>("debrief.timelineEntries")).entries.includes(contact.id));
    assert.equal(await vscode.commands.executeCommand("debrief.goToTime", contact.id), undefined);
    assert.equal((await vscode.commands.executeCommand<Entries>("debrief.timelineEntries")).current, contact.id);
    await waitFor("the entry on the map, beside BLUE ONE", () => (api.mapNarrative()?.id === contact.id ? true : undefined));
    assert.equal(api.mapNarrative()?.track, "track-blue-one");
    // Off and on again from the Timeline: the plot's choice, in its island, never a step (product owner, 15 Oct 2026).
    const stepsBeforeOnMap = (await steps()).length;
    assert.equal(await vscode.commands.executeCommand("debrief.setNarrativeOnMap", false), undefined);
    assert.equal(island().narrative_on_map, false);
    await waitFor("the map's narrative box gone", () => (api.mapNarrative() === undefined ? true : undefined));
    assert.equal(await vscode.commands.executeCommand("debrief.setNarrativeOnMap", true), undefined);
    assert.equal("narrative_on_map" in island(), false, "on is left out of the island, as it means");
    await waitFor("the map's narrative box back", () => (api.mapNarrative()?.id === contact.id ? true : undefined));
    assert.equal((await steps()).length, stepsBeforeOnMap, "never a step");
    const narrativeSteps = (await steps()).length;
    type Narrated = { problem?: string; feature?: string; entries?: number };
    const added = await vscode.commands.executeCommand<Narrated>("debrief.addNarrative", { time: "2023-06-15T09:05:00.000Z", source: "BLUE ONE", entry_type: "Comms", text: "Link check with control: loud and clear." });
    assert.equal(added.problem, undefined);
    assert.deepEqual((await steps()).at(-1)?.notes, ["Narrative entry by BLUE ONE at 09:05:00Z added"]);
    const entry = narrativeOf().find((f) => f.id === added.feature)!;
    assert.equal(entry.properties.kind === "narrative" && entry.properties.track_id, "track-blue-one");
    assert.equal((await vscode.commands.executeCommand<Narrated>("debrief.editNarrative", added.feature, { text: "Link check: loud and clear on both nets." })).problem, undefined);
    assert.deepEqual((await steps()).at(-1)?.notes, ["Narrative entry by BLUE ONE at 09:05:00Z: text changed"]);
    assert.equal(await vscode.commands.executeCommand("debrief.goToTime", added.feature), undefined);
    // For the picture, the other views folded away so the Timeline has room, as an analyst would.
    const folded = ["debrief.time", "debrief.catalogues", "debrief.outline", "debrief.tools", "debrief.history", "debrief.tote"];
    const commands = new Set(await vscode.commands.getCommands(true));
    const fold = async () => {
      for (const view of folded) if (commands.has(`${view}.toggleVisibility`)) await vscode.commands.executeCommand(`${view}.toggleVisibility`);
    };
    await fold();
    await vscode.commands.executeCommand("debrief.timeline.focus");
    await sleep(2000);
    await screenshot("15b-narrative");
    await fold();
    assert.equal((await vscode.commands.executeCommand<Narrated>("debrief.deleteNarrative", added.feature)).problem, undefined);
    assert.equal(narrativeOf().some((f) => f.id === added.feature), false);
    assert.equal(await vscode.commands.executeCommand("debrief.undo"), undefined);
    assert.equal(narrativeOf().some((f) => f.id === added.feature), true, "undo brings it back");
    // Ctrl+Shift+Z and Ctrl+Z in the Timeline outside a text box: the page posts redo_asked
    // and undo_asked, and the plot is redone and undone as from the map (product owner, 15 Oct 2026).
    api.timelineMessage({ kind: "redo_asked" });
    await waitFor("redone from the Timeline", () => (narrativeOf().some((f) => f.id === added.feature) ? undefined : true));
    api.timelineMessage({ kind: "undo_asked" });
    await waitFor("undone from the Timeline", () => (narrativeOf().some((f) => f.id === added.feature) ? true : undefined));
    // A second platform's log: its narrative lines read into the open plot, one step, its source kept.
    const scratch = mkdtempSync(path.join(tmpdir(), "debrief-narrative-"));
    const red = path.join(scratch, "red-one-log.rep");
    (await import("node:fs")).writeFileSync(red, ';NARRATIVE2: 230615 090000 "RED ONE" CSD Went deep, 40 m.\n;NARRATIVE2: 230615 090100 "RED ONE" Comms Missed the broadcast.\n');
    const read = await vscode.commands.executeCommand<Narrated>("debrief.importNarrative", red);
    assert.equal(read.problem, undefined);
    assert.equal(read.entries, 2);
    assert.deepEqual((await steps()).at(-1)?.notes?.slice(0, 2), ["Narrative read from red-one-log.rep", "2 narrative entries read, from RED ONE."]);
    const deep = narrativeOf().find((f) => f.properties.kind === "narrative" && f.properties.text === "Went deep, 40 m.");
    assert.equal((deep?.properties as { track_id?: string } | undefined)?.track_id, "track-red-one");
    assert.equal((await steps()).length, narrativeSteps + 4);
    // A Word narrative (CAP-19), legacy Debrief's narrative-document dialect, with the
    // choices an agent passes: the types to read and BLUE TWO's track (none). One step.
    const word = path.join(scratch, "red-one-log.docx");
    copyFileSync(path.resolve(__dirname, "../test/play/red-one-log.docx"), word);
    const wordRead = await vscode.commands.executeCommand<Narrated & { omitted?: string[] }>("debrief.importNarrative", word, { types: ["SONAR", "COMMS"], tracks: { "BLUE TWO": null } });
    assert.equal(wordRead.problem, undefined);
    assert.equal(wordRead.entries, 3);
    assert.match(wordRead.omitted?.join(" ") ?? "", /4 entries of types not chosen not read/);
    assert.deepEqual((await steps()).at(-1)?.notes?.slice(0, 2), ["Narrative read from red-one-log.docx", "Word document, read as a narrative log."]);
    const sonar = narrativeOf().find((f) => f.properties.kind === "narrative" && f.properties.text.startsWith("Contact on the bow"));
    assert.equal((sonar?.properties as { track_id?: string } | undefined)?.track_id, "track-red-one");
    assert.match((sonar?.properties as { text?: string } | undefined)?.text ?? "", /\nContact held on the towed array\.$/);
    assert.equal((await steps()).length, narrativeSteps + 5);
    await screenshot("15c-narrative-word");
    // The same document again, under another name (product owner, 15 Oct 2026): known by its
    // content, refused until told to skip the entries already in the plot; then only the rest.
    const copy = path.join(scratch, "red-one-log copy.docx");
    copyFileSync(word, copy);
    const again = await vscode.commands.executeCommand<Narrated>("debrief.importNarrative", copy);
    assert.match(again.problem ?? "", /^red-one-log copy\.docx is already in the plot: read in on .*Narrative read from red-one-log\.docx\); 3 of the 7 entries to read are in the plot\. Nothing was read\./);
    assert.equal((await steps()).length, narrativeSteps + 5);
    const rest = await vscode.commands.executeCommand<Narrated & { omitted?: string[] }>("debrief.importNarrative", copy, { duplicates: "skip", tracks: { "BLUE TWO": null } });
    assert.equal(rest.problem, undefined);
    assert.equal(rest.entries, 4, "the four entries not read the first time");
    assert.match(rest.omitted?.join(" ") ?? "", /3 entries already in the plot \(the same time, source and text\) not read again, as chosen\./);
    assert.equal((await steps()).length, narrativeSteps + 6);
    // Refused plainly, nothing changed: no time.
    const refusedNarrative = await vscode.commands.executeCommand<Narrated>("debrief.addNarrative", { source: "X", text: "No time." });
    assert.match(refusedNarrative.problem ?? "", /time/);
  assert.equal((await steps()).length, narrativeSteps + 6);
  }

  // The properties form of the circle, as the map's double-click or the outline opens it.
  await vscode.commands.executeCommand("debrief.editAnnotation", "annotation-exclusion-zone");
  await waitFor("the circle's form", async () => (await vscode.commands.executeCommand<string | undefined>("debrief.annotationFormOpen")) === "annotation-exclusion-zone" || undefined);
  await sleep(2500);
  await screenshot("16-annotation-properties");
  await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
  // Delete is one step; undo brings it back.
  assert.equal((await vscode.commands.executeCommand<Done>("debrief.deleteAnnotation", "annotation-datum-buoy")).problem, undefined);
  assert.deepEqual((await steps()).at(-1)?.notes, ["Label 'Datum buoy' deleted"]);
  assert.equal(await vscode.commands.executeCommand("debrief.undo"), undefined);
  assert.ok(annotation("annotation-datum-buoy"));

  // --- Drawing and editing on the map (CAP-03, NFR-13) ----------------------------------
  // What the map sends when the analyst finishes drawing: the form opens with it, to be
  // named; closed unsaved, nothing is recorded. (The pointer and keys are played in the playground test.)
  const drawnBefore = (await steps()).length;
  const timeBefore = api.getState()!.time;
  await api.fromMap!({ kind: "annotation_drawn", annotation: { shape: "area", name: "", positions: [[-75.62, 37.12], [-75.42, 37.14], [-75.4, 36.98]] } });
  await waitFor("the form, with what was drawn", async () => (await vscode.commands.executeCommand<string | undefined>("debrief.annotationFormOpen")) === "" || undefined);
  await sleep(2500);
  await screenshot("18-drawn-area-form");
  await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
  assert.equal((await steps()).length, drawnBefore);
  // An area selected alone shows its handles on the map.
  await vscode.commands.executeCommand("debrief.select", ["annotation-transit-lane"]);
  await sleep(2000);
  await screenshot("19-handles-on-the-map");
  // Letting go of a handle sends the whole description, changed: one step, named for what was done.
  const lane = annotation("annotation-transit-lane")!;
  const corners = ((lane as unknown as { geometry: { coordinates: number[][][] } }).geometry.coordinates[0]).slice(0, -1);
  const laneSpec = { shape: "area", name: "Transit lane", positions: corners, appearance: lane.properties.appearance };
  await api.fromMap!({ kind: "edit_annotation", feature_id: "annotation-transit-lane", annotation: { ...laneSpec, positions: corners.map(([lon, lat]) => [lon + 0.02, lat - 0.01]) } });
  assert.deepEqual((await steps()).at(-1)?.notes, ["Area 'Transit lane' moved"]);
  await api.fromMap!({ kind: "edit_annotation", feature_id: "annotation-transit-lane", annotation: { ...laneSpec, positions: [...corners.slice(0, 2), [-75.5, 36.95], ...corners.slice(2)] } });
  assert.deepEqual((await steps()).at(-1)?.notes, ["Area 'Transit lane' reshaped"]);
  assert.equal((await steps()).length, drawnBefore + 2);
  assert.equal(await vscode.commands.executeCommand("debrief.undo"), undefined);
  assert.equal(await vscode.commands.executeCommand("debrief.undo"), undefined);
  const back = annotation("annotation-transit-lane") as unknown as { geometry: { coordinates: number[][][] } };
  assert.deepEqual(back.geometry.coordinates[0].slice(0, -1), corners);
  // A change the service refuses is reported, and the map shows the annotation as it is.
  await api.fromMap!({ kind: "edit_annotation", feature_id: "annotation-transit-lane", annotation: { ...laneSpec, positions: corners.slice(0, 2) } });
  assert.equal((await steps()).length, drawnBefore + 2);
  assert.deepEqual((await steps()).slice(-2).map((s) => s.status), ["undone", "undone"]);
  // None of it moved current time or the window.
  assert.deepEqual(api.getState()!.time, timeBefore);

  // --- Tracks: moved, rotated, split and merged, each one step (CAP-01, CAP-02) ----------
  type TrackDone = { problem?: string; feature?: string; features?: string[] };
  const track = (id: string) => api.session.current!.plot.features.find((f) => f.id === id) as unknown as { geometry: { coordinates: number[][] }; properties: { name: string; times: string[]; style?: { colour: string } } } | undefined;
  const tracksBefore = (await steps()).length;
  // A track selected alone shows its move and rotate handles and its pivot on the map.
  await vscode.commands.executeCommand("debrief.select", ["track-blue-one"]);
  await vscode.commands.executeCommand("debrief.outline.focus");
  await sleep(2000);
  await screenshot("20-track-handles");
  // Letting go of the move handle: the map sends the move, one step named by its range and bearing.
  const blueFixes = track("track-blue-one")!.geometry.coordinates;
  await api.fromMap!({ kind: "edit_track", feature_id: "track-blue-one", track_edit: { action: "move", distance: { value: 1.2, unit: "[nmi_i]" }, bearing: { value: 45, unit: "deg" } } });
  assert.deepEqual((await steps()).at(-1)?.notes, ["BLUE ONE moved 1.20 nmi 045.0°T"]);
  assert.notDeepEqual(track("track-blue-one")!.geometry.coordinates, blueFixes);
  // "Rotate track…" with the change given, as an agent would: about the fix nearest current time.
  const rotated = await vscode.commands.executeCommand<TrackDone>("debrief.rotateTrack", "track-blue-one", { angle: { value: -10, unit: "deg" } });
  assert.equal(rotated.problem, undefined);
  assert.equal((await steps()).at(-1)?.notes?.[0], "BLUE ONE rotated 10.0° anticlockwise");
  // Only RED ONE's fixes in a period move: "part moved".
  const red = track("track-red-one")!;
  const redPeriod = { start: red.properties.times[Math.floor(red.properties.times.length / 3)], end: red.properties.times[Math.floor((2 * red.properties.times.length) / 3)] };
  const moved = await vscode.commands.executeCommand<TrackDone>("debrief.moveTrack", "track-red-one", { distance: { value: 2, unit: "km" }, bearing: { value: 90, unit: "deg" }, period: redPeriod });
  assert.equal(moved.problem, undefined);
  assert.match((await steps()).at(-1)?.notes?.[0] ?? "", /^RED ONE part moved 1\.08 nmi 090\.0°T$/);
  await vscode.commands.executeCommand("debrief.select", ["track-red-one"]);
  await sleep(2000);
  await screenshot("21-track-part-moved");
  // Split at a time: two tracks, one step; the parts selected.
  const at = red.properties.times[Math.floor(red.properties.times.length / 2)];
  const split = await vscode.commands.executeCommand<TrackDone>("debrief.splitTrack", "track-red-one", { at });
  assert.equal(split.problem, undefined);
  assert.deepEqual(split.features, ["track-red-one", "track-red-one-2"]);
  assert.deepEqual([track("track-red-one")!.properties.name, track("track-red-one-2")!.properties.name], ["RED ONE (1)", "RED ONE (2)"]);
  assert.equal(track("track-red-one-2")!.properties.style?.colour, red.properties.style?.colour);
  assert.deepEqual(api.session.selection, ["track-red-one", "track-red-one-2"]);
  await sleep(2000);
  await screenshot("22-track-split");
  // Merge: overlapping tracks are refused, saying where; the two parts join again, one step.
  const overlapping = await vscode.commands.executeCommand<TrackDone>("debrief.mergeTracks", ["track-blue-one", "track-red-one"]);
  assert.match(overlapping.problem ?? "", /overlap in time \(.* from .* to .*\)/);
  const merged = await vscode.commands.executeCommand<TrackDone>("debrief.mergeTracks", ["track-red-one", "track-red-one-2"], { name: "RED ONE" });
  assert.equal(merged.problem, undefined);
  assert.equal(merged.feature, "track-red-one");
  assert.deepEqual((await steps()).at(-1)?.notes?.[0], "RED ONE (1) and RED ONE (2) merged");
  assert.equal(track("track-red-one")!.properties.times.length, red.properties.times.length);
  assert.equal(track("track-red-one-2"), undefined);
  await sleep(2000);
  await screenshot("23-tracks-merged");
  assert.equal((await steps()).length, tracksBefore + 5);
  // Each is undone like any step: undoing the merge brings the two parts back.
  assert.equal(await vscode.commands.executeCommand("debrief.undo"), undefined);
  assert.ok(track("track-red-one-2"));
  assert.deepEqual(api.getState()!.time.current, timeBefore.current);

  // --- Cleaning tracks: jumps, smoothing and marked fixes, each one step (CAP-01, EXT-14) ----
  type Shown = { feature_id: string; fix_times?: string[]; preview?: { coordinates: number[][] }; message?: string } | undefined;
  const cleanBefore = (await steps()).length;
  // GPS glitches in BLUE ONE, as a colleague's change on another computer would bring them.
  const blueTrack = track("track-blue-one")!;
  const glitched = [Math.floor(blueTrack.properties.times.length / 3), Math.floor(blueTrack.properties.times.length / 3) + 1];
  execFileSync(process.env.DEBRIEF_PYTHON!, [
    "-c",
    "import sys; from pathlib import Path; from debrief_stac import Catalogue, Changes; from debrief_schemas import models; " +
      "c = Catalogue.open(Path(sys.argv[1])); t = next(f for f in c.read_plot(sys.argv[2]).features if f.id == 'track-blue-one'); " +
      "xy = [list(p) for p in t.geometry.coordinates]\n" +
      "for i in map(int, sys.argv[3:]): xy[i][1] += 0.05\n" +
      "t = t.model_copy(update={'geometry': t.geometry.model_copy(update={'coordinates': xy})}); " +
      "r = models.ProvRecord(id='edit-glitch', kind='edit', started_at='2026-10-14T09:00:00.000Z', agent=models.AgentRef(kind='person', name='a colleague'), notes=['GPS glitches put into BLUE ONE']); " +
      "c.commit(sys.argv[2], [r], Changes(modified=[t]))",
    current.store.location,
    current.item.id,
    ...glitched.map(String),
  ]);
  await vscode.commands.executeCommand("debrief.refresh");
  await waitFor("the colleague's glitches", async () => (await steps()).length === cleanBefore + 1 || undefined);
  // Found first, ringed on the map, nothing changed; then removed, one step named for them.
  type JumpsDone = { problem?: string; found?: string[]; removed?: number; threshold?: { value: number; unit: string } };
  await vscode.commands.executeCommand("debrief.select", []); // the rings, not the selection's outline, in the picture
  const found = await vscode.commands.executeCommand<JumpsDone>("debrief.removeJumps", "track-blue-one", { threshold: { value: 30, unit: "[kn_i]" } });
  const glitchTimes = glitched.map((i) => blueTrack.properties.times[i]);
  assert.deepEqual(found.found, glitchTimes);
  assert.equal((await steps()).length, cleanBefore + 1, "finding changes nothing");
  const ringed = await vscode.commands.executeCommand<Shown>("debrief.fixesOnMap");
  assert.deepEqual(ringed?.fix_times, glitchTimes);
  assert.match(ringed?.message ?? "", /^BLUE ONE: 2 jumps found, each faster than 30\.0 kn to reach/);
  await sleep(2000);
  await screenshot("24-jumps-found");
  const removed = await vscode.commands.executeCommand<JumpsDone>("debrief.removeJumps", "track-blue-one", { threshold: { value: 30, unit: "[kn_i]" }, times: "all" });
  assert.equal(removed.problem, undefined);
  assert.equal(removed.removed, 2);
  assert.deepEqual((await steps()).at(-1)?.notes?.slice(0, 1), ["BLUE ONE: 2 jumps removed"]);
  assert.equal(track("track-blue-one")!.properties.times.length, blueTrack.properties.times.length - 2);
  assert.equal(await vscode.commands.executeCommand<Shown>("debrief.fixesOnMap"), undefined, "the rings go");
  // Smoothing previewed (it stays on the map), then applied: one step.
  const previewed = await vscode.commands.executeCommand<{ summary?: string; moved?: number }>("debrief.smoothTrack", "track-red-one", { window: 5, apply: false });
  assert.match(previewed.summary ?? "", /^\d+ fix(es)? moved; the most a fix moved: /);
  assert.ok((await vscode.commands.executeCommand<Shown>("debrief.fixesOnMap"))?.preview?.coordinates.length);
  await sleep(2000);
  await screenshot("25-smoothing-preview");
  const smoothed = await vscode.commands.executeCommand<{ problem?: string; summary?: string }>("debrief.smoothTrack", "track-red-one", { window: 5 });
  assert.equal(smoothed.problem, undefined);
  const redName = track("track-red-one")!.properties.name; // RED ONE (1): the merge before was undone
  assert.equal((await steps()).at(-1)?.notes?.[0], `${redName} smoothed over 5 fixes`);
  assert.equal(await vscode.commands.executeCommand<Shown>("debrief.fixesOnMap"), undefined);
  // A fix coloured, labelled and commented on, each one step; the comment in the Timeline.
  const fixTime = track("track-red-one")!.properties.times[Math.floor(track("track-red-one")!.properties.times.length / 4)];
  for (const change of [{ colour: "#ffd700", colour_name: "yellow" }, { label: "Turn 1" }, { comment: "Wheel over for the second leg" }]) {
    const done = await vscode.commands.executeCommand<{ problem?: string }>("debrief.markFix", "track-red-one", fixTime, change);
    assert.equal(done.problem, undefined);
  }
  const when = new Date(fixTime).toISOString().slice(11, 19);
  assert.deepEqual((await steps()).slice(-3).map((s) => s.notes?.[0]), [`${redName} fix at ${when}Z coloured yellow`, `${redName} fix at ${when}Z labelled 'Turn 1'`, `${redName} fix at ${when}Z: comment added`]);
  const timeline = await vscode.commands.executeCommand<{ entries: string[] }>("debrief.timelineEntries");
  assert.ok(timeline.entries.includes(`fix:track-red-one:${fixTime}`));
  // The map asks for a fix by right-click; a refused change (no such fix) says why.
  const wrong = await vscode.commands.executeCommand<{ problem?: string }>("debrief.markFix", "track-red-one", "2001-01-01T00:00:00.000Z", { label: "x" });
  assert.match(wrong.problem ?? "", /has no fix at/);
  // Choosing the comment in the Timeline moves current time to its fix, as for any entry.
  await vscode.commands.executeCommand("debrief.goToTime", `fix:track-red-one:${fixTime}`);
  assert.equal(api.getState()!.time.current, fixTime);
  await vscode.commands.executeCommand("debrief.timeline.focus");
  await sleep(2000);
  await screenshot("26-marked-fix");
  assert.equal((await steps()).length, cleanBefore + 6);
  // Undone like any step: the comment goes from the Timeline.
  assert.equal(await vscode.commands.executeCommand("debrief.undo"), undefined);
  assert.ok(!(await vscode.commands.executeCommand<{ entries: string[] }>("debrief.timelineEntries")).entries.includes(`fix:track-red-one:${fixTime}`));

  // --- Shear and stretch (CAP-21): an end let go of on the map, and the commands with values given ---
  const shearBefore = (await steps()).length;
  await vscode.commands.executeCommand("debrief.select", ["track-blue-one"]);
  await sleep(1500);
  const blueBefore = track("track-blue-one")!.geometry.coordinates;
  await api.fromMap!({ kind: "edit_track", feature_id: "track-blue-one", track_edit: { action: "shear", anchor: "start", distance: { value: 1, unit: "[nmi_i]" }, bearing: { value: 0, unit: "deg" } } });
  assert.match((await steps()).at(-1)?.notes?.[0] ?? "", /^BLUE ONE sheared: \d{3}\.\d°T \d+\.\d kn$/);
  assert.deepEqual(track("track-blue-one")!.geometry.coordinates[0], blueBefore[0], "the start is held");
  const sheared = await vscode.commands.executeCommand<TrackDone>("debrief.shearTrack", "track-blue-one", { anchor: "end", course: { value: 200, unit: "deg" }, speed: { value: 6, unit: "[kn_i]" } });
  assert.equal(sheared.problem, undefined);
  assert.equal((await steps()).at(-1)?.notes?.[0], "BLUE ONE sheared: 200.0°T 6.0 kn");
  assert.match((await steps()).at(-1)?.notes?.[1] ?? "", /^Held at the end, \d\d:\d\d:\d\dZ$/);
  const stretched = await vscode.commands.executeCommand<TrackDone>("debrief.stretchTrack", "track-blue-one", { anchor: "start", speed: { value: 9, unit: "[kn_i]" } });
  assert.equal(stretched.problem, undefined);
  assert.equal((await steps()).at(-1)?.notes?.[0], "BLUE ONE stretched: 9.0 kn");
  const nothing = await vscode.commands.executeCommand<TrackDone>("debrief.stretchTrack", "track-blue-one", { anchor: "start", speed: { value: 0, unit: "[kn_i]" } });
  assert.match(nothing.problem ?? "", /more than nothing/);
  assert.equal((await steps()).length, shearBefore + 3);
  await vscode.commands.executeCommand("debrief.outline.focus");
  await sleep(2000);
  await screenshot("27-track-sheared");
  // The form: what changes, then which end is held, with what the track makes good now.
  const asking = vscode.commands.executeCommand<TrackDone>("debrief.shearTrack", "track-blue-one");
  await sleep(1500);
  await vscode.commands.executeCommand("workbench.action.acceptSelectedQuickOpenItem");
  await sleep(1500);
  await screenshot("28-shear-form");
  await vscode.commands.executeCommand("workbench.action.closeQuickOpen");
  assert.deepEqual(await asking, {});
  assert.equal((await steps()).length, shearBefore + 3, "nothing sent from a form put away");
  // Undone like any step.
  assert.equal(await vscode.commands.executeCommand("debrief.undo"), undefined);
  assert.equal((await steps()).at(-1)?.status, "undone");

  // --- A single fix moved, and dead reckoning (CAP-01): from the map, and the commands with values given ---
  const fixBefore = (await steps()).length;
  const redNow = track("track-red-one")!;
  const fixIndex = Math.floor(redNow.properties.times.length / 6);
  const movedTime = redNow.properties.times[fixIndex];
  const movedWhen = `${new Date(movedTime).toISOString().slice(11, 19)}Z`;
  // Close in on the fix, RED ONE selected alone: each fix in view has a ring of its own.
  const [lon, lat] = redNow.geometry.coordinates[fixIndex];
  await vscode.commands.executeCommand("debrief.select", ["track-red-one"]);
  await vscode.commands.executeCommand("debrief.setState", { viewport: { bbox: [lon - 0.02, lat - 0.012, lon + 0.02, lat + 0.012] } });
  await sleep(1500);
  // Letting go of a fix's ring: that fix alone moves, one step named for the fix, how far and which way.
  await api.fromMap!({ kind: "edit_track", feature_id: "track-red-one", track_edit: { action: "move_fix", fix_time: movedTime, distance: { value: 0.3, unit: "[nmi_i]" }, bearing: { value: 90, unit: "deg" } } });
  const fixStep = (await steps()).at(-1)?.notes ?? [];
  assert.equal(fixStep[0], `${redName} fix at ${movedWhen} moved 0.30 nmi 090.0°T`);
  assert.match(fixStep[2] ?? "", /^Speed to reach it from \d\d:\d\d:\d\dZ: \d+\.\d kn \(was \d+\.\d kn\)$/);
  const redMoved = track("track-red-one")!;
  assert.notDeepEqual(redMoved.geometry.coordinates[fixIndex], redNow.geometry.coordinates[fixIndex]);
  assert.deepEqual(redMoved.geometry.coordinates[fixIndex + 1], redNow.geometry.coordinates[fixIndex + 1], "its neighbour stays");
  assert.deepEqual(redMoved.properties.times, redNow.properties.times, "times stay");
  await vscode.commands.executeCommand("debrief.outline.focus");
  await sleep(2000);
  await screenshot("29-fix-moved");
  // "Move a fix…" with the position given, as an agent would; and the form, put away without sending.
  const placed = await vscode.commands.executeCommand<TrackDone>("debrief.moveFix", "track-red-one", movedTime, { position: redNow.geometry.coordinates[fixIndex] });
  assert.equal(placed.problem, undefined);
  assert.match((await steps()).at(-1)?.notes?.[0] ?? "", new RegExp(`^${redName.replace(/[()]/g, "\\$&")} fix at ${movedWhen} moved 0\\.30 nmi 270\\.0°T$`));
  const askingFix = vscode.commands.executeCommand<TrackDone>("debrief.moveFix", "track-red-one", redNow.properties.times[fixIndex + 2]);
  await sleep(1500);
  await sleep(1000);
  await screenshot("30-move-fix-form");
  await vscode.commands.executeCommand("workbench.action.closeQuickOpen");
  assert.deepEqual(await askingFix, {});
  // Plotted by dead reckoning, with no questions: one step; over the ground again puts back the positions as logged.
  const loggedRed = track("track-red-one")!.geometry.coordinates;
  const reckoned = await vscode.commands.executeCommand<TrackDone>("debrief.plottingMode", "track-red-one", "dr");
  assert.equal(reckoned.problem, undefined);
  assert.equal((await steps()).at(-1)?.notes?.[0], `${redName} plotted by dead reckoning`);
  await vscode.commands.executeCommand("debrief.outline.focus");
  await sleep(1500);
  await screenshot("32-dr-tagged");
  const overGround = await vscode.commands.executeCommand<TrackDone>("debrief.plottingMode", "track-red-one", "otg");
  assert.equal(overGround.problem, undefined);
  assert.equal((await steps()).at(-1)?.notes?.[0], `${redName} plotted over the ground`);
  assert.deepEqual(track("track-red-one")!.geometry.coordinates, loggedRed);
  assert.equal((await steps()).length, fixBefore + 4);
  // Changed while plotted by dead reckoning, over the ground again loses that change (product owner, 14 Oct 2026):
  // given, refused, saying why, until confirmed; confirmed, one step, the positions as logged back.
  await vscode.commands.executeCommand<TrackDone>("debrief.plottingMode", "track-red-one", "dr");
  const drBefore = track("track-red-one")!;
  await api.fromMap!({ kind: "edit_track", feature_id: "track-red-one", track_edit: { action: "move_fix", fix_time: movedTime, distance: { value: 0.3, unit: "[nmi_i]" }, bearing: { value: 90, unit: "deg" } } });
  // On a DR track the leg into the fix changes and every later fix follows (product owner, 14 Oct 2026).
  const drFix = (await steps()).at(-1)?.notes ?? [];
  assert.match(drFix[0] ?? "", new RegExp(`^${redName.replace(/[()]/g, "\\$&")} \\(DR\\) leg into ${movedWhen} now \\d{3}\\.\\d°T \\d+\\.\\d kn$`));
  assert.equal(drFix.at(-1), "The fixes after it follow, by dead reckoning");
  const drAfter = track("track-red-one")!;
  assert.deepEqual(drAfter.geometry.coordinates[fixIndex - 1], drBefore.geometry.coordinates[fixIndex - 1], "the fix before stays");
  assert.notDeepEqual(drAfter.geometry.coordinates[fixIndex + 1], drBefore.geometry.coordinates[fixIndex + 1], "the fix after follows");
  const drRefused = await vscode.commands.executeCommand<TrackDone>("debrief.plottingMode", "track-red-one", "otg");
  assert.match(drRefused.problem ?? "", /was changed while plotted by dead reckoning .* Nothing was changed\. To go ahead/);
  assert.equal((await steps()).length, fixBefore + 6);
  const discarded = await vscode.commands.executeCommand<TrackDone>("debrief.plottingMode", "track-red-one", "otg", { discard_dr_changes: true });
  assert.equal(discarded.problem, undefined);
  assert.deepEqual((await steps()).at(-1)?.notes?.slice(0, 2), [`${redName} plotted over the ground`, "Changes made while plotted by dead reckoning discarded"]);
  assert.deepEqual(track("track-red-one")!.geometry.coordinates, loggedRed);
  assert.equal(await vscode.commands.executeCommand("debrief.undo"), undefined);
  assert.equal((await steps()).at(-1)?.status, "undone");

  // Importing a REP file: each track plotted as asked (OTG or DR); "use this choice for future imports" is the
  // analyst's own setting, in their Debrief configuration and VS Code's Settings, never in the plot; cleared to ask again.
  type Imported = { item?: string; notes?: string[] };
  const demoRep = path.resolve(__dirname, "../test/integration/demo.rep");
  const asked = await vscode.commands.executeCommand<Imported>("debrief.importRep", undefined, { store: current.store.id, path: demoRep, modes: { NELSON: "dr", BLUE: "otg", "TRAWLER 7": "otg" } });
  assert.equal(asked.notes?.[0], "Track 'NELSON' plotted by dead reckoning (DR).");
  const settings = vscode.workspace.getConfiguration("debrief");
  assert.equal(settings.get("trackImportMode"), "ask");
  await settings.update("trackImportMode", "dr", vscode.ConfigurationTarget.Global);
  await waitFor("the remembered choice in the configuration", async () => (await vscode.commands.executeCommand<string>("debrief.trackImportMode")) === "dr" || undefined);
  const remembered = await vscode.commands.executeCommand<Imported>("debrief.importRep", undefined, { store: current.store.id, path: demoRep });
  assert.match(remembered.notes?.at(-1) ?? "", /^Tracks were plotted by dead reckoning \(DR\) as you chose for future imports\. To change it, set Debrief: Track import mode in Settings; to be asked again for each track, run Debrief: Ask again whether imported tracks are OTG or DR\.$/);
  await vscode.commands.executeCommand("debrief.askTrackImportMode");
  assert.equal(await vscode.commands.executeCommand<string>("debrief.trackImportMode"), "ask");
  await waitFor("Settings to say ask", () => vscode.workspace.getConfiguration("debrief").get("trackImportMode") === "ask" || undefined);
  // Asked again: one question for each track, as legacy Debrief asked; put away, nothing is imported.
  const prompting = vscode.commands.executeCommand<Imported | undefined>("debrief.importRep", undefined, { store: current.store.id, path: demoRep });
  await sleep(2500);
  await screenshot("31-import-asks");
  await vscode.commands.executeCommand("workbench.action.closeQuickOpen");
  assert.equal(await prompting, undefined);
  await vscode.commands.executeCommand("debrief.openPlot", current.store.id, "serial-1");
  await waitFor("serial 1 again", () => api.session.current?.item.id === "serial-1" || undefined);

  // --- Labels, symbols and arrows at intervals (CAP-32): one step for every track chosen ---
  const beforeFrequencies = (await steps()).length;
  const frequencies = (id: string) => {
    const p = track(id)!.properties as unknown as Record<string, unknown>;
    return [p.label_interval, p.symbol_interval, p.arrow_interval];
  };
  assert.equal(await vscode.commands.executeCommand("debrief.setTrackFrequencies", ["track-blue-one", "track-red-one"], { label_interval: "10 min", arrow_interval: { value: 5, unit: "min" } }), undefined);
  assert.equal((await steps()).length, beforeFrequencies + 1, "one step for both tracks");
  assert.match((await steps()).at(-1)?.notes?.[0] ?? "", /^Labels every 10 min, arrows every 5 min on BLUE ONE and RED ONE/);
  assert.deepEqual(frequencies("track-red-one"), [{ value: 10, unit: "min" }, undefined, { value: 5, unit: "min" }]);
  // Refused plainly: an interval out of range, or no track.
  assert.match((await vscode.commands.executeCommand<string>("debrief.setTrackFrequencies", ["track-blue-one"], { label_interval: "25 h" })) ?? "", /1 s to 24 h/);
  assert.match((await vscode.commands.executeCommand<string>("debrief.setTrackFrequencies", ["no-such-track"], { label_interval: "1 h" })) ?? "", /Select one or more tracks/);
  // A fix of RED ONE always shows its time label (force on only): through the fix's own change, one step.
  const forcedAt = track("track-red-one")!.properties.times[13];
  const forced = await vscode.commands.executeCommand<{ problem?: string }>("debrief.markFix", "track-red-one", forcedAt, { show_label: true });
  assert.equal(forced.problem, undefined);
  assert.match((await steps()).at(-1)?.notes?.[0] ?? "", /time label always shown$/);
  await vscode.commands.executeCommand("debrief.outline.focus");
  await sleep(2000);
  await screenshot("36-labels-symbols-arrows");
  // Undone like any step: the fix's mark, then both tracks' intervals at once.
  assert.equal(await vscode.commands.executeCommand("debrief.undo"), undefined);
  assert.equal(await vscode.commands.executeCommand("debrief.undo"), undefined);
  assert.deepEqual(frequencies("track-blue-one"), [undefined, undefined, undefined]);
  assert.deepEqual(frequencies("track-red-one"), [undefined, undefined, undefined]);

  // A legacy plot file: its circles, ellipses and styling come in as annotations.
  const dpf = path.resolve(__dirname, "../../python/debrief-io/tests/data/shapes.dpf");
  execFileSync(process.env.DEBRIEF_PYTHON!, [
    "-c",
    "import sys; from pathlib import Path; from debrief_io import import_dpf; from debrief_stac import Catalogue; " +
      "import_dpf(Catalogue.open(Path(sys.argv[1])), Path(sys.argv[2]))",
    current.store.location,
    dpf,
  ]);
  await vscode.commands.executeCommand("debrief.refresh");
  await vscode.commands.executeCommand("debrief.openPlot", current.store.id, "shapes");
  await waitFor("the legacy plot", () => api.session.current?.item.id === "shapes" || undefined);
  const shapes = api.session.current!.plot.features.filter((f) => f.properties.kind === "annotation");
  assert.ok(shapes.some((f) => f.properties.kind === "annotation" && f.properties.shape === "ellipse" && !!(f.properties as { appearance?: { colour?: string } }).appearance?.colour));
  await waitFor("the map to draw it", () => api.mapShowing() === "shapes" || undefined);
  // Its fixes' own colours, labels and comments come in as marked fixes (EXT-14).
  const nel = api.session.current!.plot.features.find((f) => (f.properties as { name?: string }).name === "NEL_STYLE") as unknown as { properties: { fix_marks?: { label?: string; comment?: string; colour?: string }[] } };
  assert.ok(nel.properties.fix_marks?.some((m) => m.label === "Override label 1" && m.colour));
  assert.ok(nel.properties.fix_marks?.some((m) => m.comment === "comment 3"));
  await vscode.commands.executeCommand("debrief.outline.focus");
  await sleep(2000);
  await screenshot("17-imported-dpf");
}

/**
 * The Tote (CAP-06, CAP-07, NFR-04), through the real tool service: the tracks chosen by
 * command, as from the outline's menu, saved in the plot's island and never a step; the
 * values follow current time; a track with no data says so; and the latency from asking
 * to showing, as current time moves at display rate, reported.
 */
async function playTheTote(api: DebriefApi, island: () => { tote?: unknown }, period: { start: string; end: string }): Promise<void> {
  const base = api.session.current!.base;
  // As "Set as Tote primary" and "Add to Tote" in the outline's menu: the Tote view opens.
  assert.equal(await vscode.commands.executeCommand("debrief.tote.setPrimary", "track-blue-one"), undefined);
  assert.equal(await vscode.commands.executeCommand("debrief.tote.add", ["track-red-one", "track-ais-cargo-04", "track-ais-tug-01"]), undefined);
  await waitFor("the Tote view", () => api.toteShowing() || undefined);
  assert.deepEqual(island().tote, { primary: "track-blue-one", secondaries: ["track-red-one", "track-ais-cargo-04", "track-ais-tug-01"] });
  assert.deepEqual(api.session.current!.base, base, "choosing the Tote's tracks is no step in the history");
  // The map is told, for its thin lines from the primary to each secondary.
  await waitFor("the map's Tote lines", () => (api.mapTote()?.secondaries?.length === 3 ? true : undefined));
  // At the window's start Cargo 04 has no data yet; RED ONE has every measure.
  const at = (time: string) => api.setState({ time: { current: time, range: period } });
  at(period.start);
  const first = await waitFor("the Tote's values", () => (api.tote()?.time === period.start && api.tote()!.rows.length === 3 ? api.tote() : undefined));
  const [red, cargo] = first.rows;
  assert.equal(red.status, "ok");
  assert.deepEqual(
    red.values!.map((v) => v.measure),
    ["range", "bearing", "relative_bearing", "aob", "bearing_rate", "course", "speed", "depth"],
  );
  assert.ok(red.values!.every((v) => typeof v.value === "number"));
  assert.deepEqual([cargo.status, cargo.note], ["no_data", "Starts 08:28:48Z"]);
  // For the picture, the other views folded away so the Tote has room, as an analyst would.
  const others = ["debrief.catalogues", "debrief.timeline", "debrief.tools", "debrief.history"];
  const known = new Set(await vscode.commands.getCommands(true));
  const toggle = async () => {
    for (const view of others) if (known.has(`${view}.toggleVisibility`)) await vscode.commands.executeCommand(`${view}.toggleVisibility`);
  };
  await toggle();
  await vscode.commands.executeCommand("debrief.tote.focus");
  await sleep(1500);
  await screenshot("34-tote");
  // Current time moves, as the time controller sends it while playing: the values follow,
  // one request at a time, the latest time each time.
  const start = Date.parse(period.start);
  let last = period.start;
  for (let i = 1; i <= 300; i++) {
    last = new Date(start + i * 20_000).toISOString();
    at(last);
    await sleep(16);
  }
  const moved = await waitFor("the Tote at the latest time", () => (api.tote()?.time === last ? api.tote() : undefined));
  assert.notEqual(moved.rows[0].values![0].value, red.values![0].value, "the range changed with current time");
  assert.equal(moved.rows[1].status, "ok", "by 09:40, Cargo 04 has data");
  await sleep(1000);
  await screenshot("35-tote-moved");
  await toggle();
  const latency = api.toteLatency();
  console.log(`Tote latency in VS Code (tool service), from asking to showing: p50 ${latency.p50} ms, p95 ${latency.p95} ms, max ${latency.max} ms over ${latency.count} answers (budget 100 ms).`);
  // Generous: the report says precisely what was seen; this catches only a gross regression.
  assert.ok(latency.p95 < 300, `Tote p95 ${latency.p95} ms`);
  // The map's lines off and on again, as the Tote's box does: island state, never a step.
  const chosen = island().tote as { primary: string; secondaries: string[] };
  assert.equal(await vscode.commands.executeCommand("debrief.setTote", { ...chosen, map_lines: false }), undefined);
  assert.deepEqual(island().tote, { ...chosen, map_lines: false });
  await waitFor("the map's lines off", () => (api.mapTote()?.map_lines === false ? true : undefined));
  assert.equal(await vscode.commands.executeCommand("debrief.setTote", chosen), undefined);
  assert.deepEqual(island().tote, chosen);
  assert.deepEqual(api.session.current!.base, base, "the map's lines are no step either");
  // Removing tracks, as from the outline's menu.
  assert.equal(await vscode.commands.executeCommand("debrief.tote.remove", ["track-ais-cargo-04", "track-ais-tug-01"]), undefined);
  assert.deepEqual(island().tote, { primary: "track-blue-one", secondaries: ["track-red-one"] });
  // Refused plainly: a feature that is not a track.
  assert.match((await vscode.commands.executeCommand<string>("debrief.tote.add", ["no-such-track"])) ?? "", /Select the tracks/);
  assert.deepEqual(api.session.current!.base, base, "still no step");

  await vscode.commands.executeCommand("notifications.clearAll");
}
