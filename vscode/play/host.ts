/**
 * The playground: Debrief in a web page, for the blog.
 *
 * This page plays the part of the VS Code extension. The map, tool form and
 * results panel are Debrief's own webviews, unchanged, each in a frame (see
 * shim.ts). The catalogue, history, tools and importers are Debrief's own
 * Python packages, running in the reader's browser under Pyodide (see
 * python.worker.ts and play.py). Nothing is sent anywhere: files the reader
 * imports stay in the browser, and everything is gone when the page closes.
 *
 * Query parameters choose what an embedded demo shows:
 *   plot=serial-1         the sample serial to open
 *   panels=tour,tote,timeline,bearings,tools,history,export,try,import   the panels, in this order (all by default;
 *                         Time, the Outline and the top bar's Plot are always there). 900 px wide and
 *                         more, they are docked around the map in a layout made from the panels
 *                         listed, the same every time (dock.ts); narrower, in the side column, the
 *                         Tote under the time controller and the walkthroughs above it. Export, Try
 *                         and Import are menus in the top bar.
 *
 * The web demo (demo.mjs) is this page, full screen at /demo/, using the playground's files.
 * Files the reader opens, there and here, are read in the browser only (DEP-07).
 *
 * 900 px wide and more, the panels are docked around the map, in tab groups the reader drags to
 * rearrange (dock.ts; product owner, 23 Oct 2026). Narrower, they are one side column as before,
 * each folding away by its heading (fold.ts). The playground and the web demo remember the layout
 * and which panels are folded in this browser; a demo that chooses its panels starts from the same
 * layout every time, with every panel open, and remembers neither, so a post's demo always shows
 * what the post describes.
 */
import type { AnnotationSpec, CoverageReport, DebriefFeatureCollection, ItemRevision, NarrativeSpec, ParameterValue, PlotView, ReviewFlag, SharedStateChange, SourceTrackRef, StacItem, TimeRange, TimeState, TmaCut, TmaFocus, TmaRequest, TmaResiduals, ToolDeclaration, ToolResult, ToteResult, ToteView } from "@debrief/schemas";
import { CoverageControl } from "../webview/coveragecontrol.js";
import { specOfFeature } from "../webview/annotationlook.js";
import { NarrativeOnMap, narrativeOnMapOf, timelineEntries, timelineTracks } from "../src/timeline.js";
import { TimelineControl } from "../webview/timelinecontrol.js";
import { count, describePeriod, describeTimes } from "../src/format.js";
import { answersToRemember, choicesOf, describeAnswers, duplicateQuestion, periodChoices, questionsFor, readSummary, rememberedAnswers, typeWords, type NarrativeChoices, type NarrativePreview } from "../src/narrativeimport.js";
import { contextTracksOf, displayed, hiddenIds, isFeature, setViewOf, timeWindowOf, viewOf, type PlotFeature } from "../src/hidden.js";
import { contextShown, type ContextTracks } from "../webview/contrast.js";
import { placeToolTime } from "../webview/timelogic.js";
import { TRACK_COLOURS } from "../webview/palette.js";
import { cutChoices, cutNow, describeCut, featureName, KEEP_CHOICES, placeOfCut, resolutionFor, scopeChoices, sensorsOf, type Keep, type ResolveContext } from "../webview/sensors.js";
import { describeSensorInFile, hostChoices, hostQuestion, hostsToAsk, sensorReadSummary, type SensorPreview } from "../src/sensorimport.js";
import { TimeControl } from "../webview/timecontrol.js";
import { ToteControl } from "../webview/totecontrol.js";
import { TmaControl } from "../webview/tmacontrol.js";
import { coverageOf, cutColours, cutRowsOf, FocusOnce, legExtent, ownshipOf, tmaSensorRows, tmaSolutionRows, type ListedCut } from "../webview/tma.js";
import { latencySummary, sameTote, toteMenu, toteOf, ToteRequests, toteTracks, withoutSecondary, withPrimary, withSecondaries } from "../webview/totelogic.js";
import { PressHold } from "../webview/presshold.js";
import { Folds } from "./fold.js";
import { Dock, MAP_ID, type LayoutStorage } from "./dock.js";
import { PANEL_TITLES, SIDE_FIRST } from "./panels.mjs";
import { openMenu, type MenuItem } from "./menu.js";
import { formatBearing, formatPosition, parsePosition } from "@debrief/kernel";
import { defaultPivotIndex, describeDistance, describeSpeed, describeTurn, FIX_PROMPT, FIX_PROMPT_DR, fixIndexAt, fixMeans, fixToEdit, jumpSpeed, legNow, mergedName, mergePlan, periodIndices, readArrayOffset, arrayOffsetTitle, readBearing, readDistance, readSpeed, readTurn, reckoningOf } from "../webview/trackedit.js";
import { chooseModes, MODE_LABELS, modeChoices, modeQuestion, REMEMBER_LABEL, REMEMBERED_IN_PLAYGROUND, type PlottingMode } from "../src/importmode.js";
import { describeJump, describeMark, describeWindow, DR_TAG, fixRows, isDeadReckoned, jumpsFound, markAt, readThreshold, readWindow, smoothingNote, type Jump } from "../webview/fixes.js";
import { FIX_COLOURS } from "../webview/palette.js";
import { ALL_PROBLEM, AT_EVERY_FIX, changesOf, choiceFromValue, choicesFor, describeChanges, describeInterval, FIELD_NAMES, FIELDS, formState, readInterval, type Field, type FieldState } from "../webview/frequencies.js";
import { formatQuantity, figureIdProblem, UNIT_LABELS } from "@debrief/kernel";
import type { FigureSource, ImageExport, RenderedImage, RevisionShown } from "@debrief/schemas";
import { fileNameFor, PRESETS, type ImageFormat, type ImagePreset, type ImageTheme } from "../webview/exportlogic.js";
import { describeExported, describeSource, READ_ONLY, rememberedOf, revisionOf, startingChoice, type ExportChoice } from "../src/figures.js";
import { callEvent, counts, outlineTarget, TourPanel, tourOfEvent, type TourAction } from "./tours.js";
import { OutlineTree } from "./outline.js";
import { fillOutlineRow } from "./outlinerow.js";
import { filesOf, isBranch, OutlineModel, selectable, type OutlineNode, type OutlineRow } from "../webview/panels/outline.js";
import { actionOf, entryOf, rowMenu, titleMenu, type Context } from "../webview/panels/actions.js";
import { undoRedo } from "../src/views/historyrows.js";
import type { HistoryStep } from "../src/service.js";
import { ToolsModel, type ToolsRow, type Unavailable } from "../webview/panels/tools.js";
import { HistoryModel, NEEDS_SERVICE } from "../webview/panels/history.js";
import { fillTools } from "./toolslist.js";
import { fillHistory } from "./historylist.js";
import { Refusal, type FlowHost, type PlotRef, type Severity } from "../webview/panels/flows/host.js";
import { runTool as runToolFlow, type ToolCall } from "../webview/panels/flows/runtool.js";
import { move as moveFlow, type How } from "../webview/panels/flows/move.js";
import { operationContext as sharedOperationContext, operationsFor, runOperation as runOperationFlow, type OperationHost, type OperationState } from "../webview/panels/flows/operation.js";
import type { TreeNode } from "../webview/outlinetree.js";
import {
  bearingsFor,
  bearingsTitle,
  type BearingsShown,
  featureIdsOfPicks,
  fixKey,
  type Operation,
  type OperationContext,
  type OperationId,
  outlineChoice,
  type OutlineFocus,
  outlineIndex,
  type OutlinePick,
  pickOf,
} from "../webview/outlinemodel.js";
import { selectionChildren, selectionColour, selectionSaid, selectionVisibility } from "../webview/outlinetoolbar.js";
import { OutlineBar } from "./outlinebar.js";
import { latestSolution, NO_SOLUTION, SOLUTION } from "../walkthroughs/contribute.mjs";
import { contentFree } from "../webview/timelinelogic.js";

type Feature = PlotFeature;
type Step = HistoryStep;
interface Opened {
  item: StacItem;
  /** The plot, with its whole-plot feature and view (the island, SUB-22). */
  plot: DebriefFeatureCollection;
  base: { current: number; plot_hash: string };
  /** The hash of the plot's view (its island) when read, to pass back when saving the time window. */
  view_hash: string;
  steps: Step[];
  recovered: string[];
  /** An earlier revision, shown read-only: the one an image was exported at (SUB-25). */
  revision?: RevisionShown;
  /** The export log entry for that image, with the view and time it was exported at. */
  export?: ImageExport;
}

const params = new URLSearchParams(location.search);
/** The web demo (demo.mjs): this page full screen at /demo/. It keeps nothing derived from a plot's content (panel review, 17 Oct 2026). */
const demo = !!document.querySelector('meta[name="debrief-demo"]');
const panelOrder = (params.get("panels") ?? "tour,tote,timeline,catalogue,coverage,bearings,tools,history,export,try,import").split(",");
const panels = new Set(panelOrder);
const startPlot = params.get("plot") ?? "serial-1";
/** Every side panel folds by its heading; remembered in this browser, except in a demo that chooses its panels. */
const folds = new Folds(Array.from(document.querySelectorAll<HTMLElement>("#side > section.panel")), !params.has("panels"));
/** The docked layout, 900 px wide and more; undefined in the narrow one (see "The layout" below). */
let dock: Dock | undefined;
/** Whether a panel is in view: its tab in front when docked, open (not folded) in the side column. */
function isShown(id: string): boolean {
  const section = document.getElementById(id);
  return !!section && !section.hidden && (dock ? dock.isShown(id) : folds.isOpen(id));
}
/** Bring a panel into view: its tab to the front when docked, unfolded in the side column. */
function showPanel(id: string): void {
  if (dock) dock.show(id);
  else folds.setOpen(id, true);
}
const theme = matchMedia("(prefers-color-scheme: light)").matches || params.get("theme") === "light" ? "light" : "dark";
if (theme === "light") document.documentElement.classList.add("light");
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
/** An element that may not be on the page, or undefined. */
const optional = <T extends HTMLElement>(id: string) => (document.getElementById(id) as T | null) ?? undefined;

// --- Python, in a worker ----------------------------------------------------------
// From the page's base: the web demo at /demo/ runs the playground's files (its <base>).
const worker = new Worker(new URL("python.worker.js", document.baseURI), { type: "module" });
let nextId = 0;
const waiting = new Map<number, { resolve: (v: string) => void; reject: (e: Error) => void }>();
worker.onmessage = ({ data }) => {
  if (data.progress) return status(data.progress, true);
  const call = waiting.get(data.id);
  waiting.delete(data.id);
  if (data.error) call?.reject(new Error(data.error));
  else call?.resolve(data.result);
};
/** Calls that change the open plot, its history or its island: refused while an earlier revision is shown read-only. */
const CHANGES_PLOT = new Set(["run", "move", "restyle", "frequencies", "annotate", "track", "clean", "narrative", "sensor", "tma_change", "set_view", "collate", "glitches", "crash", "colleague", "colleague_window"]);
function python(call: string, ...args: unknown[]): Promise<string> {
  if (opened?.revision && CHANGES_PLOT.has(call)) return Promise.resolve(JSON.stringify({ error: READ_ONLY }));
  const id = nextId++;
  worker.postMessage({ id, call, args, base: new URL(".", document.baseURI).href });
  return new Promise<string>((resolve, reject) => waiting.set(id, { resolve, reject })).then((result) => {
    // What the reader did, for the walkthroughs: a change that succeeded ticks its step (CAP-25),
    // if it was to the walkthrough's copy: the plot named, or for the log's import the plot open.
    const legsOf = (id: string) => { const f = features().find((x) => x.id === id && x.properties.kind === "track"); const tma = f && (f.properties as { tma?: { leg_starts?: string[] | null } }).tma; return tma ? 1 + (tma.leg_starts?.length ?? 0) : undefined; };
    tourEvent(callEvent(call, args, result, legsOf), typeof args[0] === "string" && call !== "import_tour_log" ? args[0] : opened?.item.id);
    return result;
  });
}
const pythonJson = async <T>(call: string, ...args: unknown[]) => JSON.parse(await python(call, ...args)) as T;
/** Whether Python has started: until then, only the map and outline work. */
let pythonReady = false;

// --- The webviews, in frames -------------------------------------------------------
function frame(name: "map" | "form" | "results" | "annotation"): HTMLIFrameElement {
  const element = document.createElement("iframe");
  element.src = `frame-${name}.html?frame=${name}&theme=${theme}`;
  element.title = { map: "Plot map", form: "Tool form", results: "Tool results", annotation: "Annotation form" }[name];
  element.className = `frame frame-${name}`;
  return element;
}
const map = frame("map");
$("main").prepend(map);
let form: HTMLIFrameElement | undefined;
let results: HTMLIFrameElement | undefined;
let annotationFrame: HTMLIFrameElement | undefined;
const ready = new Set<string>();
const post = (target: HTMLIFrameElement | undefined, message: unknown) => {
  const name = target?.className.match(/frame-(\w+)/)?.[1];
  if (target && name && ready.has(name)) target.contentWindow?.postMessage(message, location.origin);
};

// --- What is open, and the shared state -------------------------------------------
let opened: Opened | undefined;
let selection: string[] = [];
let time: TimeState | undefined;
// The time controller is at the top of the side column, as at the top of VS Code's sidebar:
// the same component. Current time and the window move the map at once; the window
// is saved in the plot when the reader lets go of it.
let timePending = false;
const TIME_WINDOW_OPEN_KEY = "debrief.play.timeWindowOpen";
const timeControl = new TimeControl($("timebar"), {
  moved: (moved) => {
    time = moved;
    tourEvent("timeMoved", opened?.item.id);
    refreshTote(); // asked at once: the Tote keeps pace by never queueing (NFR-04)
    bearingsTime?.(); // a line at current time across the bearing view's plots
    timelineControl.setTime(time); // the Timeline follows; it draws at most once a frame
    coverageControl.setTime(Date.parse(moved.current)); // a line across Coverage's bars
    narrativeToMap();
    if (timePending) return; // tell the map at most once a frame, however fast a slider moves
    timePending = true;
    requestAnimationFrame(() => {
      timePending = false;
      if (time) post(map, { kind: "set_time", time });
    });
  },
  windowSaved: (window) => void saveWindow(window),
  contextChanged: (context) => void saveView({ context_tracks: context }),
  // Pressing Play follows current time in the Timeline again (product owner, 15 Oct 2026).
  playing: (playing) => timelineControl.setPlaying(playing),
}, {
  // Whether the window's details are open, remembered in this browser (product owner, 28 Oct 2026).
  windowOpen: {
    get: () => {
      try {
        const open = window.localStorage.getItem(TIME_WINDOW_OPEN_KEY);
        return open === null ? undefined : open === "true";
      } catch {
        return undefined;
      }
    },
    set: (open) => {
      try {
        window.localStorage.setItem(TIME_WINDOW_OPEN_KEY, String(open));
      } catch {
        // Storage refused: the disclosure is just not remembered.
      }
    },
  },
});
/** The time window as the plot file last had it, or the plot's period. */
let savedWindow: TimeRange | undefined;
const periodOf = (item: StacItem): TimeRange | undefined => {
  const p = item.properties;
  const start = p.start_datetime ?? p.datetime ?? undefined;
  const end = p.end_datetime ?? p.datetime ?? undefined;
  return start && end ? { start, end } : undefined;
};
/** How the plot says tracks outside the window are drawn. The playground has no settings: the minimum-contrast setting is off. */
const contextOf = (): ContextTracks => (opened && contextTracksOf(opened.plot)) ?? "visible";
/** Current time as set by opening a plot or by a tool, with the window as saved. */
/** Current time and the window to the bearing view, once it exists (below). */
let bearingsTime: (() => void) | undefined;
function showTime(next: TimeState | undefined): void {
  time = next;
  bearingsTime?.();
  timeControl.show(time, opened && periodOf(opened.item), { saved: savedWindow, context: contextOf(), minimumContrast: false });
  timelineControl.setTime(time);
  coverageControl.setTime(time ? Date.parse(time.current) : undefined);
  narrativeToMap();
  refreshTote();
}

// --- The Tote (CAP-06): values from Python at each current time; the choice in the island ---
/** A choice the reader made that is being saved: shown at once, before the save returns. */
let toteChoosing: ToteView | undefined;
const toteChoice = (): ToteView => toteChoosing ?? toteOf(opened?.plot);
const totePanel = $("panel-tote");
const toteControl = new ToteControl($("tote"), { changed: (view) => void chooseTote(view) });
/** How long Python took to work each answer out, for the latency check (NFR-04). */
const toteCompute: number[] = [];
const toteRequests = new ToteRequests<{ item: string; time: string; tote: ToteView }>(
  async ({ item, time: at, tote }) => {
    // An earlier revision shown read-only: the Tote of the plot as it was then (product owner, 16 Oct 2026).
    const revision = opened?.item.id === item ? opened.revision?.revision : undefined;
    const outcome = await pythonJson<{ tote?: ToteResult; compute_ms?: number; error?: string }>("tote", item, JSON.stringify({ time: at, tote, ...(revision && { revision }) }));
    if (outcome.error) throw new Error(outcome.error);
    if (outcome.compute_ms !== undefined) toteCompute.push(outcome.compute_ms);
    return outcome.tote;
  },
  (result, asked) => {
    // An answer for a plot no longer open, or a choice since changed, is not shown.
    if (asked.item !== opened?.item.id || !sameTote(asked.tote, toteChoice())) return;
    toteControl.show({ result });
  },
  (error) => toast(`The Tote could not be worked out: ${error.message}`, "warning"),
);
/** For the playground test's latency report: from asking to showing, and Python's part. */
(window as unknown as { debriefToteLatency: () => unknown }).debriefToteLatency = () => ({ shown: latencySummary(toteRequests.timings), compute: latencySummary(toteCompute) });
/** Ask for the Tote at current time, while it is showing and has tracks to compare. */
function refreshTote(): void {
  if (!opened || !time || !pythonReady || !panels.has("tote") || !isShown(totePanel.id)) return;
  const tote = toteChoice();
  if (!tote.primary && !tote.secondaries?.length) return;
  toteRequests.request({ item: opened.item.id, time: time.current, tote });
}
/** The tracks and the choice, on opening a plot and when its view changes; then the values. */
function showTote(): void {
  toteControl.show(opened ? { tracks: toteTracks(opened.plot), view: toteChoice() } : undefined);
  toteToMap();
  refreshTote();
}
/** The map draws a thin line from the primary to each secondary, unless the Tote turned them off. */
function toteToMap(): void {
  if (opened) post(map, { kind: "set_tote", tote_view: toteChoice() });
}
/** The reader chose tracks for the Tote: shown at once, then saved in the island like the window. */
async function chooseTote(view: ToteView): Promise<void> {
  if (!opened) return;
  toteChoosing = view;
  toteControl.show({ view });
  toteToMap();
  refreshTote();
  await saveView({ tote: view });
  if (view.primary && view.secondaries?.length && sameTote(toteOf(opened?.plot), view)) tourEvent("toteChosen", opened?.item.id);
  // Saved (the island has it now) or not (what is saved is shown again); unless the reader
  // has chosen again meanwhile, which is still being saved and stays on screen.
  if (toteChoosing !== view) return;
  toteChoosing = undefined;
  showTote();
}
totePanel.addEventListener("fold", () => isShown(totePanel.id) && refreshTote());
/** The tools and those not available, once Python has started (as the tool service's tools/list). */
let listing: { tools: ToolDeclaration[]; unavailable: Unavailable[] } | undefined;
let tools: ToolDeclaration[] = [];
let offered: string[] = [];
/** Why Python, and with it the tools and history, could not start. */
let pythonProblem: string | undefined;
let formTool: ToolDeclaration | undefined;
let colleagueDuringNextRun = false;

/** The plot's features, without its whole-plot feature (the plot's own details and view). */
const features = (): Feature[] => (opened?.plot.features ?? []).filter(isFeature);
const selectedNames = () => selection.map((id) => featureNameOf(id));
const featureNameOf = (id: string) => { const f = features().find((g) => g.id === id); return f ? featureName(f, opened?.plot) : id; };

/**
 * Current time over the plot's time window (its view, kept in the plot file outside
 * its history), or else its period. Read again with the window as it was, current
 * time and the range stay where they were; a window changed elsewhere is shown,
 * with current time kept inside it.
 */
function timeOf(item: StacItem, plot: DebriefFeatureCollection, previous?: TimeState): TimeState | undefined {
  const window = timeWindowOf(plot) ?? periodOf(item);
  const saved = savedWindow;
  savedWindow = window;
  if (!window) return previous;
  if (!previous) return { current: window.start, range: window };
  if (saved && saved.start === window.start && saved.end === window.end) return previous;
  const ms = Date.parse;
  const current = Math.min(ms(window.end), Math.max(ms(window.start), ms(previous.current)));
  return { current: new Date(current).toISOString(), range: window };
}

/**
 * Save the time window in the plot's island when the reader lets go of it: never a
 * step in the history, never undone (SUB-22). A window a colleague changed meanwhile
 * is never overwritten (SUB-28).
 */
let saving: Promise<void> = Promise.resolve();
const saveWindow = (window: TimeRange): Promise<void> => saveView({ time_window: window });
/** Change part of the plot's island: the time window, or how context tracks are drawn (CAP-28, CAP-29). */
function saveView(change: Partial<PlotView>): Promise<void> {
  // One at a time, each with the hash the last one left, as VS Code does: two quick
  // key presses must never look like a colleague's change.
  const what = change.time_window
    ? "The time window"
    : change.tote
      ? "The Tote's tracks"
      : "narrative_on_map" in change
        ? "Whether the map shows the narrative"
        : "How context tracks are drawn";
  saving = saving.then(() => saveViewNow(change, what)).catch((error: Error) => toast(`${what} was not saved: ${error.message}`, "warning"));
  return saving;
}
async function saveViewNow(change: Partial<PlotView>, what: string): Promise<void> {
  if (!opened || !pythonReady) return; // the preview, before Python: shown, not saved
  const item = opened.item.id;
  const view = { ...(viewOf(opened.plot) ?? {}), ...change };
  const outcome = await pythonJson<{ view_hash?: string; base?: Opened["base"]; conflict?: boolean; error?: string }>(
    "set_view",
    item,
    JSON.stringify({ view, hash: opened.view_hash }),
  );
  if (outcome.conflict) {
    await openPlot(item, true);
    return toast(
      change.time_window
        ? "Someone else changed the time window, so yours was not saved. Debrief is showing theirs; set it again if you still want yours."
        : change.tote
          ? "Someone else changed this plot's view, so your choice of Tote tracks was not saved. Debrief is showing theirs; choose again if you still want yours."
          : "Someone else changed this plot's view, so your choice was not saved. Debrief is showing theirs; choose again if you still want yours.",
      "warning",
    );
  }
  if (outcome.error || !outcome.view_hash || !outcome.base) {
    showTime(time); // what is saved, again
    if ("narrative_on_map" in change) renderTimeline();
    return toast(outcome.error ?? `${what} was not saved.`, "warning");
  }
  if (opened?.item.id !== item) return;
  if (outcome.base.plot_hash !== opened.base.plot_hash || outcome.base.current !== opened.base.current) return openPlot(item, true);
  opened.view_hash = outcome.view_hash;
  setViewOf(opened.plot, view);
  savedWindow = view.time_window ?? savedWindow;
  // The controller shows what is saved; the map draws context tracks as the plot now says.
  showTime(time);
  if (change.context_tracks) post(map, { kind: "set_context", context_tracks: contextShown(contextOf(), false) });
  if ("narrative_on_map" in change) {
    narrativeShown = undefined;
    narrativeToMap();
  }
}

function showPlot(): void {
  if (!opened) return;
  post(map, {
    kind: "show_plot",
    plot: displayed(opened.plot), // hidden features left out (SUB-22)
    plot_title: opened.item.properties.title ?? opened.item.id,
    selection: { plot: opened.item.id, feature_ids: selection },
    hidden_count: hiddenIds(opened.plot).length, // hiding is shared: the map says how many, with "Show all"
    context_tracks: contextShown(contextOf(), false),
    ...(time && { time }),
    ...(opened.revision && { revision_shown: opened.revision }),
  });
  narrativeShown = undefined;
  narrativeToMap();
}

