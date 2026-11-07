/**
 * The Phase 1 tracer's tools, and the Phase 2 exit: the plot's history, through undo, a crash,
 * a colleague's change, colour and hiding, and a plot file sent with its history.
 */
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import * as vscode from "vscode";
import type { DebriefApi } from "../../src/extension.js";
import { debrief, feature, island, openSerial1, rows, sample, screenshot, sleep, steps, waitFor } from "./fixture.js";

type Window = { start: string; end: string };

export function tools(): void {
  feature("tools", () => {
    let api: DebriefApi;
    let period: Window;
    let midway: string;
    let shown: Window;
    const heard: string[] = [];
    let listening: vscode.Disposable | undefined;
    suiteSetup(async () => {
      api = await debrief();
      await openSerial1();
      period = api.session.period()!;
      // Current time set by another extension, midway: closest approach moves it from there.
      const range = api.getState()!.time.range;
      midway = new Date((Date.parse(range.start) + Date.parse(range.end)) / 2).toISOString();
      listening = api.onDidChangeState((change, origin) => heard.push(`${Object.keys(change).join()}:${origin}`));
      assert.equal(api.setState({ time: { current: midway, range } }), undefined);
    });
    suiteTeardown(() => listening?.dispose());

    test("offers range rings for one track, and opens its form", async () => {
      // Select BLUE ONE: the tools for one track are offered; open range rings.
      await vscode.commands.executeCommand("debrief.select", ["track-blue-one"]);
      await waitFor("tools for one track", () => api.offered().includes("core.range_rings") || undefined);
      assert.ok(!api.offered().includes("core.closest_approach"));
      await vscode.commands.executeCommand("debrief.showToolForm", "core.range_rings");
      await sleep(3000);
      await screenshot("02-range-rings-form");
    });

    test("runs range rings: rings on the map, the run in the history", async () => {
      // Run it: rings appear on the map, and history records the run.
      const before = api.session.current!.plot.features.length;
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
    });

    test("runs closest approach, current time to its moment, shown in a window widened to take it in", async () => {
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
      // Outside the saved window: shown in a window widened to take it in, never saved (CAP-28).
      const cpaTime = api.getState()!.time.current;
      assert.ok(cpaTime > early.end, "closest approach is after the window");
      shown = api.getState()!.time.range;
      assert.equal(shown.start, early.start);
      assert.ok(shown.end >= cpaTime && Date.parse(shown.end) - Date.parse(shown.start) <= 2 * 3600000, "widened, to no more than twice");
      assert.deepEqual(api.session.savedWindow, early, "never saved");
      assert.deepEqual(island().time_window, early);
      await sleep(3000);
      await screenshot("03-closest-approach", true);
      // Keep, as the time controller's button does: saved through the normal path.
      assert.equal(await vscode.commands.executeCommand("debrief.setTimeWindow", shown), undefined);
      assert.deepEqual(island().time_window, shown);
    });

    test("draws tracks outside the window as the plot's view says, never a step", async () => {
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
      try {
        await waitFor("the setting to draw faint as visible", () => api.mapContext() === "visible" || undefined);
        // The Time view's description says so, beside its title.
        await sleep(1500);
        await screenshot("03b-context-tracks-setting");
        assert.equal(await vscode.commands.executeCommand("debrief.contextTracks.hidden"), undefined);
        await waitFor("context hidden", () => api.mapContext() === "hidden" || undefined);
      } finally {
        await config.update("map.minimumContextContrast", undefined, vscode.ConfigurationTarget.Global);
      }
      assert.equal(await vscode.commands.executeCommand("debrief.contextTracks.visible"), undefined);
      await waitFor("context visible", () => api.mapContext() === "visible" || undefined);
      assert.equal(island().context_tracks, "visible");
      assert.equal(await vscode.commands.executeCommand("debrief.setTimeWindow", period), undefined);
    });

    test("summarises the tracks", async () => {
      const tracks = api.session.current!.plot.features.filter((f) => f.properties.kind === "track").map((f) => f.id);
      await vscode.commands.executeCommand("debrief.select", tracks);
      assert.equal(await vscode.commands.executeCommand("debrief.runTool", "core.track_summary", {}), undefined);
      await sleep(3000);
      await screenshot("04-track-summary");
    });

    test("refuses a tool that does not apply, with the reason", async () => {
      // A tool that does not apply is refused, with the reason.
      await vscode.commands.executeCommand("debrief.select", ["track-blue-one"]);
      const refused = await vscode.commands.executeCommand<string>("debrief.runTool", "core.closest_approach", {});
      assert.match(refused ?? "", /does not apply to this selection/);
    });
  });

  // --- Phase 2 exit: edit, undo, a Debrief process killed mid-save, recover ---------
  feature("history", () => {
    let api: DebriefApi;
    let folder: string;
    let blue: string | undefined;
    const ref = (id: string) => ({ feature: { id } });
    const colourOf = (id: string) => {
      const found = api.session.current!.plot.features.find((f) => f.id === id);
      return found?.properties.kind === "track" ? found.properties.style?.colour : undefined;
    };
    const python = process.env.DEBRIEF_PYTHON || "python3";
    suiteSetup(async () => {
      api = await debrief();
      await openSerial1();
      folder = path.join(sample.location, "serial-1");
      // The two runs the tools suite makes, made here too: range rings, then closest approach.
      await vscode.commands.executeCommand("debrief.select", ["track-blue-one"]);
      await waitFor("tools for one track", () => api.offered().includes("core.range_rings") || undefined);
      assert.equal(await vscode.commands.executeCommand("debrief.runTool", "core.range_rings", { spacing: { value: 1, unit: "[nmi_i]" }, rings: 4, at: "2023-06-15T09:30:00.000Z" }), undefined);
      await vscode.commands.executeCommand("debrief.select", ["track-blue-one", "track-red-one"]);
      await waitFor("tools for two tracks", () => api.offered().includes("core.closest_approach") || undefined);
      assert.equal(await vscode.commands.executeCommand("debrief.runTool", "core.closest_approach", {}), undefined);
      await waitFor("closest approach line", () => api.session.current?.plot.features.some((f) => f.id.startsWith("cpa-")) || undefined);
    });

    test("lists the runs", async () => {
      await vscode.commands.executeCommand("debrief.history.focus");
      await waitFor("history to list the runs", async () => (await steps()).length === 3 || undefined);
      assert.deepEqual((await steps()).map((s) => s.tool), ["debrief-sample", "core.range_rings", "core.closest_approach"]);
      await sleep(1000);
      await screenshot("05-history");
    });

    test("undoes closest approach: the line goes, the step stays, marked undone", async () => {
      assert.equal(await vscode.commands.executeCommand("debrief.undo"), undefined);
      await waitFor("the line to go", () => !api.session.current?.plot.features.some((f) => f.id.startsWith("cpa-")) || undefined);
      assert.deepEqual((await steps()).map((s) => s.status), ["applied", "applied", "undone"]);
      await sleep(1500);
      await screenshot("06-undone");
    });

    test("recovers from another Debrief process killed part-way through a save", async () => {
      // Another Debrief process saves a change and is killed part-way through.
      const crashed = (() => {
        try {
          execFileSync(python, [path.join(__dirname, "..", "test", "integration", "crash.py"), sample.location, "serial-1"]);
          return 0;
        } catch (error) {
          return (error as { status: number }).status;
        }
      })();
      assert.equal(crashed, 9);
      // It died before its new plot file replaced the old one: the plot file is the old one,
      // whole, so only the change in progress is lost (NFR-10, NFR-11). Reopening says so,
      // and clears what the dead process left beside it.
      assert.ok(readdirSync(folder).some((name) => name.startsWith(".plot.geojson.") && name.endsWith(".tmp")));
      await vscode.commands.executeCommand("debrief.openPlot", sample.id, "serial-1");
      await waitFor("the history after the crash", async () => (await steps()).length === 3 || undefined);
      assert.ok(!api.session.current?.plot.features.some((f) => f.id === "note-before-the-crash"));
      assert.deepEqual((await steps()).map((s) => s.status), ["applied", "applied", "undone"]);
      assert.ok(!readdirSync(folder).some((name) => name.endsWith(".tmp")));
      await sleep(1500);
      await screenshot("07-recovered", true);
    });

    test("shows the latest when a colleague changes the plot from another process", async () => {
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
        sample.location,
        "serial-1",
      ]);
      await waitFor("the colleague's note", () => api.session.current?.plot.features.some((f) => f.id === "note-colleague") || undefined);
      await waitFor("the colleague's step", async () => (await steps()).length === 4 || undefined);
      assert.deepEqual((await steps()).map((s) => s.status), ["applied", "applied", "abandoned", "applied"]);
      assert.deepEqual((await steps()).at(-1)?.notes, ["Note added by a colleague"]);
    });

    // --- Colour and hiding (SUB-22): content, so steps in the plot's history ----------
    test("colours a track, a step in the history", async () => {
      blue = colourOf("track-blue-one");
      // BLUE ONE turns out to be hostile: the analyst colours it red.
      assert.equal(await vscode.commands.executeCommand("debrief.setColour", ref("track-blue-one"), "Red"), undefined);
      assert.notEqual(colourOf("track-blue-one"), blue);
      assert.equal((await steps()).length, 5); // recorded, like any change (the colleague's note is step 4)
      assert.deepEqual((await steps()).at(-1)?.notes, ["Colour of BLUE ONE set to red"]);
      assert.deepEqual((await rows())[0], { ...(await rows())[0], current: true, nextToUndo: true });
      await vscode.commands.executeCommand("debrief.history.focus");
      await sleep(1500);
      await screenshot("08-colour-in-history");
    });

    test("hides a track, a step, the map saying how many are hidden", async () => {
      // Hiding is a step too; the map says how many are hidden, with "Show all".
      assert.equal(await vscode.commands.executeCommand("debrief.hide", ref("track-ais-cargo-01")), undefined);
      assert.equal((await steps()).length, 6);
      await waitFor("the map to count the hidden track", () => api.hiddenOnMap() === 1 || undefined);
      await vscode.commands.executeCommand("debrief.outline.focus");
      await sleep(1500);
      await screenshot("09-hidden-on-map");
    });

    test("undoes the hiding and the colour, and redoes them", async () => {
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
    });

    test("shows every hidden feature again with Show all, one more step", async () => {
      // "Show all" on the map shows every hidden feature again, as one more step.
      await vscode.commands.executeCommand("debrief.showAllHidden");
      await waitFor("nothing hidden", () => api.hiddenOnMap() === 0 || undefined);
      assert.equal((await steps()).length, 7);
    });

    // --- One file, history included (decision 13 Oct) ---------------------------------
    let added: { item?: string; problem?: string } | undefined;
    test("adds a plot file sent by a colleague, every step with it", async () => {
      // The analyst sends serial 1 to a colleague: the plot file alone, no sources beside it.
      const outbox = mkdtempSync(path.join(tmpdir(), "debrief-outbox-"));
      const sent = path.join(outbox, "serial-1-from-ian.geojson");
      copyFileSync(path.join(folder, "plot.geojson"), sent);
      // The colleague adds it to their catalogue (here, the same one): every step comes with it.
      added = await vscode.commands.executeCommand<{ item?: string; problem?: string }>(
        "debrief.addPlotFile",
        { kind: "catalogue", key: `catalogue:${sample.id}`, catalogue: { store: sample.id } },
        sent,
      );
      assert.equal(added?.problem, undefined);
      assert.equal(added?.item, "serial-1-from-ian");
      await vscode.commands.executeCommand("debrief.openPlot", sample.id, added!.item);
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
    });

    test("undoes a step the sender made, with the arrival, in one Ctrl+Z", async () => {
      // ...and undoes a step the sender made with one Ctrl+Z: the sender's "Show all", taken
      // back with the step recording the arrival, so the track the sender had hidden is
      // hidden again.
      assert.equal(await vscode.commands.executeCommand("debrief.undo"), undefined);
      await waitFor("the sender's hidden track", () => api.hiddenOnMap() === 1 || undefined);
      assert.deepEqual((await steps()).slice(-2).map((s) => s.status), ["undone", "undone"]);
      await vscode.commands.executeCommand("debrief.history.focus");
      await sleep(1500);
      await screenshot("12-undid-a-senders-step");
    });

    test("leaves the original untouched", async () => {
      await vscode.commands.executeCommand("debrief.openPlot", sample.id, "serial-1");
      await waitFor("the original", async () => (await steps()).length === 7 || undefined);
    });
  });
}
