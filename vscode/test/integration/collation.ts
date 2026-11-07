/**
 * Collation (CAP-08 to CAP-12), exported images (SUB-25, OUT-04), and a legacy plot file
 * imported, in VS Code through the real tool service.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import * as vscode from "vscode";
import type { DebriefApi } from "../../src/extension.js";
import { debrief, feature, openSerial1, sample, screenshot, sleep, steps, waitFor } from "./fixture.js";

/** A REP position: degrees, minutes and seconds with a hemisphere, as legacy Debrief writes them. */
function dms(value: number, positive: string, negative: string, width: number): string {
  const hundredths = Math.round(Math.abs(value) * 360_000);
  const degrees = Math.floor(hundredths / 360_000);
  const minutes = Math.floor((hundredths % 360_000) / 6_000);
  const seconds = ((hundredths % 6_000) / 100).toFixed(2).padStart(5, "0");
  return `${String(degrees).padStart(width, "0")} ${String(minutes).padStart(2, "0")} ${seconds} ${value >= 0 ? positive : negative}`;
}

export function collation(): void {
  /**
   * Collation (CAP-08 to CAP-12) in VS Code, through the real tool service: a navigation log for
   * BLUE ONE, written here (fiction, like the sample) and imported, is marked as new data for
   * serial 1 in Catalogues and Coverage; taken as one step; a period's source chosen; a proposal
   * refused; then the log revised by a colleague, the analyst told once and the plot flagged
   * until reviewed. Every step is undone at the end.
   */
  feature("collation", () => {
    let api: DebriefApi;
    let before = 0;
    let marked: NonNullable<NonNullable<ReturnType<DebriefApi["catalogueMarks"]>["coverage"]>["items"][number]>;
    suiteSetup(async () => {
      api = await debrief();
      await openSerial1();
      before = (await steps()).length;
    });

    test("marks a navigation log imported as new data for serial 1, in Catalogues and Coverage", async () => {
      const plot = api.session.current!.plot;
      const blue = plot.features.find((f) => f.id === "track-blue-one") as unknown as { geometry: { coordinates: number[][] }; properties: { times: string[] } };
      // BLUE ONE's own log under its name in other letters: its fixes from 09:20 to 10:20, 0.001° north
      // of the plot's, then on for 20 minutes after the plot's last fix.
      const at = (i: number) => ({ time: Date.parse(blue.properties.times[i]), position: blue.geometry.coordinates[i] });
      const fixes = blue.properties.times.map((_, i) => at(i)).filter((f) => f.time >= Date.parse("2023-06-15T09:20:00.000Z") && f.time <= Date.parse("2023-06-15T10:20:00.000Z"));
      const last = at(blue.properties.times.length - 1);
      for (let i = 1; i <= 20; i++) fixes.push({ time: last.time + i * 60_000, position: [last.position[0] - i * 0.002, last.position[1] + i * 0.001] });
      const lines = fixes.map(({ time, position }) => {
        const t = new Date(time).toISOString();
        const stamp = `${t.slice(2, 4)}${t.slice(5, 7)}${t.slice(8, 10)} ${t.slice(11, 13)}${t.slice(14, 16)}${t.slice(17, 19)}.000`;
        return `${stamp} "Blue One" @A ${dms(position[1] + 0.001, "N", "S", 2)} ${dms(position[0], "E", "W", 3)} 295.0 10.0 0`;
      });
      const folder = mkdtempSync(path.join(tmpdir(), "debrief-nav-"));
      const log = path.join(folder, "blue-one-nav-log.rep");
      writeFileSync(log, [";; A navigation log, made up for this test: not a record of any real platform.", ...lines].join("\n") + "\n");
      const imported = await vscode.commands.executeCommand<{ item?: string }>("debrief.importRep", undefined, { store: sample.id, path: log, modes: "otg" });
      assert.equal(imported.item, "blue-one-nav-log");
      // Marked as new data for serial 1, in Catalogues and Coverage: a sparkle and the words, its reason in the tooltip.
      marked = await waitFor("the new data to be marked", () => api.catalogueMarks().coverage?.items.find((i) => i.item === "blue-one-nav-log" && i.new_data));
      assert.equal(marked.new_data!.note, "New data for Serial 1: BLUE ONE, within its period");
      await vscode.commands.executeCommand("debrief.showCoverage");
      await waitFor("the Coverage view", () => (api.coverageShowing() && api.coverage()?.items.some((i) => i.new_data)) || undefined);
      await vscode.commands.executeCommand("debrief.catalogues.focus");
      await sleep(1500);
      await screenshot("37-new-data-marked");
    });

    test("takes the new data, one step named for the item; the mark clears; the Timeline lists its period", async () => {
      // Taken, as Coverage's Take asks: one step, named for the item; the mark clears.
      api.coverageMessage({ kind: "take_asked", item_revision: { catalogue: marked.catalogue, item: marked.item, revision: marked.revision } });
      await waitFor("the new data taken", async () => (await steps()).at(-1)?.notes?.[0] === "New data from blue-one-nav-log" || undefined);
      await waitFor("the mark to clear", () => api.coverage()?.items.find((i) => i.item === "blue-one-nav-log" && i.role === "drawn_from" && !i.new_data));
      // The Timeline lists the log's period of data (CAP-05).
      const timelined = await vscode.commands.executeCommand<{ entries: string[] }>("debrief.timelineEntries");
      assert.ok(timelined.entries.includes("coverage:track-blue-one:2023-06-15T12:01:00.000Z"), "the log's period after the plot's, in the Timeline");
    });

    test("chooses the log for the period both have; refuses another platform's track", async () => {
      // The period both have, the log chosen for it, as Coverage's list asks.
      const platform = api.coverage()!.platforms.find((p) => p.track === "track-blue-one")!;
      const both = platform.periods.find((p) => p.sources.length > 1)!;
      const source = platform.sources.find((s) => s.item === "blue-one-nav-log")!;
      api.coverageMessage({ kind: "source_chosen", feature_id: "track-blue-one", time_range: { start: both.start, end: both.end }, source: { catalogue: source.catalogue, item: source.item, track: source.track, name: source.name } });
      await waitFor("the period's source chosen", async () => /^BLUE ONE \d\d:\d\d:\d\dZ to \d\d:\d\d:\d\dZ from blue-one-nav-log$/.test((await steps()).at(-1)?.notes?.[0] ?? "") || undefined);
      // Serial 2's BLUE ONE is another platform: refused, by the command agents and the tree's menu use.
      const serial2 = platform.sources.find((s) => s.item === "serial-2")!;
      assert.equal(await vscode.commands.executeCommand("debrief.collate", { kind: "link", feature: "track-blue-one", source: { catalogue: serial2.catalogue, item: serial2.item, track: serial2.track, name: serial2.name }, linked: false }), undefined);
      assert.equal((await steps()).at(-1)?.notes?.[0], "BLUE ONE in Serial 2 is not BLUE ONE");
      await vscode.commands.executeCommand("debrief.coverage.focus");
      await sleep(1500);
      await screenshot("38-coverage-view");
    });

    test("flags serial 1 for review once a colleague revises the log, until cleared", async () => {
      // A colleague revises the log: Debrief says so once, and flags serial 1 until reviewed (CAP-12).
      execFileSync(process.env.DEBRIEF_PYTHON || "python3", [
        "-c",
        "import sys; from pathlib import Path; from debrief_schemas import models; from debrief_stac import Catalogue; " +
          "c = Catalogue.open(Path(sys.argv[1])); " +
          "c.edit_track('blue-one-nav-log', 'track-blue-one', {'action': 'move', 'distance': {'value': 0.1, 'unit': '[nmi_i]'}, 'bearing': {'value': 90, 'unit': 'deg'}}, models.AgentRef(kind='person', name='a colleague'))",
        sample.location,
      ]);
      await vscode.commands.executeCommand("debrief.refresh");
      const flagged = await waitFor("the plot flagged for review", () => api.catalogueMarks().flags.find((f) => f.item === "serial-1"));
      assert.equal(flagged.note, "May need review: blue-one-nav-log was revised since Serial 1 took data from it");
      await vscode.commands.executeCommand("debrief.catalogues.focus");
      await sleep(1500);
      await screenshot("39-review-flag", true);
      assert.equal(await vscode.commands.executeCommand("debrief.clearReviewFlag"), undefined);
      await waitFor("the flag to clear", () => !api.catalogueMarks().flags.length || undefined);
      // Not now with nothing chosen says why it did nothing, rather than nothing at all.
      assert.match(String(await vscode.commands.executeCommand("debrief.dismissNewData")), /^Choose an item marked New data in Catalogues/);
    });

    test("undoes the three steps", async () => {
      assert.equal((await steps()).length, before + 3);
      for (let i = 0; i < 3; i++) assert.equal(await vscode.commands.executeCommand("debrief.undo"), undefined);
      const restored = api.session.current!.plot.features.find((f) => f.id === "track-blue-one") as unknown as { properties: { supplies?: unknown; platform_unlinks?: unknown } };
      assert.equal(restored.properties.supplies, undefined);
      assert.equal(restored.properties.platform_unlinks, undefined);
      await vscode.commands.executeCommand("notifications.clearAll");
    });
  });

  /**
   * Export the map as a PNG for a slide and an SVG, each read back from its file for the ID
   * in its metadata (PNG iTXt and XMP, SVG metadata), the export logged in the plot's island and
   * never a step; then the plot changes, and the PNG is traced back by its file and by its ID
   * typed from the footer: the plot shown as it was at that step, read-only, a change refused,
   * until Go to latest.
   */
  feature("exports", () => {
    type Exported = { file: string; id: string; short: string; recorded: boolean };
    type Base = { current: number; plot_hash: string };
    let api: DebriefApi;
    let folder: string;
    let base: Base;
    let now: Base;
    let count = 0;
    let png: Exported;
    let logged: { id: string; revision: string; file: string; viewport: { bbox: number[] } }[];
    let green: string | undefined;
    const plotPath = () => path.join(sample.location, "serial-1", "plot.geojson");
    const exportLog = () => JSON.parse(readFileSync(plotPath(), "utf8")).features.find((f: { properties: { kind: string } }) => f.properties.kind === "plot").properties.view.exports;
    const colourOf = () => (api.session.current!.plot.features.find((f) => f.id === "track-red-one") as unknown as { properties: { style?: { colour?: string } } }).properties.style?.colour;
    suiteSetup(async () => {
      api = await debrief();
      const opened = await openSerial1();
      folder = mkdtempSync(path.join(tmpdir(), "debrief-figures-"));
      base = opened.base!;
      count = (await steps()).length;
    });

    test("writes an export not saved through the dialog only into the workspace or the export folder", async () => {
      // An export not saved through the dialog (an agent's, this test's) goes only into the
      // workspace's folders or the exports folder set (expert panel, 16 Oct 2026).
      const outside = String(await vscode.commands.executeCommand("debrief.exportImage", { format: "png", preset: "slide", file: path.join(tmpdir(), "debrief-outside.png") }));
      assert.match(outside, /only into this workspace's folders or the folder set in Debrief: Export folder/);
      assert.ok(!existsSync(path.join(tmpdir(), "debrief-outside.png")), "nothing written outside");
      await vscode.workspace.getConfiguration("debrief").update("exportFolder", folder, vscode.ConfigurationTarget.Global);
    });

    test("exports a PNG for a slide, its ID in its metadata, logged in the island and never a step", async () => {
      png = (await vscode.commands.executeCommand<Exported>("debrief.exportImage", { format: "png", preset: "slide", theme: "light", footer: true, file: path.join(folder, "serial-1.png") }))!;
      assert.ok(png.recorded, "the plot's export log has it");
      const data = readFileSync(png.file);
      assert.equal(data.readUInt32BE(16), 1600, "a slide is 1600 pixels wide");
      assert.equal(data.readUInt32BE(20), 900, "and 900 high");
      const text = data.toString("latin1");
      assert.ok(text.includes(`debrief:figure\0\0\0\0\0${png.id}`), "the ID in its own iTXt chunk");
      assert.ok(text.includes(`<dc:identifier>${png.id}</dc:identifier>`), "and in XMP");
      assert.ok(text.indexOf("iTXt") < text.indexOf("IDAT"), "before the image data");
      // The export is in the island: the same revision, no step.
      assert.deepEqual(api.session.current!.base, base, "an export is never a step");
      assert.equal((await steps()).length, count);
      logged = exportLog();
      assert.deepEqual(logged.map((e) => e.id), [png.id]);
      assert.equal(logged[0].revision, base.plot_hash);
      assert.equal(logged[0].file, "serial-1.png");
    });

    test("exports an SVG, its ID in its metadata, track names as text; never over a file", async () => {
      const svg = (await vscode.commands.executeCommand<Exported>("debrief.exportImage", { format: "svg", preset: "screen", theme: "current", footer: false, file: path.join(folder, "serial-1.svg") }))!;
      const svgText = readFileSync(svg.file, "utf8");
      assert.ok(svgText.includes(`<dc:identifier>${svg.id}</dc:identifier>`), "the SVG's ID in its metadata");
      assert.ok(!svgText.includes("debrief-footer"), "no footer, as asked");
      assert.ok(svgText.includes(">BLUE ONE</text>"), "track names as text");
      // Never over a file without being asked to.
      assert.match(String(await vscode.commands.executeCommand("debrief.exportImage", { format: "svg", file: svg.file })), /serial-1\.svg is there already/);
    });

    test("draws an agent's export on the open map, and refuses one outside the folders or of no plot", async () => {
      // An agent's export (product owner, 16 Oct 2026): the service asks the open map to draw it, as the analyst's is.
      const opened = api.session.current!;
      const agentFile = path.join(folder, "agent.svg");
      const byAgent = (await api.asAgent!("debrief/export_image", { store: opened.store.id, item: opened.item.id, file: agentFile, theme: "light", agent: { kind: "software_agent", name: "Test agent" } })) as Exported;
      assert.equal(byAgent.file, agentFile);
      assert.ok(readFileSync(agentFile, "utf8").includes(`<dc:identifier>${byAgent.id}</dc:identifier>`), "drawn by the map and written");
      assert.equal(exportLog().at(-1).by, "Test agent");
      await assert.rejects(api.asAgent!("debrief/export_image", { store: opened.store.id, item: "no-such-plot", file: path.join(folder, "x.png") }), /no plot 'no-such-plot'/);
      await assert.rejects(api.asAgent!("debrief/export_image", { store: opened.store.id, item: opened.item.id, file: path.join(tmpdir(), "debrief-agent-outside.png") }), /only into this workspace's folders/);
      assert.equal((await steps()).length, count, "exports are never steps");
      await sleep(500);
      await screenshot("40-exported");
    });

    test("traces the PNG back by its file: the plot as it was, read-only, at the view exported", async () => {
      // The analyst carries on: RED ONE coloured green, one step.
      assert.equal(await vscode.commands.executeCommand("debrief.setColour", { feature: { id: "track-red-one" } }, "Green"), undefined);
      assert.equal((await steps()).length, count + 1);
      green = colourOf();
      now = api.session.current!.base!;
      // Traced by its file: the plot as it was at that step, read-only.
      assert.equal(await vscode.commands.executeCommand("debrief.findImageSource", { file: png.file }), undefined);
      const shown = await waitFor("the earlier revision on the map", () => api.mapRevision());
      assert.deepEqual([shown.step, shown.latest, shown.figure], [base.current, now.current, png.short]);
      assert.notEqual(colourOf(), green, "RED ONE as it was then");
      assert.deepEqual(api.getState()!.viewport.bbox.map((x) => Math.round(x * 100)), logged[0].viewport.bbox.map((x: number) => Math.round(x * 100)), "at the view exported");
      // Nothing can be changed: undo is refused and said; the history is as it was.
      assert.match(String(await vscode.commands.executeCommand("debrief.undo")), /shown read-only, so it cannot be changed/);
      assert.equal((await steps()).length, count + 1);
      await sleep(1000);
      await screenshot("41-traced-read-only", true);
      // Go to latest: the plot as it is.
      await vscode.commands.executeCommand("debrief.openLatestRevision");
      await waitFor("the latest revision", () => (!api.session.current?.revision && colourOf() === green) || undefined);
    });

    test("traces it back by its ID typed from the footer", async () => {
      // Traced by its ID, typed from the footer as a reader might.
      assert.equal(await vscode.commands.executeCommand("debrief.findImageSource", { id: png.short.toLowerCase().replace(/-/g, " ") }), undefined);
      await waitFor("the earlier revision again", () => api.session.current?.revision?.step === base.current || undefined);
      await vscode.commands.executeCommand("debrief.openLatestRevision");
      await waitFor("the latest revision again", () => !api.session.current?.revision || undefined);
      // Put back as it was for anything after.
      assert.equal(await vscode.commands.executeCommand("debrief.undo"), undefined);
      await vscode.commands.executeCommand("notifications.clearAll");
    });
  });

  // A legacy plot file: its circles, ellipses and styling come in as annotations.
  feature("dpf", () => {
    let api: DebriefApi;
    suiteSetup(async () => {
      api = await debrief();
    });

    test("imports a legacy plot file's shapes as annotations and its fixes' marks as marked fixes", async () => {
      const dpf = path.resolve(__dirname, "../../python/debrief-io/tests/data/shapes.dpf");
      execFileSync(process.env.DEBRIEF_PYTHON!, [
        "-c",
        "import sys; from pathlib import Path; from debrief_io import import_dpf; from debrief_stac import Catalogue; " +
          "import_dpf(Catalogue.open(Path(sys.argv[1])), Path(sys.argv[2]))",
        sample.location,
        dpf,
      ]);
      await vscode.commands.executeCommand("debrief.refresh");
      await vscode.commands.executeCommand("debrief.openPlot", sample.id, "shapes");
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
    });
  });
}
