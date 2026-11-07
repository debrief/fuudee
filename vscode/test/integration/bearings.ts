/**
 * Sensor bearings (CAP-22), TMA (CAP-21) in the Bearings view and the Outline, Bearings popped
 * out, and the Outline's toolbar: each suite on a fresh serial 1.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import * as vscode from "vscode";
import type { DebriefApi } from "../../src/extension.js";
import { debrief, extension, feature, openSerial1, poppedWindow, screenshot, sleep, steps, waitFor } from "./fixture.js";

const bow = "sensor-blue-one-bow-sonar";
const towed = "sensor-blue-one-towed-array";
const halfHour = { start: "2023-06-15T08:29:00.000Z", end: "2023-06-15T08:59:00.000Z" };

/** The Bearings plot's size, once it has stayed the same for a second: not the first one drawn. */
async function settledPlot(api: DebriefApi, what: string, accept: (p: NonNullable<ReturnType<DebriefApi["bearingsPlot"]>>) => boolean) {
  let seen = "";
  let since = Date.now();
  let first: ReturnType<DebriefApi["bearingsPlot"]>;
  const plot = await waitFor(what, () => {
    const p = api.bearingsPlot();
    if (!p || !accept(p)) return undefined;
    first ??= p;
    const key = JSON.stringify(p);
    if (key !== seen) {
      seen = key;
      since = Date.now();
      return undefined;
    }
    return Date.now() - since >= 1000 ? p : undefined;
  });
  return { plot, first: first! };
}