async function openPlot(item: string, keep = false): Promise<void> {
  const previousTime = keep ? time : undefined;
  if (opened && opened.item.id !== item) closeSide();
  // The plot as the map last drew it: if Python's is the same, it isn't sent again.
  // (An earlier revision shown read-only is never the plot as it is: drawn again.)
  const shown = opened?.item.id === item && opened.base.plot_hash && !opened.revision ? opened.base.plot_hash : undefined;
  if (opened?.item.id !== item) {
    toteRequests.reset();
    toteChoosing = undefined;
  }
  opened = await pythonJson<Opened>("open_plot", item);
  $<HTMLSelectElement>("plots").value = item;
  const ids = new Set(features().map((f) => f.id));
  selection = keep ? selection.filter((id) => ids.has(id)) : [];
  // The Outline's rows kept where the plot still has them (a leg or a fix of a solution still there).
  outlinePicks = keep ? outlinePicks.filter((k) => !!pickOf(outlineIndex(opened!.plot), k)) : [];
  showTime(timeOf(opened.item, opened.plot, previousTime));
  $("plot-title").textContent = opened.item.properties.title ?? item;
  $("plot-title").classList.remove("read-only");
  if (opened.base.plot_hash !== shown) showPlot();
  else {
    post(map, { kind: "set_selection", selection: { plot: item, feature_ids: selection } });
    if (time) post(map, { kind: "set_time", time });
    post(map, { kind: "set_context", context_tracks: contextShown(contextOf(), false) });
  }
  renderOutline();
  renderTimeline();
  renderHistory();
  showTote();
  void refreshBearings();
  void refreshCollation();
  await refreshOffered();
  if (opened.recovered.length) toast(opened.recovered.join(" "), "warning");
}

/**
 * The selection: the features selected everywhere (the map, the Outline, Bearings). keys are the
 * Outline's rows chosen, when chosen there (a leg or a fix stands for its solution); chosen
 * elsewhere, the features' own rows are selected in the Outline and brought into sight.
 */
async function select(ids: string[], fromMap = false, keys?: string[]): Promise<void> {
  selection = ids;
  outlinePicks = keys ?? ids;
  bearingsFollow();
  if (!fromMap) post(map, { kind: "set_selection", selection: { plot: opened?.item.id ?? "", feature_ids: ids } });
  renderOutline(!keys);
  if (formTool) sendForm();
  await refreshOffered();
}

window.addEventListener("message", (event) => {
  if (event.origin !== location.origin) return;
  if (event.data?.debriefKey) return void historyKey(event.data.debriefKey as KeyChord);
  if (!event.data?.debriefFrame) return;
  const { debriefFrame: name, message } = event.data as { debriefFrame: string; message: { kind: string } & Record<string, unknown> };
  if (message.kind === "ready") {
    ready.add(name);
    if (name === "map") showPlot();
    if (name === "form") sendForm();
    if (name === "annotation") sendAnnotationForm();
    if (name === "results") pendingResults?.();
    return;
  }
  if (name === "map") {
    if (message.kind === "selection_changed") {
      const ids = (message.selection as { feature_ids: string[] }).feature_ids;
      selectedByHand(ids);
      void select(ids, true);
    }
    if (message.kind === "time_changed") {
      tourEvent("timeMoved", opened?.item.id);
      showTime(message.time as TimeState);
    }
    if (message.kind === "viewport_changed") viewport = (message.viewport as { bbox: number[] }).bbox;
    if (message.kind === "show_hidden" && opened) void restyle(hiddenIds(opened.plot), { hidden: false });
    if (message.kind === "edit_annotation" && message.annotation) {
      // Dragged or nudged on the map: changed so, as one step. Refused, the map shows the latest.
      const change = { kind: "edit", feature: message.feature_id, annotation: message.annotation };
      void annotate(change).then(async (problem) => {
        if (!problem || !opened) return;
        toast(`${problem} Debrief is showing the latest; try again if you still want to.`, "warning");
        await openPlot(opened.item.id, true);
        showPlot();
      });
    } else if (message.kind === "edit_annotation") editAnnotation(message.feature_id as string);
    if (message.kind === "edit_track") {
      // A track's handle or a fix's let go of, or nudged: changed so, as one step. Refused, the map shows the latest.
      const change = { kind: "edit", feature: message.feature_id, edit: message.track_edit };
      const before = opened?.base.plot_hash;
      void changeTrack(change).then(async (problem) => {
        if (!opened) return;
        // Nothing changed after all: the map still waits for the plot to come back.
        if (!problem) return void (opened.base.plot_hash === before && showPlot());
        toast(problem.includes("changed elsewhere") ? `${problem} Debrief is showing the latest; try again if you still want to.` : problem, "warning");
        await openPlot(opened.item.id, true);
        showPlot();
      });
    }
    if (message.kind === "fix_chosen") void openFixes(message.feature_id as string, message.fix_time as string);
    // One of an ambiguous cut's two lines clicked: that bearing kept, as one step; right-click or press and hold: its menu (CAP-22).
    if (message.kind === "resolve_asked") void resolveSensor({ keep: message.keep as Keep, cut_ids: [message.feature_id as string] });
    if (message.kind === "cut_chosen") void cutMenu(message.feature_id as string);
    // A TMA solution dragged: the bearing view works its residuals out again as it moves (CAP-21, NFR-04).
    if (message.kind === "tma_preview") tmaControl.preview(message.feature_id as string, (message.preview as { coordinates: [number, number][] } | undefined)?.coordinates);
    // Two clicks for a first guess made, or cancelled.
    if (message.kind === "tma_guessed") {
      const asked = tmaGuessing;
      tmaGuessing = undefined;
      const request = message.tma_request as TmaRequest | undefined;
      if (request && asked) void createTma({ ...asked, ...request });
      else toast("No solution made: the two clicks were cancelled.");
    }
    if (message.kind === "image_rendered") imageRendered?.(message as { image?: RenderedImage; message?: string });
    if (message.kind === "latest_asked" && opened) void openPlot(opened.item.id);
    if (message.kind === "annotation_drawn") {
      // Drawn on the map: the form, filled in with what was drawn, to name it and add it as one step.
      openAnnotationForm({ spec: { ...(message.annotation as AnnotationSpec), name: "" } });
      drawnUnsaved = !!annotationFrame;
      if (!annotationFrame) showPlot(); // no form (Python not ready): nothing stays drawn
    }
  } else if (name === "annotation") {
    if (message.kind === "cancel") closeSide();
    if (message.kind === "save_annotation" || message.kind === "delete_annotation") {
      if ((message.feature_id as string | undefined) !== annotationShowing?.featureId) return;
      post(annotationFrame, { kind: "form_busy", message: "Saving…" });
      const id = message.feature_id as string | undefined;
      const change =
        message.kind === "delete_annotation"
          ? { kind: "delete", features: [id] }
          : id
            ? { kind: "edit", feature: id, annotation: message.annotation }
            : { kind: "add", annotation: message.annotation };
      void annotate(change).then((problem) => {
        if (problem) return post(annotationFrame, { kind: "form_error", message: problem });
        drawnUnsaved = false; // saved: the map has the plot with it
        closeSide();
      });
    }
  } else if (name === "form") {
    if (message.kind === "cancel") closeForm();
    if (message.kind === "run_tool" && formTool && message.tool_name === formTool.name) {
      post(form, { kind: "form_busy", message: "Running…" });
      void runTool(formTool, message.parameters as ParameterValue[])
        .catch((error: Error) => `${formTool?.title ?? "The tool"} could not run here: ${error.message}`)
        .then((problem) => {
          if (problem) post(form, { kind: "form_error", message: problem });
          else closeForm();
        });
    }
  }
});

// --- Tools ------------------------------------------------------------------------
async function refreshOffered(): Promise<void> {
  if (!listing) return renderTools();
  const kinds = selection.map((id) => features().find((f) => f.id === id)?.properties.kind ?? "");
  offered = await pythonJson<string[]>("offered", JSON.stringify(kinds));
  renderTools();
}

/** The panel beside the map (below it on a narrow screen), with a Close button of its own. */
function showSide(title: string, content: HTMLElement): void {
  closeSide();
  const bar = document.createElement("div");
  bar.className = "side-bar";
  const heading = document.createElement("span");
  heading.textContent = title;
  const close = document.createElement("button");
  close.textContent = "Close";
  close.setAttribute("aria-label", `Close ${title.toLowerCase()}`);
  close.onclick = closeSide;
  bar.append(heading, close);
  $("side-frame").replaceChildren(bar, content);
  $("side-frame").hidden = false;
}
/** The annotation form is naming what was drawn on the map, not yet saved. */
let drawnUnsaved = false;
function closeSide(): void {
  if (drawnUnsaved) {
    // Closed without saving: what was drawn for it goes from the map.
    drawnUnsaved = false;
    showPlot();
  }
  if (fixesShown) showFixesOnMap(undefined); // what the panel had ringed or previewed on the map goes with it
  formTool = undefined;
  form = undefined;
  results = undefined;
  annotationFrame = undefined;
  annotationShowing = undefined;
  ready.delete("form");
  ready.delete("results");
  ready.delete("annotation");
  $("side-frame").replaceChildren();
  $("side-frame").hidden = true;
}

function openForm(tool: ToolDeclaration): void {
  if (!form) {
    const shown = frame("form");
    showSide("Tool", shown);
    form = shown;
  }
  formTool = tool;
  sendForm();
}
function sendForm(): void {
  if (!formTool || !opened) return;
  const range = time?.range;
  const current = time?.current;
  post(form, {
    kind: "show_form",
    tool: formTool,
    selected_names: selectedNames(),
    ...(range && { time_range: range }),
    ...(current && { current_time: current }),
  });
}
function closeForm(): void {
  if (form) closeSide();
}

let pendingResults: (() => void) | undefined;
function showResults(tool: ToolDeclaration, result: ToolResult): void {
  const shown = frame("results");
  showSide("Results", shown);
  results = shown;
  pendingResults = () => post(results, { kind: "show_results", tool, result_title: tool.title, result });
}

// --- The shared flows' host (PAR-09): the playground's dialog, toasts and Python ----------------
const flowHost: FlowHost = {
  ask: (q) => ask(q.text, [...q.choices]),
  message: (severity: Severity, text: string, buttons: readonly string[] = []) => notify(text, severity === "info" ? "info" : "warning", buttons),
  plot: (): PlotRef | undefined =>
    opened && { store: "play", item: opened.item.id, base: opened.base, properties: opened.item.properties, ...(opened.revision && { readOnly: true }) },
  serviceReady: () => pythonReady,
  reloadPlot: async () => {
    if (opened) await openPlot(opened.item.id, true);
    return undefined;
  },
};
/** Python's refusals the flows answer, as they name them. */
const refusalOf = (outcome: { error?: string; conflict?: unknown; newer_schema?: boolean }): Error =>
  outcome.conflict ? new Refusal("conflict", outcome.error!) : outcome.newer_schema ? new Refusal("newer_schema", outcome.error!) : new Error(outcome.error);

/** Run a tool: the shared flow (webview/panels/flows/runtool.ts); this says how Python is asked. */
async function runTool(tool: ToolDeclaration, parameters: ParameterValue[]): Promise<string | undefined> {
  const { problem } = await runToolFlow(
    {
      ...flowHost,
      callTool: async (t, plot, values, options): Promise<ToolCall> => {
        const request = {
          name: t.name,
          selection,
          parameters: values,
          state: time && { time, selection: { plot: plot.item, feature_ids: selection }, viewport: { bbox: opened?.item.bbox ?? [-180, -90, 180, 90] } },
          base: plot.base,
          ...options,
        };
        if (colleagueDuringNextRun && !options.on_conflict) {
          // The colleague's change lands while the tool runs (SUB-28).
          colleagueDuringNextRun = false;
          $<HTMLButtonElement>("colleague-during").textContent = "A colleague changes it while your next tool runs";
          await python("colleague", plot.item, new Date().toISOString(), time?.current ?? null);
        }
        const outcome = await pythonJson<{ result?: ToolResult; changed?: boolean; new_item?: string; error?: string; conflict?: { mergeable: boolean }; newer_schema?: boolean }>("run", plot.item, JSON.stringify(request));
        if (outcome.error) return { ok: false, message: outcome.error, ...(outcome.conflict && { conflict: outcome.conflict }), ...(outcome.newer_schema && { newerSchema: true }) };
        if (outcome.new_item) await refreshPlots(); // the new plot in the list
        return { ok: true, message: "", result: outcome.result, changed: outcome.changed, ...(outcome.new_item && { newItem: outcome.new_item }) };
      },
      openPlot: (_plot, item) => openPlot(item),
      applyToolState: (change, _t, ranOn) => (change.time ? showToolTime(change, ranOn.item) : false),
      showResults: (t, result) => showResults(t, result),
    },
    tool,
    parameters,
  );
  return problem;
}

/**
 * Current time a tool set, as VS Code shows it (CAP-28): outside the saved
 * window it is shown in a window widened or moved to take it in, never saved,
 * and the time controller says so until the reader keeps or reverts it. A
 * tool whose purpose is to set the window has it saved only when run by hand
 * (here, always from its form) on the plot still open. True if current time
 * is outside the saved window.
 */
function showToolTime(change: SharedStateChange, ranOn: string, byHand = true): boolean {
  if (!change.time || !opened) return false;
  const span = (r: TimeRange) => ({ start: Date.parse(r.start), end: Date.parse(r.end) });
  const range = (s: { start: number; end: number }) => ({ start: new Date(s.start).toISOString(), end: new Date(s.end).toISOString() });
  const shown = time?.range ?? change.time.range;
  const period = periodOf(opened.item);
  const here = byHand && opened.item.id === ranOn;
  const placed = placeToolTime(Date.parse(change.time.current), span(change.time.range), {
    saved: span(savedWindow ?? shown),
    shown: span(shown),
    period: period && span(period),
    saveWindow: change.save_window === true,
    byHand: here,
    samePlot: here,
  });
  showTime({ current: change.time.current, range: range(placed.window) });
  post(map, { kind: "set_time", time });
  if (placed.save) void saveWindow(range(placed.window));
  return placed.outside;
}

// --- Colour and hiding: content, so steps in the plot's history (SUB-22) --------------
/** Colour tracks, or hide or show features, as one recorded, undoable step; then show the plot. */
async function restyle(ids: string[], change: { colour: string; colour_name?: string } | { hidden: boolean }, said?: string): Promise<void> {
  if (!opened || !pythonReady || !ids.length) return;
  const outcome = await pythonJson<{ error?: string; notes?: string[] }>("restyle", opened.item.id, JSON.stringify({ base: opened.base, features: ids, ...change }));
  if (outcome.error) toast(outcome.error, "warning");
  // The Outline's toolbar: what was done, counted (product owner, 28 Oct 2026), with what it does to solutions.
  else if (said) toast([said, ...(outcome.notes ?? []).slice(1)].join(". ") + ".");
  // Cuts hidden or shown: what that does to the solutions rooted in them (product owner, 27 Oct 2026).
  else if (outcome.notes && outcome.notes.length > 1) toast(outcome.notes.join(". ") + ".");
  await openPlot(opened.item.id, true);
}
const tracksSelected = () => selection.filter((id) => features().find((f) => f.id === id)?.properties.kind === "track");
// Colour and hiding are on the Outline's toolbar (product owner, 28 Oct 2026): below, after the tree.

// --- Labels, symbols and arrows: how often, per track, one step for all chosen (CAP-32) ---
/**
 * The Frequencies form: a heading, the tracks it is for, and one chooser each for labels,
 * symbols and arrows, showing what the tracks have now ("Mixed (unchanged)" where they
 * differ), the default for arrows, Off and the presets; "Other…" opens a box to type an
 * interval ("90 s", "1h30"), saying what it means. Resolves to the choices, or undefined.
 */
function frequencyForm(tracks: NonNullable<ReturnType<typeof trackOf>>[]): Promise<Partial<Record<Field, FieldState>> | undefined> {
  return new Promise((resolve) => {
    const state = formState(tracks.map((t) => t.properties));
    const dialog = Object.assign(document.createElement("dialog"), { className: "track-form freq-form" });
    dialog.setAttribute("aria-labelledby", "freq-title");
    const form = Object.assign(document.createElement("form"), { method: "dialog" });
    const names = tracks.map((t) => t.properties.name);
    form.append(
      Object.assign(document.createElement("h2"), { id: "freq-title", textContent: "Labels, symbols and arrows" }),
      Object.assign(document.createElement("p"), { className: "detail freq-tracks", textContent: names.join(", "), title: names.join(", ") }),
    );
    const read: Record<string, () => FieldState | { problem: string }> = {};
    for (const field of FIELDS) {
      const row = Object.assign(document.createElement("div"), { className: "freq-row" });
      const id = `freq-${field}`;
      const label = Object.assign(document.createElement("label"), { htmlFor: id, textContent: FIELD_NAMES[field] });
      const select = Object.assign(document.createElement("select"), { id, name: field });
      select.append(...choicesFor(field, state[field]).map((c) => new Option(c.label, c.value)), new Option("Other…", "other"));
      select.value = String(state[field]);
      const other = Object.assign(document.createElement("input"), { type: "text", id: `${id}-other`, autocomplete: "off", placeholder: "such as 90 s or 1h30", hidden: true });
      other.setAttribute("aria-label", `${FIELD_NAMES[field]}: every`);
      const note = Object.assign(document.createElement("span"), { className: "detail form-note", id: `${id}-note` });
      note.setAttribute("aria-live", "polite");
      other.setAttribute("aria-describedby", note.id);
      // Arrows have no All: typed, it is a problem, as any other text that is not an interval.
      const typed = () => {
        const r = readInterval(other.value);
        return r === "all" && !AT_EVERY_FIX.includes(field) ? { problem: ALL_PROBLEM } : r;
      };
      const say = () => {
        const r = typed();
        note.textContent = !other.value.trim() ? "" : typeof r === "object" ? r.problem : r === "off" ? "Means off" : r === "all" ? "Means at every fix" : `Means every ${describeInterval(r)}`;
        note.classList.toggle("problem", typeof r === "object" && !!other.value.trim());
      };
      other.addEventListener("input", say);
      select.addEventListener("change", () => {
        other.hidden = select.value !== "other";
        if (other.hidden) note.textContent = "";
        else other.focus();
      });
      read[field] = () => {
        if (select.value !== "other") return choiceFromValue(select.value);
        return typed();
      };
      row.append(label, select, other, note);
      form.append(row);
    }
    const buttons = Object.assign(document.createElement("div"), { className: "buttons" });
    const go = Object.assign(document.createElement("button"), { type: "submit", className: "primary", textContent: "Apply", value: "go" });
    const cancel = Object.assign(document.createElement("button"), { type: "button", textContent: "Cancel" });
    buttons.append(go, cancel);
    form.append(buttons);
    dialog.append(form);
    document.body.append(dialog);
    let values: Partial<Record<Field, FieldState>> | undefined;
    form.addEventListener("submit", (event) => {
      const chosen: Partial<Record<Field, FieldState>> = {};
      for (const field of FIELDS) {
        const r = read[field]();
        if (typeof r === "object") {
          event.preventDefault();
          const box = document.getElementById(`freq-${field}-other`) as HTMLInputElement;
          const note = document.getElementById(`freq-${field}-note`)!;
          note.textContent = r.problem;
          note.classList.add("problem");
          box.focus();
          return;
        }
        chosen[field] = r;
      }
      values = chosen;
    });
    cancel.onclick = () => dialog.close();
    dialog.onclose = () => {
      dialog.remove();
      resolve(values);
    };
    dialog.showModal();
  });
}
async function setTrackFrequencies(): Promise<void> {
  const ids = tracksSelected();
  if (!ids.length) return toast("Select one or more tracks: Ctrl-click to add one.", "warning");
  const tracks = ids.map(trackOf).filter((t): t is NonNullable<ReturnType<typeof trackOf>> => !!t);
  const chosen = await frequencyForm(tracks);
  if (!chosen || !opened || !pythonReady) return;
  const changes = changesOf(tracks.map((t) => t.properties), chosen);
  if (!Object.keys(changes).length) return; // nothing changed: no step
  const outcome = await pythonJson<{ error?: string }>("frequencies", opened.item.id, JSON.stringify({ base: opened.base, features: ids, ...changes }));
  if (outcome.error) toast(outcome.error, "warning");
  else status(describeChanges(changes, tracks.map((t) => t.properties.name)));
  await openPlot(opened.item.id, true);
}

// --- Annotations: made, changed and deleted by hand, each a step (CAP-03 to CAP-05) ----
/** What the annotation form shows: a new annotation (no featureId), or the one being changed. */
let annotationShowing: { spec?: AnnotationSpec; featureId?: string } | undefined;
type Annotation = Extract<Feature, { properties: { kind: "annotation" } }>;
const annotationById = (id: string | undefined) => {
  const feature = features().find((f) => f.id === id);
  return feature && feature.properties.kind === "annotation" && !feature.properties.furniture ? (feature as Annotation) : undefined;
};
const selectedAnnotations = () => selection.filter((id) => annotationById(id));

function openAnnotationForm(showing: { spec?: AnnotationSpec; featureId?: string }): void {
  if (!pythonReady) return toast("Annotations can be added once Python is ready.", "warning");
  annotationShowing = showing;
  if (!annotationFrame) {
    const shown = frame("annotation");
    showSide(showing.featureId ? "Annotation" : "Add annotation", shown);
    annotationFrame = shown;
    annotationShowing = showing; // showSide closed whatever was beside the map
  }
  sendAnnotationForm();
}
function sendAnnotationForm(): void {
  if (!annotationShowing) return;
  const { spec, featureId } = annotationShowing;
  const period = opened && periodOf(opened.item);
  post(annotationFrame, {
    kind: "show_annotation_form",
    ...(spec && { annotation: spec }),
    ...(featureId && { feature_id: featureId }),
    ...(period && { time_range: period }),
    ...(time && { current_time: time.current }),
  });
}
/** The area the map shows, as it last said: a new annotation starts in its middle. */
let viewport: number[] | undefined;
/** A new annotation starts as a circle, in the middle of the map. */
function addAnnotation(): void {
  const bbox = viewport ?? opened?.item.bbox;
  const centre: [number, number] | undefined = bbox?.length === 4 ? [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2] : undefined;
  openAnnotationForm({ spec: centre ? { shape: "circle", name: "", positions: [centre] } : undefined });
}
function editAnnotation(id = selectedAnnotations()[0]): void {
  const feature = annotationById(id);
  if (!feature) return toast("Select an annotation to change.", "warning");
  void select([feature.id]);
  openAnnotationForm({ spec: specOfFeature(feature), featureId: feature.id });
}
/** Add, change or delete annotations, or show or remove the north arrow, as debrief/add_annotation and the rest do. */
async function annotate(change: Record<string, unknown>): Promise<string | undefined> {
  if (!opened || !pythonReady) return "Open a plot first.";
  const outcome = await pythonJson<{ error?: string; feature?: string }>("annotate", opened.item.id, JSON.stringify({ base: opened.base, change }));
  if (outcome.error) return outcome.error;
  await openPlot(opened.item.id, true);
  if (outcome.feature) await select([outcome.feature]);
  return undefined;
}
const hasNorthArrow = () => !!opened?.plot.features.some((f) => f.properties.kind === "annotation" && f.properties.furniture === "north_arrow");
function deleteAnnotations(): void {
  const ids = selectedAnnotations();
  if (!ids.length) return toast("Select the annotations to delete.", "warning");
  void annotate({ kind: "delete", features: ids }).then((problem) => problem && toast(problem, "warning"));
}
function toggleNorthArrow(): void {
  void annotate({ kind: "north_arrow", shown: !hasNorthArrow() }).then((problem) => problem && toast(problem, "warning"));
}

// --- Tracks: moved, rotated, split and merged, each a step (CAP-01, CAP-02) -----------
/** Move, rotate, split or merge tracks, as debrief/edit_track and the rest do; then show the plot, the new tracks selected. */
async function changeTrack(change: Record<string, unknown>, confirm?: (message: string) => Promise<boolean>): Promise<string | undefined> {
  if (!opened || !pythonReady) return "Open a plot first.";
  const send = (sent: Record<string, unknown>) => pythonJson<{ error?: string; confirm?: boolean; feature?: string; features?: string[] }>("track", opened!.item.id, JSON.stringify({ base: opened!.base, change: sent }));
  let outcome = await send(change);
  // A change that would lose what the reader made: with confirm, asked, and sent again confirming.
  if (outcome.confirm && confirm && outcome.error) {
    if (!(await confirm(outcome.error))) return undefined;
    outcome = await send({ ...change, edit: { ...(change.edit as object), discard_dr_changes: true } });
  }
  if (outcome.error) return outcome.error;
  await openPlot(opened.item.id, true);
  if (outcome.features) await select(outcome.features);
  else if (outcome.feature) await select([outcome.feature]);
  return undefined;
}
const trackOf = (id: string | undefined) => {
  const feature = features().find((f) => f.id === id);
  return feature?.properties.kind === "track" ? (feature as Extract<Feature, { properties: { kind: "track" } }>) : undefined;
};
/** The one track selected, or say why there isn't one. */
function oneTrack(verb: string): ReturnType<typeof trackOf> {
  const ids = tracksSelected();
  if (ids.length !== 1) {
    toast(`Select one track to ${verb}.`, "warning");
    return undefined;
  }
  return trackOf(ids[0]);
}

