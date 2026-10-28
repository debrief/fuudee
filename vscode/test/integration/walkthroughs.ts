/**
 * Walkthroughs on VS Code's Get Started page (CAP-25), in real VS Code with the real tool
 * service: the five are contributed, each step with its picture and a completion event on a
 * context key of its own; each opens a fresh copy of the sample in a catalogue of its own and
 * never touches any other; and each step's event is said when, and only when, the analyst
 * has done what it asks, by the same commands the steps' buttons and an agent use.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import * as vscode from "vscode";
import type { DebriefApi } from "../../src/extension.js";

type Helpers = {
  waitFor: <T>(what: string, probe: () => T | undefined | Promise<T | undefined>, timeoutMs?: number) => Promise<T>;
  screenshot: (name: string, keepNotifications?: boolean) => Promise<void>;
  sleep: (ms: number) => Promise<unknown>;
};
type Step = { id: string; title: string; description: string; media: { svg: string; altText: string }; completionEvents: string[] };

/** Every file under a folder with its hash: to show a catalogue is untouched. */
function snapshot(folder: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of readdirSync(folder, { recursive: true })) {
    const file = path.join(folder, String(name));
    if (statSync(file).isFile()) out[String(name)] = createHash("sha256").update(readFileSync(file)).digest("hex");
  }
  return out;
}

/** The Get Started page's tabs open now, by their labels. */
const startedTabs = () =>
  vscode.window.tabGroups.all.flatMap((g) => g.tabs).filter((t) => !(t.input instanceof vscode.TabInputText) && /Welcome|Walkthrough|Get Started|Open and explore a serial/i.test(t.label));

/**
 * The first activation after install opens the first walkthrough, Open and explore a serial, on
 * the Get Started page, once only, by a flag in global state (product owner, 22 Oct 2026). This
 * window's profile is fresh, so its activation was the first; the next start is the same check
 * again on the same global state, and opens nothing.
 */
export async function firstRunWalkthrough(api: DebriefApi, { waitFor, screenshot, sleep }: Helpers): Promise<void> {
  assert.equal(await api.walkthroughOnActivation(), true, "the first activation opened the first walkthrough");
  const tabs = await waitFor("the Get Started page", () => (startedTabs().length ? startedTabs() : undefined), 15000);
  assert.ok(tabs.some((t) => t.isActive), `the Get Started page is in front: ${tabs.map((t) => t.label).join(", ")}`);
  await screenshot("walkthrough-00-first-activation");
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  await waitFor("the page closed", () => !startedTabs().length || undefined);
  assert.equal(await api.walkthroughOnNextStart!(), false, "a later start opens nothing");
  await sleep(1500);
  assert.deepEqual(startedTabs().map((t) => t.label), [], "nor does the page open again");
  assert.equal(await api.walkthroughOnNextStart!(), false, "nor on the start after");
}

