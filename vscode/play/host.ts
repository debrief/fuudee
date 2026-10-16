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
 *   panels=tote,timeline,tools,history,try,import   the side panels, in this order (all by default;
 *                         the Tote, when listed, is always under the time controller)
 *
 * Every side panel folds away by its heading (fold.ts). The playground remembers which are
 * folded in this browser; a demo that chooses its panels starts with them all open, and
 * folding there is not remembered, so a post's demo always shows what the post describes.
 */
import type { AnnotationSpec, CoverageReport, DebriefFeatureCollection, ItemRevision, NarrativeSpec, ParameterValue, PlotView, ReviewFlag, SharedStateChange, SourceTrackRef, StacItem, TimeRange, TimeState, ToolDeclaration, ToolResult, ToteResult, ToteView } from "@debrief/schemas";
import { CoverageControl } from "../webview/coveragecontrol.js";
import { specOfFeature } from "../webview/annotationlook.js";
import { NarrativeOnMap, narrativeOnMapOf, timelineEntries, timelineTracks } from "../src/timeline.js";
import { TimelineControl } from "../webview/timelinecontrol.js";
import { count, describePeriod, describeTimes, describeToolRun } from "../src/format.js";
import { resolveTimes } from "../src/timeinput.js";
import { answersToRemember, choicesOf, describeAnswers, duplicateQuestion, periodChoices, questionsFor, readSummary, rememberedAnswers, typeWords, type NarrativeChoices, type NarrativePreview } from "../src/narrativeimport.js";
import { describeStep, needs } from "../src/wording.js";
import { contextTracksOf, displayed, hiddenIds, isFeature, isHidden, setViewOf, timeWindowOf, viewOf, type PlotFeature } from "../src/hidden.js";
import { contextShown, type ContextTracks } from "../webview/contrast.js";
import { placeToolTime } from "../webview/timelogic.js";
import { TRACK_COLOURS } from "../webview/palette.js";
import { TimeControl } from "../webview/timecontrol.js";
import { ToteControl } from "../webview/totecontrol.js";
import { latencySummary, sameTote, toteOf, ToteRequests, toteTracks, withoutSecondary, withPrimary, withSecondaries } from "../webview/totelogic.js";
import { PressHold } from "../webview/presshold.js";
import { Folds } from "./fold.js";
import { formatBearing, formatPosition, parsePosition } from "@debrief/kernel";
import { defaultPivotIndex, describeDistance, describeSpeed, describeTurn, FIX_PROMPT, FIX_PROMPT_DR, fixIndexAt, fixMeans, fixToEdit, jumpSpeed, legNow, mergedName, mergePlan, periodIndices, readBearing, readDistance, readSpeed, readTurn, reckoningOf } from "../webview/trackedit.js";
import { chooseModes, MODE_LABELS, modeChoices, modeQuestion, REMEMBER_LABEL, REMEMBERED_IN_PLAYGROUND, type PlottingMode } from "../src/importmode.js";
import { describeJump, describeMark, describeWindow, DR_TAG, fixRows, isDeadReckoned, jumpsFound, markAt, readThreshold, readWindow, smoothingNote, type Jump } from "../webview/fixes.js";
import { FIX_COLOURS } from "../webview/palette.js";
import { ALL_PROBLEM, AT_EVERY_FIX, changesOf, choiceFromValue, choicesFor, describeChanges, describeInterval, describeSetFrequencies, FIELD_NAMES, FIELDS, formState, readInterval, trackDetails, type Field, type FieldState } from "../webview/frequencies.js";
import { formatQuantity } from "@debrief/kernel";

type Feature = PlotFeature;
interface Step {
  seq: number;
  status: "applied" | "undone" | "abandoned";
  kind: string;
  tool: string | null;
  agent: string;
  at: string;
  notes?: string[];
}
interface Opened {
  item: StacItem;
  /** The plot, with its whole-plot feature and view (the island, SUB-22). */
  plot: DebriefFeatureCollection;
  base: { current: number; plot_hash: string };
  /** The hash of the plot's view (its island) when read, to pass back when saving the time window. */
  view_hash: string;
  steps: Step[];
  recovered: string[];
}