interface FormField {
  id: string;
  label: string;
  value?: string;
  /** Shown in an empty text box, such as "such as 300 m". */
  placeholder?: string;
  options?: { value: string; label: string }[];
  /** What the text means, or what is wrong with it. */
  read?: (text: string) => { means: string } | { problem: string };
  /** The label and the value offered, from the choices made so far: worked out again when a choice changes, the value only while it is still the one offered. */
  follow?: (values: Record<string, string>) => { label: string; value: string };
  /** A box to tick, beside its label: its value is "yes" when ticked, else "". */
  check?: boolean;
}
/**
 * A small form in a dialog: each field says, beneath it, what it understood or what is wrong; nothing is sent until all are right. Resolves to the values, or undefined for Cancel.
 * warning, above the fields, is a warning (a red bar); { info } only explains (the neutral bar an information toast has); { warning, info } is both, the warning first.
 */
function trackForm(title: string, action: string, fields: FormField[], warning?: string | { info?: string; ready?: boolean; warning?: string }): Promise<Record<string, string> | undefined> {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "track-form";
    dialog.setAttribute("aria-label", title);
    const form = document.createElement("form");
    form.method = "dialog";
    const heading = Object.assign(document.createElement("h2"), { textContent: title });
    form.append(heading);
    if (typeof warning === "string") form.append(Object.assign(document.createElement("p"), { className: "form-warning", textContent: warning }));
    else if (warning) {
      if (warning.warning) form.append(Object.assign(document.createElement("p"), { className: "form-warning", textContent: warning.warning }));
      if (warning.info) form.append(Object.assign(document.createElement("p"), { className: "form-info", textContent: warning.info }));
    }
    const notes = new Map<string, HTMLElement>();
    const following: (() => void)[] = [];
    const valueOf = (element: HTMLInputElement | null) => (element?.type === "checkbox" ? (element.checked ? "yes" : "") : (element?.value ?? ""));
    const chosen = () => Object.fromEntries(fields.map((f) => [f.id, valueOf(form.elements.namedItem(f.id) as HTMLInputElement | null)]));
    for (const field of fields) {
      const row = document.createElement("label");
      row.className = field.check ? "form-row form-check" : "form-row";
      const label = Object.assign(document.createElement("span"), { textContent: field.label });
      if (!field.check) row.append(label);
      let input: HTMLInputElement | HTMLSelectElement;
      if (field.check) {
        input = Object.assign(document.createElement("input"), { type: "checkbox", checked: field.value === "yes" });
        row.append(input, label);
      } else if (field.options) {
        input = document.createElement("select");
        input.append(...field.options.map((o) => new Option(o.label, o.value)));
      } else {
        input = Object.assign(document.createElement("input"), { type: "text", autocomplete: "off", ...(field.placeholder && { placeholder: field.placeholder }) });
      }
      input.name = field.id;
      input.id = `track-form-${field.id}`;
      if (field.value !== undefined && !field.check) input.value = field.value;
      const note = Object.assign(document.createElement("span"), { className: "detail form-note" });
      note.id = `${input.id}-note`;
      note.setAttribute("aria-live", "polite");
      input.setAttribute("aria-describedby", note.id);
      notes.set(field.id, note);
      const say = () => {
        if (!field.read) return true;
        const read = field.read(input.value);
        note.textContent = "means" in read ? `Means ${read.means}` : read.problem;
        note.classList.toggle("problem", "problem" in read);
        return "means" in read;
      };
      input.addEventListener("input", say);
      if (input.value) say();
      if (field.follow) {
        const follow = field.follow;
        let offered = input.value;
        following.push(() => {
          const now = follow(chosen());
          label.textContent = now.label;
          if (input.value === offered) input.value = now.value;
          offered = now.value;
          say();
        });
      }
      if (field.options) input.addEventListener("change", () => following.forEach((f) => f()));
      if (field.check) row.append(note);
      else row.append(input, note);
      form.append(row);
    }
    following.forEach((f) => f());
    const buttons = document.createElement("div");
    buttons.className = "buttons";
    const go = Object.assign(document.createElement("button"), { type: "submit", className: "primary", textContent: action, value: "go" });
    const cancel = Object.assign(document.createElement("button"), { type: "button", textContent: "Cancel" });
    buttons.append(go, cancel);
    form.append(buttons);
    dialog.append(form);
    document.body.append(dialog);
    let values: Record<string, string> | undefined;
    form.addEventListener("submit", (event) => {
      const data = chosen();
      const wrong = fields.filter((f) => f.read && "problem" in f.read(data[f.id] ?? ""));
      if (wrong.length) {
        event.preventDefault();
        for (const f of wrong) {
          const read = f.read!(data[f.id] ?? "");
          notes.get(f.id)!.textContent = "problem" in read ? read.problem : "";
          notes.get(f.id)!.classList.add("problem");
        }
        (form.elements.namedItem(wrong[0].id) as HTMLElement | null)?.focus();
        return;
      }
      values = data;
    });
    cancel.onclick = () => dialog.close();
    dialog.onclose = () => {
      dialog.remove();
      resolve(values);
    };
    dialog.showModal();
    // Answers offered from last time: the action has the keyboard, so Enter confirms them.
    if (typeof warning === "object" && warning.ready) go.focus();
  });
}
const shown = (read: { problem: string } | number | { value: number; unit: string }, means: () => string) => (typeof read === "object" && "problem" in read ? read : { means: means() });
/** A TMA solution's leg that current time is in, once it is split into legs: This leg, as the map's drags take it at first. */
function legOfTrack(track: NonNullable<ReturnType<typeof trackOf>> | undefined) {
  const tma = track && (track.properties as { tma?: { leg_starts?: string[] | null } }).tma;
  return tma ? legExtent(track.properties.times, tma.leg_starts, time ? Date.parse(time.current) : undefined) : undefined;
}
/** The choice of what moves or turns: the whole track, its fixes in the time window, or, for a TMA solution split into legs, the leg current time is in. */
function extentField(track?: NonNullable<ReturnType<typeof trackOf>>): FormField {
  const window = time?.range;
  const leg = legOfTrack(track);
  return {
    id: "extent",
    label: "What changes",
    options: [
      { value: "whole", label: "Whole track" },
      ...(leg ? [{ value: "leg", label: `This leg: leg ${leg.leg} of ${leg.legs}, ${describeTimes(leg.period.start, leg.period.end)}, the one current time is in` }] : []),
      ...(window ? [{ value: "window", label: `Fixes in the time window, ${describeTimes(window.start, window.end)}` }] : []),
    ],
  };
}
const windowPeriod = (extent: string, track?: NonNullable<ReturnType<typeof trackOf>>) => (extent === "window" && time ? time.range : extent === "leg" ? legOfTrack(track)?.period : undefined);

async function moveTrack(): Promise<void> {
  const track = oneTrack("move");
  if (!track) return;
  const values = await trackForm(`Move ${track.properties.name}`, "Move", [
    extentField(track),
    { id: "distance", label: "Distance", value: "", read: (t) => shown(readDistance(t), () => describeDistance(readDistance(t) as { value: number; unit: string })) },
    { id: "bearing", label: "Bearing, true", value: "", read: (t) => shown(readBearing(t), () => formatBearing({ value: readBearing(t) as number, unit: "deg" })) },
  ]);
  if (!values) return;
  const period = windowPeriod(values.extent, track);
  const edit = { action: "move", distance: readDistance(values.distance), bearing: { value: readBearing(values.bearing), unit: "deg" }, ...(period && { period }) };
  const problem = await changeTrack({ kind: "edit", feature: track.id, edit });
  if (problem) toast(problem, "warning");
}
async function rotateTrack(): Promise<void> {
  const track = oneTrack("rotate");
  if (!track) return;
  const values = await trackForm(`Rotate ${track.properties.name}`, "Rotate", [
    extentField(track),
    {
      id: "pivot",
      label: "About",
      options: [
        { value: "default", label: "The fix nearest current time (or the first fix)" },
        { value: "first", label: "The first fix" },
        { value: "last", label: "The last fix" },
      ],
    },
    { id: "angle", label: "Angle, degrees (positive is clockwise)", value: "", read: (t) => shown(readTurn(t), () => describeTurn(readTurn(t) as number)) },
  ]);
  if (!values) return;
  const period = windowPeriod(values.extent, track);
  const times = track.properties.times.map(Date.parse);
  const indices = periodIndices(times, period && { start: Date.parse(period.start), end: Date.parse(period.end) });
  if (!indices.length) return toast(`${track.properties.name} has no fixes in the time window, so nothing was rotated.`, "warning");
  const index =
    values.pivot === "first" ? indices[0] : values.pivot === "last" ? indices[indices.length - 1] : defaultPivotIndex(times, indices, time ? Date.parse(time.current) : undefined);
  const edit = { action: "rotate", angle: { value: readTurn(values.angle), unit: "deg" }, pivot: track.geometry.coordinates[index], ...(period && { period }) };
  const problem = await changeTrack({ kind: "edit", feature: track.id, edit });
  if (problem) toast(problem, "warning");
}
/** What the track, or its fixes in the time window, makes good now: as the form offers it when that is chosen. */
function legChosen(track: NonNullable<ReturnType<typeof trackOf>>, extent: string): NonNullable<ReturnType<typeof legNow>> | undefined {
  const times = track.properties.times.map(Date.parse);
  const period = windowPeriod(extent, track);
  return legNow(track.geometry.coordinates as [number, number][], times, periodIndices(times, period && { start: Date.parse(period.start), end: Date.parse(period.end) }));
}
/** What a shear or a stretch holds, and what the track makes good now; or say why it cannot be done. */
function heldFields(track: NonNullable<ReturnType<typeof trackOf>>, verb: string): FormField[] | undefined {
  if (!legChosen(track, "whole")) {
    toast(`${track.properties.name} has fixes at only one time, so it cannot be ${verb}.`, "warning");
    return undefined;
  }
  const anchor: FormField = {
    id: "anchor",
    label: "Which end stays where it is",
    options: [
      { value: "start", label: "Hold the start; the end moves" },
      { value: "end", label: "Hold the end; the start moves" },
    ],
  };
  return [extentField(track), anchor];
}
/** The course or the speed made good, offered as it is now for what is chosen to change. */
function madeGood(track: NonNullable<ReturnType<typeof trackOf>>, id: "course" | "speed", label: string, read: FormField["read"]): FormField {
  return {
    id,
    label,
    read,
    follow: (values) => {
      const now = legChosen(track, values.extent);
      if (!now) return { label: `${label} (its fixes there are at only one time)`, value: "" };
      const [course, ...speed] = now.said.split(" ");
      return { label: `${label} (now ${id === "course" ? course : speed.join(" ")})`, value: now[id] };
    },
  };
}
const courseField = (track: NonNullable<ReturnType<typeof trackOf>>) =>
  madeGood(track, "course", "Course made good, true", (t) => shown(readBearing(t), () => formatBearing({ value: readBearing(t) as number, unit: "deg" })));
const speedField = (track: NonNullable<ReturnType<typeof trackOf>>, positive: boolean) =>
  madeGood(track, "speed", "Speed made good", (t) => shown(readSpeed(t, undefined, positive), () => describeSpeed(readSpeed(t) as { value: number; unit: string })));
async function shearTrack(): Promise<void> {
  const track = oneTrack("shear");
  const held = track && heldFields(track, "sheared");
  if (!track || !held) return;
  const values = await trackForm(`Shear ${track.properties.name}`, "Shear", [...held, courseField(track), speedField(track, false)]);
  if (!values) return;
  const period = windowPeriod(values.extent, track);
  const edit = { action: "shear", anchor: values.anchor, course: { value: readBearing(values.course), unit: "deg" }, speed: readSpeed(values.speed), ...(period && { period }) };
  const problem = await changeTrack({ kind: "edit", feature: track.id, edit });
  if (problem) toast(problem, "warning");
}
async function stretchTrack(): Promise<void> {
  const track = oneTrack("stretch");
  const held = track && heldFields(track, "stretched");
  if (!track || !held) return;
  const values = await trackForm(`Stretch ${track.properties.name}`, "Stretch", [...held, speedField(track, true)]);
  if (!values) return;
  const period = windowPeriod(values.extent, track);
  const edit = { action: "stretch", anchor: values.anchor, speed: readSpeed(values.speed, undefined, true), ...(period && { period }) };
  const problem = await changeTrack({ kind: "edit", feature: track.id, edit });
  if (problem) toast(problem, "warning");
}
async function plottingMode(): Promise<void> {
  const track = oneTrack("plot over the ground or by dead reckoning");
  if (!track) return;
  const name = track.properties.name;
  const now = (track.properties.plotting_mode as PlottingMode | undefined) ?? "otg";
  const values = await trackForm(
    `How is ${name} plotted?`,
    "Plot",
    [{ id: "mode", label: "Plotted", value: now, options: (["otg", "dr"] as const).map((m) => ({ value: m, label: `${MODE_LABELS[m]}${m === now ? ", as now" : ""}` })) }],
    { info: "By dead reckoning, the first fix stays and each fix after it is placed from the one before by that fix's recorded course and speed; its positions as logged are kept, and over the ground puts them back. One step; Undo takes it back." },
  );
  if (!values || values.mode === now) return;
  // Over the ground after a change made while plotted by dead reckoning loses that change (decision, product
  // owner, 14 Oct 2026): the form says so, and the reader confirms first.
  const confirmLoss = async (message: string) => !!(await trackForm(`Plot ${name} over the ground?`, "Plot over the ground", [], message));
  const problem = await changeTrack({ kind: "edit", feature: track.id, edit: { action: "set_plotting_mode", plotting_mode: values.mode } }, confirmLoss);
  if (problem) toast(problem, "warning");
}
async function splitTrack(): Promise<void> {
  const track = oneTrack("split");
  if (!track || !time) return;
  const at = time.current;
  const name = track.properties.name;
  const named = (t: string) => (t.trim() ? { means: `named ${t.trim()}` } : { problem: "Give the part a name." });
  const values = await trackForm(`Split ${name} at ${describeTimes(at)}`, "Split", [
    { id: "first", label: `Part before ${describeTimes(at)}`, value: `${name} (1)`, read: named },
    { id: "second", label: `Part from ${describeTimes(at)} on`, value: `${name} (2)`, read: named },
  ]);
  if (!values) return;
  const problem = await changeTrack({ kind: "split", feature: track.id, at, names: [values.first.trim(), values.second.trim()] });
  if (problem) toast(problem, "warning");
}
async function mergeTracks(): Promise<void> {
  const ids = tracksSelected();
  if (ids.length < 2) return toast("Select two or more tracks to merge: Ctrl-click to add one.", "warning");
  // The name, offered as the earliest's (or the split track's, for its parts); and, before anything is lost, what would be.
  const { ordered, lost } = mergePlan(ids.map(trackOf).filter((t): t is NonNullable<ReturnType<typeof trackOf>> => !!t));
  const named = (t: string) => (t.trim() ? { means: `named ${t.trim()}` } : { problem: "Give the merged track a name." });
  const values = await trackForm(
    `Merge ${ordered.map((t) => t.properties.name).join(", ")}`,
    lost.length ? "Merge anyway" : "Merge",
    [{ id: "name", label: "Name for the merged track", value: mergedName(ordered.map((t) => t.properties.name)), read: named }],
    lost.length ? `Only what every track has is kept. ${lost.join(". ")}. Undo puts them back.` : undefined,
  );
  if (!values) return;
  const problem = await changeTrack({ kind: "merge", features: ids, name: values.name.trim() });
  if (problem) toast(problem, "warning");
}

// --- Cleaning tracks: jumps, smoothing and marked fixes (CAP-01, EXT-14) -------------
/** Find jumps or preview smoothing (nothing changes), or remove jumps, smooth or mark a fix (one step each), as the tool service does. */
async function clean<T = Record<string, unknown>>(change: Record<string, unknown>, reading = false): Promise<T & { error?: string }> {
  if (!opened || !pythonReady) return { error: "Open a plot first." } as T & { error?: string };
  const outcome = await pythonJson<T & { error?: string }>("clean", opened.item.id, JSON.stringify({ base: opened.base, change }));
  if (!outcome.error && !reading) await openPlot(opened.item.id, true);
  return outcome;
}
/** Whether the map has fixes ringed, or a change previewed, for the panel beside it. */
let fixesShown = false;
function showFixesOnMap(shown?: { feature_id: string; fix_times?: string[]; preview?: unknown; message?: string }): void {
  fixesShown = !!shown;
  post(map, shown ? { kind: "show_fixes", ...shown } : { kind: "show_fixes" });
}
/** A panel beside the map: a line of text, then what follows. */
function panel(lead: string, ...content: HTMLElement[]): HTMLElement {
  const box = document.createElement("div");
  box.className = "omitted-panel clean-panel";
  const p = Object.assign(document.createElement("p"), { textContent: lead });
  p.setAttribute("role", "status");
  box.append(p, ...content);
  return box;
}
const button = (text: string, primary = false) => Object.assign(document.createElement("button"), { type: "button", textContent: text, className: primary ? "primary" : "" });

// "Jumps…": the threshold, offered as the track's default; then the jumps found, ringed on the map and listed
// beside it, all ticked; Remove takes out those still ticked, as one step. Nothing is ever removed unseen.
async function findJumps(): Promise<void> {
  const track = oneTrack("find jumps in");
  if (!track) return;
  const name = track.properties.name;
  type Found = { threshold: { value: number; unit: string }; median_speed: { value: number; unit: string } | null; jumps: Jump[] };
  let found = await clean<Found>({ kind: "find_jumps", feature: track.id }, true);
  if (found.error) return toast(found.error, "warning");
  const median = found.median_speed ? `Offered: three times ${name}'s median speed of ${formatQuantity(found.median_speed)}, at least 10 kn.` : "Offered: at least 10 kn.";
  const values = await trackForm(`Find jumps in ${name}`, "Find", [
    {
      id: "threshold",
      label: `A fix is a jump when reaching it needs more than this speed. ${median}`,
      value: formatQuantity(found.threshold),
      read: (t) => {
        const read = readThreshold(t);
        return "problem" in read ? read : { means: `faster than ${formatQuantity(read)} to reach` };
      },
    },
  ]);
  if (!values) return;
  const threshold = readThreshold(values.threshold) as { value: number; unit: string };
  if (threshold.value !== found.threshold.value || threshold.unit !== found.threshold.unit) {
    found = await clean<Found>({ kind: "find_jumps", feature: track.id, threshold }, true);
    if (found.error) return toast(found.error, "warning");
  }
  const dr = isDeadReckoned(track.properties);
  const said = jumpsFound(dr ? `${name} (${DR_TAG})` : name, found.jumps.length, found.threshold, undefined, dr);
  if (!found.jumps.length) return toast(said);
  const list = document.createElement("ul");
  list.className = "jump-list";
  list.setAttribute("aria-label", `Jumps found in ${name}: untick any that are real`);
  const boxes = found.jumps.map((jump) => {
    const { label, description } = describeJump(jump);
    const row = document.createElement("li");
    const box = Object.assign(document.createElement("input"), { type: "checkbox", checked: true, value: jump.time });
    const text = Object.assign(document.createElement("label"), { textContent: ` ${label} ` });
    text.prepend(box);
    text.append(Object.assign(document.createElement("span"), { className: "detail", textContent: description }));
    row.append(text);
    list.append(row);
    return box;
  });
  const remove = button("", true);
  const cancel = button("Cancel");
  const ticked = () => boxes.filter((b) => b.checked).map((b) => b.value);
  const say = () => {
    const n = ticked().length;
    remove.textContent = n ? `Remove ${n} jump${n === 1 ? "" : "s"}` : "Remove";
    remove.disabled = !n;
    showFixesOnMap({ feature_id: track.id, fix_times: ticked(), message: said });
  };
  boxes.forEach((b) => (b.onchange = say));
  const actions = document.createElement("div");
  actions.className = "buttons";
  actions.append(remove, cancel);
  showSide("Jumps", panel(`${said} Untick any that are real; Remove takes out the rest as one step, and Undo puts them back.`, list, actions));
  say();
  cancel.onclick = closeSide;
  remove.onclick = async () => {
    remove.disabled = true;
    const outcome = await clean({ kind: "remove_jumps", feature: track.id, times: ticked(), threshold: found.threshold });
    if (outcome.error) {
      remove.disabled = false;
      return toast(outcome.error, "warning");
    }
    // Only this panel: the next walkthrough step's button, in sight beside the map, may have opened another meanwhile.
    if ($("side-frame").contains(remove)) closeSide();
  };
}

// "Smooth…": what to smooth and over how many fixes; then the track as smoothing would leave it, dashed on
// the map, with how far fixes would move; Apply makes it one step.
async function smoothTrack(): Promise<void> {
  const track = oneTrack("smooth");
  if (!track) return;
  const name = track.properties.name;
  const values = await trackForm(`Smooth ${name}`, "Preview", [
    extentField(),
    {
      id: "window",
      label: "Over how many fixes (an odd number). The first and last fixes of what is smoothed stay where they are; times never change.",
      value: "5",
      read: (t) => {
        const read = readWindow(t);
        return typeof read === "number" ? { means: describeWindow(read) } : read;
      },
    },
  ]);
  if (!values) return;
  const window = readWindow(values.window) as number;
  const period = windowPeriod(values.extent);
  const change = { feature: track.id, window, ...(period && { period }) };
  const preview = await clean<{ preview: { coordinates: number[][] }; moved: number; summary: string }>({ kind: "preview_smoothing", ...change }, true);
  if (preview.error) return toast(preview.error, "warning");
  if (!preview.moved) return toast(`${name}: no fix would move, so there is nothing to smooth.`);
  const note = smoothingNote(name, window, preview.summary);
  const apply = button("Apply", true);
  const cancel = button("Cancel");
  const actions = document.createElement("div");
  actions.className = "buttons";
  actions.append(apply, cancel);
  showSide("Smoothing", panel(`${note} The dashed line on the map shows the track as smoothing would leave it. Apply makes it one step; Undo puts it back.`, actions));
  showFixesOnMap({ feature_id: track.id, fix_times: [], preview: { type: "LineString", coordinates: preview.preview.coordinates }, message: note });
  cancel.onclick = closeSide;
  apply.onclick = async () => {
    apply.disabled = true;
    const outcome = await clean({ kind: "smooth", ...change });
    if (outcome.error) {
      apply.disabled = false;
      return toast(outcome.error, "warning");
    }
    // Only this panel: the next walkthrough step's button, in sight beside the map, may have opened another meanwhile.
    if ($("side-frame").contains(apply)) closeSide();
  };
}

