/**
 * Editing tracks, each change one step (CAP-01, CAP-02, CAP-21, CAP-32, EXT-14): moved, rotated,
 * split and merged; cleaned; sheared and stretched; a fix moved and dead reckoning; REP import's
 * OTG or DR; labels, symbols and arrows at intervals. Each suite on a fresh serial 1.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import * as vscode from "vscode";
import type { DebriefApi } from "../../src/extension.js";
import { debrief, feature, openSerial1, sample, screenshot, sleep, steps, waitFor } from "./fixture.js";

type TrackDone = { problem?: string; feature?: string; features?: string[] };
type Track = { geometry: { coordinates: number[][] }; properties: { name: string; times: string[]; style?: { colour: string } } };

export function tracks(): void {
  let api: DebriefApi;
  const track = (id: string) => api.session.current!.plot.features.find((f) => f.id === id) as unknown as Track | undefined;
  const fresh = async () => {
    api = await debrief();
    await openSerial1();
  };

  // --- Tracks: moved, rotated, split and merged, each one step (CAP-01, CAP-02) ----------
  feature("tracks", () => {
    let tracksBefore = 0;
    let timeBefore: string;
    let red: Track;
    suiteSetup(async () => {
      await fresh();
      tracksBefore = (await steps()).length;
      timeBefore = api.getState()!.time.current;
    });

    test("moves a track as its handle on the map does, and rotates it, one step each", async () => {
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
    });

    test("moves part of a track, one step", async () => {
      // Only RED ONE's fixes in a period move: "part moved".
      red = track("track-red-one")!;
      const redPeriod = { start: red.properties.times[Math.floor(red.properties.times.length / 3)], end: red.properties.times[Math.floor((2 * red.properties.times.length) / 3)] };
      const moved = await vscode.commands.executeCommand<TrackDone>("debrief.moveTrack", "track-red-one", { distance: { value: 2, unit: "km" }, bearing: { value: 90, unit: "deg" }, period: redPeriod });
      assert.equal(moved.problem, undefined);
      assert.match((await steps()).at(-1)?.notes?.[0] ?? "", /^RED ONE part moved 1\.08 nmi 090\.0°T$/);
      await vscode.commands.executeCommand("debrief.select", ["track-red-one"]);
      await sleep(2000);
      await screenshot("21-track-part-moved");
    });

    test("splits a track at a time into two, one step, the parts selected", async () => {
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
    });

    test("merges the parts again, one step, refusing tracks that overlap in time", async () => {
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
    });

    test("undoes the merge like any step, current time where it was", async () => {
      // Each is undone like any step: undoing the merge brings the two parts back.
      assert.equal(await vscode.commands.executeCommand("debrief.undo"), undefined);
      assert.ok(track("track-red-one-2"));
      assert.deepEqual(api.getState()!.time.current, timeBefore);
    });
  });

  // --- Cleaning tracks: jumps, smoothing and marked fixes, each one step (CAP-01, EXT-14) ----
  feature("cleaning", () => {
    type Shown = { feature_id: string; fix_times?: string[]; preview?: { coordinates: number[][] }; message?: string } | undefined;
    type JumpsDone = { problem?: string; found?: string[]; removed?: number; threshold?: { value: number; unit: string } };
    let cleanBefore = 0;
    let blueTrack: Track;
    let glitchTimes: string[];
    let redName: string;
    let fixTime: string;
    suiteSetup(async () => {
      await fresh();
      cleanBefore = (await steps()).length;
    });

    test("finds GPS glitches a colleague's change brought, ringed on the map, nothing changed", async () => {
      // GPS glitches in BLUE ONE, as a colleague's change on another computer would bring them.
      blueTrack = track("track-blue-one")!;
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
        sample.location,
        "serial-1",
        ...glitched.map(String),
      ]);
      await vscode.commands.executeCommand("debrief.refresh");
      await waitFor("the colleague's glitches", async () => (await steps()).length === cleanBefore + 1 || undefined);
      // Found first, ringed on the map, nothing changed; then removed, one step named for them.
      await vscode.commands.executeCommand("debrief.select", []); // the rings, not the selection's outline, in the picture
      const found = await vscode.commands.executeCommand<JumpsDone>("debrief.removeJumps", "track-blue-one", { threshold: { value: 30, unit: "[kn_i]" } });
      glitchTimes = glitched.map((i) => blueTrack.properties.times[i]);
      assert.deepEqual(found.found, glitchTimes);
      assert.equal((await steps()).length, cleanBefore + 1, "finding changes nothing");
      const ringed = await vscode.commands.executeCommand<Shown>("debrief.fixesOnMap");
      assert.deepEqual(ringed?.fix_times, glitchTimes);
      assert.match(ringed?.message ?? "", /^BLUE ONE: 2 jumps found, each faster than 30\.0 kn to reach/);
      await sleep(2000);
      await screenshot("24-jumps-found");
    });

    test("removes the jumps, one step named for them, the rings gone", async () => {
      const removed = await vscode.commands.executeCommand<JumpsDone>("debrief.removeJumps", "track-blue-one", { threshold: { value: 30, unit: "[kn_i]" }, times: "all" });
      assert.equal(removed.problem, undefined);
      assert.equal(removed.removed, 2);
      assert.deepEqual((await steps()).at(-1)?.notes?.slice(0, 1), ["BLUE ONE: 2 jumps removed"]);
      assert.equal(track("track-blue-one")!.properties.times.length, blueTrack.properties.times.length - 2);
      assert.equal(await vscode.commands.executeCommand<Shown>("debrief.fixesOnMap"), undefined, "the rings go");
    });

    test("previews smoothing on the map, then applies it, one step", async () => {
      // Smoothing previewed (it stays on the map), then applied: one step.
      const previewed = await vscode.commands.executeCommand<{ summary?: string; moved?: number }>("debrief.smoothTrack", "track-red-one", { window: 5, apply: false });
      assert.match(previewed.summary ?? "", /^\d+ fix(es)? moved; the most a fix moved: /);
      assert.ok((await vscode.commands.executeCommand<Shown>("debrief.fixesOnMap"))?.preview?.coordinates.length);
      await sleep(2000);
      await screenshot("25-smoothing-preview");
      const smoothed = await vscode.commands.executeCommand<{ problem?: string; summary?: string }>("debrief.smoothTrack", "track-red-one", { window: 5 });
      assert.equal(smoothed.problem, undefined);
      redName = track("track-red-one")!.properties.name;
      assert.equal((await steps()).at(-1)?.notes?.[0], `${redName} smoothed over 5 fixes`);
      assert.equal(await vscode.commands.executeCommand<Shown>("debrief.fixesOnMap"), undefined);
    });

    test("colours, labels and comments on a fix, one step each, the comment in the Timeline", async () => {
      // A fix coloured, labelled and commented on, each one step; the comment in the Timeline.
      fixTime = track("track-red-one")!.properties.times[Math.floor(track("track-red-one")!.properties.times.length / 4)];
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
    });

    test("undoes the comment like any step: it goes from the Timeline", async () => {
      assert.equal(await vscode.commands.executeCommand("debrief.undo"), undefined);
      assert.ok(!(await vscode.commands.executeCommand<{ entries: string[] }>("debrief.timelineEntries")).entries.includes(`fix:track-red-one:${fixTime}`));
    });
  });

  // --- Shear and stretch (CAP-21): an end let go of on the map, and the commands with values given ---
  feature("shear", () => {
    let shearBefore = 0;
    suiteSetup(async () => {
      await fresh();
      shearBefore = (await steps()).length;
    });

    test("shears a track as its end on the map does, and by command; stretches it; refuses a stretch to nothing", async () => {
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
    });

    test("opens the shear form; put away, nothing is sent", async () => {
      // The form: what changes, then which end is held, with what the track makes good now.
      const asking = vscode.commands.executeCommand<TrackDone>("debrief.shearTrack", "track-blue-one");
      await sleep(1500);
      await vscode.commands.executeCommand("workbench.action.acceptSelectedQuickOpenItem");
      await sleep(1500);
      await screenshot("28-shear-form");
      await vscode.commands.executeCommand("workbench.action.closeQuickOpen");
      assert.deepEqual(await asking, {});
      assert.equal((await steps()).length, shearBefore + 3, "nothing sent from a form put away");
    });

    test("undoes a shear like any step", async () => {
      assert.equal(await vscode.commands.executeCommand("debrief.undo"), undefined);
      assert.equal((await steps()).at(-1)?.status, "undone");
    });
  });

  // --- A single fix moved, and dead reckoning (CAP-01): from the map, and the commands with values given ---
  feature("fixes", () => {
    let fixBefore = 0;
    let redNow: Track;
    let redName: string;
    let fixIndex: number;
    let movedTime: string;
    let movedWhen: string;
    let loggedRed: number[][];
    suiteSetup(async () => {
      await fresh();
      fixBefore = (await steps()).length;
      redNow = track("track-red-one")!;
      redName = redNow.properties.name;
      fixIndex = Math.floor(redNow.properties.times.length / 6);
      movedTime = redNow.properties.times[fixIndex];
      movedWhen = `${new Date(movedTime).toISOString().slice(11, 19)}Z`;
    });

    test("moves a single fix as its ring on the map does, one step named for it", async () => {
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
    });

    test("moves a fix to a position given; opens the form, put away without sending", async () => {
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
    });

    test("plots a track by dead reckoning and over the ground again, one step each, the positions as logged back", async () => {
      // Plotted by dead reckoning, with no questions: one step; over the ground again puts back the positions as logged.
      loggedRed = track("track-red-one")!.geometry.coordinates;
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
    });

    test("on a DR track, moves the leg into a fix; over the ground refused until told to lose that change", async () => {
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
    });
  });

  // Importing a REP file: each track plotted as asked (OTG or DR); "use this choice for future imports" is the
  // analyst's own setting, in their Debrief configuration and VS Code's Settings, never in the plot; cleared to ask again.
  feature("import", () => {
    type Imported = { item?: string; notes?: string[] };
    const demoRep = path.resolve(__dirname, "../test/integration/demo.rep");
    suiteSetup(fresh);

    test("plots each track of a REP file as given, OTG or DR", async () => {
      const asked = await vscode.commands.executeCommand<Imported>("debrief.importRep", undefined, { store: sample.id, path: demoRep, modes: { NELSON: "dr", BLUE: "otg", "TRAWLER 7": "otg" } });
      assert.equal(asked.notes?.[0], "Track 'NELSON' plotted by dead reckoning (DR).");
    });

    test("remembers the analyst's choice for future imports in their settings, and clears it to ask again", async () => {
      const settings = vscode.workspace.getConfiguration("debrief");
      assert.equal(settings.get("trackImportMode"), "ask");
      await settings.update("trackImportMode", "dr", vscode.ConfigurationTarget.Global);
      try {
        await waitFor("the remembered choice in the configuration", async () => (await vscode.commands.executeCommand<string>("debrief.trackImportMode")) === "dr" || undefined);
        const remembered = await vscode.commands.executeCommand<Imported>("debrief.importRep", undefined, { store: sample.id, path: demoRep });
        assert.match(remembered.notes?.at(-1) ?? "", /^Tracks were plotted by dead reckoning \(DR\) as you chose for future imports\. To change it, set Debrief: Track import mode in Settings; to be asked again for each track, run Debrief: Ask again whether imported tracks are OTG or DR\.$/);
      } finally {
        await vscode.commands.executeCommand("debrief.askTrackImportMode");
      }
      assert.equal(await vscode.commands.executeCommand<string>("debrief.trackImportMode"), "ask");
      await waitFor("Settings to say ask", () => vscode.workspace.getConfiguration("debrief").get("trackImportMode") === "ask" || undefined);
    });

    test("asks again for each track; put away, nothing is imported", async () => {
      // Asked again: one question for each track, as legacy Debrief asked; put away, nothing is imported.
      const prompting = vscode.commands.executeCommand<Imported | undefined>("debrief.importRep", undefined, { store: sample.id, path: demoRep });
      await sleep(2500);
      await screenshot("31-import-asks");
      await vscode.commands.executeCommand("workbench.action.closeQuickOpen");
      assert.equal(await prompting, undefined);
      await vscode.commands.executeCommand("debrief.openPlot", sample.id, "serial-1");
      await waitFor("serial 1 again", () => api.session.current?.item.id === "serial-1" || undefined);
    });
  });

  // --- Labels, symbols and arrows at intervals (CAP-32): one step for every track chosen ---
  feature("labels", () => {
    let beforeFrequencies = 0;
    const frequencies = (id: string) => {
      const p = track(id)!.properties as unknown as Record<string, unknown>;
      return [p.label_interval, p.symbol_interval, p.arrow_interval];
    };
    suiteSetup(async () => {
      await fresh();
      beforeFrequencies = (await steps()).length;
    });

    test("sets labels and arrows at intervals on two tracks, one step; refuses an interval out of range or no track", async () => {
      assert.equal(await vscode.commands.executeCommand("debrief.setTrackFrequencies", ["track-blue-one", "track-red-one"], { label_interval: "10 min", arrow_interval: { value: 5, unit: "min" } }), undefined);
      assert.equal((await steps()).length, beforeFrequencies + 1, "one step for both tracks");
      assert.match((await steps()).at(-1)?.notes?.[0] ?? "", /^Labels every 10 min, arrows every 5 min on BLUE ONE and RED ONE/);
      assert.deepEqual(frequencies("track-red-one"), [{ value: 10, unit: "min" }, undefined, { value: 5, unit: "min" }]);
      // Refused plainly: an interval out of range, or no track.
      assert.match((await vscode.commands.executeCommand<string>("debrief.setTrackFrequencies", ["track-blue-one"], { label_interval: "25 h" })) ?? "", /1 s to 24 h/);
      assert.match((await vscode.commands.executeCommand<string>("debrief.setTrackFrequencies", ["no-such-track"], { label_interval: "1 h" })) ?? "", /Select one or more tracks/);
    });

    test("always shows a fix's time label, one step", async () => {
      // A fix of RED ONE always shows its time label (force on only): through the fix's own change, one step.
      const forcedAt = track("track-red-one")!.properties.times[13];
      const forced = await vscode.commands.executeCommand<{ problem?: string }>("debrief.markFix", "track-red-one", forcedAt, { show_label: true });
      assert.equal(forced.problem, undefined);
      assert.match((await steps()).at(-1)?.notes?.[0] ?? "", /time label always shown$/);
      await vscode.commands.executeCommand("debrief.outline.focus");
      await sleep(2000);
      await screenshot("36-labels-symbols-arrows");
    });

    test("undoes the fix's mark, then both tracks' intervals at once", async () => {
      assert.equal(await vscode.commands.executeCommand("debrief.undo"), undefined);
      assert.equal(await vscode.commands.executeCommand("debrief.undo"), undefined);
      assert.deepEqual(frequencies("track-blue-one"), [undefined, undefined, undefined]);
      assert.deepEqual(frequencies("track-red-one"), [undefined, undefined, undefined]);
    });
  });
}