export async function playWalkthroughs(api: DebriefApi, others: { id: string; location: string }, { waitFor, screenshot, sleep }: Helpers): Promise<void> {
  const extension = vscode.extensions.getExtension<DebriefApi>("debrief.debrief")!;
  const contributed = extension.packageJSON.contributes.walkthroughs as { id: string; title: string; steps: Step[] }[];
  assert.deepEqual(contributed.map((w) => w.title), ["Open and explore a serial", "Import and collate", "Tidy a track", "Annotate and export a figure", "Bearings and TMA"]);
  // The suite before this did much of what the steps ask: start as a newcomer would.
  api.forgetWalkthroughs!();
  const events: string[] = [];
  for (const walkthrough of contributed) {
    for (const step of walkthrough.steps) {
      assert.ok(existsSync(path.join(extension.extensionPath, step.media.svg)), step.media.svg);
      assert.ok(step.media.altText.length > 10);
      assert.equal(step.completionEvents.length, 1);
      const [, event] = step.completionEvents[0].match(/^onContext:debrief\.walkthrough\.(\w+)$/) ?? [];
      assert.ok(event, step.completionEvents[0]);
      events.push(event);
    }
  }
  assert.equal(new Set(events).size, 27);
  // The Get Started page's own commands the extension also ticks steps with: not VS Code's API, so checked here.
  const known = await vscode.commands.getCommands(true);
  assert.ok(known.includes("welcome.markStepComplete") && known.includes("welcome.markStepIncomplete"), "VS Code still has the commands that mark a walkthrough's step");
  // Nothing is ticked until it is done (this window has not opened a walkthrough's copy).
  const seen = () => api.walkthroughEvents();
  const said = (event: string) => waitFor(`the step's event ${event}`, () => seen().includes(event) || undefined, 60000);
  /** Not ticked, after the time a tick would take. */
  const notSaid = async (event: string, why: string) => {
    await sleep(800);
    assert.ok(!seen().includes(event), why);
  };
  /** As the map sends it when the analyst selects or moves time there. */
  const byHand = (message: Record<string, unknown>) => api.fromMap!(message);
  for (const tour of ["explore", "collate", "tidy", "annotate", "tma"]) assert.ok(!seen().includes(`${tour}Opened`));

  // The other catalogues, the analyst's own, are never touched by a walkthrough.
  let before = snapshot(others.location);
  const steps = () => vscode.commands.executeCommand<{ notes?: string[] }[]>("debrief.historySteps");
  const open = async (tour: string, fresh = true) => {
    assert.equal(await vscode.commands.executeCommand("debrief.walkthrough.open", tour, { fresh }), undefined);
    return opened(tour);
  };
  const opened = async (tour: string) => {
    await waitFor(`the copy for ${tour}`, () => (api.session.current?.item.id === `serial-1-${tour}` && api.mapShowing() === `serial-1-${tour}`) || undefined, 120000);
    await said(`${tour}Opened`);
    const copy = api.session.current!;
    assert.equal(copy.item.properties.title, `Serial 1: ${contributed.find((w) => w.id === tour)!.title}`);
    assert.equal(copy.store.title, `Walkthrough: ${contributed.find((w) => w.id === tour)!.title}`);
    return copy;
  };
  // A step's button before its walkthrough's copy exists acts on nothing, and says why.
  assert.match(String(await vscode.commands.executeCommand("debrief.walkthrough.do", "explore", "debrief.outline.focus")), /^Open a copy of serial 1 for Open and explore a serial first/);

  // --- Open and explore a serial ---
  // Pressed twice at once: one copy made, the second press told so.
  const twice = await Promise.all([vscode.commands.executeCommand("debrief.walkthrough.open", "explore", { fresh: true }), vscode.commands.executeCommand("debrief.walkthrough.open", "explore", { fresh: true })]);
  assert.deepEqual(twice.map(String).sort(), ["The copy is being made already.", "undefined"]);
  const explore = await opened("explore");
  const period = api.getState()!.time.range;
  // Looking does not tick: a time a tool, a command or the plot set is not the analyst's.
  assert.ok(!seen().includes("timeMoved"));
  const later = { current: new Date(Date.parse(period.start) + 3_600_000).toISOString(), range: period };
  assert.equal(await vscode.commands.executeCommand("debrief.setState", { time: later }), undefined);
  await notSaid("timeMoved", "a time set by a command is not the analyst moving it");
  // A different time: the same one again would change nothing.
  await byHand({ kind: "time_changed", time: { ...later, current: new Date(Date.parse(later.current) + 60_000).toISOString() } });
  await said("timeMoved");
  // Debrief's own selections (by command, as after adding an annotation) and one track are not the step.
  await vscode.commands.executeCommand("debrief.select", ["track-blue-one", "track-red-one"]);
  await notSaid("selected", "a selection made by command");
  await byHand({ kind: "selection_changed", selection: { plot: explore.item.id, feature_ids: ["track-blue-one"] } });
  await notSaid("selected", "one track selected");
  await byHand({ kind: "selection_changed", selection: { plot: explore.item.id, feature_ids: ["track-blue-one", "track-red-one"] } });
  await said("selected");
  assert.ok(!seen().includes("toteChosen"));
  assert.equal(await vscode.commands.executeCommand("debrief.setTote", { primary: "track-blue-one", secondaries: [] }), undefined);
  await sleep(500);
  assert.ok(!seen().includes("toteChosen"), "a primary alone compares nothing");
  assert.equal(await vscode.commands.executeCommand("debrief.setTote", { primary: "track-blue-one", secondaries: ["track-red-one"] }), undefined);
  await said("toteChosen");
  const entries = (await vscode.commands.executeCommand<{ entries: string[] }>("debrief.timelineEntries")).entries.filter((e) => e.startsWith("narrative"));
  assert.equal(await vscode.commands.executeCommand("debrief.goToTime", entries[3]), undefined);
  await said("timelineChosen");
  // The Get Started page, its steps ticked.
  await vscode.commands.executeCommand("debrief.walkthroughs", "explore");
  await sleep(3000);
  await screenshot("50-walkthrough-explore-done");
  await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
  // Carrying on with the copy opens it as it is, not again.
  const steps1 = (await steps()).length;
  await open("explore", false);
  assert.equal((await steps()).length, steps1);
  assert.equal(api.session.current!.store.location, explore.store.location);

  // --- Import and collate ---
  assert.match(String(await vscode.commands.executeCommand("debrief.walkthrough.importLog")), /^Open the copy of serial 1 for Import and collate first/);
  const collate = await open("collate");
  // Coverage before the log is imported is not the step.
  await vscode.commands.executeCommand("debrief.showCoverage");
  await notSaid("coverageShown", "Coverage before the log is imported");
  const imported = await vscode.commands.executeCommand<{ item?: string }>("debrief.walkthrough.importLog", { modes: "otg" });
  assert.equal(imported?.item, "blue-one-nav-log");
  await said("imported");
  assert.ok(existsSync(path.join(path.dirname(collate.store.location), "blue-one-nav-log.rep")), "the log waits beside the catalogue, outside it");
  const marked = await waitFor("the log marked new data", () => api.catalogueMarks().coverage?.items.find((i) => i.item === "blue-one-nav-log" && i.new_data));
  await vscode.commands.executeCommand("debrief.showCoverage");
  await said("coverageShown");
  api.coverageMessage({ kind: "take_asked", item_revision: { catalogue: marked.catalogue, item: marked.item, revision: marked.revision } });
  await said("newDataTaken");
  const platform = await waitFor("BLUE ONE's sources", () => api.coverage()?.platforms.find((p) => p.track === "track-blue-one" && p.sources.some((s) => s.item === "blue-one-nav-log")));
  const both = platform.periods.find((p) => p.sources.length > 1)!;
  const source = platform.sources.find((s) => s.item === "blue-one-nav-log")!;
  api.coverageMessage({ kind: "source_chosen", feature_id: "track-blue-one", time_range: { start: both.start, end: both.end }, source: { catalogue: source.catalogue, item: source.item, track: source.track, name: source.name } });
  await said("sourceChosen");
  await vscode.commands.executeCommand("debrief.coverage.focus");
  await sleep(1500);
  await screenshot("51-walkthrough-collate");

  // --- Tidy a track ---
  const tidy = await open("tidy");
  assert.equal((await steps()).at(-1)?.notes?.[0], "GPS glitches put into RED ONE");
  const found = await vscode.commands.executeCommand<{ found?: string[] }>("debrief.removeJumps", "track-red-one", {});
  assert.equal(found?.found?.length, 3, "the three glitches, found");
  assert.ok(!seen().includes("jumpsRemoved"), "finding them removes nothing, and ticks nothing");
  // The same change to the analyst's own plot ticks nothing; the step's button then works on the copy.
  await vscode.commands.executeCommand("debrief.openPlot", others.id, "serial-1");
  await waitFor("the analyst's serial 1", () => (api.session.current?.store.id === others.id && api.session.current.item.id === "serial-1") || undefined);
  const theirs = (await steps()).length;
  await vscode.commands.executeCommand("debrief.smoothTrack", "track-red-one", { window: 5 });
  await waitFor("their plot smoothed", async () => (await steps()).length > theirs || undefined);
  await notSaid("smoothed", "smoothing the analyst's own plot is not the step");
  assert.equal(await vscode.commands.executeCommand("debrief.undo"), undefined);
  // Their plot changed by this test's own hand, and back: from here on no walkthrough may change it.
  before = snapshot(others.location);
  await vscode.commands.executeCommand("debrief.walkthrough.do", "tidy", "debrief.removeJumps", "track-red-one", { times: "all" });
  assert.equal(api.session.current?.item.id, tidy.item.id, "the step's button opened the walkthrough's copy first");
  await said("jumpsRemoved");
  await vscode.commands.executeCommand("debrief.smoothTrack", "track-red-one", { window: 5, apply: false });
  await sleep(500);
  assert.ok(!seen().includes("smoothed"), "a preview is not smoothing");
  await vscode.commands.executeCommand("debrief.smoothTrack", "track-red-one", { window: 5 });
  await said("smoothed");
  const red = api.session.current!.plot.features.find((f) => f.id === "track-red-one") as unknown as { properties: { times: string[] } };
  await vscode.commands.executeCommand("debrief.markFix", "track-red-one", red.properties.times[60], { label: "Turned away" });
  await said("fixMarked");
  assert.ok(!seen().includes("sheared"));
  await vscode.commands.executeCommand("debrief.moveTrack", "track-blue-one", { distance: { value: 0.1, unit: "[nmi_i]" }, bearing: { value: 90, unit: "deg" } });
  await notSaid("sheared", "a move is not a shear");
  await vscode.commands.executeCommand("debrief.stretchTrack", "track-blue-one", { anchor: "start", speed: { value: 9, unit: "[kn_i]" } });
  await notSaid("sheared", "a stretch is not the shear the step asks for");
  await vscode.commands.executeCommand("debrief.shearTrack", "track-blue-one", { anchor: "start", course: { value: 200, unit: "deg" }, speed: { value: 6, unit: "[kn_i]" } });
  await said("sheared");
  await vscode.commands.executeCommand("debrief.outline.focus");
  await sleep(1500);
  await screenshot("52-walkthrough-tidy");
  // Started again: its steps unticked, so they tick again on the fresh copy; other walkthroughs' stay.
  await open("tidy");
  for (const event of ["jumpsRemoved", "smoothed", "fixMarked", "sheared"]) assert.ok(!seen().includes(event), `${event} unticked by starting again`);
  assert.ok(seen().includes("timelineChosen"), "another walkthrough's steps stay ticked");
  assert.equal((await steps()).at(-1)?.notes?.[0], "GPS glitches put into RED ONE", "a fresh copy, its glitches back");
  await vscode.commands.executeCommand("debrief.walkthrough.do", "tidy", "debrief.removeJumps", "track-red-one", { times: "all" });
  await said("jumpsRemoved");
  await vscode.commands.executeCommand("debrief.smoothTrack", "track-red-one", { window: 5 });
  await vscode.commands.executeCommand("debrief.markFix", "track-red-one", red.properties.times[60], { label: "Turned away" });
  await vscode.commands.executeCommand("debrief.shearTrack", "track-blue-one", { anchor: "start", course: { value: 200, unit: "deg" }, speed: { value: 6, unit: "[kn_i]" } });
  await said("sheared");

  // --- Annotate and export a figure ---
  const annotate = await open("annotate");
  await vscode.commands.executeCommand("debrief.addAnnotation", { shape: "area", name: "Search area", positions: [[-75.62, 37.12], [-75.42, 37.14], [-75.4, 36.98]] });
  await said("annotationAdded");
  await vscode.commands.executeCommand("debrief.setTrackFrequencies", ["track-blue-one", "track-red-one"], { label_interval: "10 min" });
  await said("frequenciesSet");
  const folder = mkdtempSync(path.join(tmpdir(), "debrief-walkthrough-"));
  await vscode.workspace.getConfiguration("debrief").update("exportFolder", folder, vscode.ConfigurationTarget.Global);
  const exported = await vscode.commands.executeCommand<{ short: string }>("debrief.exportImage", { format: "png", preset: "slide", footer: true, file: path.join(folder, "figure.png") });
  await said("imageExported");
  assert.equal((await vscode.commands.executeCommand<{ problem?: string }>("debrief.toggleNorthArrow"))?.problem, undefined);
  assert.ok(!seen().includes("imageTraced"));
  assert.equal(await vscode.commands.executeCommand("debrief.findImageSource", { id: exported!.short }), undefined);
  await said("imageTraced");
  await waitFor("the image's plot, read-only", () => api.mapRevision());
  await vscode.commands.executeCommand("debrief.openLatestRevision");
  await waitFor("the latest", () => !api.session.current?.revision || undefined);
  assert.equal(api.session.current!.item.id, annotate.item.id);

  // --- Bearings and TMA (fitted as legacy Debrief's tutorial teaches; product owner, 25 Oct 2026) ---
  const towed = "sensor-blue-one-towed-array";
  const day = "2023-06-15T";
  const nmi = (value: number) => ({ value, unit: "[nmi_i]" });
  const deg = (value: number) => ({ value, unit: "deg" });
  const kn = (value: number) => ({ value, unit: "[kn_i]" });
  assert.match(String(await vscode.commands.executeCommand("debrief.walkthrough.do", "tma", "debrief.chooseInOutline", towed)), /^Open a copy of serial 1 for Bearings and TMA first/);
  // Bearings is a view container of its own in the panel below the editor, beside the Terminal (product owner, 25 Oct 2026).
  const containers = extension.packageJSON.contributes.viewsContainers as Record<string, { id: string }[]>;
  assert.ok(containers.panel.some((c) => c.id === "debrief-bearings"), "Bearings' container is in the panel");
  assert.ok(!containers.activitybar?.some((c) => c.id === "debrief-bearings"), "not in the side bar");
  assert.deepEqual((extension.packageJSON.contributes.views["debrief-bearings"] as { id: string }[]).map((v) => v.id), ["debrief.bearings"]);
  await open("tma");
  // Opened with the towed array selected in the Outline and Bearings showing it, in sight in the panel; its wild bearing a step of its own.
  await waitFor("Bearings showing the towed array", () => (api.bearings()?.sensor_id === towed && api.bearings()?.cuts?.length ? true : undefined), 60000);
  assert.deepEqual(api.outlineKeys(), [towed]);
  await waitFor("Bearings in sight in the panel", () => api.bearingsVisible() || undefined, 30000);
  assert.equal((await steps()).at(-1)?.notes?.[0], "A wild bearing put into Towed array cut at 11:12:00Z");
  // A step that needs the solution, before there is one, does nothing and says why.
  assert.match(String(await vscode.commands.executeCommand("debrief.walkthrough.do", "tma", "debrief.moveTrack", "$solution")), /^Make the solution first/);
  // Each button's choice is made in the Outline (product owner, 27 Oct 2026), and Bearings follows,
  // ringing it (the view applies it: the playground's test plays that).
  const focused = (what: string, check: (focus: Record<string, unknown>) => boolean) => waitFor(what, () => (api.bearings()?.focus && check(api.bearings()!.focus as Record<string, unknown>) ? true : undefined), 60000);
  await vscode.commands.executeCommand("debrief.walkthrough.do", "tma", "debrief.chooseInOutline", towed, { cut_time: `${day}09:46:00.000Z` });
  await focused("the cut at 09:46Z chosen", (f) => f.cut_time === `${day}09:46:00.000Z`);
  const first = (api.bearings()?.cuts ?? []).find((c) => c.time === `${day}09:46:00.000Z`)!;
  assert.deepEqual(api.outlineKeys(), [first.id], "chosen in the Outline");
  assert.equal(api.getState()?.time?.current, `${day}09:46:00.000Z`, "current time to it");
  assert.equal(first.side, "starboard", "the bearing the step names, 236.3°, is to starboard");
  assert.equal(first.bearing.toFixed(1), "236.3");
  await vscode.commands.executeCommand("debrief.resolveAmbiguity", { keep: "ambiguous", cut_ids: [first.id] });
  await notSaid("sideKept", "making a cut ambiguous again keeps no side");
  // Keep starboard, the Tools' entry, on the cut chosen in the Outline.
  assert.equal((await vscode.commands.executeCommand<{ problem?: string }>("debrief.keepStarboard"))?.problem, undefined);
  await said("sideKept");
  const tmaPeriod = { start: `${day}09:46:00.000Z`, end: `${day}12:00:00.000Z` };
  await vscode.commands.executeCommand("debrief.walkthrough.do", "tma", "debrief.chooseInOutline", towed, { period: tmaPeriod, make: true });
  await focused("the period chosen and the first guess opened", (f) => !!f.make && (f.cut_ids as string[] | undefined)?.length === 102);
  // Debrief's first guess as its form sends it: 4.94 nmi along the first bearing, across it, 8.0 kn.
  const made = await vscode.commands.executeCommand<{ feature?: string; residuals?: { rms?: number } }>("debrief.tmaCreate", { sensor_ids: [towed], period: tmaPeriod, range: nmi(4.94), course: deg(326.3), speed: kn(8) });
  await said("solutionMade");
  const solution = made!.feature!;
  const rmsNow = (near: number, what: string) => waitFor(what, () => (api.bearings()?.solution_id === solution && Math.abs((api.bearings()?.residuals?.rms ?? 999) - near) < 0.1 ? api.bearings()!.residuals! : undefined), 60000);
  assert.ok(Math.abs((made!.residuals?.rms ?? 0) - 55.9) < 0.1, `Debrief's first guess is far off, as the step says: ${made!.residuals?.rms}`);
  // A shear of another track in the copy is Tidy a track's, not this walkthrough's.
  await vscode.commands.executeCommand("debrief.shearTrack", "track-blue-one", { anchor: "start", course: deg(200), speed: kn(6) });
  await notSaid("solutionSheared", "BLUE ONE sheared is not the solution sheared");
  await vscode.commands.executeCommand("debrief.undo");
  // The panel closed: the step's button (Move…) brings Bearings back into sight there (the panel's L8).
  await vscode.commands.executeCommand("workbench.action.closePanel");
  await waitFor("the panel closed", () => !api.bearingsVisible() || undefined, 15000);
  await vscode.commands.executeCommand("debrief.walkthrough.do", "tma", "debrief.moveTrack", "$solution", { distance: nmi(1.67), bearing: deg(56.3) });
  await said("solutionMoved");
  await waitFor("Bearings back in sight in the panel", () => api.bearingsVisible() || undefined, 30000);
  await notSaid("solutionSheared", "a move is not the shear");
  await rmsNow(62.7, "the solution at RED ONE's range: the RMS up, as the step says");
  await vscode.commands.executeCommand("debrief.walkthrough.do", "tma", "debrief.shearTrack", "$solution", { anchor: "start", course: deg(246), speed: kn(3.8) });
  await said("solutionSheared");
  const fitted = await rmsNow(38.8, "the first leg fitted");
  const firstLeg = fitted.rows.filter((r) => r.time <= `${day}10:32:00.000Z`).map((r) => r.residual!);
  assert.equal(firstLeg.filter((v) => Math.abs(v) > 3).length, 2, "all but 2 of the first leg's 40 errors within 3°");
  await vscode.commands.executeCommand("debrief.walkthrough.do", "tma", "debrief.chooseInOutline", "$solution", { cut_time: `${day}11:12:00.000Z` });
  await focused("the cut at 11:12Z chosen", (f) => f.cut_time === `${day}11:12:00.000Z`);
  const wild = fitted.rows.find((r) => r.time === `${day}11:12:00.000Z`)!;
  assert.deepEqual(api.outlineKeys(), [wild.id]);
  assert.equal(api.bearings()?.solution_id, solution, "a cut of the solution keeps it shown");
  assert.match((await vscode.commands.executeCommand<{ problem?: string }>("debrief.tmaCountIn"))?.problem ?? "", /counted in Contact 1 solution already/);
  await notSaid("cutLeftOut", "counting a cut again is not leaving it out");
  assert.equal((await vscode.commands.executeCommand<{ problem?: string }>("debrief.tmaLeaveOut"))?.problem, undefined);
  await said("cutLeftOut");
  await vscode.commands.executeCommand("debrief.walkthrough.do", "tma", "debrief.chooseInOutline", "$solution", { fix_time: `${day}10:38:00.000Z` });
  await focused("the position at 10:38Z chosen", (f) => f.cut_time === `${day}10:38:00.000Z`);
  assert.match(api.outlineKeys()[0], /#fix\d+$/);
  assert.equal((await vscode.commands.executeCommand<{ problem?: string }>("debrief.splitBeforeFix"))?.problem, undefined);
  assert.equal((await steps()).at(-1)?.notes?.[0], "Contact 1 solution split into legs before its fix at 10:38:00Z");
  // The split is not the step: dragging a leg is (product owner, 25 Oct 2026). The whole solution
  // dragged is an earlier step's; its second leg (This leg, as the map or the form sends it, a period) is this one.
  await notSaid("legDragged", "a split is not the step");
  const leg2 = { start: `${day}10:38:00.000Z`, end: `${day}12:00:00.000Z` };
  await vscode.commands.executeCommand("debrief.walkthrough.do", "tma", "debrief.moveTrack", "$solution", { period: leg2, distance: nmi(0.17), bearing: deg(155) });
  await said("legDragged");
  await vscode.commands.executeCommand("debrief.walkthrough.do", "tma", "debrief.shearTrack", "$solution", { anchor: "start", period: leg2, course: deg(200), speed: kn(5.2) });
  const fittedBoth = await rmsNow(1.84, "both legs fitted, near the bearings' own accuracy");
  const beyond = fittedBoth.rows.filter((r) => !r.excluded && r.residual !== undefined && r.residual !== null && Math.abs(r.residual) > 3).length;
  assert.equal(beyond, 9, "9 of 101 beyond the cut-off, as the step says");
  assert.ok(api.bearingsVisible(), "Bearings in sight in the panel");
  await sleep(1500);
  await screenshot("53-walkthrough-tma");

  // Every step of every walkthrough has been ticked by doing it.
  assert.deepEqual([...seen()].sort(), [...events].sort());
  // Only the walkthroughs' own catalogues changed; the analyst's are as they were.
  assert.deepEqual(snapshot(others.location), before);
  for (const tour of ["explore", "collate", "tidy", "annotate", "tma"]) {
    const store = (await vscode.commands.executeCommand<string | undefined>("debrief.walkthrough.open", tour, { fresh: false })) ?? "";
    assert.equal(store, "");
    assert.ok(api.session.current!.store.location.includes(path.join("walkthroughs", tour)), "in the extension's own storage");
  }
  await vscode.workspace.getConfiguration("debrief").update("exportFolder", undefined, vscode.ConfigurationTarget.Global);
}