// "Fixes…": the selected track's fixes, in time order; choose one (it is ringed on the map), then
// colour, label or comment on it, each one step. A right-click on a fix on the map opens it here.
const colourName = (colour: string) => FIX_COLOURS.find((c) => c.colour === colour)?.name.toLowerCase();
function listFixes(): void {
  const track = oneTrack("list the fixes of");
  if (track) void openFixes(track.id);
}
async function openFixes(trackId: string, time?: string): Promise<void> {
  const track = trackOf(trackId);
  if (!track) return;
  if (!selection.includes(trackId) || selection.length !== 1) await select([trackId]);
  const name = track.properties.name;
  const rows = fixRows(track, undefined, colourName);
  let chosen = time ?? rows[0]?.time;
  const list = document.createElement("ul");
  list.className = "list fix-list";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", `Fixes of ${name}`);
  const actions = document.createElement("div");
  actions.className = "fix-actions";
  const render = () => {
    list.querySelectorAll("li").forEach((li) => {
      const on = li.dataset.time === chosen;
      li.classList.toggle("selected", on);
      li.setAttribute("aria-selected", String(on));
    });
    const mark = chosen ? markAt(track, chosen) : undefined;
    const when = chosen ? describeTimes(chosen) : "";
    const colour = document.createElement("select");
    colour.setAttribute("aria-label", `Colour of the fix at ${when}`);
    colour.append(new Option(mark?.colour ? `Colour: ${colourName(mark.colour) ?? mark.colour}` : "Colour…", ""), ...FIX_COLOURS.map((c) => new Option(c.name, c.colour)));
    if (mark?.colour) colour.append(new Option("Track's colour", "none"));
    colour.onchange = () => {
      const picked = colour.value;
      if (!picked) return;
      const named = FIX_COLOURS.find((c) => c.colour === picked);
      void markFix(track.id, chosen!, picked === "none" ? { colour: null } : { colour: picked }, named?.name.toLowerCase());
    };
    const text = (member: "label" | "comment") => {
      const b = button(member === "label" ? "Label…" : "Comment…");
      b.onclick = async () => {
        const values = await trackForm(`${member === "label" ? "Label" : "Comment"} for the fix of ${name} at ${when}`, "Save", [
          { id: "text", label: member === "label" ? "Drawn on the map beside the fix; empty removes it" : "Shown when you point at the fix, and in the Timeline; empty removes it", value: mark?.[member] ?? "" },
        ]);
        if (values) void markFix(track.id, chosen!, { [member]: values.text.trim() || null });
      };
      return b;
    };
    const said = Object.assign(document.createElement("div"), { className: "detail", textContent: describeMark(mark, colourName) || "No colour, label or comment of its own." });
    const move = button("Move…");
    move.id = "move-fix";
    move.title = "Move this fix alone to a position you type; or drag its ring on the map, zoomed in";
    move.onclick = () => void moveFix(track.id, chosen!);
    // Force on only (decision, product owner, 15 Oct 2026): this fix always shows its time label, or its symbol, whatever the track's intervals.
    const forced = (member: "show_label" | "show_symbol", words: string) => {
      const b = button(words);
      b.className = "toggle";
      b.setAttribute("aria-pressed", String(!!mark?.[member]));
      b.title = `Always show this fix's ${words.toLowerCase()}, whatever the track's interval, at any zoom`;
      b.onclick = () => void markFix(track.id, chosen!, { [member]: !mark?.[member] });
      return b;
    };
    actions.replaceChildren(Object.assign(document.createElement("div"), { className: "fix-chosen", textContent: `Fix at ${when}` }), said, colour, text("label"), text("comment"), forced("show_label", "Time label"), forced("show_symbol", "Symbol"), move);
    if (chosen) showFixesOnMap({ feature_id: track.id, fix_times: [chosen] });
  };
  list.replaceChildren(
    ...rows.map((row) => {
      const li = document.createElement("li");
      li.dataset.time = row.time;
      li.tabIndex = 0;
      li.setAttribute("role", "option");
      li.innerHTML = `<span class="name"></span> <span class="detail"></span>`;
      li.querySelector(".name")!.textContent = row.label;
      li.querySelector(".detail")!.textContent = [row.description, row.mark].filter(Boolean).join(" · ");
      const choose = () => {
        chosen = row.time;
        render();
      };
      li.onclick = choose;
      li.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          choose();
        } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const next = (e.key === "ArrowDown" ? li.nextElementSibling : li.previousElementSibling) as HTMLElement | null;
          next?.focus();
        }
      };
      return li;
    }),
  );
  showSide(`Fixes of ${name}`, panel("Choose a fix to colour, label, comment on or move: each change is one step. Right-click a fix on the map to choose it there.", actions, list));
  render();
  list.querySelector<HTMLElement>(`li[data-time="${CSS.escape(chosen ?? "")}"]`)?.scrollIntoView({ block: "nearest" });
}
/** "Move…" in the fix list: where the fix goes, typed in any notation Debrief reads, saying how far, which way and the speeds it implies; one step. */
async function moveFix(trackId: string, time: string): Promise<void> {
  const track = trackOf(trackId);
  if (!track) return;
  const name = track.properties.name;
  const index = fixIndexAt(track.properties.times, time);
  if (index < 0) return toast(`${name} has no fix at ${describeTimes(time)}.`, "warning");
  const positions = track.geometry.coordinates as [number, number][];
  const times = track.properties.times.map(Date.parse);
  const jump = jumpSpeed(positions, times);
  const here = positions[index];
  const read = (text: string): { means: string } | { problem: string } => {
    try {
      const p = parsePosition(text);
      const to: [number, number] = [p.longitude, p.latitude];
      return { means: `${formatPosition(p)}. ${fixMeans(name, positions, times, index, to, jump, reckoningOf(track.properties))}` };
    } catch (error) {
      return { problem: (error as Error).message };
    }
  };
  const values = await trackForm(`Move the fix of ${name} at ${describeTimes(time)}`, "Move", [
    { id: "position", label: reckoningOf(track.properties) ? FIX_PROMPT_DR : FIX_PROMPT, value: formatPosition({ longitude: here[0], latitude: here[1] }), read },
  ]);
  if (!values) return;
  const p = parsePosition(values.position);
  const problem = await changeTrack({ kind: "edit", feature: trackId, edit: fixToEdit(track.properties.times[index], [p.longitude, p.latitude]) });
  if (problem) toast(problem, "warning");
  await openFixes(trackId, time);
}
async function markFix(trackId: string, time: string, changes: Record<string, string | boolean | null>, colourName?: string): Promise<void> {
  const outcome = await clean({ kind: "mark", feature: trackId, time, changes, ...(colourName && { colour_name: colourName }) });
  if (outcome.error) toast(outcome.error, "warning");
  await openFixes(trackId, time); // the list again, saying the fix's new mark
}

// --- The Timeline: narrative, notes and periods in time order (CAP-05, CAP-20) -------
/** Where the reader's Timeline filter is kept: this browser, every read and write guarded. */
const TIMELINE_FILTER_KEY = "debrief.play.timelineFilter";
const timelineMemory = {
  load: () => {
    try {
      const text = window.localStorage.getItem(TIMELINE_FILTER_KEY);
      return text ? JSON.parse(text) : undefined;
    } catch {
      return undefined;
    }
  },
  save: (value: unknown) => {
    try {
      window.localStorage.setItem(TIMELINE_FILTER_KEY, JSON.stringify(value));
    } catch {
      // Not remembered: the filter still applies on this visit.
    }
  },
};
let timelineIds = new Map<string, string>();
const timelineControl = new TimelineControl(
  $("timeline"),
  {
    choose: (id) => goToTime(id),
    save: (spec, id) => void saveNarrative(spec, id),
    remove: (id) => void narrate({ kind: "delete", features: [id] }).then((outcome) => outcome.error && toast(outcome.error, "warning")),
    // The map's narrative box: the plot's choice, in its island like the Tote's lines; left out when on.
    narrativeOnMap: (on) => void saveView({ narrative_on_map: on ? undefined : false }),
    // Ctrl+Z outside the Timeline's text boxes, decided by the Timeline as in VS Code.
    history: (how) => void move(how),
  },
  undefined,
  // The web demo keeps the kinds shown and the view's own settings, never sources, types or
  // phrases, which come from what was opened (panel review, 17 Oct 2026); an embedded demo, nothing.
  params.has("panels") ? undefined : demo ? { load: timelineMemory.load, save: (value: unknown) => timelineMemory.save(contentFree(value)) } : timelineMemory,
);
(window as unknown as { debriefTimeline: () => unknown }).debriefTimeline = () => ({ ...timelineControl.state, drawTimes: timelineControl.drawTimes.slice(-20) });
let narrativeOnMap = new NarrativeOnMap([]);
let narrativeShown: string | undefined;
function renderTimeline(): void {
  const entries = opened ? timelineEntries(opened.plot) : [];
  timelineIds = new Map(entries.map((e) => [e.id, e.start]));
  narrativeOnMap = new NarrativeOnMap(entries);
  timelineControl.show(
    opened ? { entries, tracks: timelineTracks(opened.plot), plotId: opened.item.id, narrativeOnMap: narrativeOnMapOf(opened.plot) } : undefined,
  );
  timelineControl.setTime(time);
  narrativeToMap();
}
/** The narrative entry current time is at, beside its track on the map, when it changes (CAP-20). */
function narrativeToMap(): void {
  const entry = time && opened && narrativeOnMapOf(opened.plot) ? narrativeOnMap.at(Date.parse(time.current)) : undefined;
  if (entry?.id === narrativeShown) return;
  narrativeShown = entry?.id;
  post(map, entry ? { kind: "set_narrative", timeline_entry: entry } : { kind: "set_narrative" });
}
/** Move current time to an entry: outside the window shown, the window widens or moves, shown but not saved (CAP-28). */
function goToTime(id: string): void {
  const start = timelineIds.get(id);
  if (!time || !opened || !start) return;
  const at = new Date(Date.parse(start)).toISOString();
  const range = time.range;
  const span = { start: at < range.start ? at : range.start, end: at > range.end ? at : range.end };
  showToolTime({ time: { current: at, range: span } }, opened.item.id, false);
  tourEvent("timelineChosen", opened.item.id);
}
/** Add, change or delete narrative entries, or read a REP file's narrative in, as debrief/add_narrative and the rest do. */
async function narrate(change: Record<string, unknown>): Promise<{ error?: string; feature?: string; entries?: number; omitted?: string[] }> {
  if (!opened || !pythonReady) return { error: "Open a plot first." };
  const outcome = await pythonJson<{ error?: string; feature?: string; entries?: number; omitted?: string[] }>("narrative", opened.item.id, JSON.stringify({ base: opened.base, change }));
  if (outcome.error) return outcome;
  await openPlot(opened.item.id, true);
  return outcome;
}
async function saveNarrative(spec: NarrativeSpec, id?: string): Promise<void> {
  const outcome = await narrate(id ? { kind: "edit", feature: id, entry: spec } : { kind: "add", entry: spec });
  timelineControl.saved(outcome.error ? undefined : (outcome.feature ?? id), outcome.error);
}

// --- History ----------------------------------------------------------------------
/** Undo, redo and go to, one at a time, each from the base the one before left (as VS Code's serially). */
let moving: Promise<unknown> = Promise.resolve();
/** Undo, redo or go to a step: the shared flow (webview/panels/flows/move.ts); this says how Python is asked. */
function move(how: How, step?: number): Promise<void> {
  const next = moving.then(() => moveNow(how, step));
  moving = next.catch(() => undefined);
  return next;
}
async function moveNow(how: How, step?: number): Promise<void> {
  await moveFlow(
    {
      ...flowHost,
      history: async () => historyModel(),
      move: async (moving, base, at, allow) => {
        const outcome = await pythonJson<{ error?: string; conflict?: boolean; newer_schema?: boolean }>("move", opened!.item.id, JSON.stringify({ how: moving, base, ...(at !== undefined && { step: at }), ...(allow && { allow_newer_schema: true }) }));
        if (outcome.error) throw refusalOf(outcome);
      },
      refreshHistory: async () => renderHistory(),
    },
    how,
    step,
  );
}
/** Undo or Redo, as its catalogued action: only when it can act (a key does nothing otherwise, as VS Code's keybinding). */
function undoOrRedo(how: "undo" | "redo"): void {
  const { context, reasons } = playContext();
  if (entryOf(actionOf(`debrief.${how}`), undefined, context, reasons).enabled) void move(how);
}

// Ctrl+Z undoes, Ctrl+Shift+Z or Ctrl+Y redoes, as in VS Code: here in the page, and
// forwarded from the map, form and results frames (see shim.ts). Never while typing.
type KeyChord = { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean };
function historyKey(e: KeyChord): boolean {
  if (!(e.ctrlKey || e.metaKey) || !panels.has("history") || !pythonReady) return false;
  const key = e.key.toLowerCase();
  if (key === "z" && !e.shiftKey) undoOrRedo("undo");
  else if ((key === "z" && e.shiftKey) || (key === "y" && !e.shiftKey)) undoOrRedo("redo");
  else return false;
  return true;
}
const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
document.addEventListener("keydown", (event) => {
  if (!typing(event.target) && historyKey(event)) event.preventDefault();
});

// --- Rendering --------------------------------------------------------------------
// --- The Outline: a tree (product owner, 27 Oct 2026) ------------------------------------
// The Outline panel model's tree (webview/panels/outline.ts, PAR-01), as VS Code's is: its
// sections and groups, a track's sensors, a sensor's cuts (in pages of 500 when it has more), a TMA
// solution's legs and each leg's positions (fixes). Rendered by outlinerow.ts, virtualised by outline.ts.
/** The rows selected in the Outline, by key: features, cuts, and the legs and fixes of solutions (which are not features). */
let outlinePicks: string[] = [];
/** The Outline's toolbar (product owner, 28 Oct 2026), made once the tree is. */
let outlineBar: OutlineBar | undefined;
/** The plot the Outline last showed, and the branches it has opened as they first show: a track carrying a new sensor opens. */
let outlineItem: string | undefined;
const outlineSeen = new Set<string>();
/** The model of the plot open, made once for each plot read, and the tree's node for each of its nodes. */
let outlineModel = new OutlineModel();
const outlineTreeNodes = new Map<string, TreeNode<OutlineNode>>();
function outlineNow(): OutlineModel {
  const plot = opened?.plot;
  if (outlineModel.index?.plot !== plot) {
    outlineModel = new OutlineModel(opened && { plot: opened.plot, files: filesOf(opened.item, (asset) => asset.href) });
    outlineTreeNodes.clear();
  }
  return outlineModel;
}
function outlineTreeNode(node: OutlineNode): TreeNode<OutlineNode> {
  let made = outlineTreeNodes.get(node.key);
  if (!made) {
    let children: TreeNode<OutlineNode>[] | undefined;
    made = { key: node.key, data: node, branch: isBranch(node), children: () => (children ??= outlineModel.children(node).map(outlineTreeNode)) };
    outlineTreeNodes.set(node.key, made);
  }
  return made;
}
function outlineRoots(): TreeNode<OutlineNode>[] {
  return outlineNow().roots.map(outlineTreeNode);
}
/** The rows chosen, as a set, made again only when they change. */
let outlineChosen: { picks: string[]; keys: Set<string> } = { picks: [], keys: new Set() };
function outlineRow(node: OutlineNode): OutlineRow {
  if (outlineChosen.picks !== outlinePicks) outlineChosen = { picks: outlinePicks, keys: new Set(outlinePicks) };
  return outlineNow().row(node, outlineChosen.keys);
}
const outlineTree = new OutlineTree<OutlineNode>($("outline"), {
  roots: outlineRoots,
  fill: (row, li) => fillOutlineRow(outlineRow(row.node.data), li),
  empty: () => outlineNow().emptyText,
  // Rows that select nothing (a heading, a page of cuts) leave the selection alone, as in VS Code; the narrative row shows the Timeline.
  chose: (keys) => {
    const rows = keys.map((k) => outlineNow().node(k)).filter((n): n is OutlineNode => !!n);
    const picks = rows.filter(selectable).map((n) => n.key);
    if (rows.length === 1 && outlineRow(rows[0]).activate?.kind === "timeline") showPanel("panel-timeline");
    if (picks.length) void chooseInOutline(picks);
    else outlineTree.mark(outlinePicks);
  },
  // Its menu: right-click, press and hold on a touch screen, or Shift+F10; the action catalogue's for the row (PAR-07).
  menu: (key, x, y, element) => outlineRowMenu(key, x, y, element),
});
// The tree, and what a row says by key (the model's row, as fillOutlineRow draws it), for the tests.
Object.assign(window, {
  debriefOutline: outlineTree,
  debriefOutlineRow: (key: string): OutlineRow | undefined => {
    const node = outlineNow().node(key);
    return node && outlineRow(node);
  },
});

// --- The Outline's toolbar (product owner, 28 Oct 2026) ----------------------------------------
/** Hide what is selected, or show it: all shown, hide them all; all hidden or some of each, show them all. One step. */
async function hideOrShowSelected(): Promise<void> {
  const context = operationContext();
  if (!context) return;
  const v = selectionVisibility(context.index, context.picks, context.readOnly);
  if (!v.action) return toast(v.title, "warning");
  await restyle(v.ids, { hidden: v.action === "hide" }, v.done);
}
/** The selected that have a colour, coloured: one step, named by the palette's name or the hex typed. */
async function colourSelected(colour: string, name?: string): Promise<void> {
  const context = operationContext();
  if (!context) return;
  const c = selectionColour(context.index, context.picks, context.readOnly);
  if (!c.enabled) return toast(c.reason ?? "Nothing selected has a colour.", "warning");
  await restyle(c.ids, { colour, ...(name && { colour_name: name }) }, `Coloured ${c.what} ${name ?? colour}`);
}
/** Select children: the selection replaced by the direct children of what is selected, their branches opened and the first brought into sight. */
async function selectChildrenOfSelection(): Promise<void> {
  if (!opened) return;
  const index = outlineIndex(opened.plot);
  const children = selectionChildren(index, outlinePicked());
  if (children.reason) return toast(children.reason, "warning");
  const model = outlineNow();
  for (const parent of children.parents) for (const key of [...model.ancestors(parent), parent]) outlineTree.open.add(key);
  // A sensor of more than a page of cuts: the page of the first opened too.
  if (children.keys[0]) for (const key of model.ancestors(children.keys[0])) outlineTree.open.add(key);
  await chooseInOutline(children.keys);
  outlineTree.select(children.keys, [], children.keys[0]);
}
outlineBar = new OutlineBar(
  $("outline-toolbar"),
  {
    state: () => {
      const index = opened ? outlineIndex(opened.plot) : undefined;
      const picks = outlinePicked();
      const readOnly = !!opened?.revision;
      const none = "Open a plot first.";
      const children = index ? selectionChildren(index, picks) : { keys: [], title: `Select children: ${none}`, reason: none };
      const rows = outlineListed().length;
      return {
        visibility: index ? selectionVisibility(index, picks, readOnly) : { state: "none", ids: [], hidden: 0, ignored: 0, pressed: "false", title: `Hide or show on the map: ${none}` },
        colour: index ? selectionColour(index, picks, readOnly) : { ids: [], enabled: false, title: `Colour: ${none}`, reason: none },
        all: { count: rows, ...(!rows && { reason: "the Outline lists nothing." }) },
        children: { count: children.keys.length, title: children.title, ...(children.reason && { reason: children.reason }) },
        selected: picks.length,
        ...(!pythonReady && { waiting: "(Python is starting.)" }),
        title: ((c) => titleMenu("debrief.outline", c.context, c.reasons))(playContext()),
      };
    },
    hideOrShow: () => void hideOrShowSelected(),
    colour: (colour, name) => void colourSelected(colour, name),
    // Every row listed, as Ctrl+A in the tree.
    selectAll: () => void chooseInOutline(outlineListed()),
    selectChildren: () => void selectChildrenOfSelection(),
    clearSelection: () => void chooseInOutline([]),
    run: (id) => void runAction(id),
    more: (entries, from) => {
      const box = from.getBoundingClientRect();
      openMenu(
        entries.map((e, i) => ({
          label: e.title,
          groupStart: i > 0 && e.group !== entries[i - 1].group,
          ...(!e.enabled && { disabled: e.reason }),
          ...(e.checked !== undefined && { checked: e.checked }),
          act: () => void runAction(e.id),
        })),
        { label: "The Outline: more actions", x: box.left, y: box.bottom, from },
      );
    },
  },
  TRACK_COLOURS,
);
/** Every row to select listed (the branches open), as VS Code's Select all and Ctrl+A in the tree take them. */
function outlineListed(): string[] {
  return outlineNow().listedKeys((node) => outlineTree.open.has(node.key));
}
/** The picks the Outline's selection stands for. */
function outlinePicked(): OutlinePick[] {
  if (!opened) return [];
  const index = outlineIndex(opened.plot);
  return outlinePicks.map((k) => pickOf(index, k)).filter((p): p is OutlinePick => !!p);
}
/** Rows chosen in the Outline: the features they stand for selected everywhere; a position chosen, current time to it. */
async function chooseInOutline(keys: string[]): Promise<void> {
  if (!opened) return;
  const index = outlineIndex(opened.plot);
  const picks = keys.map((k) => pickOf(index, k)).filter((p): p is OutlinePick => !!p);
  const fix = [...picks].reverse().find((p): p is Extract<OutlinePick, { kind: "fix" }> => p.kind === "fix");
  if (fix) timeTo(new Date(index.solutions.get(fix.solution)!.times[fix.index]).toISOString());
  const ids = featureIdsOfPicks(picks);
  selectedByHand(ids);
  await select(ids, false, keys);
}

function renderOutline(reveal = false): void {
  if (opened && opened.item.id !== outlineItem) {
    outlineItem = opened.item.id;
    outlineTree.open.clear();
    outlineSeen.clear();
  }
  // The branches the model has open when they first show (the headings, a track carrying a sensor
  // not seen before); after that, as the reader left them, as VS Code keeps them.
  const model = outlineNow();
  for (const key of model.startOpen()) {
    if (outlineSeen.has(key)) continue;
    outlineSeen.add(key);
    outlineTree.open.add(key);
  }
  outlineTree.refresh();
  if (reveal && opened) {
    const last = outlinePicks[outlinePicks.length - 1];
    outlineTree.select(outlinePicks, last ? model.ancestors(last) : []);
  } else outlineTree.mark(outlinePicks);
  // The hint line is gone (product owner, 28 Oct 2026; the walkthroughs teach the gestures): the
  // selection's count said to a screen reader, only when it changes; the toolbar shows the selection.
  const said = selectionSaid(opened ? outlineIndex(opened.plot) : undefined, outlinePicked());
  if ($("selection-said").textContent !== said) $("selection-said").textContent = said;
  outlineBar?.update();
}

// --- The outline's press and hold ------------------------------------------------------------
// Press and hold a track in the outline on a touch screen: its menu, as a right-click (presshold.ts).
const outlineHold = new PressHold((x, y) =>
  document.elementFromPoint(x, y)?.closest("#outline li")?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: y })),
);
const touchy = (e: PointerEvent) => e.pointerType === "touch" || e.pointerType === "pen";
const outlineList = $("outline");
outlineList.addEventListener("pointerdown", (e) => {
  if (!touchy(e)) return outlineHold.reset();
  if (e.isPrimary) outlineHold.reset();
  outlineHold.press(e.pointerId, e.clientX, e.clientY);
});
outlineList.addEventListener("pointermove", (e) => void (touchy(e) && outlineHold.move(e.pointerId, e.clientX, e.clientY)));
for (const type of ["pointerup", "pointercancel"] as const) window.addEventListener(type, (e) => void (touchy(e) && outlineHold.release(e.pointerId)), true);
outlineList.addEventListener("scroll", () => outlineHold.cancel());
outlineList.addEventListener(
  "contextmenu",
  (e) => {
    if (!e.isTrusted) return; // ours, from the hold
    if (outlineHold.fired) {
      e.preventDefault(); // the browser's own right-click for a hold already sent on
      e.stopImmediatePropagation();
    } else if (outlineHold.pressing) outlineHold.cancel(); // the browser's came first: it is the one
  },
  true,
);
outlineList.addEventListener(
  "click",
  (e) => {
    if (outlineHold.fired && !outlineHold.pressing) {
      e.stopImmediatePropagation(); // the tap that ends a hold is not a click: it would select
      e.preventDefault();
      outlineHold.reset();
    }
  },
  true,
);