const params = new URLSearchParams(location.search);
const panelOrder = (params.get("panels") ?? "tote,timeline,catalogue,coverage,tools,history,try,import").split(",");
const panels = new Set(panelOrder);
const startPlot = params.get("plot") ?? "serial-1";
/** Every side panel folds by its heading; remembered in this browser, except in a demo that chooses its panels. */
const folds = new Folds(Array.from(document.querySelectorAll<HTMLElement>("#side > section.panel")), !params.has("panels"));
const theme = matchMedia("(prefers-color-scheme: light)").matches || params.get("theme") === "light" ? "light" : "dark";
if (theme === "light") document.documentElement.classList.add("light");
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// --- Python, in a worker ----------------------------------------------------------
const worker = new Worker(new URL("python.worker.js", location.href), { type: "module" });
let nextId = 0;
const waiting = new Map<number, { resolve: (v: string) => void; reject: (e: Error) => void }>();
worker.onmessage = ({ data }) => {
  if (data.progress) return status(data.progress, true);
  const call = waiting.get(data.id);
  waiting.delete(data.id);
  if (data.error) call?.reject(new Error(data.error));
  else call?.resolve(data.result);
};
function python(call: string, ...args: unknown[]): Promise<string> {
  const id = nextId++;
  worker.postMessage({ id, call, args, base: new URL(".", location.href).href });
  return new Promise((resolve, reject) => waiting.set(id, { resolve, reject }));
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
const timeControl = new TimeControl($("timebar"), {
  moved: (moved) => {
    time = moved;
    refreshTote(); // asked at once: the Tote keeps pace by never queueing (NFR-04)
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
function showTime(next: TimeState | undefined): void {
  time = next;
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
    const outcome = await pythonJson<{ tote?: ToteResult; compute_ms?: number; error?: string }>("tote", item, JSON.stringify({ time: at, tote }));
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
  if (!opened || !time || !pythonReady || !panels.has("tote") || !folds.isOpen(totePanel.id)) return;
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
  // Saved (the island has it now) or not (what is saved is shown again); unless the reader
  // has chosen again meanwhile, which is still being saved and stays on screen.
  if (toteChoosing !== view) return;
  toteChoosing = undefined;
  showTote();
}
totePanel.addEventListener("fold", () => folds.isOpen(totePanel.id) && refreshTote());
let tools: ToolDeclaration[] = [];
let offered: string[] = [];
let formTool: ToolDeclaration | undefined;
let colleagueDuringNextRun = false;

/** The plot's features, without its whole-plot feature (the plot's own details and view). */
const features = (): Feature[] => (opened?.plot.features ?? []).filter(isFeature);
const selectedNames = () => selection.map((id) => features().find((f) => f.id === id)?.properties.name ?? id);

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
  });
  narrativeShown = undefined;
  narrativeToMap();
}

async function openPlot(item: string, keep = false): Promise<void> {
  const previousTime = keep ? time : undefined;
  if (opened && opened.item.id !== item) closeSide();
  // The plot as the map last drew it: if Python's is the same, it isn't sent again.
  const shown = opened?.item.id === item && opened.base.plot_hash ? opened.base.plot_hash : undefined;
  if (opened?.item.id !== item) {
    toteRequests.reset();
    toteChoosing = undefined;
  }
  opened = await pythonJson<Opened>("open_plot", item);
  $<HTMLSelectElement>("plots").value = item;
  const ids = new Set(features().map((f) => f.id));
  selection = keep ? selection.filter((id) => ids.has(id)) : [];
  showTime(timeOf(opened.item, opened.plot, previousTime));
  $("plot-title").textContent = opened.item.properties.title ?? item;
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
  void refreshCollation();
  await refreshOffered();
  if (opened.recovered.length) toast(opened.recovered.join(" "), "warning");
}

async function select(ids: string[], fromMap = false): Promise<void> {
  selection = ids;
  if (!fromMap) post(map, { kind: "set_selection", selection: { plot: opened?.item.id ?? "", feature_ids: ids } });
  renderOutline();
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
    if (message.kind === "selection_changed") void select((message.selection as { feature_ids: string[] }).feature_ids, true);
    if (message.kind === "time_changed") showTime(message.time as TimeState);
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
  if (!tools.length) return renderTools();
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
function closeResults(): void {
  if (results) closeSide();
}

async function runTool(tool: ToolDeclaration, parameters: ParameterValue[], onConflict?: string): Promise<string | undefined> {
  if (!opened) return "Open a plot first.";
  const ranOn = opened.item.id; // the plot it ran on: a window it asks to save is saved only there
  const resolved = resolveTimes(tool, parameters, opened);
  if (typeof resolved === "string") return resolved;
  const request = {
    name: tool.name,
    selection,
    parameters: Object.fromEntries(resolved.map((p) => [p.name, p.value])),
    state: time && { time, selection: { plot: opened.item.id, feature_ids: selection }, viewport: { bbox: opened.item.bbox ?? [-180, -90, 180, 90] } },
    base: opened.base,
    ...(onConflict && { on_conflict: onConflict }),
  };
  if (colleagueDuringNextRun && !onConflict) {
    // The colleague's change lands while the tool runs (SUB-28).
    colleagueDuringNextRun = false;
    $<HTMLButtonElement>("colleague-during").textContent = "A colleague changes it while your next tool runs";
    await python("colleague", opened.item.id, new Date().toISOString(), time?.current ?? null);
  }
  const outcome = await pythonJson<{ result?: ToolResult; changed?: boolean; new_item?: string; error?: string; conflict?: { mergeable: boolean } }>(
    "run",
    opened.item.id,
    JSON.stringify(request),
  );
  if (outcome.conflict) {
    const choice = await ask(
      outcome.conflict.mergeable
        ? `The plot was changed elsewhere while ${tool.title} ran. The other change touches different features, so the two can be combined, or ${tool.title}'s result can be saved as a new plot.`
        : `The plot was changed elsewhere while ${tool.title} ran, and touches the same features. ${tool.title}'s result can be saved as a new plot.`,
      outcome.conflict.mergeable ? ["Combine the changes", "Save mine as a new plot"] : ["Save mine as a new plot"],
    );
    if (!choice) {
      await openPlot(opened.item.id, true);
      return `${tool.title} was not run: the plot was changed elsewhere. Debrief is showing the latest.`;
    }
    return runTool(tool, parameters, choice === "Combine the changes" ? "merge" : "new_plot");
  }
  if (outcome.error) return outcome.error;
  const result = outcome.result!;
  if (outcome.new_item) {
    await refreshPlots();
    toast(`Your result was saved as a new plot, ${outcome.new_item}. The original keeps the other change.`);
    await openPlot(outcome.new_item, true);
  } else if (outcome.changed) {
    await openPlot(opened.item.id, true);
  }
  const outside = result.state_change?.time ? showToolTime(result.state_change, ranOn) : false;
  if (result.non_spatial?.length) showResults(tool, result);
  const said = describeToolRun(tool.title, result, outside);
  if (said) toast(said);
  return undefined;
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
async function restyle(ids: string[], change: { colour: string; colour_name: string } | { hidden: boolean }): Promise<void> {
  if (!opened || !pythonReady || !ids.length) return;
  const outcome = await pythonJson<{ error?: string }>("restyle", opened.item.id, JSON.stringify({ base: opened.base, features: ids, ...change }));
  if (outcome.error) toast(outcome.error, "warning");
  await openPlot(opened.item.id, true);
}
const tracksSelected = () => selection.filter((id) => features().find((f) => f.id === id)?.properties.kind === "track");
$<HTMLSelectElement>("colour").append(...TRACK_COLOURS.map((c) => new Option(c.name, c.colour)));
$<HTMLSelectElement>("colour").onchange = (e) => {
  const picker = e.target as HTMLSelectElement;
  const chosen = TRACK_COLOURS.find((c) => c.colour === picker.value);
  picker.value = "";
  if (!chosen) return;
  if (!tracksSelected().length) return toast("Select one or more tracks to colour.", "warning");
  void restyle(tracksSelected(), { colour: chosen.colour, colour_name: chosen.name.toLowerCase() });
};
$("hide").onclick = () => (selection.length ? void restyle(selection, { hidden: true }) : toast("Select what to hide.", "warning"));
// With nothing selected, Show shows everything hidden, as the map's "Show all" does.
$("show").onclick = () => opened && void restyle(selection.length ? selection : hiddenIds(opened.plot), { hidden: false });

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
$("track-frequencies").onclick = async () => {
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
};

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
$("add-annotation").onclick = () => addAnnotation();
$("edit-annotation").onclick = () => editAnnotation();
$("delete-annotation").onclick = () => {
  const ids = selectedAnnotations();
  if (!ids.length) return toast("Select the annotations to delete.", "warning");
  void annotate({ kind: "delete", features: ids }).then((problem) => problem && toast(problem, "warning"));
};
$("north-arrow").onclick = () => void annotate({ kind: "north_arrow", shown: !hasNorthArrow() }).then((problem) => problem && toast(problem, "warning"));

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
        input = Object.assign(document.createElement("input"), { type: "text", autocomplete: "off" });
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
/** The choice of what moves or turns: the whole track, or its fixes in the time window. */
function extentField(): FormField {
  const window = time?.range;
  return {
    id: "extent",
    label: "What changes",
    options: [{ value: "whole", label: "Whole track" }, ...(window ? [{ value: "window", label: `Fixes in the time window, ${describeTimes(window.start, window.end)}` }] : [])],
  };
}
const windowPeriod = (extent: string) => (extent === "window" && time ? time.range : undefined);

$("move-track").onclick = async () => {
  const track = oneTrack("move");
  if (!track) return;
  const values = await trackForm(`Move ${track.properties.name}`, "Move", [
    extentField(),
    { id: "distance", label: "Distance", value: "", read: (t) => shown(readDistance(t), () => describeDistance(readDistance(t) as { value: number; unit: string })) },
    { id: "bearing", label: "Bearing, true", value: "", read: (t) => shown(readBearing(t), () => formatBearing({ value: readBearing(t) as number, unit: "deg" })) },
  ]);
  if (!values) return;
  const period = windowPeriod(values.extent);
  const edit = { action: "move", distance: readDistance(values.distance), bearing: { value: readBearing(values.bearing), unit: "deg" }, ...(period && { period }) };
  const problem = await changeTrack({ kind: "edit", feature: track.id, edit });
  if (problem) toast(problem, "warning");
};
$("rotate-track").onclick = async () => {
  const track = oneTrack("rotate");
  if (!track) return;
  const values = await trackForm(`Rotate ${track.properties.name}`, "Rotate", [
    extentField(),
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
  const period = windowPeriod(values.extent);
  const times = track.properties.times.map(Date.parse);
  const indices = periodIndices(times, period && { start: Date.parse(period.start), end: Date.parse(period.end) });
  if (!indices.length) return toast(`${track.properties.name} has no fixes in the time window, so nothing was rotated.`, "warning");
  const index =
    values.pivot === "first" ? indices[0] : values.pivot === "last" ? indices[indices.length - 1] : defaultPivotIndex(times, indices, time ? Date.parse(time.current) : undefined);
  const edit = { action: "rotate", angle: { value: readTurn(values.angle), unit: "deg" }, pivot: track.geometry.coordinates[index], ...(period && { period }) };
  const problem = await changeTrack({ kind: "edit", feature: track.id, edit });
  if (problem) toast(problem, "warning");
};
/** What the track, or its fixes in the time window, makes good now: as the form offers it when that is chosen. */
function legChosen(track: NonNullable<ReturnType<typeof trackOf>>, extent: string): NonNullable<ReturnType<typeof legNow>> | undefined {
  const times = track.properties.times.map(Date.parse);
  const period = windowPeriod(extent);
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
  return [extentField(), anchor];
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
$("shear-track").onclick = async () => {
  const track = oneTrack("shear");
  const held = track && heldFields(track, "sheared");
  if (!track || !held) return;
  const values = await trackForm(`Shear ${track.properties.name}`, "Shear", [...held, courseField(track), speedField(track, false)]);
  if (!values) return;
  const period = windowPeriod(values.extent);
  const edit = { action: "shear", anchor: values.anchor, course: { value: readBearing(values.course), unit: "deg" }, speed: readSpeed(values.speed), ...(period && { period }) };
  const problem = await changeTrack({ kind: "edit", feature: track.id, edit });
  if (problem) toast(problem, "warning");
};
$("stretch-track").onclick = async () => {
  const track = oneTrack("stretch");
  const held = track && heldFields(track, "stretched");
  if (!track || !held) return;
  const values = await trackForm(`Stretch ${track.properties.name}`, "Stretch", [...held, speedField(track, true)]);
  if (!values) return;
  const period = windowPeriod(values.extent);
  const edit = { action: "stretch", anchor: values.anchor, speed: readSpeed(values.speed, undefined, true), ...(period && { period }) };
  const problem = await changeTrack({ kind: "edit", feature: track.id, edit });
  if (problem) toast(problem, "warning");
};
$("plotting-mode").onclick = async () => {
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
};
$("split-track").onclick = async () => {
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
};
$("merge-tracks").onclick = async () => {
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
};

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
$("find-jumps").onclick = async () => {
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
    closeSide();
  };
};

// "Smooth…": what to smooth and over how many fixes; then the track as smoothing would leave it, dashed on
// the map, with how far fixes would move; Apply makes it one step.
$("smooth-track").onclick = async () => {
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
    closeSide();
  };
};

// "Fixes…": the selected track's fixes, in time order; choose one (it is ringed on the map), then
// colour, label or comment on it, each one step. A right-click on a fix on the map opens it here.
const colourName = (colour: string) => FIX_COLOURS.find((c) => c.colour === colour)?.name.toLowerCase();
$("fix-list").onclick = () => {
  const track = oneTrack("list the fixes of");
  if (track) void openFixes(track.id);
};
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
  params.has("panels") ? undefined : timelineMemory,
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
async function move(how: "undo" | "redo" | "goto", step?: number): Promise<void> {
  if (!opened || !pythonReady) return;
  const outcome = await pythonJson<{ error?: string }>("move", opened.item.id, how, step ?? null);
  if (outcome.error) return toast(outcome.error, "warning");
  closeResults(); // they describe a plot that is no longer current
  await openPlot(opened.item.id, true);
}

// Ctrl+Z undoes, Ctrl+Shift+Z or Ctrl+Y redoes, as in VS Code: here in the page, and
// forwarded from the map, form and results frames (see shim.ts). Never while typing.
type KeyChord = { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean };
function historyKey(e: KeyChord): boolean {
  if (!(e.ctrlKey || e.metaKey) || !panels.has("history") || !pythonReady) return false;
  const key = e.key.toLowerCase();
  if (key === "z" && !e.shiftKey) void move("undo");
  else if ((key === "z" && e.shiftKey) || (key === "y" && !e.shiftKey)) void move("redo");
  else return false;
  return true;
}
const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
document.addEventListener("keydown", (event) => {
  if (!typing(event.target) && historyKey(event)) event.preventDefault();
});

// --- Rendering --------------------------------------------------------------------
function renderOutline(): void {
  const list = $("outline");
  // Re-rendering replaces the rows: keep keyboard focus on the row that had it.
  const focused = list.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.id : undefined;
  list.replaceChildren(
    ...features()
      .filter((f) => f.properties.kind === "track" || f.geometry)
      .map((f) => {
        const row = document.createElement("li");
        const selected = selection.includes(f.id);
        row.className = selected ? "selected" : "";
        row.tabIndex = 0;
        row.dataset.id = f.id;
        row.setAttribute("role", "option");
        row.setAttribute("aria-selected", String(selected));
        const props = f.properties as { times?: string[]; time?: string };
        row.innerHTML = `<span class="name"></span> <span class="detail"></span>`;
        row.querySelector(".name")!.textContent = f.properties.name;
        // A track plotted by dead reckoning: a small DR beside its name (decision, product owner, 14 Oct 2026).
        if (f.properties.kind === "track" && isDeadReckoned(f.properties)) {
          const tag = Object.assign(document.createElement("span"), { className: "tag", textContent: DR_TAG, title: "Plotted by dead reckoning (DR), from its first fix by each fix's course and speed" });
          tag.setAttribute("aria-label", "plotted by dead reckoning");
          row.querySelector(".name")!.after(" ", tag);
        }
        const when = props.times ? describeTimes(props.times[0], props.times.at(-1)) : f.properties.kind;
        row.querySelector(".detail")!.textContent = isHidden(f) ? `hidden on map · ${when}` : when;
        if (f.properties.kind === "track") {
          // Its details when pointed at, its labels, symbols and arrows among them; those set on a line of their own (CAP-32).
          row.title = trackDetails(f.properties, when, isDeadReckoned(f.properties));
          const set = describeSetFrequencies(f.properties);
          if (set) row.append(Object.assign(document.createElement("span"), { className: "detail freq-detail", textContent: set }));
        }
        const choose = (add: boolean) =>
          void select(add ? (selection.includes(f.id) ? selection.filter((i) => i !== f.id) : [...selection, f.id]) : [f.id]);
        row.onclick = (e) => choose(e.ctrlKey || e.metaKey || e.shiftKey);
        if (f.properties.kind === "track") {
          // Its menu: right-click, press and hold on a touch screen, or Shift+F10 (the Tote, CAP-06).
          row.oncontextmenu = (e) => {
            e.preventDefault();
            trackMenu(f.id, e.clientX, e.clientY, row);
          };
        }
        row.onkeydown = (e) => {
          if (f.properties.kind === "track" && (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey))) {
            e.preventDefault();
            const box = row.getBoundingClientRect();
            return trackMenu(f.id, box.left + 24, box.bottom, row);
          }
          // Only Enter and Space select; every other key (Tab above all) does what it always does.
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          choose(e.ctrlKey || e.metaKey || e.shiftKey);
        };
        return row;
      }),
  );
  if (focused) list.querySelector<HTMLElement>(`[data-id="${CSS.escape(focused)}"]`)?.focus();
  $("north-arrow").setAttribute("aria-pressed", String(hasNorthArrow()));
  $("selected-count").textContent = selection.length ? `${count(selection.length, "feature")} selected · Ctrl-click to add` : "Click to select · Ctrl-click to add";
}

// --- The outline's menu for a track (the Tote, CAP-06) ----------------------------------
let menu: HTMLElement | undefined;
let menuReturn: HTMLElement | undefined;
function closeMenu(focus = true): void {
  const was = menu;
  menu = undefined;
  was?.remove();
  if (was && focus) menuReturn?.focus();
}
/** What can be done to a track from the outline: put it in the Tote, as the primary or a secondary, or take it out. */
function trackMenu(id: string, x: number, y: number, from: HTMLElement): void {
  closeMenu(false);
  menuReturn = from;
  const tote = toteChoice();
  const items: [string, () => ToteView][] = [];
  if (tote.primary !== id) items.push(["Set as Tote primary", () => withPrimary(toteChoice(), id)]);
  if (tote.primary === id || tote.secondaries?.includes(id)) {
    items.push(["Remove from Tote", () => (toteChoice().primary === id ? withPrimary(toteChoice(), undefined) : withoutSecondary(toteChoice(), id))]);
  } else items.push(["Add to Tote", () => withSecondaries(toteChoice(), [id])]);
  const element = document.createElement("div");
  element.className = "context-menu";
  element.setAttribute("role", "menu");
  element.setAttribute("aria-label", `${features().find((f) => f.id === id)?.properties.name ?? id}: Tote`);
  const buttons = items.map(([label, change]) => {
    const button = Object.assign(document.createElement("button"), { textContent: label });
    button.setAttribute("role", "menuitem");
    button.tabIndex = -1;
    button.onclick = () => {
      closeMenu();
      folds.setOpen(totePanel.id, true);
      void chooseTote(change());
    };
    return button;
  });
  element.append(...buttons);
  element.onkeydown = (e) => {
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      closeMenu();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      buttons[(at + (e.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length].focus();
    }
  };
  document.body.append(element);
  // Within the window, however near its edge the track was.
  const box = element.getBoundingClientRect();
  element.style.left = `${Math.max(0, Math.min(x, innerWidth - box.width - 4))}px`;
  element.style.top = `${Math.max(0, Math.min(y, innerHeight - box.height - 4))}px`;
  menu = element;
  buttons[0].focus();
}
document.addEventListener("pointerdown", (e) => void (menu && !menu.contains(e.target as Node) && closeMenu(false)), true);
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

function renderTools(): void {
  const list = $("tools");
  if (!tools.length) {
    list.innerHTML = `<li class="detail">Starting Python…</li>`;
    return;
  }
  const sorted = [...tools].sort((a, b) => Number(offered.includes(b.name)) - Number(offered.includes(a.name)));
  list.replaceChildren(
    ...sorted.map((tool) => {
      const on = offered.includes(tool.name);
      const row = document.createElement("li");
      const button = document.createElement("button");
      button.textContent = tool.title;
      button.disabled = !on;
      button.title = tool.explanation;
      button.onclick = () => openForm(tool);
      const why = document.createElement("span");
      why.className = "detail";
      why.textContent = on ? "" : needs(tool);
      row.append(button, " ", why);
      return row;
    }),
  );
}

function renderHistory(): void {
  const steps = opened?.steps ?? [];
  const title = (name: string) => tools.find((t) => t.name === name)?.title;
  $("history").replaceChildren(
    ...[...steps].reverse().map((step) => {
      const { label, status } = describeStep(step, title);
      const row = document.createElement("li");
      const current = step.seq === opened?.base.current;
      row.className = `step ${step.status}`;
      const marker = current ? "current" : step.status === "undone" ? "undone" : step.status === "abandoned" ? "replaced" : "";
      row.innerHTML = `<span class="name"></span> <span class="detail"></span>`;
      row.querySelector(".name")!.textContent = label;
      row.querySelector(".detail")!.textContent = [`step ${step.seq}`, marker, describePeriod(step.at), step.agent].filter(Boolean).join(" · ");
      row.title = status;
      if (!current && step.status !== "abandoned") {
        const back = document.createElement("button");
        back.className = "link";
        back.textContent = step.status === "undone" ? "Redo up to here" : "Go back here";
        back.onclick = () => void move("goto", step.seq);
        row.append(" ", back);
      }
      return row;
    }),
  );
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
function toast(text: string, kind: "info" | "warning" = "info"): void {
  const note = document.createElement("div");
  note.className = `toast ${kind}`;
  note.textContent = text;
  note.setAttribute("role", "status");
  $("toasts").append(note);
  setTimeout(() => note.remove(), 8000);
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
  const outcome = await pythonJson<{ error?: string; changed?: boolean; notes?: string[] }>("collate", opened.item.id, JSON.stringify({ base: opened.base, change }));
  status("Ready. Everything runs in your browser; nothing is sent anywhere.");
  if (outcome.error) {
    toast(outcome.error, "warning");
    coverageControl.say(outcome.error);
    return;
  }
  if (!outcome.changed) {
    coverageControl.say("Nothing to change: it is so already.");
    return;
  }
  // The plot, its island or another plot's island changed: show the latest, and with it collation.
  await openPlot(opened.item.id, true);
  if (outcome.notes?.length) toast(`${outcome.notes[0]}. Undo takes it back.`);
}

// --- Wiring -----------------------------------------------------------------------
const OPTIONAL = ["tote", "timeline", "catalogue", "coverage", "tools", "history", "try", "import"];
for (const panel of OPTIONAL) $(`panel-${panel}`).hidden = !panels.has(panel);
// The panels in the order the demo lists them, after the plot and its outline; the Tote stays
// under the time controller, since both follow current time.
for (const panel of panelOrder) if (OPTIONAL.includes(panel) && panel !== "tote") $("side").append($(`panel-${panel}`));
/** History, Try and Import need Python: off until it is ready. */
const NEEDS_PYTHON = ["new-data", "revise", "undo", "redo", "track-frequencies", "move-track", "rotate-track", "shear-track", "stretch-track", "split-track", "merge-tracks", "find-jumps", "smooth-track", "fix-list", "plotting-mode", "ask-again", "glitches", "crash", "colleague", "colleague-window", "colleague-during", "file", "narrative-file", "colour", "hide", "show", "add-annotation", "edit-annotation", "delete-annotation", "north-arrow"];
function needsPython(on: boolean): void {
  for (const id of NEEDS_PYTHON) $<HTMLButtonElement | HTMLInputElement>(id).disabled = !on;
}
needsPython(false);
$("undo").onclick = () => void move("undo");
$("redo").onclick = () => void move("redo");
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
  folds.setOpen("panel-catalogue", true);
  folds.setOpen("panel-coverage", true);
  toast(`${made.title} was imported into the catalogue: ${count(made.fixes ?? 0, "fix", "fixes")}. It has data for this plot, so it is marked New data.`);
};
// An item the plot drew from is revised (CAP-12): a colleague corrects it, as one step in that item.
$("revise").onclick = async () => {
  if (!opened) return;
  const revised = await pythonJson<{ item?: string; title?: string; error?: string }>("revise", opened.item.id);
  if (revised.error) return toast(revised.error, "warning");
  await refreshCollation();
  folds.setOpen("panel-catalogue", true);
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
async function askModes(name: string, data: Uint8Array): Promise<{ modes: Record<string, PlottingMode>; remembered: boolean } | undefined> {
  const tracks = await pythonJson<string[]>("rep_tracks", name, data);
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
  folds.setOpen("panel-timeline", true);
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
  const asked = await askModes(file.name, data);
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
  const parts = [count(report.tracks.length, "track"), count(report.fixes, "fix", "fixes")];
  if (report.annotations) parts.push(count(report.annotations, "annotation"));
  if (report.narrative_entries) parts.push(count(report.narrative_entries, "narrative entry", "narrative entries"));
  // Nothing is dropped silently (EXT-15): what wasn't imported is listed beside the map.
  const panel = document.createElement("div");
  panel.className = "omitted-panel";
  const heading = document.createElement("h2");
  heading.textContent = `${file.name}: imported ${parts.join(", ")}`;
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
};

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
  const unavailable = () => Object.assign(document.createElement("li"), { className: "detail", textContent: "Needs Python, which could not start." });
  $("tools").replaceChildren(unavailable());
  $("history").replaceChildren(unavailable());
  if (opened) $("plots").replaceChildren(new Option(opened.item.properties.title ?? opened.item.id, opened.item.id));
}

(async () => {
  void preview(startPlot);
  status("Starting Python in your browser: the first time takes a little while…", true);
  try {
    await python("start");
    tools = await pythonJson<ToolDeclaration[]>("tools");
    await pythonJson("setup");
    await refreshPlots();
    // keep: anything the reader selected on the preview stays selected.
    await openPlot(startPlot, true);
    pythonReady = true;
    refreshTote();
    await showImportMode();
    needsPython(true);
    status("Ready. Everything runs in your browser; nothing is sent anywhere.");
  } catch (error) {
    const message = (error as Error).message;
    withoutPython(message.startsWith("Python couldn't") ? message : `Python could not start here: ${message}.`);
  }
})();
