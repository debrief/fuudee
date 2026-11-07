/**
 * Annotations (CAP-03 to CAP-05): shapes, labels and notes, each a step; the Timeline; drawing
 * and editing on the map (NFR-13). The narrative in the Timeline (CAP-19, CAP-20).
 */
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import * as vscode from "vscode";
import type { AnnotationProperties } from "@debrief/schemas";
import type { DebriefApi } from "../../src/extension.js";
import { debrief, feature, island, openSerial1, screenshot, sleep, steps, waitFor } from "./fixture.js";

type Done = { problem?: string; feature?: string };
type Entries = { entries: string[]; current?: string };

export function annotations(): void {
  // --- Annotations: shapes, labels and notes, each a step (CAP-03 to CAP-05) ------------
  feature("annotations", () => {
    let api: DebriefApi;
    const annotation = (id: string) => {
      const found = api.session.current!.plot.features.find((f) => f.id === id);
      return found?.properties.kind === "annotation" ? (found as { properties: AnnotationProperties }) : undefined;
    };
    suiteSetup(async () => {
      api = await debrief();
      await openSerial1();
    });

    test("opens the form beside the map, a circle in the middle of the map", async () => {
      // The results of earlier tools are not needed here: more room for the map.
      for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) if (tab.label.startsWith("Results")) await vscode.window.tabGroups.close(tab);
      }
      await vscode.commands.executeCommand("debrief.addAnnotation");
      await waitFor("the annotation form", async () => (await vscode.commands.executeCommand<string | undefined>("debrief.annotationFormOpen")) === "" || undefined);
      await sleep(2500);
      await screenshot("13-add-annotation-form");
      await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
    });

    test("adds a circle as the form sends it, restyles it, and undoes and redoes the style", async () => {
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
    });

    test("adds an ellipse, an area, a label, a note and the north arrow; refuses what cannot be made", async () => {
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
    });

    test("lists time-only annotations in the Timeline; choosing one moves current time to it", async () => {
      const listed = await vscode.commands.executeCommand<Entries>("debrief.timelineEntries");
      assert.ok(listed.entries.includes("annotation-contact-gained"));
      await vscode.commands.executeCommand("debrief.timeline.focus");
      assert.equal(await vscode.commands.executeCommand("debrief.goToTime", "annotation-contact-gained"), undefined);
      assert.equal(api.session.time?.current, "2023-06-15T10:15:00.000Z");
      assert.equal((await vscode.commands.executeCommand<Entries>("debrief.timelineEntries")).current, "annotation-contact-gained");
      await vscode.commands.executeCommand("debrief.timeline.focus");
      await sleep(2000);
      await screenshot("15-timeline");
    });

    test("opens a circle's properties form; deletes a label, one step, and undoes it", async () => {
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
    });

    // --- Drawing and editing on the map (CAP-03, NFR-13) ----------------------------------
    let drawnBefore = 0;
    let timeBefore: ReturnType<DebriefApi["getState"]> extends infer S ? (S extends { time: infer T } ? T : never) : never;
    test("opens the form for an area drawn on the map; closed unsaved, nothing is recorded", async () => {
      // What the map sends when the analyst finishes drawing: the form opens with it, to be
      // named; closed unsaved, nothing is recorded. (The pointer and keys are played in the playground test.)
      drawnBefore = (await steps()).length;
      timeBefore = api.getState()!.time;
      await api.fromMap!({ kind: "annotation_drawn", annotation: { shape: "area", name: "", positions: [[-75.62, 37.12], [-75.42, 37.14], [-75.4, 36.98]] } });
      await waitFor("the form, with what was drawn", async () => (await vscode.commands.executeCommand<string | undefined>("debrief.annotationFormOpen")) === "" || undefined);
      await sleep(2500);
      await screenshot("18-drawn-area-form");
      await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
      assert.equal((await steps()).length, drawnBefore);
    });

    test("changes an area as its handles on the map do, one step each; reports a change refused", async () => {
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
    });
  });

  // The narrative in the Timeline (CAP-20): the sample's log is narrative entries, one step each
  // to add, change and delete; a REP file's narrative read into the plot as one step; the entry
  // current time is at shown on the map beside its track.
  feature("narrative", () => {
    type Narrated = { problem?: string; feature?: string; entries?: number };
    let api: DebriefApi;
    let contact: { id: string };
    let added: Narrated;
    let narrativeSteps = 0;
    let scratch: string;
    let word: string;
    const narrativeOf = () => api.session.current!.plot.features.filter((f) => f.properties.kind === "narrative");
    suiteSetup(async () => {
      api = await debrief();
      await openSerial1();
      scratch = mkdtempSync(path.join(tmpdir(), "debrief-narrative-"));
      await vscode.commands.executeCommand("debrief.timeline.focus");
    });

    test("lists the sample's log in the Timeline, the entry at current time beside its track on the map", async () => {
      await waitFor("the Timeline view", () => api.timelineShowing() || undefined);
      const logged = narrativeOf();
      assert.ok(logged.length > 20, "the sample's log is narrative entries");
      assert.ok(!api.session.current!.plot.features.some((f) => f.properties.kind === "annotation" && f.properties.style === "note" && f.properties.name === "BLUE ONE"), "not notes");
      contact = logged.find((f) => f.properties.kind === "narrative" && f.properties.text.startsWith("Bow sonar contact"))!;
      assert.ok((await vscode.commands.executeCommand<Entries>("debrief.timelineEntries")).entries.includes(contact.id));
      assert.equal(await vscode.commands.executeCommand("debrief.goToTime", contact.id), undefined);
      assert.equal((await vscode.commands.executeCommand<Entries>("debrief.timelineEntries")).current, contact.id);
      await waitFor("the entry on the map, beside BLUE ONE", () => (api.mapNarrative()?.id === contact.id ? true : undefined));
      assert.equal(api.mapNarrative()?.track, "track-blue-one");
    });

    test("turns the narrative on the map off and on, the plot's choice and never a step", async () => {
      // Off and on again from the Timeline: the plot's choice, in its island, never a step (product owner, 15 Oct 2026).
      const stepsBeforeOnMap = (await steps()).length;
      assert.equal(await vscode.commands.executeCommand("debrief.setNarrativeOnMap", false), undefined);
      assert.equal(island().narrative_on_map, false);
      await waitFor("the map's narrative box gone", () => (api.mapNarrative() === undefined ? true : undefined));
      assert.equal(await vscode.commands.executeCommand("debrief.setNarrativeOnMap", true), undefined);
      assert.equal("narrative_on_map" in island(), false, "on is left out of the island, as it means");
      await waitFor("the map's narrative box back", () => (api.mapNarrative()?.id === contact.id ? true : undefined));
      assert.equal((await steps()).length, stepsBeforeOnMap, "never a step");
    });

    test("adds an entry and changes it, one step each", async () => {
      narrativeSteps = (await steps()).length;
      added = await vscode.commands.executeCommand<Narrated>("debrief.addNarrative", { time: "2023-06-15T09:05:00.000Z", source: "BLUE ONE", entry_type: "Comms", text: "Link check with control: loud and clear." });
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
      try {
        await vscode.commands.executeCommand("debrief.timeline.focus");
        await sleep(2000);
        await screenshot("15b-narrative");
      } finally {
        await fold();
      }
    });

    test("deletes an entry, undoes it, and redoes and undoes from the Timeline's keys", async () => {
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
    });

    test("reads a second platform's REP log into the plot, one step, its source kept", async () => {
      // A second platform's log: its narrative lines read into the open plot, one step, its source kept.
      const red = path.join(scratch, "red-one-log.rep");
      writeFileSync(red, ';NARRATIVE2: 230615 090000 "RED ONE" CSD Went deep, 40 m.\n;NARRATIVE2: 230615 090100 "RED ONE" Comms Missed the broadcast.\n');
      const read = await vscode.commands.executeCommand<Narrated>("debrief.importNarrative", red);
      assert.equal(read.problem, undefined);
      assert.equal(read.entries, 2);
      assert.deepEqual((await steps()).at(-1)?.notes?.slice(0, 2), ["Narrative read from red-one-log.rep", "2 narrative entries read, from RED ONE."]);
      const deep = narrativeOf().find((f) => f.properties.kind === "narrative" && f.properties.text === "Went deep, 40 m.");
      assert.equal((deep?.properties as { track_id?: string } | undefined)?.track_id, "track-red-one");
      assert.equal((await steps()).length, narrativeSteps + 4);
    });

    test("reads a Word narrative with the types and tracks an agent passes, one step", async () => {
      // A Word narrative (CAP-19), legacy Debrief's narrative-document dialect, with the
      // choices an agent passes: the types to read and BLUE TWO's track (none). One step.
      word = path.join(scratch, "red-one-log.docx");
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
    });

    test("knows the same document under another name, and reads only the entries not in the plot", async () => {
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
    });

    test("refuses an entry with no time, changing nothing", async () => {
      // Refused plainly, nothing changed: no time.
      const refusedNarrative = await vscode.commands.executeCommand<Narrated>("debrief.addNarrative", { source: "X", text: "No time." });
      assert.match(refusedNarrative.problem ?? "", /time/);
      assert.equal((await steps()).length, narrativeSteps + 6);
    });
  });
}