// --- Sensors: ambiguous bearings resolved, sensor data read in (CAP-22) -------------------
/** Keep a side of ambiguous cuts, or make them ambiguous again, or read a file's sensor lines in, as debrief/resolve_ambiguity and debrief/import_sensor do: one step each. */
// --- The bearing view (CAP-21; product owner, 24 Oct 2026): a sensor's cuts, TMA solutions
// made from them, and their residuals, live while one is dragged on the map --------------------
/** What Bearings shows (product owner, 27 Oct 2026): what the Outline's selection last chose, a solution or a sensor's coverage; never saved. */
let tmaShown: BearingsShown | undefined;
const shownSolution = (): string | undefined => (tmaShown && "solution" in tmaShown ? tmaShown.solution : undefined);
/** The cuts two clicks on the map are asked for, until they are made or cancelled. */
let tmaGuessing: TmaRequest | undefined;
let tmaAsking = 0;
/** What the view is to choose when next shown: a fix or a cut ringed, the first guess's form, as the Outline or a walkthrough's step asks. */
const tmaFocus = new FocusOnce();
/** How long Python took to work out the residuals shown, ms: for the drag budget's measure (NFR-04). */
const tmaCompute: number[] = [];
/** The reader's error cut-off, degrees, as the page's settings keep it (debrief-config). */
let errorCutOff: number | undefined;
/** Which of the plot's panes the reader shows: this browser, every read and write guarded (product owner, 25 Oct 2026). */
const BEARINGS_KEY = "debrief.play.bearings";
/** A dot of Bearings chosen: its cut, or the solution at a fix (that position, in the Outline), selected in the Outline and on the map; current time to it. */
function selectFromBearings(id: string, at: string): void {
  timeTo(at);
  if (id === shownSolution() && opened) {
    const s = outlineIndex(opened.plot).solutions.get(id);
    const i = s ? s.times.indexOf(Date.parse(at)) : -1;
    if (i >= 0) return void select([id], false, [fixKey(id, i)]).then(() => renderOutline(true));
  }
  void select([id]);
}
const tmaControl = new TmaControl(
  $("bearings"),
  {
    create: (request) => void createTma(request),
    guess: (request) => {
      tmaGuessing = request;
      post(map, { kind: "tma_guess", tma_request: request });
    },
    exclude: (feature, cutIds, excluded) => void changeTma({ kind: "exclude", feature, cut_ids: cutIds, excluded }),
    split: (feature, at) => void changeTma({ kind: "split", feature, at }),
    time: (at) => timeTo(at),
    resolve: (cutId, keep) => void resolveSensor({ keep, cut_ids: [cutId] }),
    // A box drawn with Select bearings on: the sides boxed kept, one step, as debrief/resolve_ambiguity (product owner, 28 Oct 2026).
    resolveCuts: (resolution) => void resolveSensor(resolution),
    // A dot clicked: its cut, or the solution at a fix, selected in the Outline and on the map; current time to it.
    select: (id, at) => selectFromBearings(id, at),
    // A dot right-clicked: the Outline's menu for its cut, or the solution's position there (product owner, 29 Oct 2026).
    menu: (id, at, x, y) => {
      const s = opened && id === shownSolution() ? outlineIndex(opened.plot).solutions.get(id) : undefined;
      const i = s ? s.times.indexOf(Date.parse(at)) : -1;
      const key = i >= 0 ? fixKey(id, i) : id;
      const choose = { label: i >= 0 ? "Select this position" : "Select this cut", act: () => selectFromBearings(id, at) };
      outlineRowMenu(key, x ?? 0, y ?? 0, $("bearings").querySelector<HTMLElement>(".tma-canvas") ?? undefined, choose, [key]);
    },
    cutOff: (degrees) => {
      errorCutOff = degrees;
      if (pythonReady) void python("set_error_cut_off", degrees);
    },
  },
  undefined,
  {
    load: () => {
      try {
        const text = window.localStorage.getItem(BEARINGS_KEY);
        return text ? JSON.parse(text) : undefined;
      } catch {
        return undefined;
      }
    },
    save: (value) => {
      try {
        window.localStorage.setItem(BEARINGS_KEY, JSON.stringify(value));
      } catch {
        // Not remembered: the panes stay as chosen on this visit.
      }
    },
  },
);
(window as unknown as { debriefTma: TmaControl; debriefTmaCompute: number[] }).debriefTma = tmaControl;
bearingsTime = () => {
  if (time) tmaControl.setTime(Date.parse(time.current), time.range);
};
(window as unknown as { debriefTmaCompute: number[] }).debriefTmaCompute = tmaCompute;
/** What is selected, and current time: for the tests (a dot clicked in the Bearings view selects its cut or fix). */
(window as unknown as { debriefSelection: () => unknown }).debriefSelection = () => ({ selection, picks: outlinePicks, current: time?.current });

/** The solution or the sensor's coverage the Outline chose, its cuts or residuals asked of Python again. */
async function refreshBearings(): Promise<void> {
  if (!opened || !panels.has("bearings")) return;
  const plot = opened.plot;
  const index = outlineIndex(plot);
  const asked = ++tmaAsking;
  // Something no longer in the plot (undone, deleted): nothing shown.
  if (tmaShown && ("solution" in tmaShown ? !index.solutions.has(tmaShown.solution) : !index.sensors.has(tmaShown.sensor))) tmaShown = undefined;
  // Chosen while Python starts (product owner, 29 Oct 2026): said so, busy; asked again once it is ready.
  if (!pythonReady && tmaShown) return tmaControl.waiting(`${bearingsTitle(index, tmaShown)}: starting Python in your browser. Its bearings show here once it is ready.`);
  const sensors = tmaSensorRows(plot);
  const solutions = tmaSolutionRows(plot);
  const solution = shownSolution();
  const sensorId = tmaShown && "sensor" in tmaShown ? tmaShown.sensor : undefined;
  const sensor = sensors.find((s) => s.id === sensorId);
  let cuts: TmaCut[] | undefined;
  let residuals: TmaResiduals | undefined;
  if (pythonReady && (solution || sensor)) {
    const outcome = await pythonJson<{ cuts?: ListedCut[]; residuals?: TmaResiduals; compute_ms?: number; error?: string }>("tma_view", opened.item.id, JSON.stringify(solution ? { solution } : { sensor: sensor?.id }));
    if (outcome.error) toast(outcome.error, "warning");
    if (outcome.compute_ms !== undefined) tmaCompute.push(outcome.compute_ms);
    residuals = outcome.residuals;
    if (sensor && outcome.cuts) cuts = cutRowsOf(sensor, outcome.cuts, cutColours(plot));
    if (errorCutOff === undefined) errorCutOff = Number(await python("error_cut_off"));
  }
  if (asked !== tmaAsking || !opened) return;
  // Around a solution: its sensors' whole coverage, and ownship's courses over it (product owner, 25 Oct 2026).
  let around = {};
  if (residuals && solution) {
    const coverage = coverageOf(plot, solution);
    const times = [...coverage.map((c) => c.time), ...residuals.rows.map((r) => r.time)].sort();
    around = { coverage, ownship: ownshipOf(plot, solution, times.length ? { start: times[0], end: times[times.length - 1] } : undefined) };
  } else if (sensor) around = { ownship: ownshipOf(plot, sensor.id) };
  const focus = tmaFocus.take();
  tmaControl.show({
    plot_id: opened.item.id,
    ...(opened.revision && { read_only: true }),
    title: bearingsTitle(index, tmaShown),
    sensors,
    ...(sensor && { sensor_id: sensor.id }),
    ...(cuts && { cuts }),
    solutions,
    ...(residuals && solution && { solution_id: solution, residuals }),
    ...around,
    ...(errorCutOff !== undefined && Number.isFinite(errorCutOff) && { error_cut_off: errorCutOff }),
    ...(focus && { focus }),
  });
  if (time) tmaControl.setTime(Date.parse(time.current), time.range);
  bearingsWidth();
}
/**
 * The column Bearings is in widened while a solution is open there, and back when none is
 * (product owner, 25 Oct 2026): two panes of 160 px or more; only from and to the default widths.
 */
function bearingsWidth(): void {
  requestAnimationFrame(() => {
    const shown = tmaControl.shown;
    if (dock?.widenFor("panel-bearings", !!shown?.solution_id && !!shown.residuals)) placeSoon();
  });
}
/**
 * Bearings follows the Outline's selection (product owner, 27 Oct 2026): a solution, one of its
 * legs or fixes shows the solution (a fix ringed); a sensor, or some of its cuts, its coverage (the
 * last cut ringed), but cuts of the solution's sensors keep it shown, as a dot clicked does;
 * something unrelated keeps what is shown.
 */
function bearingsFollow(): void {
  if (!opened) return;
  const index = outlineIndex(opened.plot);
  const picks = outlinePicked();
  const next = bearingsFor(index, picks, shownSolution());
  if (!next) return;
  const ring = ringOf(index, picks, next);
  if (ring) tmaFocus.ask({ cut_time: ring });
  tmaShown = next;
  // Asked again even when the same: the plot read afresh, as choosing a solution again did (the panel's H2).
  void refreshBearings();
}
/** The time of what the plot rings for a selection: the fix chosen, else the last cut chosen. */
function ringOf(index: ReturnType<typeof outlineIndex>, picks: OutlinePick[], shown: BearingsShown): string | undefined {
  if ("solution" in shown && shown.fix !== undefined) return new Date(index.solutions.get(shown.solution)!.times[shown.fix]).toISOString();
  const cut = [...picks].reverse().find((p) => p.kind === "cut");
  return cut && cut.kind === "cut" ? cut.cut.properties.time : undefined;
}
/**
 * A walkthrough's step (Bearings and TMA): the Outline choosing for the reader, with Bearings in
 * view: a sensor's or a solution's row; the cut at a time; the cuts of a period, and the first guess's
 * form for them; or a solution's position (fix) at a time. Current time moves to a cut or a fix.
 */
async function outlineWith(id: string, focus: OutlineFocus = {}): Promise<void> {
  if (!opened) return;
  const index = outlineIndex(opened.plot);
  if (!index.byId.has(id)) return toast("That is not in this plot.", "warning");
  showPanel("panel-outline");
  showPanel("panel-bearings");
  const keys = outlineChoice(index, id, focus);
  if (typeof keys === "string") return toast(keys, "warning");
  const at = focus.cut_time ?? focus.fix_time;
  if (at) timeTo(new Date(Date.parse(at)).toISOString());
  await select(featureIdsOfPicks(keys.map((k) => pickOf(index, k)!)), false, keys);
  renderOutline(true);
  if (focus.make) return runOperation("tma-from-cuts");
  // The keyboard on the row chosen; in the one column (a phone), the row in sight in the page, centred,
  // so a section's heading held at the top or the bottom never covers it (the panel's L7).
  const row = document.querySelector<HTMLElement>(`#outline li[data-id="${CSS.escape(keys[keys.length - 1])}"]`);
  row?.focus({ preventScroll: true });
  if (!dock) row?.scrollIntoView({ block: "center", inline: "nearest" });
}
/** A TMA change, each one step (CAP-21): as debrief/tma_create, tma_split_leg and tma_exclude_cut. */
async function changeTma(change: Record<string, unknown>): Promise<{ error?: string; feature?: string; notes?: string[] }> {
  if (!opened || !pythonReady) return { error: "Open a plot first." };
  status("Saving…", true);
  const outcome = await pythonJson<{ error?: string; feature?: string; notes?: string[]; changed?: boolean }>("tma_change", opened.item.id, JSON.stringify({ base: opened.base, change }));
  status("");
  if (outcome.error) {
    toast(outcome.error, "warning");
    if (outcome.error.includes("changed elsewhere")) await openPlot(opened.item.id, true);
    return outcome;
  }
  if (outcome.feature) {
    tmaShown = { solution: outcome.feature };
    selection = [outcome.feature];
  }
  await openPlot(opened.item.id, true);
  if (outcome.feature) await select([outcome.feature]);
  if (outcome.notes?.length) toast(outcome.notes.join(" "));
  return outcome;
}
async function createTma(request: TmaRequest): Promise<void> {
  const outcome = await changeTma({ kind: "create", request });
  tmaControl.made(outcome.error);
  if (!outcome.error) showPanel("panel-bearings");
}
// --- The Tools' entries for the Outline's selection (product owner, 27 Oct 2026) ---------------
/** What the Tools' entries act on, as things stand: the Outline's rows chosen, the solution Bearings shows, the time window. */
const operationState = (): OperationState => ({
  index: opened ? outlineIndex(opened.plot) : undefined,
  keys: outlinePicks,
  shownSolution: shownSolution(),
  window: time?.range,
  readOnly: !!opened?.revision,
});
/** What they act on for the rows given (a menu's), else the Outline's rows chosen. */
const operationContext = (keys?: readonly string[]): OperationContext | undefined => sharedOperationContext(operationState(), keys);
/** The Tools' entries for the selection (or the rows given), each enabled or with the reason it is not. */
const operations = (keys?: readonly string[]): Operation[] => operationsFor(operationState(), keys);
(window as unknown as { debriefOperations: () => Operation[] }).debriefOperations = operations;
/** A change's answer as the shared flows take it. */
const doneOf = (outcome: { error?: string; notes?: string[]; changed?: boolean }) => ({ ...(outcome.error && { problem: outcome.error }), ...(outcome.notes && { notes: outcome.notes }), ...(outcome.changed !== undefined && { changed: outcome.changed }) });
/** A TMA change, as debrief/tma_split_leg and debrief/tma_exclude_cut: the plot shown again either way. */
async function tmaChanged(change: Record<string, unknown>) {
  if (!opened || !pythonReady) return { problem: "Open a plot first." };
  status("Saving…", true);
  const outcome = await pythonJson<{ error?: string; notes?: string[]; changed?: boolean }>("tma_change", opened.item.id, JSON.stringify({ base: opened.base, change }));
  status("");
  await openPlot(opened.item.id, true);
  return doneOf(outcome);
}
/** The shared flow (webview/panels/flows/operation.ts); this says how Python makes each change. */
const operationHost: OperationHost = {
  ...flowHost,
  operationState,
  splitLeg: (solution, at, side) => tmaChanged({ kind: "split", feature: solution, at, side }),
  setCutsHidden: async (ids, hidden) => {
    if (!opened || !pythonReady) return { problem: "Open a plot first." };
    const outcome = await pythonJson<{ error?: string; notes?: string[] }>("restyle", opened.item.id, JSON.stringify({ base: opened.base, features: ids, hidden }));
    await openPlot(opened.item.id, true);
    return doneOf(outcome);
  },
  deleteCuts: async (ids) => {
    status("Deleting…", true);
    const outcome = await sense<{ ok?: boolean }>({ kind: "delete", cut_ids: ids });
    status("");
    return doneOf(outcome);
  },
  exclude: (solution, ids, excluded) => tmaChanged({ kind: "exclude", feature: solution, cut_ids: ids, excluded }),
  keepSide: async (keep, ids) => {
    status("Resolving…", true);
    const outcome = await sense<{ ok?: boolean }>({ kind: "resolve", resolution: { keep, cut_ids: ids } });
    status("");
    return doneOf(outcome);
  },
  makeSolution: async (sensor, focus) => {
    tmaShown = { sensor };
    tmaFocus.ask(focus);
    showPanel("panel-bearings");
    await refreshBearings();
  },
};
/** One of the Tools' entries, on the Outline's selection (or the rows given: a menu's). */
async function runOperation(id: OperationId, keys?: readonly string[]): Promise<void> {
  await runOperationFlow(operationHost, id, keys);
}
// --- The Outline's menus and toolbar, from the action catalogue (PAR-07) --------------------------
/**
 * The context keys VS Code sets, as the playground has them now, for the catalogue's when clauses and
 * enablement; and what the playground can say where one does not hold (Python starting, the
 * selection's own reasons), for these rows (the Outline's selection by default).
 */
function playContext(keys: readonly string[] = outlinePicks): { context: Context; reasons: Record<string, string> } {
  const index = opened ? outlineIndex(opened.plot) : undefined;
  const picks = index ? keys.map((k) => pickOf(index, k)).filter((p): p is OutlinePick => !!p) : [];
  const readOnly = !!opened?.revision;
  const visibility = index ? selectionVisibility(index, picks, readOnly) : undefined;
  const colour = index ? selectionColour(index, picks, readOnly) : undefined;
  const children = index ? selectionChildren(index, picks) : undefined;
  const history = undoRedo(opened?.steps ?? [], opened?.base.current ?? 0, readOnly);
  const tote = toteMenu(toteChoice(), featureIdsOfPicks(picks).filter((id) => !!trackOf(id)));
  const reasons: Record<string, string> = {};
  // The playground's own state (§5): the plot is shown, but nothing can change it until Python is ready.
  if (opened && !pythonReady) for (const key of ["debrief.plotOpen", "debrief.canUndo", "debrief.canRedo"]) reasons[key] = "Python is starting.";
  // An earlier revision shown read-only: Undo and Redo cannot act, and say so.
  if (readOnly) for (const key of ["debrief.canUndo", "debrief.canRedo"]) reasons[key] = "An earlier revision is shown read-only, so it cannot be changed.";
  if (colour?.reason) reasons["debrief.selectionColourable"] = colour.reason;
  if (children?.reason) reasons["debrief.selectionHasChildren"] = children.reason;
  if (tote.primaryReason) reasons["debrief.toteCanSetPrimary"] = tote.primaryReason;
  const context: Context = {
    "debrief.plotOpen": !!opened && pythonReady,
    "debrief.selectionVisibility": visibility?.state ?? "none",
    "debrief.selectionColourable": !!colour?.enabled,
    "debrief.selectionHasChildren": !!children && !children.reason,
    "debrief.canUndo": history.canUndo && pythonReady,
    "debrief.canRedo": history.canRedo && pythonReady,
    "debrief.revisionShown": readOnly,
    "debrief.northArrow": hasNorthArrow(),
    "debrief.toteCanAdd": tote.canAdd,
    "debrief.toteCanRemove": tote.canRemove,
    "debrief.toteCanSetPrimary": !tote.primaryReason,
  };
  return { context, reasons };
}

type Where = { x: number; y: number; from?: HTMLElement };
/** The Tote changed for the tracks among these rows, the Tote brought into view. */
function changeTote(keys: readonly string[], change: (tote: ToteView, tracks: string[]) => ToteView): void {
  const tracks = keys.filter((k) => !!trackOf(k));
  showPanel(totePanel.id);
  void chooseTote(change(toteChoice(), tracks));
}
/**
 * What each catalogued action does in the playground, on the rows it was chosen on: those rows are
 * the selection by then. An action that runs an Outline operation (a cut's or a position's) needs no
 * entry here: it runs that operation on its rows.
 */
const PLAY_ACTIONS: Record<string, (keys: string[], at: Where) => unknown> = {
  "debrief.setColour": () => outlineBar?.openColour(),
  "debrief.hide": (keys) => restyle(keys.filter((k) => features().some((f) => f.id === k)), { hidden: true }),
  "debrief.show": (keys) => restyle(keys.filter((k) => features().some((f) => f.id === k)), { hidden: false }),
  "debrief.setTrackFrequencies": () => setTrackFrequencies(),
  "debrief.editAnnotation": (keys) => editAnnotation(keys[0]),
  "debrief.deleteAnnotation": () => deleteAnnotations(),
  "debrief.moveTrack": () => moveTrack(),
  "debrief.rotateTrack": () => rotateTrack(),
  "debrief.shearTrack": () => shearTrack(),
  "debrief.stretchTrack": () => stretchTrack(),
  "debrief.splitTrack": () => splitTrack(),
  "debrief.mergeTracks": () => mergeTracks(),
  "debrief.removeJumps": () => findJumps(),
  "debrief.smoothTrack": () => smoothTrack(),
  // The fixes listed, to colour, label, comment on or move one.
  "debrief.markFix": () => listFixes(),
  "debrief.moveFix": () => listFixes(),
  "debrief.plottingMode": () => plottingMode(),
  "debrief.tote.setPrimary": (keys) => changeTote(keys, (tote, tracks) => withPrimary(tote, tracks[0])),
  "debrief.tote.add": (keys) => changeTote(keys, (tote, tracks) => withSecondaries(tote, tracks)),
  "debrief.tote.remove": (keys) => changeTote(keys, (tote, tracks) => tracks.reduce((t, id) => (t.primary === id ? withPrimary(t, undefined) : withoutSecondary(t, id)), tote)),
  // Which side to keep, then which cuts (the cut at current time, the window, those selected, or all).
  "debrief.resolveAmbiguity": (keys, at) =>
    openMenu(
      KEEP_CHOICES.map((c) => ({ label: `${c.label}…`, act: () => chooseCuts(c.keep, at.from ?? $("outline"), at.x, at.y, keys) })),
      { label: "Ambiguous bearings: keep", x: at.x, y: at.y, from: at.from },
    ),
  "debrief.currentCut": (keys) => currentCutMenu(keys[0]),
  "debrief.setArrayOffset": (keys) => arrayOffsetForm(keys[0]),
  "debrief.showBearings": () => showPanel("panel-bearings"),
  "debrief.tmaSplitLeg": async (keys) => {
    if (!time) return toast("Set current time first: the solution is split into legs there.", "warning");
    const outcome = await changeTma({ kind: "split", feature: keys[0], at: time.current });
    if (outcome.error) toast(outcome.error, "warning");
  },
  // The Outline's toolbar and its overflow menu.
  "debrief.selectionHide": () => hideOrShowSelected(),
  "debrief.selectionShow": () => hideOrShowSelected(),
  "debrief.selectionShowAll": () => hideOrShowSelected(),
  "debrief.colourSelection": () => outlineBar?.openColour(),
  "debrief.selectAll": () => chooseInOutline(outlineListed()),
  "debrief.selectChildren": () => selectChildrenOfSelection(),
  "debrief.clearSelection": () => chooseInOutline([]),
  "debrief.addAnnotation": () => addAnnotation(),
  "debrief.toggleNorthArrow": () => toggleNorthArrow(),
  "debrief.importSensor": () => $("sensor-file").click(),
  "debrief.exportImage": () => $("open-export").click(),
};

/** The actions that act on the rows given, leaving the selection as it is, as VS Code's do. */
const ON_ROWS = new Set(["debrief.hide", "debrief.show", "debrief.editAnnotation", "debrief.tote.setPrimary", "debrief.tote.add", "debrief.tote.remove", "debrief.resolveAmbiguity", "debrief.currentCut", "debrief.setArrayOffset", "debrief.tmaSplitLeg"]);

/**
 * Run a catalogued action on these rows (a row's menu: the row and the rest of the selection if it
 * is in it), or the selection (a toolbar's). One that cannot run says why, in the catalogue's words,
 * as VS Code refuses it (PAR-08).
 */
async function runAction(id: string, keys: string[] = outlinePicks, at: Where = { x: 0, y: 0 }): Promise<void> {
  const action = actionOf(id);
  const { context, reasons } = playContext(keys);
  const entry = entryOf(action, undefined, context, reasons);
  if (!entry.enabled) return toast(entry.reason!, "warning");
  if (action.operation) return runOperation(action.operation as OperationId, keys);
  const run = PLAY_ACTIONS[id];
  if (!run) return toast(`${action.title.replace(/…$/, "")}: not in the playground yet.`, "warning");
  // Those that work on the selection (the track edits, the fix list) act on these rows selected first.
  if (!ON_ROWS.has(id) && keys.join() !== outlinePicks.join()) await chooseInOutline(keys);
  await run(keys, at);
}

/**
 * A row's context menu (right-click, press and hold, Shift+F10 or the menu key), as VS Code's: the
 * action catalogue's entries for its menu context, in its groups and order, each disabled with its
 * reason where it cannot run (PAR-07, PAR-08); and, from Bearings, choosing the row there too.
 */
function outlineRowMenu(key: string, x: number, y: number, from?: HTMLElement, also?: MenuItem, rows?: string[]): void {
  const node = outlineNow().node(key);
  if (!node) return;
  const keys = rows ?? (outlinePicks.includes(key) ? [...outlinePicks] : [key]);
  const row = outlineRow(node);
  const { context, reasons } = playContext(keys);
  const entries = rowMenu("debrief.outline", row.menu, context, reasons);
  if (!entries.length && !also) return;
  const items: MenuItem[] = entries.map((e, i) => ({
    label: e.title,
    groupStart: i > 0 && e.group !== entries[i - 1].group,
    ...(!e.enabled && { disabled: e.reason }),
    act: () => {
      from?.focus();
      void runAction(e.id, keys, { x, y, from });
    },
  }));
  if (also) items.push({ ...also, groupStart: items.length > 0 });
  openMenu(items, { label: `${row.label}: actions`, x, y, from });
}
/** Current time to a cut's time: within the window, or a window widened to take it in, shown and not saved (CAP-28). */
function timeTo(at: string): void {
  if (!time) return;
  const range = time.range;
  const within = at >= range.start && at <= range.end;
  const next: TimeState = { current: at, range: within ? range : { start: at < range.start ? at : range.start, end: at > range.end ? at : range.end } };
  showTime(next);
  post(map, { kind: "set_time", time: next });
}