export function bearings(): void {
  // Sensor bearings (CAP-22): the sample's two sensors under BLUE ONE in the Outline; the Towed
  // array's cuts kept to port, one step, as an agent or a menu asks; ambiguous again, one step;
  // a .dsf file read in, its track named for a track the plot has not, one step; each undone.
  feature("sensors", () => {
    type Sensed = { problem?: string; answer?: { notes?: string[]; sensors?: string[]; cuts?: number } };
    let api: DebriefApi;
    const cutsOf = (sensor: string) => api.session.current!.plot.features.filter((f) => f.properties.kind === "sensor_cut" && f.properties.sensor_id === sensor);
    const resolved = (f: { properties: { kind: string; resolved?: string | null } }) => f.properties.kind === "sensor_cut" && !!f.properties.resolved;
    suiteSetup(async () => {
      api = await debrief();
      await openSerial1();
    });

    test("lists the sensors under their track in the Outline", () => {
      const children = api.outlineChildren("track-blue-one");
      assert.deepEqual(children.map((c) => c.label), ["Bow sonar", "Towed array"], "the sensors under their track");
      assert.match(children[1].description, /^\d+ cuts · \d+ ambiguous$/);
    });

    test("keeps port for the Towed array's cuts, one step", async () => {
      const before = (await steps()).length;
      const port = await vscode.commands.executeCommand<Sensed>("debrief.resolveAmbiguity", { keep: "port", sensor_ids: [towed] });
      assert.equal(port.problem, undefined);
      assert.equal((await steps()).length, before + 1, "one step");
      assert.match((await steps()).at(-1)?.notes?.[0] ?? "", /^Port kept: \d+ Towed array cuts \d\d:\d\d:\d\dZ–\d\d:\d\d:\d\dZ$/);
      assert.ok(cutsOf(towed).some(resolved), "resolved");
      assert.match(api.outlineChildren("track-blue-one")[1].description, / resolved$/);
      // For the picture, a twenty-minute window, as an analyst reads bearings; then the window as it was.
      const timeBefore = api.getState()?.time;
      assert.equal(api.setState({ time: { current: "2023-06-15T09:33:00.000Z", range: { start: "2023-06-15T09:20:00.000Z", end: "2023-06-15T09:40:00.000Z" } } }), undefined);
      await vscode.commands.executeCommand("debrief.outline.focus");
      await sleep(1500);
      await screenshot("15d-sensors");
      if (timeBefore) api.setState({ time: timeBefore });
    });

    test("makes them ambiguous again, one step; both undone", async () => {
      const again = await vscode.commands.executeCommand<Sensed>("debrief.resolveAmbiguity", { keep: "ambiguous", sensor_ids: [towed] });
      assert.equal(again.problem, undefined);
      assert.match((await steps()).at(-1)?.notes?.[0] ?? "", /^Ambiguous again: \d+ Towed array cuts /);
      assert.equal(await vscode.commands.executeCommand("debrief.undo"), undefined);
      assert.equal(await vscode.commands.executeCommand("debrief.undo"), undefined);
      assert.ok(!cutsOf(towed).some(resolved), "undone: ambiguous as read");
    });

    test("puts the Towed array astern, one step; undone", async () => {
      // The Towed array 300 yd astern, worm in the hole: one step, the sensor's own; undone.
      const astern = await vscode.commands.executeCommand<Sensed>("debrief.setArrayOffset", towed, { value: 300, unit: "[yd_i]" }, "worm_in_hole");
      assert.equal(astern.problem, undefined);
      assert.equal((await steps()).at(-1)?.notes?.[0], "Towed array: 300 yd astern, worm in the hole");
      const array = api.session.current!.plot.features.find((f) => f.id === towed)!.properties as { array_offset?: { value: number; unit: string }; array_mode?: string };
      assert.deepEqual([array.array_offset, array.array_mode], [{ value: 300, unit: "[yd_i]" }, "worm_in_hole"]);
      assert.equal(await vscode.commands.executeCommand("debrief.undo"), undefined);
      assert.equal((api.session.current!.plot.features.find((f) => f.id === towed)!.properties as { array_offset?: unknown }).array_offset ?? null, null, "undone: at the ship");
    });

    test("reads a .dsf file in, its track given, one step; undone", async () => {
      const scratch = mkdtempSync(path.join(tmpdir(), "debrief-sensor-"));
      const dsf = path.join(scratch, "nelson.dsf");
      writeFileSync(dsf, ';SENSOR2: 20230615 090000.000 NELSON @A NULL 45.0 135.0 NULL NULL "Hull array" 0900\n;SENSOR: 20230615 091000.000 NELSON @A NULL 50.0 NULL "Hull array" 0910\n');
      const unnamed = await vscode.commands.executeCommand<Sensed>("debrief.importSensor", dsf);
      assert.match(unnamed.problem ?? "", /NELSON/, "a track the plot has not is asked for");
      const read = await vscode.commands.executeCommand<Sensed>("debrief.importSensor", dsf, { NELSON: "track-red-one" });
      assert.equal(read.problem, undefined);
      assert.equal(read.answer?.cuts, 2);
      assert.equal((await steps()).at(-1)?.notes?.[0], "Sensor data read from nelson.dsf");
      assert.deepEqual(api.outlineChildren("track-red-one").map((c) => c.label), ["Hull array"]);
      assert.equal(await vscode.commands.executeCommand("debrief.undo"), undefined);
      assert.deepEqual(api.outlineChildren("track-red-one"), []);
    });
  });

  // TMA (CAP-21; product owner, 24 Oct 2026): a solution made from half an hour of the Bow sonar's
  // cuts with the first guess's defaults, one step, selected, its residuals in the Bearings view;
  // a cut left out of the RMS, one step; split into legs, one step, still one track; each undone.
  feature("tma", () => {
    type Made = { problem?: string; feature?: string; notes?: string[]; residuals?: { rms?: number | null; counted: number } };
    let api: DebriefApi;
    let solution: string;
    let wild: string;
    suiteSetup(async () => {
      api = await debrief();
      await openSerial1();
    });

    test("makes a solution from the Bow sonar's cuts, one step, its residuals in Bearings in the panel", async () => {
      const before = (await steps()).length;
      const made = await vscode.commands.executeCommand<Made>("debrief.tmaCreate", { sensor_ids: [bow], period: halfHour });
      assert.equal(made.problem, undefined);
      assert.equal((await steps()).length, before + 1, "one step");
      assert.match((await steps()).at(-1)?.notes?.[0] ?? "", /^Contact 1 solution made: \d+ Bow sonar cuts 08:29:00Z–08:59:00Z$/);
      solution = made.feature!;
      assert.deepEqual(api.session.selection, [solution], "the solution selected");
      assert.match(api.outlineItem(solution)?.description ?? "", /^TMA · Contact 1/);
      await vscode.commands.executeCommand("debrief.showBearings", solution);
      const shown = await waitFor("the Bearings view to show the solution's residuals", () => (api.bearings()?.solution_id === solution && api.bearings()?.residuals ? api.bearings() : undefined));
      assert.equal(shown.residuals!.counted, made.residuals!.counted);
      assert.ok(shown.residuals!.counted > 10, "its cuts counted");
      wild = shown.residuals!.rows[1].id;
      // In the panel below the editor (product owner, 25 Oct 2026): wide and short, the panes side by
      // side with room each, the time axis the panel's height; big enough to read at this window's size.
      // The view lays its controls out on top first, measures them there, and only then (a frame or
      // two later, in its ResizeObserver) moves them beside the plot if on top leaves it too short:
      // the size read once it has stayed the same for a second, not the first one drawn.
      const { plot, first } = await settledPlot(api, "the Bearings plot drawn in the panel, its size settled", (p) => p.panes.length >= 2);
      console.log(`Bearings in the panel, first drawn: plot ${first.height} px tall, panes ${first.panes.join(" and ")} px wide`);
      await sleep(1500);
      await screenshot("15e-tma-bearings");
      console.log(`Bearings in the panel: plot ${plot.height} px tall, panes ${plot.panes.join(" and ")} px wide`);
      // VS Code 1.95's test window opens at 1024 × 768 (later ones maximized, 1440 × 900 here): its
      // panel's default share leaves the plot's box about 215 px, the plot 181 px of it.
      const least = /^1\.95\./.test(vscode.version) ? 175 : 200;
      assert.ok(plot.height >= least, `the plot ${plot.height} px tall, at least ${least}`);
      for (const w of plot.panes) assert.ok(w >= 200, `a pane ${w} px wide, at least 200`);
    });

    test("leaves a cut out of the RMS and splits the solution into legs, one step each; all undone", async () => {
      const left = await vscode.commands.executeCommand<{ problem?: string; notes?: string[] }>("debrief.tmaExclude", solution, [wild]);
      assert.equal(left.problem, undefined);
      assert.match((await steps()).at(-1)?.notes?.[0] ?? "", /^Contact 1 solution: cut at 08:\d\d:\d\dZ left out of the RMS$/);
      await waitFor("the view to leave the cut out", () => (api.bearings()?.residuals?.excluded === 1 ? true : undefined));
      const split = await vscode.commands.executeCommand<{ problem?: string }>("debrief.tmaSplitLeg", solution, { at: "2023-06-15T08:44:00.000Z" });
      assert.equal(split.problem, undefined);
      assert.equal((await steps()).at(-1)?.notes?.[0], "Contact 1 solution split into legs at 08:44:00Z");
      const tag = api.session.current!.plot.features.find((f) => f.id === solution)!.properties as { tma?: { leg_starts?: string[] } };
      assert.deepEqual(tag.tma?.leg_starts, ["2023-06-15T08:44:00.000Z"], "still one track, in two legs");
      for (let i = 0; i < 3; i++) assert.equal(await vscode.commands.executeCommand("debrief.undo"), undefined);
      assert.ok(!api.session.current!.plot.features.some((f) => f.id === solution), "undone: no solution");
    });
  });

  // The Outline's TMA and cuts (product owner, 27 Oct 2026): a solution opens to its legs and each
  // leg to its positions; a sensor to its cuts; the Tools' entries as commands on the Outline's rows,
  // each one step: split before and after a position, hide, show, keep a side, leave out, delete;
  // a solution from cuts opening the first guess in Bearings, which follows the Outline's selection.
  feature("tma-outline", () => {
    type Done = { problem?: string; notes?: string[]; changed?: boolean };
    let api: DebriefApi;
    let solution: string;
    let start = 0;
    let fixes: ReturnType<DebriefApi["outlineChildren"]>;
    let towedCuts: string[];
    suiteSetup(async () => {
      api = await debrief();
      await openSerial1();
      const made = await vscode.commands.executeCommand<{ problem?: string; feature?: string }>("debrief.tmaCreate", { sensor_ids: [bow], period: halfHour });
      assert.equal(made.problem, undefined);
      solution = made.feature!;
      start = (await steps()).length;
    });

    test("opens a solution to its legs and each leg to its positions; Bearings follows a position chosen", async () => {
      const legs = api.outlineChildren(solution);
      assert.deepEqual(legs.map((l) => [l.label, l.key, l.context]), [["Leg 1", `${solution}#leg1`, "outline-leg"]], "a solution opens to its legs");
      fixes = api.outlineChildren(`${solution}#leg1`);
      assert.ok(fixes.length > 10, "the leg opens to its positions");
      assert.match(fixes[0].label, /^08:29:00Z$/);
      assert.match(fixes[0].description, /^\d{3}\.\d°T \d+\.\d kn$/, "each with its course and speed");
      assert.equal(fixes[0].context, "outline-fix");
      // Bearings follows the Outline: a position chosen shows the solution, ringed there, current time to it.
      await vscode.commands.executeCommand("debrief.chooseInOutline", solution, { fix_time: "2023-06-15T08:44:00.000Z" });
      await waitFor("Bearings showing the solution at the position", () => (api.bearings()?.title === "Contact 1 solution · fix at 08:44:00Z" ? true : undefined));
      assert.equal(api.getState()?.time?.current, "2023-06-15T08:44:00.000Z");
      assert.deepEqual(api.outlineKeys(), [fixes.find((f) => f.label === "08:44:00Z")!.key]);
      const ops = await vscode.commands.executeCommand<{ id: string; enabled: boolean; label: string }[]>("debrief.outlineOperations");
      assert.deepEqual(ops.map((o) => [o.id, o.enabled, o.label]), [["split-before", true, "Split before 08:44:00Z"], ["split-after", true, "Split after 08:44:00Z"]]);
      await vscode.commands.executeCommand("debrief.tools.focus");
      await sleep(1000);
      await screenshot("15f-tools-for-a-position");
    });

    test("splits before and after a position, one step each; refuses a leg too short, saying why", async () => {
      const before = await vscode.commands.executeCommand<Done>("debrief.splitBeforeFix");
      assert.equal(before.problem, undefined);
      assert.equal((await steps()).at(-1)?.notes?.[0], "Contact 1 solution split into legs before its fix at 08:44:00Z");
      const after = await vscode.commands.executeCommand<Done>("debrief.splitAfterFix", [`${solution}#fix3`]);
      assert.equal(after.problem, undefined);
      assert.equal((await steps()).at(-1)?.notes?.[0], `Contact 1 solution split into legs after its fix at ${fixes[3].label}`);
      assert.deepEqual(api.outlineChildren(solution).map((l) => l.label), ["Leg 1", "Leg 2", "Leg 3"]);
      const refused = await vscode.commands.executeCommand<Done>("debrief.splitBeforeFix", [`${solution}#fix1`]);
      assert.match(refused.problem ?? "", /^Leg 1 would keep 1 fix before the split and 3 fixes after it: each leg needs two\.$/, "disabled, with its reason");
    });

    test("opens a sensor to its cuts: a run of them hidden, shown, left out and deleted, one step each", async () => {
      // A sensor opens to its cuts: a run of them chosen, hidden, shown, deleted, each one step.
      const cuts = api.outlineChildren(bow);
      assert.ok(cuts.length > 100 && cuts.every((c) => c.context?.startsWith("outline-cut")), "the sensor's cuts, each a row");
      assert.match(cuts[0].description, /^\d{3}\.\d°/);
      const rooted = (api.session.current!.plot.features.find((f) => f.id === solution)!.properties as { tma: { cut_ids: string[] } }).tma.cut_ids;
      const run = rooted.slice(4, 8);
      await vscode.commands.executeCommand("debrief.chooseInOutline", bow, { cut_time: "2023-06-15T08:33:00.000Z" });
      await waitFor("Bearings keeping the solution for a cut of its sensor", () => (api.bearings()?.solution_id === solution ? true : undefined));
      const hidden = await vscode.commands.executeCommand<Done>("debrief.hideCuts", run);
      assert.equal(hidden.problem, undefined);
      assert.match((await steps()).at(-1)?.notes?.[0] ?? "", /^4 Bow sonar cuts 08:3\d:\d\dZ–08:3\d:\d\dZ hidden on the map$/);
      assert.match((await steps()).at(-1)?.notes?.[1] ?? "", /^Contact 1 solution: 4 of its cuts left out of its residuals until shown again$/);
      assert.match(api.outlineChildren(bow).find((c) => c.key === run[0])!.description, /hidden on map$/);
      assert.equal((await vscode.commands.executeCommand<Done>("debrief.showCuts", run)).problem, undefined);
      const left = await vscode.commands.executeCommand<Done>("debrief.tmaLeaveOut", [run[0]]);
      assert.equal(left.problem, undefined);
      assert.match((await steps()).at(-1)?.notes?.[0] ?? "", /^Contact 1 solution: cut at 08:\d\d:\d\dZ left out of the RMS$/);
      const deleted = await vscode.commands.executeCommand<Done>("debrief.deleteCuts", run);
      assert.equal(deleted.problem, undefined);
      assert.match((await steps()).at(-1)?.notes?.[0] ?? "", /^4 Bow sonar cuts .* deleted$/);
      assert.match((await steps()).at(-1)?.notes?.[1] ?? "", /^Contact 1 solution drops the 4 cuts deleted it was rooted in/);
      assert.ok(!api.outlineChildren(bow).some((c) => c.key === run[0]), "gone from the Outline");
    });

    test("keeps a side for a run of cuts, and for the cuts boxed with Select bearings", async () => {
      // Keep a side for a run of the towed array's cuts at once.
      towedCuts = api.outlineChildren(towed).slice(0, 6).map((c) => c.key!);
      const kept = await vscode.commands.executeCommand<Done>("debrief.keepStarboard", towedCuts);
      assert.equal(kept.problem, undefined);
      assert.match((await steps()).at(-1)?.notes?.[0] ?? "", /^Starboard kept: 6 Towed array cuts /);
      await waitFor("the Outline saying the side kept", () => (api.outlineChildren(towed)[0].description.endsWith("stbd kept") ? true : undefined));
      // Select bearings (product owner, 28 Oct 2026): the view's toggle, and a box's message, the same
      // operation as the Tools' Keep port and starboard, one step for the cuts boxed on each side, and
      // those resolved whose kept dots were boxed made ambiguous again.
      const bundle = readFileSync(path.join(extension().extensionPath, "dist", "webview", "bearings.js"), "utf8");
      assert.ok(bundle.includes("tma-select") && bundle.includes("Select bearings"), "the Select bearings toggle in the Bearings view");
      const boxed = api.outlineChildren(towed).slice(6, 12).map((c) => c.key!);
      await api.bearingsMessage({ kind: "tma_resolve", resolution: { keep: "bearing", cut_ids: boxed.slice(0, 1), other_cut_ids: boxed, clear_cut_ids: towedCuts.slice(0, 2) } });
      assert.match((await steps()).at(-1)?.notes?.[0] ?? "", /^Kept 5 (Towed array )?cuts to (port|starboard|the sides boxed) and made 2 ambiguous again(, 0\d:\d\d:\d\dZ–0\d:\d\d:\d\dZ)?$/);
      await waitFor("the Outline saying the two ambiguous again", () => (api.outlineChildren(towed)[0].description.includes("≈") ? true : undefined));
      assert.ok((await steps()).at(-1)?.notes?.includes("1 cut boxed on both sides, left as they were."), "a cut boxed on both sides left");
      await vscode.commands.executeCommand("debrief.outline.focus");
      await sleep(1000);
      await screenshot("15g-outline-tree");
    });

    test("opens the first guess in Bearings for a solution from a run of cuts, ownship's course and speed shown", async () => {
      // A solution from a run of cuts: the first guess's form, in Bearings, for exactly those.
      const fromCuts = await vscode.commands.executeCommand<Done>("debrief.tmaFromCuts", towedCuts);
      assert.equal(fromCuts.problem, undefined);
      await waitFor("Bearings' first guess for the cuts", () => (api.bearings()?.focus?.make && api.bearings()?.focus?.cut_ids?.length === 6 && api.bearings()?.sensor_id === towed ? true : undefined));
      // The Course/Speed pane before any solution: ownship's course and speed, the sensor's host (product owner, 28 Oct 2026).
      const own = api.bearings()?.ownship ?? [];
      assert.deepEqual(own.map((o) => o.name), ["BLUE ONE"], "ownship for the sensor shown");
      assert.ok(own[0].courses.length > 10 && (own[0].speeds?.length ?? 0) === own[0].courses.length, "its courses and speeds");
      await sleep(1000);
      await screenshot("15h-bearings-first-guess");
    });

    test("made each change one step, all undone", async () => {
      const done = (await steps()).length - start;
      assert.equal(done, 8, "one step each");
      for (let i = 0; i < done + 1; i++) assert.equal(await vscode.commands.executeCommand("debrief.undo"), undefined);
      assert.ok(!api.session.current!.plot.features.some((f) => f.id === solution), "undone: no solution");
    });
  });

  // Bearings popped out (product owner, 28 Oct 2026): an editor tab, moved into a window of its own
  // for a second monitor, linked exactly as the panel's view is; the panel a placeholder meanwhile;
  // closed, back in the panel. Show bearings reveals whichever is live.
  feature("bearings-pop-out", () => {
    let api: DebriefApi;
    let solution: string;
    let start = 0;
    let panelPlot: ReturnType<DebriefApi["bearingsPlot"]>;
    let popped: { where: string; reason?: string };
    suiteSetup(async () => {
      api = await debrief();
      await openSerial1();
      const made = await vscode.commands.executeCommand<{ problem?: string; feature?: string }>("debrief.tmaCreate", { sensor_ids: [bow], period: halfHour });
      assert.equal(made.problem, undefined);
      solution = made.feature!;
      start = (await steps()).length;
    });
    suiteTeardown(async () => {
      // Whatever happened, Bearings back in the panel for the suites after.
      if (api?.bearingsPlace().where === "window") await vscode.commands.executeCommand("debrief.bringBackBearings");
    });

    test("offers Pop out in the Bearings view's title bar", async () => {
      await vscode.commands.executeCommand("debrief.showBearings", solution);
      await waitFor("Bearings in the panel showing the solution", () => (api.bearings()?.solution_id === solution && api.bearingsPlace().where === "panel" ? true : undefined));
      const manifest = JSON.parse(readFileSync(path.join(extension().extensionPath, "package.json"), "utf8"));
      assert.ok(
        manifest.contributes.menus["view/title"].some((m: { command: string; when: string }) => m.command === "debrief.popOutBearings" && m.when.includes("view == debrief.bearings")),
        "Pop out in the Bearings view's title bar",
      );
      await sleep(1000);
      await screenshot("15i-bearings-pop-out-button");
      panelPlot = api.bearingsPlot();
    });

    test("pops out into an editor of its own, moved into a new window, the panel a placeholder", async () => {
      // Popped out: an editor (WebviewPanel) with Bearings' page, VS Code asked to move it into a new window.
      poppedWindow("before");
      popped = await vscode.commands.executeCommand<{ where: string; reason?: string }>("debrief.popOutBearings");
      console.log(`Bearings popped out: ${popped.where}${popped.reason ? ` (${popped.reason})` : ""}`);
      const place = api.bearingsPlace();
      assert.equal(place.where, "window", "the popped-out view is live");
      assert.equal(place.panel?.title, "Bearings");
      assert.match(place.panel?.viewType ?? "", /debrief\.bearingsWindow$/);
      assert.ok(place.placeholder, "the panel's view shows the placeholder");
      // Under xvfb the new window cannot be seen to open: the move was asked for, with the editor active.
      if (popped.where === "window") assert.equal(place.moveAsked, 1, "moved into a new window");
      try {
        await waitFor("the popped-out page showing the solution", () => {
          const shown = api.bearingsPosted("show_tma");
          return api.bearingsShowing() && shown?.where === "window" && shown.delivered && (shown.message.tma as { solution_id?: string } | undefined)?.solution_id === solution ? true : undefined;
        });
      } catch (error) {
        // What was seen, to tell a page that never said it was ready from a message never delivered.
        const shown = api.bearingsPosted("show_tma");
        console.log(`Bearings popped out, not shown: page ready ${api.bearingsShowing()}, last show_tma ${shown ? `to the ${shown.where}, delivered ${shown.delivered}, solution ${(shown.message.tma as { solution_id?: string } | undefined)?.solution_id}` : "none"}`);
        throw error;
      }
      const tabs = vscode.window.tabGroups.all.flatMap((g) => g.tabs);
      const tab = tabs.find((t) => t.input instanceof vscode.TabInputWebview && t.input.viewType.endsWith("debrief.bearingsWindow"));
      console.log(`Bearings' tab ${tab ? "listed" : "not listed"} in the main window's tab groups`);
    });

    test("draws the plot larger popped out than in the panel", async () => {
      // Large: the plot as drawn in the editor, taller than in the panel, the controls on top.
      const { plot } = await settledPlot(api, "the popped-out plot drawn, its size settled", (p) => p !== panelPlot && p.panes.length >= 2);
      console.log(`Bearings popped out: plot ${plot.height} px tall, panes ${plot.panes.join(" and ")} px wide (in the panel: ${panelPlot?.height} px)`);
      assert.ok(plot.height >= 220, `the popped-out plot ${plot.height} px tall, at least 220`);
      assert.ok(!panelPlot || plot.height > panelPlot.height, "taller than in the panel");
      // Its window filling the screen, as maximised on a second monitor (only where xdotool can size it; no window manager under xvfb).
      if (popped.where === "window" && poppedWindow("fill")) {
        const before = JSON.stringify(api.bearingsPlot());
        const big = await waitFor("the plot drawn again in the window filling the screen", () => {
          const p = api.bearingsPlot();
          return p && JSON.stringify(p) !== before && p.panes.length >= 2 ? p : undefined;
        });
        await sleep(1500);
        const settled = api.bearingsPlot() ?? big;
        console.log(`Bearings popped out, its window filling the ${execFileSync("xdotool", ["getdisplaygeometry"], { encoding: "utf8" }).trim().replace(" ", " × ")} screen: plot ${settled.height} px tall, panes ${settled.panes.join(" and ")} px wide`);
        assert.ok(settled.height > plot.height, "taller again");
      }
      await sleep(1500);
      await screenshot("15j-bearings-popped-out");
    });

    test("links current time, the Outline's selection, a cut clicked and a box drawn to the popped-out page", async () => {
      // Linked: current time and the Outline's selection reach the popped-out page.
      const time = { current: "2023-06-15T08:40:00.000Z", range: api.getState()!.time!.range };
      assert.equal(api.session.setTime(time, "test"), undefined);
      await waitFor("current time sent to the popped-out page", () => {
        const sent = api.bearingsPosted("set_time");
        return sent?.where === "window" && sent.delivered && (sent.message.time as { current: string }).current === time.current ? true : undefined;
      });
      await vscode.commands.executeCommand("debrief.chooseInOutline", solution, { fix_time: "2023-06-15T08:44:00.000Z" });
      await waitFor("the popped-out page following the Outline", () => {
        const shown = api.bearingsPosted("show_tma");
        return shown?.where === "window" && (shown.message.tma as { title?: string } | undefined)?.title === "Contact 1 solution · fix at 08:44:00Z" ? true : undefined;
      });
      // A cut clicked in the popped-out plot: current time there, in both directions.
      const cutTime = (api.bearings()!.residuals!.rows[2] as { time: string }).time;
      await api.bearingsMessage({ kind: "tma_time_asked", current_time: cutTime }, "window");
      assert.equal(api.getState()?.time?.current, cutTime, "current time from the popped-out view");
      // A box drawn with Select bearings on in the popped-out view: one step. The panel's page, a placeholder now, is not acted on.
      const boxed = api.outlineChildren(towed).slice(0, 4).map((c) => c.key!);
      const box = { kind: "tma_resolve", resolution: { keep: "bearing", cut_ids: boxed, other_cut_ids: [] } };
      await api.bearingsMessage(box, "panel");
      assert.equal((await steps()).length, start, "nothing from the panel while popped out");
      await api.bearingsMessage(box, "window");
      assert.equal((await steps()).length, start + 1, "one step from the popped-out view");
      // Undo: the popped-out page shown the plot as it was again.
      const posts = api.bearingsPosted("show_tma");
      assert.equal(await vscode.commands.executeCommand("debrief.undo"), undefined);
      await waitFor("the popped-out page shown the plot again after undo", () => (api.bearingsPosted("show_tma") !== posts && api.bearingsPosted("show_tma")?.where === "window" ? true : undefined));
    });

    test("reveals the popped-out view on Show bearings, the panel's placeholder shown", async () => {
      // Show bearings: the popped-out view, not the panel.
      await vscode.commands.executeCommand("debrief.showBearings", solution);
      const place = api.bearingsPlace();
      assert.equal(place.where, "window");
      assert.ok(place.panel?.visible, "Show bearings reveals the popped-out view");
      // The placeholder, in the panel: shown for the picture.
      await vscode.commands.executeCommand("debrief.bearings.focus");
      // The popped-out window off the screen for the picture, as if on the second monitor (where xdotool can move it).
      if (popped.where === "window") poppedWindow("aside");
      await sleep(1500);
      await screenshot("15k-bearings-placeholder");
      assert.equal(api.bearingsPlace().where, "window", "the panel's placeholder shown, Bearings still popped out");
    });

    test("comes back to the panel when closed, and when brought back", async () => {
      // Closed: back in the panel, its page ready and linked again.
      const closing = vscode.window.tabGroups.all.flatMap((g) => g.tabs).find((t) => t.input instanceof vscode.TabInputWebview && t.input.viewType.endsWith("debrief.bearingsWindow"));
      if (closing) await vscode.window.tabGroups.close(closing);
      else await vscode.commands.executeCommand("debrief.bringBackBearings");
      console.log(`Bearings closed by ${closing ? "its tab" : "Bring back"}`);
      await waitFor("Bearings back in the panel", () => (api.bearingsPlace().where === "panel" && !api.bearingsPlace().placeholder && api.bearingsShowing() ? true : undefined));
      await waitFor("the panel's page shown the solution again", () => (api.bearingsPosted("show_tma")?.where === "panel" ? true : undefined));
      await vscode.commands.executeCommand("debrief.showBearings", solution);
      await waitFor("Show bearings revealing the panel", () => (api.bearingsVisible() && api.bearingsPlace().where === "panel" ? true : undefined));
      // Popped out again and brought back by the command.
      await vscode.commands.executeCommand("debrief.popOutBearings");
      assert.equal(api.bearingsPlace().where, "window");
      await vscode.commands.executeCommand("debrief.bringBackBearings");
      await waitFor("Bearings brought back", () => (api.bearingsPlace().where === "panel" && api.bearingsShowing() ? true : undefined));
    });

    test("closes an editor VS Code restores after a reload, Bearings staying in the panel", async () => {
      // After a reload VS Code may restore the editor: closed, Bearings stays in the panel.
      const restored = vscode.window.createWebviewPanel("debrief.bearingsWindow", "Bearings", vscode.ViewColumn.Active, {});
      let disposed = false;
      restored.onDidDispose(() => (disposed = true));
      await api.restoreBearingsWindow(restored);
      assert.ok(disposed, "a restored Bearings editor closed");
      assert.equal(api.bearingsPlace().where, "panel");
      assert.equal(await vscode.commands.executeCommand("debrief.undo"), undefined);
      assert.ok(!api.session.current!.plot.features.some((f) => f.id === solution), "undone: no solution");
    });
  });

  // The Outline's toolbar in its title bar (product owner, 28 Oct 2026): codicon buttons, the
  // eye's icon following the selection (debrief.selectionVisibility); each command run on the
  // Outline's selection, one step each where it changes the plot; the context keys following.
  feature("outline-toolbar", () => {
    let api: DebriefApi;
    let start = 0;
    type Keys = { visibility: string; colourable: boolean; hasChildren: boolean; selected: boolean };
    const keys = () => vscode.commands.executeCommand<Keys>("debrief.outlineToolbarState");
    const keysAre = (what: string, want: Partial<Keys>) =>
      waitFor(what, async () => {
        const now = await keys();
        return Object.entries(want).every(([k, v]) => now[k as keyof typeof now] === v) ? now : undefined;
      });
    const colourOf = (id: string) => {
      const f = api.session.current!.plot.features.find((g) => g.id === id)!;
      return f.properties.kind === "track" ? f.properties.style?.colour : (f.properties as { colour?: string }).colour;
    };
    suiteSetup(async () => {
      api = await debrief();
      await openSerial1();
      start = (await steps()).length;
    });

    test("contributes its codicon buttons, each a registered command", async () => {
      const titleBar = (extension().packageJSON.contributes.menus["view/title"] as { command: string; when: string; group: string }[]).filter((m) => m.when.startsWith("view == debrief.outline") && m.group.startsWith("navigation"))
        // In the order VS Code shows them: by each entry's order in its group (navigation@N), not by where it is in package.json.
        .sort((a, b) => Number(a.group.split("@")[1]) - Number(b.group.split("@")[1]));
      assert.deepEqual(
        titleBar.map((m) => m.command),
        ["debrief.selectionHide", "debrief.selectionShow", "debrief.selectionShowAll", "debrief.colourSelection", "debrief.selectAll", "debrief.selectChildren", "debrief.clearSelection", "debrief.addAnnotation"],
      );
      const declared = new Map((extension().packageJSON.contributes.commands as { command: string; icon?: string; title: string }[]).map((c) => [c.command, c]));
      assert.deepEqual(
        titleBar.map((m) => declared.get(m.command)?.icon),
        ["$(eye)", "$(eye-closed)", "$(color-mode)", "$(symbol-color)", "$(check-all)", "$(type-hierarchy-sub)", "$(clear-all)", "$(add)"],
      );
      assert.match(titleBar[0].when, /debrief\.selectionVisibility != hidden && debrief\.selectionVisibility != mixed/);
      assert.match(titleBar[2].when, /debrief\.selectionVisibility == mixed/);
      const registered = new Set(await vscode.commands.getCommands(true));
      for (const m of titleBar) assert.ok(registered.has(m.command), `${m.command} is registered`);
    });

    test("hides the selection, one step, and shows all of a mixed selection, one step", async () => {
      await vscode.commands.executeCommand("debrief.outline.focus");
      await vscode.commands.executeCommand("debrief.clearSelection");
      await keysAre("nothing selected", { visibility: "none", colourable: false, hasChildren: false, selected: false });
      // Two tracks shown: the eye; hiding them is one step, and the closed eye.
      await vscode.commands.executeCommand("debrief.select", ["track-blue-one", "track-red-one"]);
      await keysAre("two tracks shown", { visibility: "visible", colourable: true, hasChildren: true, selected: true });
      assert.equal(await vscode.commands.executeCommand("debrief.selectionHide"), undefined);
      assert.deepEqual((await steps()).at(-1)?.notes, ["BLUE ONE and RED ONE hidden on the map"]);
      await keysAre("two tracks hidden", { visibility: "hidden" });
      // A shown track added: mixed; Show all shows the three, one step.
      await vscode.commands.executeCommand("debrief.select", ["track-blue-one", "track-red-one", "track-ais-cargo-01"]);
      await keysAre("some hidden, some shown", { visibility: "mixed" });
      await sleep(1000);
      await screenshot("outline-toolbar-vscode-mixed");
      assert.equal(await vscode.commands.executeCommand("debrief.selectionShowAll"), undefined);
      assert.deepEqual((await steps()).at(-1)?.notes, ["3 tracks shown on the map"]);
      await keysAre("all shown again", { visibility: "visible" });
    });

    test("colours tracks and a sensor by name and by hex, one step each; refuses what is not a colour", async () => {
      // Colour: the three tracks and a sensor, by name and by hex, each one step; undone and redone.
      const was = colourOf("track-red-one");
      await vscode.commands.executeCommand("debrief.select", ["track-blue-one", "track-red-one", "track-ais-cargo-01", "sensor-blue-one-towed-array"]);
      await keysAre("colourable", { colourable: true });
      assert.equal(await vscode.commands.executeCommand("debrief.colourSelection", "Purple"), undefined);
      assert.deepEqual((await steps()).at(-1)?.notes, ["Colour of 3 tracks and 1 sensor set to purple"]);
      assert.equal(colourOf("sensor-blue-one-towed-array"), colourOf("track-red-one"));
      assert.equal(await vscode.commands.executeCommand("debrief.undo"), undefined);
      assert.equal(colourOf("track-red-one"), was);
      assert.equal(await vscode.commands.executeCommand("debrief.redo"), undefined);
      assert.notEqual(colourOf("track-red-one"), was);
      assert.equal(await vscode.commands.executeCommand("debrief.colourSelection", "#1F6E8C"), undefined);
      assert.deepEqual((await steps()).at(-1)?.notes, ["Colour of 3 tracks and 1 sensor set to #1f6e8c"]);
      assert.match((await vscode.commands.executeCommand<string>("debrief.colourSelection", "mauve")) ?? "", /^mauve is not a colour/);
    });

    test("selects a sensor's children, everything, and nothing", async () => {
      // Select children: a sensor's cuts, in place of the sensor; a cut has none.
      await vscode.commands.executeCommand("debrief.select", ["sensor-blue-one-towed-array"]);
      await keysAre("a sensor's children", { hasChildren: true });
      assert.equal(await vscode.commands.executeCommand("debrief.selectChildren"), undefined);
      const towedCuts = api.session.current!.plot.features.filter((f) => f.properties.kind === "sensor_cut" && (f.properties as { sensor_id: string }).sensor_id === "sensor-blue-one-towed-array").map((f) => f.id);
      await waitFor("the towed array's cuts chosen", () => (api.outlineKeys().length === towedCuts.length ? true : undefined));
      assert.deepEqual(new Set(api.session.selection), new Set(towedCuts));
      await keysAre("cuts have no children", { hasChildren: false, visibility: "visible" });
      // Select all: every row listed, the tracks among them.
      assert.equal(await vscode.commands.executeCommand("debrief.selectAll"), undefined);
      for (const id of ["track-blue-one", "track-red-one", "track-ais-cargo-01"]) assert.ok(api.outlineKeys().includes(id), `${id} selected`);
      await keysAre("all selected", { selected: true });
      // Clear selection.
      await vscode.commands.executeCommand("debrief.clearSelection");
      await keysAre("cleared", { visibility: "none", selected: false, colourable: false });
      assert.deepEqual(api.outlineKeys(), []);
    });

    test("made a step for each change, all undone", async () => {
      const done = (await steps()).length - start;
      assert.equal(done, 4, "hide, show, and two colours: a step each");
      for (let i = 0; i < done; i++) assert.equal(await vscode.commands.executeCommand("debrief.undo"), undefined);
    });
  });
}