async function sense<T>(change: Record<string, unknown>, data?: Uint8Array): Promise<T & { error?: string; notes?: string[] }> {
  if (!opened || !pythonReady) return { error: "Open a plot first." } as T & { error: string };
  const outcome = await pythonJson<T & { error?: string; notes?: string[] }>("sensor", opened.item.id, JSON.stringify({ base: opened.base, change }), ...(data ? [data] : []));
  if (!outcome.error) await openPlot(opened.item.id, true);
  return outcome;
}
/** What the reader is looking at: the sensors asked about (else those selected or carrying selected cuts, else every sensor with ambiguous cuts), the selection, the window and current time. */
function resolveContext(sensorIds?: string[]): ResolveContext | undefined {
  if (!opened) return undefined;
  const entries = sensorsOf(opened.plot);
  const chosen = new Set(sensorIds ?? selection);
  const byCut = new Map(entries.flatMap((e) => e.cuts.map((c) => [c.id, e.sensor.id] as const)));
  const named = entries.filter((e) => chosen.has(e.sensor.id) || [...chosen].some((id) => byCut.get(id) === e.sensor.id));
  const asked = named.length ? named : entries.filter((e) => e.cuts.some((c) => !!c.properties.ambiguous_bearing));
  if (!asked.length) return undefined;
  return {
    entries: asked,
    selected: selection,
    ...(time && { window: { start: Date.parse(time.range.start), end: Date.parse(time.range.end) }, at: Date.parse(time.current) }),
  };
}
/** Keep a side for the cut at the current time, those in the window, those selected or all: chosen from a menu at the control, then one step. */
function chooseCuts(keep: Keep, from: HTMLElement, x: number, y: number, sensorIds?: string[]): void {
  const context = resolveContext(sensorIds);
  if (!context) return toast(opened && sensorsOf(opened.plot).length ? "No sensor in this plot has ambiguous cuts." : "This plot has no sensors.", "warning");
  const keepLabel = KEEP_CHOICES.find((c) => c.keep === keep)!.label;
  const scopes = scopeChoices(context);
  if (!scopes.length) return toast("No cuts are in the time window.", "warning");
  openMenu(
    scopes.map((c) => ({
      label: `${c.label} (${c.detail})`,
      act: () => {
        from.focus();
        void resolveSensor(resolutionFor(c.scope, keep, context));
      },
    })),
    { label: `${keepLabel}: which cuts?`, x, y, from },
  );
}
async function resolveSensor(resolution: ReturnType<typeof resolutionFor>): Promise<void> {
  if (typeof resolution === "string") return toast(resolution, "warning");
  status("Resolving…", true);
  const outcome = await sense<{ ok?: boolean }>({ kind: "resolve", resolution });
  status("");
  if (outcome.error) return toast(outcome.error, "warning");
  if (outcome.notes?.length) toast(outcome.notes.join(" "));
}
/** A sensor's menu in the Outline: keep port or starboard bearings, or make its cuts ambiguous again; then which cuts. */
/**
 * A towed array's offset astern of the ship, and how it follows (product owner, 24 Oct
 * 2026), as debrief/set_array_offset: typed in the analyst's length unit, 0 for at the
 * ship; worm in the hole (legacy's default) or plain. One step.
 */
async function arrayOffsetForm(id: string): Promise<void> {
  const entry = opened && sensorsOf(opened.plot).find((e) => e.sensor.id === id);
  if (!entry) return;
  const props = entry.sensor.properties;
  const now = props.array_offset;
  const values = await trackForm(arrayOffsetTitle(props.name, entry.host?.properties.name), "Set", [
    {
      id: "offset",
      label: "Distance astern of the ship, metres unless you give a unit (0 for at the ship)",
      value: now ? `${now.value} ${UNIT_LABELS[now.unit] ?? now.unit}` : "",
      placeholder: "such as 300 m",
      read: (t) => {
        const read = readArrayOffset(t);
        if ("problem" in read) return read;
        const means = read.value === 0 ? "at the ship" : `${describeDistance(read)} astern`;
        return { means: read.warning ? `${means}. ${read.warning}` : means };
      },
    },
    {
      id: "mode",
      label: "How it follows the ship",
      value: props.array_mode === "plain" ? "plain" : "worm_in_hole",
      options: [
        { value: "worm_in_hole", label: "Worm in the hole: back along the ship's own track (legacy's default)" },
        { value: "plain", label: "Plain: straight astern, along the ship's course" },
      ],
    },
  ]);
  if (!values) return;
  const read = readArrayOffset(values.offset) as { value: number; unit: string };
  status("Saving…", true);
  const outcome = await sense<{ changed?: boolean }>({ kind: "array_offset", sensor_ids: [id], offset: read.value === 0 ? null : { value: read.value, unit: read.unit }, mode: values.mode });
  status("");
  if (outcome.error) return toast(outcome.error, "warning");
  toast(outcome.notes?.length ? outcome.notes.join(" ") : `${props.name} is so already.`);
}
/** The cut current time is at for a sensor: its bearings said, and its menu, so the keyboard reaches the cut the map emphasises. */
async function currentCutMenu(id: string): Promise<void> {
  const entry = opened && sensorsOf(opened.plot).find((e) => e.sensor.id === id);
  const now = entry && time ? cutNow(entry, Date.parse(time.current), { start: Date.parse(time.range.start), end: Date.parse(time.range.end) }) : undefined;
  if (!entry || !now) return toast(`${featureNameOf(id)} has no cut at or before current time in the time window.`, "warning");
  await cutMenu(now.id);
}
/** A cut's menu (right-click, or press and hold, on one of its lines on the map): keep either bearing, make it ambiguous again, or select it. */
async function cutMenu(id: string): Promise<void> {
  const entry = opened && sensorsOf(opened.plot).find((e) => e.cuts.some((c) => c.id === id));
  const cut = entry?.cuts.find((c) => c.id === id);
  if (!entry || !cut) return;
  // The course its sides are told by, where its sensor was (its array astern, if it has one).
  const course = placeOfCut(entry, cut)?.course;
  const choices = new Map<string, () => unknown>();
  for (const choice of cutChoices(cut, course)) choices.set(choice.label, () => resolveSensor({ keep: choice.keep, cut_ids: [id] }));
  choices.set("Select this cut", () => void select([id]));
  const chosen = await ask(describeCut(cut, entry.sensor.properties.name, course).replace(/\n/g, ". "), [...choices.keys()]);
  if (chosen) await choices.get(chosen)!();
}
// A .dsf or REP file's sensor lines read into the open plot (CAP-22), as one step, the file
// kept as a source: a sensor whose track the plot has not is asked about, as legacy asked.
$<HTMLInputElement>("sensor-file").onchange = async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || !opened || !pythonReady) return;
  const data = new Uint8Array(await file.arrayBuffer());
  status(`Reading ${file.name}…`, true);
  const preview = await pythonJson<SensorPreview & { error?: string }>("sensor_preview", opened.item.id, file.name, data);
  status("");
  if (preview.error) return toast(preview.error, "warning");
  if (!preview.cuts) return toast(`No sensor cut could be read from ${preview.name}. ${preview.omitted.slice(0, 2).join(" ")}`.trim(), "warning");
  let again = false;
  if (preview.earlier.length) {
    const last = preview.earlier[preview.earlier.length - 1];
    if ((await ask(`${preview.name} was read into this plot before: ${last.how}, ${describePeriod(last.at)}.`, ["Read it again"])) !== "Read it again") return toast("Nothing was read.");
    again = true;
  }
  const hosts: Record<string, string | null> = {};
  for (const asked of hostsToAsk(preview)) {
    const names = hostChoices(preview, asked).map((t) => t.name);
    const chosen = await ask(`${hostQuestion(asked)} ${asked.sensors.map(describeSensorInFile).join("; ")}.`, [...names, "Do not read these"]);
    if (!chosen) return toast("Nothing was read.");
    hosts[asked.track] = preview.tracks.find((t) => t.name === chosen)?.id ?? null;
  }
  status(`Reading ${file.name}…`, true);
  const outcome = await sense<{ sensors: string[]; cuts: number; omitted: string[] }>({ kind: "import", name: file.name, hosts, again }, data);
  status("");
  if (outcome.error) return toast(outcome.error, "warning");
  showPanel("panel-outline");
  toast([sensorReadSummary(outcome, file.name), ...(outcome.notes ?? []), ...outcome.omitted].join(" "));
};

/** The sections the reader opened or closed in the Tools, by key: kept as the list is filled again. */
const toolsOpen = new Map<string, boolean>();
/** The Tools panel model's list (webview/panels/tools.ts, PAR-01), as VS Code's is. */
function renderTools(): void {
  const model = new ToolsModel({
    listing,
    problem: pythonProblem,
    plotOpen: !!opened,
    selected: selection.length,
    offered,
    operations: listing ? operations() : [],
  });
  fillTools($("tools"), model, toolsOpen, (row) => runToolsRow(row));
}
/** A Tools row chosen: its catalogued action. */
function runToolsRow(row: ToolsRow): void {
  if (!row.run) return;
  const { action, args } = row.run;
  if (action === "debrief.showToolForm") {
    const tool = tools.find((t) => t.name === args[0]);
    if (tool) openForm(tool);
    return;
  }
  const op = actionOf(action).operation;
  if (op) void runOperation(op as OperationId);
}

/** The History panel model (webview/panels/history.ts, PAR-01), as VS Code's is. */
function historyModel(): HistoryModel {
  return new HistoryModel({
    open: !!opened,
    steps: opened?.steps ?? [],
    current: opened?.base.current ?? 0,
    ...(opened?.revision && { shown: opened.revision.step }),
    // No Python yet, or none: what VS Code says with no tool service.
    ...((!pythonReady || pythonProblem) && opened && { problem: NEEDS_SERVICE }),
    toolTitle: (name) => tools.find((t) => t.name === name)?.title,
  });
}
/** History's title bar (the action catalogue's: Go to latest revision, Undo, Redo) and its rows. */
function renderHistory(): void {
  const { context, reasons } = playContext();
  // Undo and Redo disabled, with the catalogue's reason, when they cannot act (PAR-08), as VS Code's are.
  $("history-actions").replaceChildren(
    ...titleMenu("debrief.history", context, reasons).map((entry) => {
      const button = document.createElement("button");
      button.type = "button";
      button.id = entry.id.replace(/^debrief\./, "");
      button.className = "history-action";
      button.dataset.icon = entry.icon ?? "";
      button.textContent = HISTORY_ACTION_GLYPHS[entry.icon ?? ""] ?? entry.title;
      button.disabled = !entry.enabled;
      button.title = entry.enabled ? entry.title : `${entry.title}: ${entry.reason}`;
      button.setAttribute("aria-label", button.title);
      button.onclick = () => void runHistoryAction(entry.id);
      return button;
    }),
  );
  fillHistory($("history"), historyModel().rows());
}
/** The playground's artwork for History's title bar (cosmetic: VS Code draws the codicons). */
const HISTORY_ACTION_GLYPHS: Record<string, string> = { discard: "↶", redo: "↷", "arrow-right": "→" };
/** A catalogued History action: its title bar's, or a step's (by its number). */
async function runHistoryAction(id: string, step?: number): Promise<void> {
  if (id === "debrief.undo") return move("undo");
  if (id === "debrief.redo") return move("redo");
  if (id === "debrief.goToStep" || id === "debrief.redoToStep") return move("goto", step);
  if (id === "debrief.openLatestRevision" && opened?.revision) return openPlot(opened.item.id);
}
/** A step's context menu (right-click, press and hold, Shift+F10 or the menu key), as VS Code's: the action catalogue's for its menu context. */
function historyRowMenu(li: HTMLElement, x: number, y: number): void {
  const row = historyModel().rows().find((r) => r.key === li.dataset.key);
  if (!row?.menu) return;
  const { context, reasons } = playContext();
  const entries = rowMenu("debrief.history", row.menu, context, reasons);
  if (!entries.length) return;
  openMenu(
    entries.map((e, i) => ({ label: e.title, groupStart: i > 0 && e.group !== entries[i - 1].group, ...(!e.enabled && { disabled: e.reason }), act: () => void runHistoryAction(e.id, row.seq) })),
    { label: `${row.label}: actions`, x, y, from: li },
  );
}
{
  const list = $("history");
  list.addEventListener("contextmenu", (e) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>("li[data-menu]");
    if (!li) return;
    e.preventDefault();
    historyRowMenu(li, e.clientX, e.clientY);
  });
  list.addEventListener("keydown", (e) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>("li[data-menu]");
    if (!li || !(e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey))) return;
    e.preventDefault();
    const at = li.getBoundingClientRect();
    historyRowMenu(li, at.left + 16, at.bottom);
  });
  // Press and hold a step on a touch screen: its menu, as a right-click (presshold.ts).
  const hold = new PressHold((x, y) => document.elementFromPoint(x, y)?.closest<HTMLElement>("#history li[data-menu]") && historyRowMenu(document.elementFromPoint(x, y)!.closest<HTMLElement>("#history li[data-menu]")!, x, y));
  const touch = (e: PointerEvent) => e.pointerType === "touch" || e.pointerType === "pen";
  list.addEventListener("pointerdown", (e) => (touch(e) ? hold.press(e.pointerId, e.clientX, e.clientY) : hold.reset()));
  list.addEventListener("pointermove", (e) => void (touch(e) && hold.move(e.pointerId, e.clientX, e.clientY)));
  for (const type of ["pointerup", "pointercancel"] as const) list.addEventListener(type, (e) => void (touch(e) && hold.release(e.pointerId)));
}

async function refreshPlots(): Promise<void> {
  const plots = await pythonJson<{ id: string; title: string }[]>("plots");
  const picker = $<HTMLSelectElement>("plots");
  picker.replaceChildren(...plots.map((p) => new Option(p.title, p.id)));
  picker.disabled = false;
  if (opened) picker.value = opened.item.id;
}

// --- Notices and questions ---------------------------------------------------------
function status(text: string, busy = false): void {
  $("status").textContent = text;
  $("status").classList.toggle("busy", busy);
}
/**
 * A message, as VS Code's notifications (toast, without buttons; notify, with): its text and its buttons. Resolves to the
 * button chosen, or undefined once it goes (after 8 s, or longer while it offers a choice).
 */
function toast(text: string, kind: "info" | "warning" = "info"): void {
  void notify(text, kind);
}
function notify(text: string, kind: "info" | "warning" = "info", buttons: readonly string[] = []): Promise<string | undefined> {
  const note = document.createElement("div");
  note.className = `toast ${kind}`;
  note.setAttribute("role", "status");
  note.append(Object.assign(document.createElement("span"), { textContent: text }));
  return new Promise((resolve) => {
    const gone = (chosen?: string) => {
      note.remove();
      resolve(chosen);
    };
    for (const label of buttons) {
      const button = Object.assign(document.createElement("button"), { type: "button", textContent: label, className: "toast-button" });
      button.onclick = () => gone(label);
      note.append(" ", button);
    }
    $("toasts").append(note);
    setTimeout(gone, buttons.length ? 20000 : 8000);
  });
}
function ask(question: string, choices: string[]): Promise<string | undefined> {
  return new Promise((resolve) => {
    const dialog = $<HTMLDialogElement>("ask");
    $("ask-text").textContent = question;
    let chosen: string | undefined;
    const buttons = [...choices, "Cancel"].map((choice, i) => {
      const button = document.createElement("button");
      button.textContent = choice;
      button.className = i === 0 ? "primary" : "";
      button.onclick = () => {
        chosen = choice === "Cancel" ? undefined : choice;
        dialog.close();
      };
      return button;
    });
    $("ask-buttons").replaceChildren(...buttons);
    // However the dialog closes, Escape included, the question is answered: Escape is Cancel.
    dialog.onclose = () => resolve(chosen);
    dialog.showModal();
  });
}

// --- Collation (CAP-08 to CAP-12): the catalogue's items, and the open plot's coverage ---
// As VS Code's Catalogues tree and Coverage view: each item in the folder tree the plot
// draws from with its tracks and their periods of data, new data marked with a sparkle and
// the words "New data" (never colour alone), plots that drew from an item since revised
// flagged "May need review"; and Coverage, the same component as VS Code's, to choose which
// item supplies each period. Each step goes through Python as the tool service's do.
type CollationStep =
  | { kind: "take"; source: { catalogue: string; item: string; revision?: string } }
  | { kind: "prefer"; feature: string; period: TimeRange; source: SourceTrackRef }
  | { kind: "link"; feature: string; source: SourceTrackRef; linked: boolean }
  | { kind: "dismiss"; source: ItemRevision }
  | { kind: "reviewed"; item?: string };
let coverage: CoverageReport | undefined;
let reviewFlags: ReviewFlag[] = [];
/** Review flags already said, so each revision is said once (CAP-12). */
const flagsSaid = new Set<string>();
const coverageControl = new CoverageControl($("coverage"), {
  choose: (track, period, source) => void collateStep({ kind: "prefer", feature: track, period, source }),
  link: (track, source, linked) => void collateStep({ kind: "link", feature: track, source, linked }),
  take: (item) => void collateStep({ kind: "take", source: item }),
  dismiss: (item) => void collateStep({ kind: "dismiss", source: item }),
  reviewed: () => void collateStep({ kind: "reviewed" }),
});
/** How long each ask for coverage took, from asking Python to its answer, for the performance check (NFR-01). */
const coverageTimes: number[] = [];
(window as unknown as { debriefCoverage: () => unknown }).debriefCoverage = () => ({ coverage, flags: reviewFlags, times: coverageTimes.slice(-20) });

/** Ask Python what collation says of the open plot and the catalogue; show it, and say a new revision once. */
async function refreshCollation(): Promise<void> {
  if (!opened) return;
  const asked = opened.item.id;
  const started = performance.now();
  const answer = await pythonJson<{ coverage?: CoverageReport; flags?: ReviewFlag[]; error?: string }>("coverage", asked);
  coverageTimes.push(performance.now() - started);
  if (opened?.item.id !== asked) return; // another plot was opened meanwhile
  if (answer.error) return coverageControl.say(answer.error);
  coverage = answer.coverage;
  reviewFlags = answer.flags ?? [];
  coverageControl.show(coverage);
  coverageControl.setTime(time ? Date.parse(time.current) : undefined);
  coverageSeen();
  renderItems();
  const fresh = reviewFlags.filter((f) => !flagsSaid.has(`${f.item}:${f.revised.map((r) => r.revision).join()}`));
  for (const f of fresh) flagsSaid.add(`${f.item}:${f.revised.map((r) => r.revision).join()}`);
  for (const f of fresh) toast(`${f.note}. Reviewed, under Catalogue or Coverage, clears the flag.`, "warning");
}

/** The catalogue's items, as Catalogues lists them: marks, tracks and what can be done to each. */
function renderItems(): void {
  const items = coverage?.items ?? [];
  $("items").replaceChildren(
    ...items.map((item) => {
      const li = document.createElement("li");
      const flag = reviewFlags.find((f) => f.catalogue === item.catalogue && f.item === item.item);
      const open = item.role === "this_plot";
      li.className = `item${open ? " item-open" : ""}`;
      const words = [open ? "open" : "", item.new_data ? "New data" : "", flag ? "May need review" : "", item.role === "drawn_from" ? (item.revised ? "drawn from, revised since" : "drawn from") : ""].filter(Boolean);
      const notes = [item.new_data?.note, flag ? `${flag.note}.` : "", item.revised ? "Revised since this plot took data from it." : ""].filter(Boolean);
      li.setAttribute("aria-label", [item.title, ...words, ...notes].join(", "));
      const name = document.createElement("div");
      name.className = "item-name";
      // A mark is a symbol and words, its reason the tooltip: never colour alone.
      const symbol = flag ? "⚑" : item.new_data ? "✦" : "";
      name.innerHTML = `${symbol ? `<span class="item-mark${flag ? " item-flag" : ""}" aria-hidden="true">${symbol}</span> ` : ""}<span class="item-title"></span>`;
      name.querySelector(".item-title")!.textContent = item.title;
      if (notes.length) name.title = notes.join(" ");
      const detail = document.createElement("div");
      detail.className = "detail";
      detail.textContent = [...words, describePeriod(item.start ?? undefined, item.end ?? undefined)].filter(Boolean).join(" · ");
      const actions = document.createElement("div");
      actions.className = "item-actions";
      const button = (text: string, title: string, act: () => void) => {
        const b = document.createElement("button");
        b.textContent = text;
        b.title = title;
        b.onclick = act;
        actions.append(b);
      };
      if (!open) {
        button("Open", `Open ${item.title}`, () => void openPlot(item.item));
        button(item.new_data ? "Take" : "Take data", `Take its data into ${opened?.item.properties.title ?? "this plot"}, as one step: Undo takes it back`, () =>
          void collateStep({ kind: "take", source: { catalogue: item.catalogue, item: item.item, ...(item.revision && { revision: item.revision }) } }),
        );
      }
      if (item.new_data) button("Not now", "Set it aside: the mark clears until it is revised", () => void collateStep({ kind: "dismiss", source: { catalogue: item.catalogue, item: item.item, revision: item.new_data!.revision } }));
      if (flag) button("Reviewed", "You have reviewed this plot against the revised items: clear its flag until one is revised again", () => void collateStep({ kind: "reviewed", item: item.item }));
      li.append(name, detail);
      if (item.tracks?.length) {
        const tracks = document.createElement("details");
        const summary = document.createElement("summary");
        summary.textContent = count(item.tracks.length, "track");
        const list = document.createElement("ul");
        list.className = "item-tracks";
        list.replaceChildren(
          ...item.tracks.map((t) => {
            const row = document.createElement("li");
            const spans = t.spans.map((s) => describeTimes(s.start, s.end)).join("; ");
            row.textContent = `${t.name}: ${spans} · ${count(t.fixes, "fix", "fixes")}`;
            return row;
          }),
        );
        tracks.append(summary, list);
        li.append(tracks);
      }
      if (actions.childElementCount) li.append(actions);
      return li;
    }),
  );
  // Plots elsewhere in the catalogue that may need review, though not in this plot's folder tree.
  for (const flag of reviewFlags.filter((f) => !items.some((i) => i.item === f.item))) {
    const li = document.createElement("li");
    li.className = "item";
    li.innerHTML = `<div class="item-name"><span class="item-mark item-flag" aria-hidden="true">⚑</span> <span class="item-title"></span></div><div class="detail"></div>`;
    li.querySelector(".item-title")!.textContent = flag.title;
    li.querySelector(".detail")!.textContent = `May need review · ${flag.note}`;
    $("items").append(li);
  }
}

/** A collation step, one recorded step in the plot's history; or new data set aside or a flag cleared, in a plot's island. */
async function collateStep(change: CollationStep): Promise<void> {
  if (!opened || !pythonReady) return;
  status("Collating…", true);
  const outcome = await pythonJson<{ error?: string; changed?: boolean; notes?: string[]; message?: string }>("collate", opened.item.id, JSON.stringify({ base: opened.base, change }));
  status("Ready. Everything runs in your browser; nothing is sent anywhere.");
  if (outcome.error) {
    toast(outcome.error, "warning");
    coverageControl.say(outcome.error);
    return;
  }
  if (!outcome.changed) {
    if (outcome.message) {
      // Nothing taken, but the plot's island may say it is reviewed now: show collation again.
      await refreshCollation();
      toast(outcome.message);
    }
    coverageControl.say(outcome.message ?? "Nothing to change: it is so already.");
    return;
  }
  // The plot, its island or another plot's island changed: show the latest, and with it collation.
  await openPlot(opened.item.id, true);
  if (outcome.notes?.length) toast(`${outcome.notes[0]}. Undo takes it back.`);
}

// --- Exported images (SUB-25): the map drawn as an image with its ID, and traced back -----
let imageRendered: ((message: { image?: RenderedImage; message?: string }) => void) | undefined;
/** The map draws the image; resolved by its image_rendered. */
function drawImage(request: { format: ImageFormat; preset: ImagePreset; theme: ImageTheme; footer_text?: string }): Promise<RenderedImage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("the map did not draw it in time")), 60000);
    imageRendered = (message) => {
      clearTimeout(timer);
      imageRendered = undefined;
      if (message.image) resolve(message.image);
      else reject(new Error(message.message ?? "the map could not draw it"));
    };
    post(map, { kind: "export_image", image_request: request });
  });
}
/** What the reader chose for an export; its size and colours remembered in this browser. */
function exportChoice(): ExportChoice {
  return {
    format: $<HTMLSelectElement>("export-format").value as ImageFormat,
    preset: $<HTMLSelectElement>("export-preset").value as ImagePreset,
    theme: $<HTMLSelectElement>("export-theme").value as ImageTheme,
    footer: $<HTMLInputElement>("export-footer").checked,
  };
}
const EXPORT_KEY = "debrief.play.export";
function rememberExport(choice: ExportChoice): void {
  try {
    // The size and colours only: the footer is on again next time (expert panel, 16 Oct 2026).
    localStorage.setItem(EXPORT_KEY, JSON.stringify(rememberedOf(choice)));
  } catch {
    // a private window: not remembered
  }
}
function recalledExport(): ExportChoice {
  try {
    return startingChoice(JSON.parse(localStorage.getItem(EXPORT_KEY) ?? "{}"));
  } catch {
    return startingChoice(undefined);
  }
}
/**
 * Export the map as the reader sees it: an image ID for the plot at the revision shown,
 * the map drawn at the size and in the colours chosen with the ID's short form in a
 * corner, the ID put into its metadata and the export recorded in the plot's export log
 * (its island, never a step), then the file handed to the reader to save.
 */
async function exportMap(): Promise<void> {
  if (!opened || !pythonReady) return;
  const choice = exportChoice();
  rememberExport(choice);
  const said = $("export-said");
  const item = opened.item.id;
  said.textContent = "Preparing the image…";
  const button = $<HTMLButtonElement>("export-image");
  button.disabled = true; // one image at a time
  try {
    const figure = await pythonJson<{ id: string; short: string; revision: string; error?: string }>("figure_id", item, opened.revision?.revision ?? (opened.base.plot_hash || null));
    if (figure.error) throw new Error(figure.error);
    const shown = opened;
    const image = await drawImage({ format: choice.format, preset: choice.preset, theme: choice.theme, ...(choice.footer && { footer_text: figure.short }) });
    // Drawn as it was shown: read again meanwhile (changed elsewhere), the image is not of the revision its ID names.
    if (opened !== shown) throw new Error("the plot changed while the image was being drawn. Export it again.");
    const file = fileNameFor(opened.item.properties.title ?? item, figure.short, choice.format);
    const bytes = choice.format === "png" ? Uint8Array.from(atob(image.data), (c) => c.charCodeAt(0)) : new TextEncoder().encode(image.data);
    const tote = toteChoice();
    const request = { id: figure.id, file, footer: choice.footer, format: choice.format, preset: choice.preset, theme: choice.theme, width: image.width, height: image.height, viewport: image.viewport, time, ...(tote.primary && { tote }) };
    const done = await pythonJson<{ data?: string; short: string; recorded: boolean; note?: string; error?: string; view?: PlotView | null; view_hash?: string }>("export_image", item, JSON.stringify(request), bytes);
    if (done.error || !done.data) throw new Error(done.error ?? "it could not be saved");
    // The plot's island has the export log now: kept, so the next change to the view is not taken for a colleague's.
    if (opened?.item.id === item && !opened.revision && done.view_hash) {
      opened.view_hash = done.view_hash;
      setViewOf(opened.plot, done.view ?? null);
    }
    const blob = new Blob([Uint8Array.from(atob(done.data), (c) => c.charCodeAt(0))], { type: choice.format === "png" ? "image/png" : "image/svg+xml" });
    const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: file });
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 60000);
    // There is no save dialog here to rename it in: say plainly that the plot's title travels in the name (product owner, 16 Oct 2026).
    const titled = `Its file name, ${file}, has the plot's title in it: rename it before sending it on if the title should not travel.`;
    said.textContent = [describeExported({ file, short: done.short, recorded: done.recorded, note: done.note }, choice.footer), titled, ...(image.notes ?? [])].join(" ");
  } catch (error) {
    said.textContent = `The image was not exported: ${(error as Error).message}`;
  } finally {
    button.disabled = false;
    $<HTMLInputElement>("export-footer").checked = true; // on again for the next image
  }
}
/** What Find source answers: each ID found, with the plots and exports it names; the pictures not read, and why. */
type Traced = { images: { id: string; short: string; where: string; sources: FigureSource[] }[]; problem?: string; skipped?: { where: string; why: string }[] };
/**
 * The plots an image came from, by a file's metadata or an ID typed from its corner; one
 * found is opened as it was then. Several (two exports of one revision, say) are listed
 * for the reader to choose, never one picked for them.
 */
async function findSource(how: { file: File } | { typed: string }): Promise<void> {
  if (!pythonReady) return;
  const list = $("find-results");
  list.replaceChildren();
  $("find-said").textContent = "Looking…";
  const answer =
    "file" in how
      ? await pythonJson<Traced>("find_image_source", how.file.name, new Uint8Array(await how.file.arrayBuffer()), null)
      : await pythonJson<Traced>("find_image_source", null, null, how.typed);
  // A picture that could not be read (encrypted, say): said, the others still traced.
  const unread = (answer.skipped ?? []).map((s) => `${s.where} was not read: ${s.why}.`).join(" ");
  const several = answer.images.reduce((n, i) => n + i.sources.length, 0) > 1 ? "Several exports match: choose one by when it was exported and what it showed." : "";
  $("find-said").textContent = answer.problem ?? [several, answer.images.length ? unread : ""].filter(Boolean).join(" ");
  const found = answer.images.flatMap((image) => image.sources.map((source) => ({ image, source })));
  for (const { image, source } of found) {
    const row = document.createElement("li");
    const { label, detail } = describeSource(source);
    const words = Object.assign(document.createElement("span"), { textContent: `${image.short}: ${label}` });
    const where = Object.assign(document.createElement("span"), { className: "detail", textContent: [detail, image.where === "typed" ? "" : image.where].filter(Boolean).join(" · ") });
    const open = Object.assign(document.createElement("button"), { textContent: "Open as exported", title: "Show the plot as it was when the image was exported, read-only" });
    open.onclick = () => void openRevision(source, image.id, image.short);
    row.append(words, " ", open, where);
    list.append(row);
  }
  if (found.length === 1) await openRevision(found[0].source, found[0].image.id, found[0].image.short);
}
/** Show a plot as it was at an image's revision, read-only, with the view and time it was exported at. */
async function openRevision(source: FigureSource, id: string, short: string): Promise<void> {
  const shown = await pythonJson<Opened & { error?: string }>("open_revision", source.item, source.revision, id.startsWith("DBF1") ? id : source.export?.id ?? null);
  if (shown.error) return toast(shown.error, "warning");
  if (opened && opened.item.id !== source.item) closeSide();
  shown.revision = { ...revisionOf(source, short), ...shown.revision, figure: short };
  opened = shown;
  selection = [];
  $<HTMLSelectElement>("plots").value = source.item;
  $("plot-title").textContent = `${opened.item.properties.title ?? source.item} (read-only)`;
  $("plot-title").classList.add("read-only"); // shown beside the list only then: otherwise it says what the list says
  const exported = shown.export ?? source.export;
  // The Tote's tracks as exported, so its lines and values are the image's (product owner, 16 Oct 2026).
  if (exported?.tote) setViewOf(opened.plot, { ...(viewOf(opened.plot) ?? {}), tote: exported.tote });
  if (exported?.time) savedWindow = exported.time.range; // the window this revision is shown in, not one beyond a saved window
  showTime(exported?.time ?? timeOf(opened.item, opened.plot));
  showPlot();
  if (exported?.viewport) post(map, { kind: "set_viewport", viewport: exported.viewport });
  renderOutline();
  renderTimeline();
  renderHistory();
  showTote();
  $("find-said").textContent = `Showing ${opened.item.properties.title ?? source.item} at step ${source.step}, as when ${short} was exported. Read-only: Go to latest on the map to change it.`;
}
function setUpExport(): void {
  const presets = $<HTMLSelectElement>("export-preset");
  presets.replaceChildren(...PRESETS.map((p) => Object.assign(new Option(p.label, p.id), { title: p.detail })));
  const recalled = recalledExport();
  $<HTMLSelectElement>("export-format").value = recalled.format;
  presets.value = recalled.preset;
  $<HTMLSelectElement>("export-theme").value = recalled.theme;
  $<HTMLInputElement>("export-footer").checked = recalled.footer;
  $("export-image").onclick = () => void exportMap();
  $<HTMLInputElement>("find-file").onchange = (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) void findSource({ file });
    (event.target as HTMLInputElement).value = "";
  };
  const typed = $<HTMLInputElement>("find-id");
  const problem = $("find-id-problem");
  typed.oninput = () => {
    problem.textContent = typed.value.trim() ? (figureIdProblem(typed.value) ?? "") : "";
    typed.setAttribute("aria-invalid", String(!!problem.textContent));
  };
  $<HTMLFormElement>("find-id-form").onsubmit = (event) => {
    event.preventDefault();
    const why = figureIdProblem(typed.value);
    problem.textContent = why ?? "";
    if (!why) void findSource({ typed: typed.value });
  };
}
setUpExport();

// --- Wiring -----------------------------------------------------------------------
const OPTIONAL = ["tour", "tote", "timeline", "catalogue", "coverage", "bearings", "tools", "history", "export", "try", "import"];
// A panel not listed is not shown; a menu (Export, Try, Import) is shown only when opened.
for (const panel of OPTIONAL) $(`panel-${panel}`).hidden = !panels.has(panel) || $(`panel-${panel}`).classList.contains("menu-panel");
// The top bar's menus, and the Catalogue's Import…, only where their panels are listed.
$("open-export").hidden = !panels.has("export");
$("open-try").hidden = !panels.has("try");
$("open-import").hidden = !panels.has("import");
$("catalogue-import").hidden = !panels.has("import");
// The side column (the narrow layout): the walkthroughs, time controller, Tote and Outline first,
// then the panels in the order the demo lists them.
const SIDE_ORDER = [...SIDE_FIRST, ...panelOrder.map((p) => `panel-${p}`).filter((id) => !SIDE_FIRST.includes(id) && optional(id)?.matches("#side > section.panel"))];
for (const id of SIDE_ORDER) $("side").append($(id));
/** History, Try and Import need Python: off until it is ready. */
const NEEDS_PYTHON = ["export-image", "find-file", "find-id", "find-id-go", "new-data", "revise", "ask-again", "glitches", "crash", "colleague", "colleague-window", "colleague-during", "file", "narrative-file", "sensor-file"];
function needsPython(on: boolean): void {
  for (const id of NEEDS_PYTHON) $<HTMLButtonElement | HTMLInputElement>(id).disabled = !on;
}
needsPython(false);
renderHistory(); // Undo and Redo disabled, saying why, until Python is ready and there is a step to take back

// --- The layout (product owner, 23 Oct 2026) ---------------------------------------
// 900 px wide and more (and 480 high), the panels are docked around the map in tab groups,
// "A, task-grouped" (panels.mjs): Time, Tote, Outline with Catalogue, and Tools with History on the
// left; Timeline with Coverage under the map; the walkthroughs alone on the right, where a newcomer
// starts and a step's words are never hidden behind another tab. The reader drags tabs to rearrange
// them, or moves them from a tab's menu (the way by touch, too); the layout is remembered in this
// browser, except in a blog's demo (dock.ts). Narrower, and on phones, the panels are the one side
// column as before, each folding by its heading (engineering decision, 23 Oct 2026).
// The map and the form beside it (in <main>) never move in the page, docked or not: moving a frame
// reloads it. Docked, <main> is laid over the map's empty place in the layout.
const DOCKED = matchMedia("(min-width: 900px) and (min-height: 480px)");
const mapSlot = document.createElement("div");
mapSlot.className = "map-slot";
/** The browser's local storage, or none where reading it throws. */
const layoutStorage = (): LayoutStorage | undefined => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};
/**
 * Below this width the map's place is too narrow for a tool's form beside the map: the form goes
 * under it, as in the narrow layout (panel review, 23 Oct 2026). The form beside the map is 34% of
 * the place, 260 to 380 px; 640 px keeps the map at least 380 px wide beside it.
 */
const FORM_BESIDE_FROM = 640;
/** Docked: <main> over the map's place; the form beside the map or under it, by the place's width; the notes over the map. */
function placeMain(): void {
  const main = $("main");
  if (!dock) {
    main.removeAttribute("style");
    main.classList.remove("form-under");
    document.body.style.removeProperty("--map-right");
    return;
  }
  const slot = mapSlot.getBoundingClientRect();
  const app = $("app").getBoundingClientRect();
  Object.assign(main.style, { left: `${slot.left - app.left}px`, top: `${slot.top - app.top}px`, width: `${slot.width}px`, height: `${slot.height}px` });
  main.classList.toggle("form-under", slot.width < FORM_BESIDE_FROM);
  document.body.style.setProperty("--map-right", `${Math.max(0, innerWidth - slot.right)}px`);
}
let placing = false;
const placeSoon = () => {
  placeMain();
  if (placing) return;
  placing = true;
  // Dockview places its panels a frame after a change: placed again then, and a frame after.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      placing = false;
      placeMain();
    }),
  );
};
/** The top bar's controls the keyboard reaches, in order: before the layout's first group and after its last. */
const topBarControls = () => Array.from(document.querySelectorAll<HTMLElement>("#topbar select, #topbar button")).filter((el) => !el.hidden && !(el as HTMLButtonElement).disabled && el.offsetParent !== null);
/** The docked layout: as remembered, or fresh (the default, remembered from now on). */
function makeDock(fresh: boolean): Dock {
  const sections = new Map(Object.keys(PANEL_TITLES).filter((id) => !$(id).hidden).map((id) => [id, $(id)] as const));
  return new Dock({
    container: $("dock"),
    sections,
    titles: PANEL_TITLES,
    slot: mapSlot,
    overSlot: $("main"),
    before: () => topBarControls().at(-1),
    after: () => topBarControls()[0],
    remember: !params.has("panels"),
    fresh,
    storage: layoutStorage,
    shown: (id, shown) => sections.get(id)?.dispatchEvent(new CustomEvent("fold", { detail: { open: shown } })),
    changed: placeSoon,
    dragging: (on) => document.body.classList.toggle("dock-dragging", on),
    reset: resetLayout,
  });
}
/**
 * Moving a panel between the layout and the side column (narrow and back, Reset) would put every
 * list in it back at its top: a browser forgets an element's scroll when it moves. So each scroll
 * is kept, inside the panels (the Timeline's list, the Outline's) and of each docked panel itself,
 * and given back once moved (panel review, 23 Oct 2026).
 *
 * Given back as each list gets its size, not at a set frame (CI, 23 Oct 2026): docked, a panel's
 * content has no height until Dockview places it, a frame or more later on a slow machine, and a
 * scroll given to a list with nothing to scroll is lost. So a list that has not got its scroll back
 * is given it again each time it is resized, until every list has its own, or the reader scrolls,
 * clicks or types, or the layout moves again. A list that something else has placed meanwhile (the
 * Timeline keeps the entry at its top) is left where that put it.
 */
const panelScroll = new Map<string, number>();
/** Stops giving scrolls back from the last move. */
let stopKeeping: (() => void) | undefined;
/** How long, at most, to keep giving a scroll back after a move. */
const KEEP_SCROLL_FOR = 5000;
/**
 * Each list's last scroll, with its size then (CI, 24 Oct 2026). Before the panels move, the page may
 * already be laid out at the new width: the side column wider, a list's rows no longer wrap, it has
 * less to scroll, and the browser pulls it back to the end of what is left (its top, when nothing is).
 * That is not the reader's scroll: a scroll back to a list's end that comes with its change of size is
 * not kept here, and the scroll before it is given back once the panels have moved.
 */
type ScrollPlace = { top: number; left: number; size: string };
const scrollPlaces = new Map<Element, ScrollPlace>();
const sizeOf = (el: Element) => `${el.clientWidth}×${el.clientHeight} of ${el.scrollWidth}×${el.scrollHeight}`;
/** The scroll the browser has taken from a list, down or across (pulled back to the end of what is left), if it has. */
function scrollTaken(el: Element): ScrollPlace | undefined {
  const was = scrollPlaces.get(el);
  if (!was) return undefined;
  const down = was.top > el.scrollTop && el.scrollTop >= el.scrollHeight - el.clientHeight - 1;
  const across = was.left > el.scrollLeft && el.scrollLeft >= el.scrollWidth - el.clientWidth - 1;
  return (down || across) && was.top >= el.scrollTop && was.left >= el.scrollLeft ? was : undefined;
}
document.addEventListener(
  "scroll",
  (e) => {
    const el = e.target;
    if (!(el instanceof Element) || !el.closest("section.panel")) return;
    const was = scrollPlaces.get(el);
    const now = { top: el.scrollTop, left: el.scrollLeft, size: sizeOf(el) };
    const pulledBack = was && was.size !== now.size && !!scrollTaken(el);
    scrollPlaces.set(el, pulledBack ? { ...was, size: now.size } : now);
  },
  { capture: true, passive: true },
);
function keepingScroll(move: () => void): void {
  stopKeeping?.();
  const kept: { el: Element; top: number; left: number; given?: [number, number] }[] = [];
  for (const id of Object.keys(PANEL_TITLES)) {
    const section = $(id);
    for (const el of [section, ...Array.from(section.querySelectorAll("*"))]) {
      // Its scroll now, or, where the browser has already taken some of it, the one before.
      const taken = scrollTaken(el);
      if (taken) kept.push({ el, top: taken.top, left: taken.left });
      else if (el.scrollTop || el.scrollLeft) kept.push({ el, top: el.scrollTop, left: el.scrollLeft });
    }
    const content = dock?.contentOf(id);
    if (content) panelScroll.set(id, content.scrollTop);
  }
  move();
  for (const [id, top] of panelScroll) {
    const content = dock?.contentOf(id);
    if (content && top) kept.push({ el: content, top, left: content.scrollLeft });
  }
  /** Gives each list its scroll, if it has not got it yet; true when every list has. */
  const give = (): boolean => {
    for (const k of kept.slice()) {
      const { el, top, left, given } = k;
      const has = el.scrollTop === top && el.scrollLeft === left;
      const placedElsewhere = given !== undefined && (el.scrollTop || el.scrollLeft) && (el.scrollTop !== given[0] || el.scrollLeft !== given[1]);
      if (!has && !placedElsewhere) {
        el.scrollTop = top;
        el.scrollLeft = left;
        k.given = [el.scrollTop, el.scrollLeft];
      }
      if ((el.scrollTop === top && el.scrollLeft === left) || placedElsewhere) kept.splice(kept.indexOf(k), 1);
    }
    return !kept.length;
  };
  for (const el of scrollPlaces.keys()) if (!el.isConnected) scrollPlaces.delete(el);
  // At once, before a list that keeps its own place lays itself out for its new width.
  if (give()) return;
  const resized = new ResizeObserver(() => void (give() && stop()));
  for (const { el } of kept) resized.observe(el);
  const readerActs = ["wheel", "pointerdown", "keydown", "touchstart"];
  const stop = () => {
    resized.disconnect();
    for (const type of readerActs) removeEventListener(type, stop, true);
    clearTimeout(timer);
    if (stopKeeping === stop) stopKeeping = undefined;
  };
  for (const type of readerActs) addEventListener(type, stop, { capture: true, passive: true });
  const timer = setTimeout(stop, KEEP_SCROLL_FOR);
  stopKeeping = stop;
}
/** The panels back in the side column, and the layout gone. */
function unDock(): void {
  for (const id of SIDE_ORDER) $("side").append($(id));
  dock?.dispose();
  dock = undefined;
}
/** Reset layout: the default, made afresh; the keyboard on the button that asked, or the time controller's tab. */
function resetLayout(): void {
  if (!dock) return;
  const focused = document.activeElement;
  keepingScroll(() => {
    unDock();
    dock = makeDock(true);
  });
  placeSoon();
  bearingsWidth();
  refreshTote();
  if (!(focused instanceof HTMLElement && focused.isConnected)) dock?.focusTab("panel-time");
}
/**
 * Where the keyboard goes when the layout changes under it (panel review, 23 Oct 2026): a panel's
 * tab becomes its heading's fold button going narrow, and the fold button its tab going docked;
 * what was inside a panel stays where it was; a menu of the top bar closes, back to its button.
 */
function focusAfterLayout(focused: HTMLElement | undefined): void {
  if (!focused) return;
  const panelId = focused.dataset.panel ?? (focused.matches("button.fold") ? focused.closest("section.panel")?.id : undefined);
  if (focused.matches(".dv-tab") && panelId) {
    if (dock) dock.focusTab(panelId);
    else optional(panelId)?.querySelector<HTMLElement>("button.fold")?.focus({ preventScroll: true });
    return;
  }
  if (focused.matches("button.fold") && panelId && dock) return dock.focusTab(panelId);
  if (focused.isConnected && document.activeElement !== focused) focused.focus({ preventScroll: true });
}
/** Docked or not, as the window is now; the keyboard stays where it was, or on its equivalent. */
function setLayout(): void {
  const docked = DOCKED.matches;
  if (docked === !!dock) return;
  const focused = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : undefined;
  if (menuShown) {
    closeMenuPanel(!!focused && menuShown.panel.contains(focused));
    return finishLayout(docked, undefined);
  }
  finishLayout(docked, focused);
}
function finishLayout(docked: boolean, focused: HTMLElement | undefined): void {
  keepingScroll(() => {
    if (docked) {
      document.body.classList.add("docked");
      $("dock").hidden = false;
      folds.suspend(true);
      dock = makeDock(false);
      bearingsWidth();
    } else {
      unDock();
      $("dock").hidden = true;
      document.body.classList.remove("docked", "dock-dragging");
      folds.suspend(false);
    }
  });
  $("reset-layout").hidden = !dock;
  placeMain();
  focusAfterLayout(focused);
  // What shows only in view (the Tote's values, Coverage's step) as the panels now are.
  refreshTote();
  coverageSeen();
}
setLayout();
DOCKED.addEventListener("change", setLayout);
addEventListener("resize", placeSoon);
$("reset-layout").onclick = () => dock?.reset();
/** For the tests: the layout as it is. */
(window as unknown as { debriefLayout: () => unknown }).debriefLayout = () => ({ docked: !!dock, groups: dock?.groups() ?? [], map: MAP_ID });

// --- The top bar's menus: Export, Try and Import, each under its button ---------------
/** The menu open, and the button that opened it. */
let menuShown: { panel: HTMLElement; from: HTMLElement } | undefined;
const menuButtons = (id: string) => Array.from(document.querySelectorAll<HTMLElement>(`[aria-controls="${id}"].menu-button`));
/** Open a menu under the button that opened it (or its top bar button), within the window. */
function openMenuPanel(id: string, from?: HTMLElement): void {
  const panel = $(id);
  const button = from ?? menuButtons(id).find((b) => !b.hidden && b.offsetParent) ?? menuButtons(id)[0];
  if (menuShown?.panel === panel) return;
  closeMenuPanel(false);
  panel.hidden = false;
  menuShown = { panel, from: button };
  for (const b of menuButtons(id)) b.setAttribute("aria-expanded", String(b === button));
  const box = button.getBoundingClientRect();
  const width = panel.getBoundingClientRect().width;
  panel.style.left = `${Math.max(4, Math.min(box.left, innerWidth - width - 4))}px`;
  panel.style.top = `${box.bottom + 2}px`;
  panel.style.maxHeight = `${Math.max(160, innerHeight - box.bottom - 10)}px`;
}
function closeMenuPanel(focus: boolean): void {
  const was = menuShown;
  if (!was) return;
  menuShown = undefined;
  was.panel.hidden = true;
  for (const b of menuButtons(was.panel.id)) b.setAttribute("aria-expanded", "false");
  if (focus && was.from.isConnected) was.from.focus();
}
for (const button of Array.from(document.querySelectorAll<HTMLElement>(".menu-button"))) {
  button.addEventListener("click", () => {
    const id = button.getAttribute("aria-controls") ?? "";
    if (menuShown && menuShown.panel.id === id && menuShown.from === button) closeMenuPanel(false);
    else {
      openMenuPanel(id, button);
      firstControl($(id)).focus({ preventScroll: true });
    }
  });
}
for (const panel of Array.from(document.querySelectorAll<HTMLElement>(".menu-panel"))) {
  panel.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    closeMenuPanel(true);
  });
}
// A pointer pressed outside the menu closes it; not in a question it asked (a dialog), nor on a note.
document.addEventListener(
  "pointerdown",
  (e) => {
    const target = e.target as HTMLElement;
    if (!menuShown || menuShown.panel.contains(target) || menuShown.from.contains(target) || target.closest("dialog, .toasts")) return;
    closeMenuPanel(false);
  },
  true,
);
// A click in a frame (the map, a form) reaches no listener here: the page losing focus to it closes the menu.
addEventListener("blur", () => setTimeout(() => document.activeElement instanceof HTMLIFrameElement && closeMenuPanel(false)));
// A file chosen to import: the menu has done its part.
for (const id of ["file", "narrative-file"]) $(id).addEventListener("change", () => closeMenuPanel(false));
// The window resized (the menu's place moved with its button) or, narrow, the page scrolled (the menu
// stays where it was put, its button scrolls away): the menu closes, the keyboard back on its
// button if it was in the menu. Tabbing out of a menu closes it too.
const closeIfMoved = () => menuShown && closeMenuPanel(menuShown.panel.contains(document.activeElement));
addEventListener("resize", closeIfMoved);
addEventListener("scroll", () => !dock && closeIfMoved(), { passive: true });
for (const panel of Array.from(document.querySelectorAll<HTMLElement>(".menu-panel"))) {
  panel.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    // Once the keyboard has gone where Tab takes it: out of the menu (to the page or past it), the menu closes.
    setTimeout(() => menuShown?.panel === panel && !panel.contains(document.activeElement) && closeMenuPanel(false));
  });
}

$<HTMLSelectElement>("plots").onchange = (e) => void openPlot((e.target as HTMLSelectElement).value);
$("crash").onclick = async () => {
  if (!opened) return;
  await python("crash", opened.item.id, new Date().toISOString(), time?.current ?? null);
  toast("Debrief stopped part-way through saving a note: the new plot file was written, but had not yet replaced the old one. Reopen the plot to see what happens.", "warning");
  $("reopen").hidden = false;
};
$("reopen").onclick = async () => {
  $("reopen").hidden = true;
  if (opened) await openPlot(opened.item.id, true);
};
$("colleague").onclick = async () => {
  if (!opened) return;
  await python("colleague", opened.item.id, new Date().toISOString(), time?.current ?? null);
  // As the extension does when the plot changes on disk: show the latest, and say so.
  await openPlot(opened.item.id, true);
  toast(`${opened.item.properties.title} was changed elsewhere. Debrief is showing the latest.`);
};
$("glitches").onclick = async () => {
  const ids = tracksSelected();
  if (!opened || ids.length !== 1) return toast("Select one track to put GPS glitches into.", "warning");
  const outcome = await pythonJson<{ error?: string }>("glitches", opened.item.id, ids[0]);
  if (outcome.error) return toast(outcome.error, "warning");
  await openPlot(opened.item.id, true);
  toast("Three GPS glitches were put into the track, as a step of their own. Try Jumps… on it.");
};
$("colleague-window").onclick = async () => {
  if (!opened) return;
  await python("colleague_window", opened.item.id);
  // As the extension does when the plot file changes: show the latest, and say so.
  await openPlot(opened.item.id, true);
  toast(`The time window of ${opened.item.properties.title} was changed elsewhere. Debrief is showing the latest.`);
};
// New data arrives through Debrief's import (CAP-10): a navigation log for the open plot's
// first track, written here and imported into the catalogue, so Catalogue and Coverage mark it.
$("new-data").onclick = async () => {
  if (!opened) return;
  status("Importing a navigation log…", true);
  const made = await pythonJson<{ item?: string; title?: string; fixes?: number; error?: string }>("new_data", opened.item.id);
  status("Ready. Everything runs in your browser; nothing is sent anywhere.");
  if (made.error) return toast(made.error, "warning");
  await refreshPlots();
  await refreshCollation();
  showPanel("panel-catalogue");
  showPanel("panel-coverage");
  toast(`${made.title} was imported into the catalogue: ${count(made.fixes ?? 0, "fix", "fixes")}. It has data for this plot, so it is marked New data.`);
};
// An item the plot drew from is revised (CAP-12): a colleague corrects it, as one step in that item.
$("revise").onclick = async () => {
  if (!opened) return;
  const revised = await pythonJson<{ item?: string; title?: string; error?: string }>("revise", opened.item.id);
  if (revised.error) return toast(revised.error, "warning");
  await refreshCollation();
  showPanel("panel-catalogue");
};
$("colleague-during").onclick = (e) => {
  colleagueDuringNextRun = true;
  (e.target as HTMLButtonElement).textContent = "Armed: run a tool to see what happens";
};
// How tracks imported are plotted (CAP-01): asked of each track of a REP file, as legacy Debrief
// asked, unless the reader chose a mode for future imports. That choice is the reader's own
// setting, kept in the page's settings file (as debrief-config keeps an analyst's), never in the
// catalogue or a plot; "Ask again" clears it.
async function showImportMode(): Promise<void> {
  const mode = (await python("import_mode")) as "ask" | PlottingMode;
  $("import-mode-text").textContent =
    mode === "ask"
      ? "Debrief asks, for each track of a REP file, whether it is plotted over the ground (OTG) or by dead reckoning (DR)."
      : `Tracks imported are plotted ${mode === "dr" ? "by dead reckoning (DR)" : "over the ground (OTG)"}, as you chose for future imports.`;
  $("ask-again").hidden = mode === "ask";
}
$("ask-again").onclick = async () => {
  await python("set_import_mode", "ask");
  await showImportMode();
  toast("Debrief will ask how each track you import is plotted.");
};
/** How each track of a REP file is plotted: asked, one track at a time, unless a choice is remembered. Undefined if the reader stopped. */
async function askModes(tracks: string[]): Promise<{ modes: Record<string, PlottingMode>; remembered: boolean } | undefined> {
  const remembered = (await python("import_mode")) as "ask" | PlottingMode;
  // As legacy Debrief asked: over the ground or by dead reckoning, and apart from that a box to tick.
  return chooseModes(
    tracks,
    remembered,
    async (track, index, count) => {
      const values = await trackForm(
        modeQuestion(track, index, count),
        "Import",
        [
          { id: "mode", label: "Plotted", options: modeChoices().map((c) => ({ value: c.mode, label: c.label })) },
          { id: "remember", label: REMEMBER_LABEL, check: true },
        ],
        { info: "Over the ground, each fix is where it was logged; by dead reckoning, from the first fix by each fix's course and speed. Tick the box to be asked no more; Ask again, under Import, asks again." },
      );
      return values ? { mode: values.mode as PlottingMode, remember: values.remember === "yes" } : undefined;
    },
    async (mode) => {
      await python("set_import_mode", mode);
      await showImportMode();
    },
  );
}
// A platform's log read into the open plot, as one step (CAP-19, CAP-20): a REP file's
// narrative lines, or a Word or PDF document's entries in legacy Debrief's dialects, the
// reader asked first what legacy Debrief asked (types, the plot's period, tracks).
$<HTMLInputElement>("narrative-file").onchange = async (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || !opened || !pythonReady) return;
  const data = new Uint8Array(await file.arrayBuffer());
  let choices: NarrativeChoices | undefined;
  const isDocument = /\.(docx?|pdf)$/i.test(file.name);
  status(`Reading ${file.name}…`, true);
  const preview = await pythonJson<NarrativePreview>("narrative_preview", opened.item.id, file.name, data);
  status("");
  // A REP file that cannot be previewed is read as before, and says why it cannot be.
  if (preview.error && isDocument) return toast(preview.error, "warning");
  if (!preview.error) {
    if (preview.fixes) return toast(`${file.name} is ASW data: positions of a track, not narrative. Import it as a plot for its track.`, "warning");
    // Read into the plot before, or with entries already in it (product owner, 15 Oct 2026):
    // a line at the top of the form says so, and its action skips them; Cancel reads nothing.
    const again = duplicateQuestion(preview, (iso) => describePeriod(iso));
    const asked = isDocument ? await askNarrative(preview, again) : again ? await askAgain(preview, again) : {};
    if (!asked) return toast("Nothing was read.");
    if (again?.nothingNew) return toast(`Nothing was read: every entry of ${preview.name} is already in the plot.`);
    choices = asked;
  }
  status(`Reading ${file.name}…`, true);
  const outcome = await pythonJson<{ error?: string; entries?: number; omitted?: string[] }>(
    "narrative",
    opened.item.id,
    JSON.stringify({ base: opened.base, change: { kind: "import", name: file.name, ...(choices && { choices }) } }),
    data,
  );
  status("");
  if (outcome.error) return toast(outcome.error, "warning");
  await openPlot(opened.item.id, true);
  showPanel("panel-timeline");
  toast(readSummary(outcome, count));
};
type Again = NonNullable<ReturnType<typeof duplicateQuestion>>;
/** The line saying a file is in the plot already, for the top of the form. */
const againLine = (again: Again) => `${again.title}. ${again.detail}`;
/** A file read in before, or with entries in the plot: skip those, or (Cancel) read nothing. */
async function askAgain(preview: NarrativePreview, again: Again): Promise<NarrativeChoices | undefined> {
  const values = await trackForm(`Read ${preview.name}`, again.skip, [], { warning: againLine(again), info: `${again.skipDetail}.`, ready: true });
  return values ? { duplicates: "skip" } : undefined;
}
/** What legacy Debrief asked before reading a document, in one form, below the line saying it is in the plot already, if it is; undefined if the reader stopped. */
async function askNarrative(preview: NarrativePreview, again?: Again): Promise<NarrativeChoices | undefined> {
  const tracks = opened ? timelineTracks(opened.plot) : [];
  const ask = questionsFor(preview, tracks);
  if (!ask.types && !ask.period && !ask.platforms.length) return again ? askAgain(preview, again) : {};
  // Last time's answers for this dialect, kept in the page's settings (user state, never in
  // the plot; product owner, 15 Oct 2026): the form comes filled in, and Enter reads.
  const dialect = preview.dialect ?? preview.format;
  const before = (await pythonJson<{ answers?: { skipTypes: string[]; withinPeriod: boolean; tracks: Record<string, string | null> } }>("narrative_answers_for", dialect)).answers;
  const offered = rememberedAnswers(preview, tracks, before);
  const last = offered?.answers ?? {};
  const fields: FormField[] = [];
  if (ask.types) preview.types.forEach((t, i) => fields.push({ id: `type-${i}`, label: `${typeWords(t.name)} (${t.count})`, check: true, value: !last.types || last.types.includes(t.name) ? "yes" : "" }));
  if (ask.period) {
    const words = periodChoices(preview, (iso) => describeTimes(iso));
    fields.push({ id: "period", label: "Entries", value: last.withinPeriod ? "within" : "all", options: [{ value: "all", label: words.all }, { value: "within", label: words.within }] });
  }
  ask.platforms.forEach((platform, i) => {
    const known = last.tracks?.[platform];
    fields.push({ id: `track-${i}`, label: `${platform}'s track`, ...(known !== undefined && { value: known ?? "" }), options: [...tracks.map((t) => ({ value: t.id, label: t.name })), { value: "", label: "No track" }] });
  });
  const intro = `${preview.described}: ${count(preview.entries, "entry", "entries")}.`;
  const info = offered?.complete
    ? { info: `${intro} As last time: ${describeAnswers(preview, last, tracks)}.`, ready: true }
    : { info: `${intro} Untick the types not to read.` };
  const values = await trackForm(`Read ${preview.name}`, again ? again.skip : "Read", fields, again ? { ...info, warning: againLine(again) } : info);
  if (!values) return undefined;
  const types = ask.types ? preview.types.filter((_, i) => values[`type-${i}`] === "yes").map((t) => t.name) : undefined;
  if (types && !types.length) return undefined;
  const chosenTracks = Object.fromEntries(ask.platforms.map((platform, i) => [platform, values[`track-${i}`] || null]));
  const answers = { types, withinPeriod: ask.period ? values.period === "within" : undefined, tracks: chosenTracks };
  await python("set_narrative_answers", dialect, JSON.stringify(answersToRemember(preview, tracks, answers, before)));
  return { ...choicesOf(preview, answers), ...(again && { duplicates: "skip" as const }) };
}
$<HTMLInputElement>("file").onchange = async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const data = new Uint8Array(await file.arrayBuffer());
  (e.target as HTMLInputElement).value = ""; // so the same file can be chosen again
  // A Word or PDF document: narrative, with no tracks to ask about; or ASW data, positions
  // of one platform, whose track legacy Debrief asked a name for.
  let trackName: string | null = null;
  if (/\.(docx?|pdf)$/i.test(file.name)) {
    const preview = await pythonJson<NarrativePreview>("narrative_preview", null, file.name, data);
    if (preview.fixes) {
      const values = await trackForm("Name for this track", "Import", [{ id: "name", label: "Track", value: file.name.replace(/\.[^.]+$/, "") }], { info: `${file.name} holds ${count(preview.fixes, "position")} of one platform.` });
      if (!values) return toast("Nothing was imported.");
      trackName = values.name;
    }
  }
  const asked = await askModes(await pythonJson<string[]>("rep_tracks", file.name, data));
  if (!asked) return toast("Nothing was imported.");
  status(`Importing ${file.name}…`, true);
  const report = await pythonJson<{
    item?: string;
    tracks: string[];
    fixes: number;
    annotations: number;
    narrative_entries?: number;
    omitted: string[];
    notes?: string[];
    error?: string;
    plot_file?: boolean;
    steps?: number;
  }>("import_file", file.name, data, Object.keys(asked.modes).length ? JSON.stringify(asked.modes) : null, asked.remembered ? REMEMBERED_IN_PLAYGROUND : null, trackName);
  status("Ready. Everything runs in your browser; nothing is sent anywhere.");
  if (report.error || !report.item) return toast(report.error ?? "The file could not be imported.", "warning");
  await refreshPlots();
  await openPlot(report.item);
  if (report.plot_file) {
    // A Debrief plot file: its whole history came with it (decision 13 Oct).
    return toast(`Added ${file.name} with its history: ${count(report.steps ?? 0, "step")}, undo and redo included.`);
  }
  showImported(file.name, report);
};

/** What an import brought in, beside the map; nothing is dropped silently (EXT-15). */
function showImported(name: string, report: { tracks: string[]; fixes: number; annotations?: number; narrative_entries?: number; omitted: string[]; notes?: string[] }): void {
  const parts = [count(report.tracks.length, "track"), count(report.fixes, "fix", "fixes")];
  if (report.annotations) parts.push(count(report.annotations, "annotation"));
  if (report.narrative_entries) parts.push(count(report.narrative_entries, "narrative entry", "narrative entries"));
  // Nothing is dropped silently (EXT-15): what wasn't imported is listed beside the map.
  const panel = document.createElement("div");
  panel.className = "omitted-panel";
  const heading = document.createElement("h2");
  heading.textContent = `${name}: imported ${parts.join(", ")}`;
  const lead = document.createElement("p");
  lead.textContent = report.omitted.length
    ? `Not imported (${report.omitted.length}), and recorded in the plot's provenance:`
    : "Everything in the file was imported.";
  const list = document.createElement("ul");
  list.replaceChildren(...report.omitted.map((line) => Object.assign(document.createElement("li"), { textContent: line })));
  // How each track is plotted, and how to change a remembered choice.
  const modes = document.createElement("ul");
  modes.className = "import-notes";
  modes.replaceChildren(...(report.notes ?? []).map((line) => Object.assign(document.createElement("li"), { textContent: line })));
  panel.append(heading, modes, lead, list);
  showSide("Import", panel);
}

// --- Walkthroughs (CAP-25): VS Code's Get Started page, as a panel; the same words -----------
// Each step ticks when the reader does it (tourEvent, from what happened). Its button takes
// the reader to the right place, or opens a fresh copy of serial 1 for the walkthrough.
const READY = "Ready. Everything runs in your browser; nothing is sent anywhere.";
const TOUR_KEY = "debrief.play.tour";
const tourPanel = panels.has("tour")
  ? new TourPanel($("tour"), (actions) => tourAct(actions), params.has("panels") ? undefined : {
      load: () => {
        try {
          return window.localStorage.getItem(TOUR_KEY) ?? undefined;
        } catch {
          return undefined;
        }
      },
      save: (tour) => {
        try {
          window.localStorage.setItem(TOUR_KEY, tour);
        } catch {
          // Not remembered: the walkthrough is still shown on this visit.
        }
      },
    }, (file) => fetch(new URL(`walkthroughs/${file}`, document.baseURI)).then((r) => (r.ok ? r.text() : Promise.reject(new Error(file)))))
  : undefined;
/** Each walkthrough's copy of serial 1, by walkthrough: made here, gone when the page closes. */
const tourCopies = new Map<string, string>();
/** Something the reader did, to a plot: it ticks its step only in the walkthrough shown, on its copy (counts). */
function tourEvent(event: string | undefined, item: string | undefined): void {
  if (!event || !tourPanel) return;
  const tour = tourOfEvent(event);
  if (tour && counts(event, { active: tourPanel.current, copy: tourCopies.get(tour), item, done: new Set(tourPanel.events) })) tourPanel.doneWith(event);
}
/** Tracks selected by hand: the step asks for two, so a click that leaves one, or none, is not it. */
function selectedByHand(ids: string[]): void {
  if (ids.filter((id) => features().find((f) => f.id === id)?.properties.kind === "track").length >= 2) tourEvent("selected", opened?.item.id);
}
(window as unknown as { debriefTours: () => unknown }).debriefTours = () => ({ tour: tourPanel?.current, events: tourPanel?.events ?? [], copies: Object.fromEntries(tourCopies) });
/** For the tests: how many steps a plot's history has, read from Python. */
(window as unknown as { debriefStepsOf: (item: string) => Promise<number> }).debriefStepsOf = async (item) => (await pythonJson<Opened>("open_plot", item)).steps.length;
/** Coverage on screen, showing the open plot's: a walkthrough's step is to look at it. */
let coverageOnScreen = false;
function coverageSeen(): void {
  if (coverageOnScreen && coverage && isShown("panel-coverage")) tourEvent("coverageShown", opened?.item.id);
}
new IntersectionObserver((entries) => {
  // Enough of it in sight to read a track or two: a study's Coverage can be far taller than the screen.
  coverageOnScreen = entries.some((e) => e.isIntersecting && e.intersectionRect.height >= Math.min(120, e.boundingClientRect.height));
  coverageSeen();
}, { threshold: [0, 0.02, 0.05, 0.1, 0.25, 0.5, 1] }).observe($("coverage"));
$("panel-coverage").addEventListener("fold", () => coverageSeen());

/** Bring a panel or a control into view, opening its panel or its menu; click it, or put the keyboard on it. */
function reveal(id: string, click: boolean): void {
  const element = optional(id);
  if (!element) return toast("That is not on this page.", "warning");
  // In a menu of the top bar (Export, Try, Import): the menu opened under its button.
  const menuPanel = element.closest<HTMLElement>(".menu-panel");
  if (menuPanel) {
    openMenuPanel(menuPanel.id);
    const target = element === menuPanel ? firstControl(menuPanel) : element.matches("button, input, select, textarea, [tabindex]") ? element : firstControl(element);
    if (click) target.click();
    else target.focus({ preventScroll: true });
    return;
  }
  const section = element.matches("section.panel") ? element : element.closest<HTMLElement>("section.panel");
  if (section) {
    section.hidden = false;
    showPanel(section.id);
  }
  // A panel: its heading, or docked, its tab; a list: its first row; otherwise the control itself.
  if (element === section && dock) {
    section.parentElement?.scrollTo({ top: 0 });
    if (click) return;
    return dock.focusTab(section.id);
  }
  const target =
    element.matches("section.panel")
      ? (element.querySelector<HTMLElement>("button.fold") ?? element)
      : element.matches("button, input, select, textarea, [tabindex]")
        ? element
        : firstControl(element);
  // A panel shown from its top, so what it holds is in sight; a control just brought into sight.
  // Docked, only the panel scrolls: the layout itself never does.
  if (dock) scrollWithin(target);
  else if (element === section) section.scrollIntoView({ block: "start" });
  else target.scrollIntoView({ block: "nearest" });
  if (click) target.click();
  else target.focus({ preventScroll: true });
}
/** A control in an element, or the element. */
const firstControl = (element: HTMLElement): HTMLElement => element.querySelector<HTMLElement>("button:not([hidden]), input, select, [tabindex]") ?? element;
/** Scroll a docked panel so an element in it is in sight, scrolling nothing else. */
function scrollWithin(element: HTMLElement): void {
  const panel = element.closest<HTMLElement>(".dock-panel");
  if (!panel) return;
  const box = element.getBoundingClientRect();
  const view = panel.getBoundingClientRect();
  if (box.top < view.top) panel.scrollTop -= view.top - box.top + 8;
  else if (box.bottom > view.bottom) panel.scrollTop += Math.min(box.top - view.top - 8, box.bottom - view.bottom + 8);
}
/** What a step's button does, in order: on the walkthrough's copy, which is opened first if another plot is open. */
async function tourAct(actions: TourAction[]): Promise<void> {
  if (actions[0]?.verb !== "open" && tourPanel) {
    const copy = tourCopies.get(tourPanel.current);
    if (!copy) return toast("Open a copy of serial 1 first: this walkthrough's first step.", "warning");
    if (opened?.item.id !== copy) {
      await openPlot(copy);
      toast(`${opened?.item.properties.title ?? copy} is open again: the walkthrough works on its copy, not on the plot that was open.`);
    }
  }
  for (const step of actions) {
    // A step that needs the walkthrough's TMA solution: the latest in its copy, once made.
    if (step.target.includes(SOLUTION) && !latestSolution(features())) return toast(NO_SOLUTION, "warning");
    const action = { ...step, target: step.target.replaceAll(SOLUTION, latestSolution(features()) ?? SOLUTION) };
    if (action.verb === "open") await openTourCopy(action.target);
    else if (action.verb === "focus") reveal(action.target, false);
    else if (action.verb === "click") reveal(action.target, true);
    else if (action.verb === "run") await runAction(action.target);
    else if (action.verb === "select") await select(action.target.split(",").filter((id) => features().some((f) => f.id === id)));
    else if (action.verb === "import-log") await importTourLog();
    else if (action.verb === "outline") {
      const { feature, focus } = outlineTarget(action.target);
      await outlineWith(feature, focus);
    }
  }
}
/**
 * A fresh copy of serial 1 for a walkthrough, made from the sample as shipped, opened. Again,
 * it starts the walkthrough again: the old copy goes and its steps are unticked (panel review,
 * 17 Oct 2026). One at a time, however often the button is pressed.
 */
let copying = false;
async function openTourCopy(tour: string): Promise<void> {
  if (!pythonReady) return toast("The walkthrough's copy can be made once Python is ready.", "warning");
  if (copying) return;
  copying = true;
  try {
    status("Making a copy of serial 1 for the walkthrough…", true);
    const made = await pythonJson<{ item?: string; title?: string; error?: string }>("tour_copy", tour, tourCopies.get(tour) ?? null);
    status(READY);
    if (made.error || !made.item) return toast(made.error ?? "The walkthrough's copy could not be made.", "warning");
    tourCopies.set(tour, made.item);
    tourPanel?.restart(tour);
    await refreshPlots();
    await openPlot(made.item);
    toast(`${made.title}: a fresh copy of serial 1 for this walkthrough, under Plot. The sample itself is unchanged.`);
    tourEvent(`${tour}Opened`, made.item);
  } finally {
    copying = false;
  }
}
/** Import and collate: the navigation log that came with the walkthrough's copy, imported as a REP file is, into the catalogue. */
async function importTourLog(): Promise<void> {
  if (!pythonReady || !opened) return;
  const log = await pythonJson<{ name?: string; tracks?: string[]; error?: string }>("tour_log_tracks");
  if (log.error || !log.tracks) return toast(log.error ?? "The navigation log could not be read.", "warning");
  const asked = await askModes(log.tracks);
  if (!asked) return toast("Nothing was imported.");
  status(`Importing ${log.name}…`, true);
  const report = await pythonJson<{ item?: string; tracks: string[]; fixes: number; omitted: string[]; notes?: string[]; error?: string }>(
    "import_tour_log",
    Object.keys(asked.modes).length ? JSON.stringify(asked.modes) : null,
    asked.remembered ? REMEMBERED_IN_PLAYGROUND : null,
  );
  status(READY);
  if (report.error || !report.item) return toast(report.error ?? "The navigation log could not be imported.", "warning");
  // The plot stays open: the log is new data for it, in the catalogue.
  await refreshPlots();
  await refreshCollation();
  showPanel("panel-catalogue");
  showImported(log.name ?? "The navigation log", report);
}

/** Show the sample plot straight from the site while Python starts, so the map is never empty. */
async function preview(item: string): Promise<void> {
  try {
    const [plot, stac] = await Promise.all([
      fetch(`sample/${item}/plot.geojson`).then((r) => r.json()),
      fetch(`sample/${item}/${item}.json`).then((r) => r.json()),
    ]);
    if (opened) return; // Python was quicker
    delete plot.history; // the plot file's history: nothing on screen reads it
    opened = { item: stac, plot, base: { current: 0, plot_hash: "" }, view_hash: "", steps: [], recovered: [] };
    showTime(timeOf(stac, plot));
    $("plot-title").textContent = stac.properties.title ?? item;
    showPlot();
    renderOutline();
    renderTimeline();
    showTote();
  } catch {
    // the map fills in when Python is ready
  }
}

/** Python could not start: say so plainly, and mark what needs it as unavailable. */
function withoutPython(why: string): void {
  status(`${why} The map still works; tools, history and import need Python.`);
  $("status").classList.add("problem");
  for (const panel of ["tools", "history", "try", "import"]) $(`panel-${panel}`).classList.add("unavailable");
  // As VS Code's Tools and History say when the tool service could not start.
  pythonProblem = why;
  renderTools();
  renderHistory();
  if (opened) $("plots").replaceChildren(new Option(opened.item.properties.title ?? opened.item.id, opened.item.id));
}

(async () => {
  void preview(startPlot);
  status("Starting Python in your browser: the first time takes a little while…", true);
  try {
    await python("start");
    listing = await pythonJson<{ tools: ToolDeclaration[]; unavailable: Unavailable[] }>("tools");
    tools = listing.tools;
    await pythonJson("setup");
    await refreshPlots();
    // keep: anything the reader selected on the preview stays selected.
    await openPlot(startPlot, true);
    pythonReady = true;
    // What was chosen for Bearings while Python started, asked for now.
    void refreshBearings();
    refreshTote();
    await showImportMode();
    needsPython(true);
    outlineBar?.update();
    renderHistory();
    status("Ready. Everything runs in your browser; nothing is sent anywhere.");
  } catch (error) {
    const message = (error as Error).message;
    withoutPython(message.startsWith("Python couldn't") ? message : `Python could not start here: ${message}.`);
  }
})();
