/**
 * The bearing view (CAP-21, CAP-22; product owner, 24 Oct 2026): a sensor's cuts in a
 * list a TMA solution's period is chosen from, the first guess, and a solution's bearings
 * and residuals after legacy Debrief's Stacked Dots, live while it is dragged on the map.
 *
 * One component for every host: VS Code shows it as the Bearings view (webview/tmaview.ts),
 * the playground as a docked panel. The host asks Python for the cuts and the residuals
 * (debrief/sensors, debrief/tma_residuals) and makes every change; this shows them, works
 * the residuals out again while a drag moves the solution (tma.ts, held to the vectors
 * Python is), and says what the analyst asked for.
 *
 * - The cut list is virtualised: only the rows in sight are drawn, each of one fixed
 *   height (never the font's), so thousands of cuts scroll as quickly as tens. It is a
 *   listbox: Up and Down move along it, Shift with them (or Shift-click) chooses a period,
 *   Home, End, Page Up and Page Down go further, Enter moves current time to the cut (the
 *   map emphasises it), Alt+Down and Alt+Up go to the next and previous ambiguous cut not
 *   yet resolved (and current time with them), and the buttons beside keep a side of the
 *   cut chosen. With a solution shown, Space leaves the cuts chosen out of its RMS error,
 *   or counts them again, one step each time (Shift and the arrow keys still choose; Space
 *   never moves the period). Each option says its place in the list (aria-setsize and
 *   aria-posinset), and the cut chosen stays in the page while scrolled out of sight, so
 *   the list's active descendant is always there.
 * - No solution shown: the sensor's cuts, the period chosen (by default the cuts in the
 *   time window, as CAP-21 roots a solution in the window), and Make solution…: a form for
 *   the first guess (a range along the first cut's bearing, a course and a speed, offered
 *   as 10,000 yd, across the bearing, 8 kn, in the analyst's units), or two clicks on the
 *   map instead.
 * - A solution shown: legacy's Bearing Residuals (Stacked Dots), as legacy laid it out
 *   (product owner, 25 Oct 2026; stackeddots.ts): time up the left, the latest at the top,
 *   and beside each other the Bearing, Error and Course/Speed panes, as the analyst chooses
 *   (remembered per browser, or as the VS Code view's state). Every measured bearing of the
 *   sensors shown on the map, over their whole coverage; the calculated bearings and the
 *   errors where the solution is; the Error pane green while every error counted is within
 *   the analyst's cut-off and pink otherwise, said in words beside it too. Then the RMS, and
 *   the list of the solution's cuts beneath the plot, each with its error. An ambiguous cut
 *   not yet resolved is measured by the bearing nearer the solution (≈); its other bearing
 *   is drawn faint, never counted. A cut hidden on the map is left out until shown again.
 *   A box dragged in a pane zooms (double-click or Reset zoom undoes it); a dot clicked
 *   selects its cut, or the solution's fix, and moves current time to it; a crosshair and a
 *   readout say the time and value under the pointer.
 * - While a drag moves the solution, each frame works out the residuals again, writes the
 *   RMS, the residuals of the rows in sight (their cells only, nothing rebuilt) and draws
 *   the plot: the Error axis fitted to the errors every frame, as legacy's auto-resize did,
 *   or held (Hold scale) and widened when an error falls outside, never a dot drawn at an
 *   edge it is not at; the Bearing axis kept as it was when the drag began, widened the same
 *   way; a zoom kept. The whole frame is timed (timings) against the drag budget (NFR-04).
 */
import { convert, DEFAULT_SETTINGS, fixed, formatTime, UNIT_LABELS, type FormatSettings } from "@debrief/kernel";
import type { TimeRange, TmaCut, TmaRequest, TmaResidualRow, TmaResiduals, TmaSolutionRow, TmaView } from "@debrief/schemas";
import type { LonLat } from "./geodesic.js";
import { bearingText, type Kept } from "./sensors.js";
import {
  about,
  coverageSpan,
  type Cue,
  cueStyle,
  cueMark,
  describeCue,
  errorCue,
  errorExtent,
  fitErrors,
  fitRange,
  inside,
  isZoomed,
  legCourses,
  nearestPoint,
  niceTicks,
  noZoom,
  type Pane,
  PANE_NAMES,
  PANES,
  type PanesShown,
  panTime,
  type Range,
  readPanes,
  tickTime,
  timeTicks,
  timeToY,
  togglePane,
  valueToX,
  widen,
  xToValue,
  yToTime,
  type Zoom,
  zoomBox,
  zoomTime,
  zoomValues,
} from "./stackeddots.js";
import {
  cutBearings,
  type CutRow,
  cutWhen,
  describePeriod,
  describeRms,
  guessDefaults,
  isAmbiguousRow,
  liveResiduals,
  primeLive,
  nearestRow,
  nextAmbiguous,
  nextContact,
  periodOf,
  residualNotes,
  residualText,
  rowLabel,
  rowsInSight,
  scrollFor,
  sideOfRow,
  splitAllowed,
  wrap,
} from "./tma.js";
import { describeDistance, describeSpeed, readBearing, readDistance, readSpeed } from "./trackedit.js";

export interface TmaControlHost {
  /** The analyst chose a sensor, to list its cuts, or a solution, to show its residuals (tma_chosen). */
  choose(featureId: string): void;
  /** Make a solution as asked (tma_create). */
  create(request: TmaRequest): void;
  /** Make a solution of these cuts by two clicks on the map (tma_guess). */
  guess(request: TmaRequest): void;
  /** Leave rooted cuts out of the RMS, or count them again (tma_exclude). */
  exclude(solutionId: string, cutIds: string[], excluded: boolean): void;
  /** Split the solution into legs at a time (tma_split). */
  split(solutionId: string, time: string): void;
  /** Move current time to a cut's time (tma_time_asked). */
  time(time: string): void;
  /** Keep one of an ambiguous cut's bearings, or make it ambiguous again (resolve_asked). */
  resolve(cutId: string, keep: Kept | "ambiguous"): void;
  /** Select a cut, or the solution at one of its fixes, and move current time to it: a dot clicked (tma_select). */
  select(featureId: string, time: string): void;
  /** Remember the analyst's error cut-off, degrees, in their Debrief configuration (tma_cut_off). */
  cutOff(degrees: number): void;
}

/** Where the view remembers which panes show: the browser's storage, or the VS Code view's state. */
export interface TmaControlMemory {
  load(): unknown;
  save(state: { panes: PanesShown }): void;
}

/** One row of the list, of one height whatever the font: the list scrolls by it. */
export const ROW_PX = 22;
/** How near a click is to a dot to choose it, pixels. */
const HIT_PX = 7;
/** A drag shorter than this either way is a click, not a box. */
const BOX_PX = 5;
/** From this width the view lays the plots beside the list (the strip under the map). */
const WIDE_PX = 640;
/** Below this width the list drops its tick boxes, so a bearing is still read whole. */
const NARROW_PX = 280;
const escape = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

type Row = CutRow;

export class TmaControl {
  private view?: TmaView;
  /** The residuals as a drag on the map now leaves them; undefined when not dragging. */
  private live?: TmaResiduals;
  private pending?: LonLat[];
  private frame?: number;
  private active = -1;
  private anchor = -1;
  /** Whether the analyst has chosen a period, or it still follows the time window. */
  private chose = false;
  private window?: TimeRange;
  private current?: number;
  private rowsKey = "";
  private drawn = new Map<number, HTMLElement>();
  private formOpen = false;
  private said?: ReturnType<typeof setTimeout>;
  /** How long each frame of a drag took, ms, the residuals worked out and everything drawn: for the tests and the drag budget (NFR-04). */
  readonly timings: number[] = [];
  /** The Bearing axis while a drag goes on: kept as it was when the drag began (widened, never clamped), and the bearing it is unwrapped about. */
  private frozen?: { bearing: Range; reference: number };
  /** The plots' size while a drag goes on: read once, as reading it after writing the list makes the browser lay the page out again every frame. */
  private frozenGeometry?: ReturnType<TmaControl["measure"]>;
  /** Each base's rows' times, parsed once. */
  private rowTimes = new WeakMap<TmaResiduals | TmaCut[], number[]>();
  /** The theme's colours, read when the view is drawn, not every frame. */
  private colours?: ReturnType<TmaControl["readColours"]>;
  /** Which panes show: the analyst's, remembered. */
  private panes: PanesShown;
  /** Hold scale: the Error axis stays put, widened when an error falls outside it. */
  private hold = false;
  private heldError?: Range;
  private zoom: Zoom = noZoom();
  /** The analyst's error cut-off, degrees: the host's, from Debrief's configuration. */
  private cutOffDegrees = 3;
  /** The sensors' coverage shown (cuts not rooted in the solution), their times, and the whole span plotted: worked out once per view. */
  private coverage: { rows: TmaCut[]; times: number[]; whole?: Range } = { rows: [], times: [] };
  /** The solution's fixes' times, parsed once per view. */
  private fixTimes: number[] = [];
  /** Where each pane was last drawn, and its axis: for pointing at it. */
  private drawn_?: PlotLayout;
  /** A box being dragged in a pane, in the canvas's pixels. */
  private box?: { pane: Pane; x0: number; y0: number; x1: number; y1: number };
  private pointer?: { x: number; y: number };
  /** Each frame's Error axis and how many errors fell outside it (never any): for the tests. */
  readonly errorAxes: { lo: number; hi: number; outside: number }[] = [];
  private readonly sensor: HTMLSelectElement;
  private readonly solution: HTMLSelectElement;
  private readonly plot: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly overlay: HTMLCanvasElement;
  private readonly tools: HTMLElement;
  private readonly readout: HTMLElement;
  private readonly keyLine: HTMLElement;
  private readonly cue: HTMLElement;
  private readonly cutOffInput: HTMLInputElement;
  private readonly rmsLine: HTMLElement;
  private readonly notes: HTMLElement;
  private readonly actions: HTMLElement;
  private readonly list: HTMLElement;
  private readonly spacer: HTMLElement;
  private readonly heading: HTMLElement;
  private readonly chosen: HTMLElement;
  private readonly period: HTMLElement;
  private readonly make: HTMLButtonElement;
  private readonly form: HTMLFormElement;
  private readonly status: HTMLElement;
  private readonly empty: HTMLElement;
  private readonly buttons: Record<"prev" | "next" | "first" | "second" | "again" | "exclude" | "split", HTMLButtonElement>;

  constructor(
    private readonly element: HTMLElement,
    private readonly host: TmaControlHost,
    private readonly settings: FormatSettings = DEFAULT_SETTINGS,
    private readonly memory?: TmaControlMemory,
  ) {
    let remembered: unknown;
    try {
      remembered = memory?.load();
    } catch {
      remembered = undefined;
    }
    this.panes = readPanes((remembered as { panes?: unknown } | undefined)?.panes);
    element.classList.add("tma");
    element.setAttribute("role", "group");
    element.setAttribute("aria-label", "Bearings");
    const paneButton = (p: Pane) => `<button type="button" class="tma-pane" data-pane="${p}" aria-pressed="false" title="Show or hide the ${PANE_NAMES[p]} pane">${PANE_NAMES[p]}</button>`;
    element.innerHTML =
      `<p class="tma-empty">Open a plot with sensor bearings to list its cuts and make a TMA solution from them.</p>` +
      `<div class="tma-head">` +
      `<label class="tma-pick"><span>Sensor</span><select class="tma-sensor" aria-label="Sensor whose cuts are listed"></select></label>` +
      `<label class="tma-pick"><span>Solution</span><select class="tma-solution" aria-label="TMA solution shown"></select></label>` +
      `</div>` +
      `<div class="tma-body"><div class="tma-left">` +
      `<div class="tma-tools" role="toolbar" aria-label="The plot's panes and scale" hidden>` +
      `<span class="tma-panes" role="group" aria-label="Panes shown">${PANES.map(paneButton).join("")}</span>` +
      `<button type="button" class="tma-hold" aria-pressed="false" title="Keep the Error axis as it is while dragging; it still widens to take in an error outside it">Hold scale</button>` +
      `<button type="button" class="tma-reset" disabled title="Undo the zoom (double-click the plot, or press 0 in it)" aria-keyshortcuts="0">Reset zoom</button>` +
      `<label class="tma-cutoff" title="The Error pane is green while every error counted is within this, pink otherwise; kept with your Debrief settings"><span>Cut-off</span><input type="number" class="tma-cutoff-input" min="0.1" max="180" step="0.5" inputmode="decimal" aria-label="Error cut-off, degrees"><span aria-hidden="true">°</span></label>` +
      `</div>` +
      `<div class="tma-plot" hidden><canvas class="tma-canvas" role="img" tabindex="0" aria-keyshortcuts="ArrowUp ArrowDown Enter + - [ ] 0 PageUp PageDown"></canvas><canvas class="tma-overlay" aria-hidden="true"></canvas></div>` +
      `<p class="tma-readout" aria-hidden="true" hidden></p>` +
      `<p class="tma-cue" hidden aria-live="polite"><span class="tma-cue-mark" aria-hidden="true"></span> <span class="tma-cue-text"></span></p>` +
      `<p class="tma-key" aria-hidden="true" hidden></p>` +
      `<p class="tma-rms" hidden></p>` +
      `<div class="tma-below">` +
      `<ul class="tma-notes" hidden></ul>` +
      `<div class="tma-actions" role="group" aria-label="The cut chosen">` +
      `<button type="button" class="tma-prev" title="The previous ambiguous cut not yet resolved, and current time to it (Alt+Up)" aria-keyshortcuts="Alt+ArrowUp">Previous ambiguous</button>` +
      `<button type="button" class="tma-next" title="The next ambiguous cut not yet resolved, and current time to it (Alt+Down)" aria-keyshortcuts="Alt+ArrowDown">Next ambiguous</button>` +
      `<button type="button" class="tma-first" hidden></button>` +
      `<button type="button" class="tma-second" hidden></button>` +
      `<button type="button" class="tma-again" hidden>Make ambiguous again</button>` +
      `<button type="button" class="tma-exclude" hidden aria-keyshortcuts="Space"></button>` +
      `<button type="button" class="tma-split" hidden></button>` +
      `</div>` +
      `<div class="tma-chosen"><span class="tma-period" aria-live="polite"></span><button type="button" class="tma-make primary">Make solution…</button></div>` +
      `<form class="tma-form" hidden novalidate aria-label="First guess"></form>` +
      `<p class="tma-status" aria-live="polite"></p>` +
      `</div></div><div class="tma-right">` +
      `<div class="tma-columns" aria-hidden="true"><span class="tma-c-time">Time</span><span class="tma-c-brg">Bearing</span><span class="tma-c-res">Residual</span></div>` +
      `<div class="tma-list" role="listbox" tabindex="0" aria-multiselectable="true"><div class="tma-spacer"></div></div>` +
      `</div></div>`;
    const q = <T extends HTMLElement>(s: string) => element.querySelector<T>(s)!;
    this.empty = q(".tma-empty");
    this.sensor = q(".tma-sensor");
    this.solution = q(".tma-solution");
    this.plot = q(".tma-plot");
    this.canvas = q(".tma-canvas");
    this.overlay = q(".tma-overlay");
    this.tools = q(".tma-tools");
    this.readout = q(".tma-readout");
    this.keyLine = q(".tma-key");
    this.cue = q(".tma-cue");
    this.cutOffInput = q(".tma-cutoff-input");
    this.rmsLine = q(".tma-rms");
    this.notes = q(".tma-notes");
    this.actions = q(".tma-actions");
    this.heading = q(".tma-columns");
    this.list = q(".tma-list");
    this.spacer = q(".tma-spacer");
    this.chosen = q(".tma-chosen");
    this.period = q(".tma-period");
    this.make = q(".tma-make");
    this.form = q(".tma-form");
    this.status = q(".tma-status");
    this.buttons = {
      prev: q(".tma-prev"),
      next: q(".tma-next"),
      first: q(".tma-first"),
      second: q(".tma-second"),
      again: q(".tma-again"),
      exclude: q(".tma-exclude"),
      split: q(".tma-split"),
    };
    this.sensor.addEventListener("change", () => {
      if (!this.sensor.value) return;
      this.chose = false;
      this.host.choose(this.sensor.value);
    });
    this.solution.addEventListener("change", () => this.host.choose(this.solution.value || this.sensor.value));
    this.list.addEventListener("scroll", () => this.renderRows());
    this.list.addEventListener("keydown", (e) => this.key(e));
    this.list.addEventListener("click", (e) => this.click(e));
    this.list.addEventListener("focus", () => {
      if (this.active < 0 && this.rows().length) this.setActive(0, false);
    });
    this.canvas.addEventListener("pointerdown", (e) => this.pointerDown(e));
    this.canvas.addEventListener("pointermove", (e) => this.pointerMove(e));
    this.canvas.addEventListener("pointerup", (e) => this.pointerUp(e));
    this.canvas.addEventListener("pointercancel", () => this.pointerGone());
    this.canvas.addEventListener("pointerleave", () => !this.box && this.pointerGone());
    this.canvas.addEventListener("dblclick", () => this.resetZoom());
    this.canvas.addEventListener("keydown", (e) => this.plotKey(e));
    this.canvas.addEventListener("focus", () => this.sayActive());
    this.canvas.addEventListener("blur", () => this.pointerGone());
    this.tools.querySelectorAll<HTMLButtonElement>(".tma-pane").forEach((button) => button.addEventListener("click", () => this.togglePane(button.dataset.pane as Pane)));
    q<HTMLButtonElement>(".tma-hold").addEventListener("click", () => this.setHold(!this.hold));
    q<HTMLButtonElement>(".tma-reset").addEventListener("click", () => this.resetZoom());
    this.cutOffInput.addEventListener("change", () => this.setCutOff(Number(this.cutOffInput.value)));
    this.buttons.prev.addEventListener("click", () => this.ambiguous(-1));
    this.buttons.next.addEventListener("click", () => this.ambiguous(1));
    this.buttons.first.addEventListener("click", () => this.keep("bearing"));
    this.buttons.second.addEventListener("click", () => this.keep("ambiguous_bearing"));
    this.buttons.again.addEventListener("click", () => this.keep("ambiguous"));
    this.buttons.exclude.addEventListener("click", () => this.toggleExcluded());
    this.buttons.split.addEventListener("click", () => this.split());
    this.make.addEventListener("click", () => this.openForm());
    // Wide and short (the strip under the map): the plots and buttons beside the list, not above it.
    const resized = new ResizeObserver(() => {
      element.classList.toggle("tma-wide", element.clientWidth >= WIDE_PX);
      // Narrow (a side column, about 200 px): the list keeps time, bearing and residual readable; the tick box goes (Space and the button leave a cut out).
      element.classList.toggle("tma-narrow", element.clientWidth < NARROW_PX);
      this.renderRows();
      // Not mid-drag: the plot's size is read once a drag.
      if (!this.live) this.frozenGeometry = undefined;
      this.drawPlot();
    });
    resized.observe(element);
    // The plot's own box too: what is beneath it (a note, the buttons) can take its height without the panel changing.
    resized.observe(this.plot);
    this.render();
  }

  // --- What the host says -------------------------------------------------------------

  /** Everything the view shows; nothing for no plot. */
  show(view: TmaView | undefined): void {
    const before = this.view;
    this.view = view;
    this.live = undefined;
    this.frozen = undefined;
    this.frozenGeometry = undefined;
    this.colours = undefined;
    if (view?.error_cut_off !== undefined && view.error_cut_off !== null) this.cutOffDegrees = view.error_cut_off;
    // Another solution: its own zoom and held scale; the same one shown again (a step saved) keeps them.
    if (before?.solution_id !== view?.solution_id || before?.plot_id !== view?.plot_id) {
      this.zoom = noZoom();
      this.heldError = undefined;
    }
    this.prepareCoverage();
    const key = this.keyOf();
    if (key !== this.rowsKey) {
      // Another list: the place in it starts again, but a solution's own list keeps its row.
      const kept = before && view && this.mode() === "solution" && before.solution_id === view.solution_id ? this.activeId(before) : undefined;
      this.rowsKey = key;
      this.active = kept ? this.rows().findIndex((r) => r.id === kept) : -1;
      this.anchor = this.active;
      this.drawn.forEach((e) => e.remove());
      this.drawn.clear();
      if (!kept) this.list.scrollTop = 0;
    } else {
      this.drawn.forEach((e) => e.remove());
      this.drawn.clear();
    }
    if (!this.chose) this.followWindow();
    this.render();
    // Ready for a drag: its first frame then costs no more than the rest (NFR-04).
    const solution = this.solutionRow();
    if (view?.residuals && solution) {
      primeLive(view.residuals, solution);
      this.timesOf(view.residuals.rows);
    }
  }

  /** Current time and the time window: the period offered follows the window until the analyst chooses one. */
  setTime(current: number | undefined, window?: TimeRange): void {
    this.current = current;
    if (window) this.window = window;
    if (!this.chose && this.mode() === "cuts") {
      this.followWindow();
      this.renderRows();
      this.renderChosen();
    }
    this.drawPlot();
  }

  /** A solution as a drag on the map now leaves it, its fixes where the map draws them; none when the drag ends. */
  preview(featureId: string, coordinates: LonLat[] | undefined): void {
    const view = this.view;
    if (!view || view.solution_id !== featureId || !view.residuals) return;
    if (!coordinates) {
      // The drag put back, or saved: Python's residuals (exact again once the step is saved).
      this.pending = undefined;
      if (this.frame !== undefined) cancelAnimationFrame(this.frame);
      this.frame = undefined;
      this.frozen = undefined;
      this.frozenGeometry = undefined;
      if (this.live) {
        this.live = undefined;
        this.cue.setAttribute("aria-live", "polite");
        this.renderResiduals();
      }
      return;
    }
    this.pending = coordinates;
    if (this.frame !== undefined) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = undefined;
      const coords = this.pending;
      const solution = this.solutionRow();
      if (!coords || !solution || !this.view?.residuals) return;
      const started = performance.now();
      this.live = liveResiduals(this.view.residuals, solution, coords);
      this.renderLive();
      this.timings.push(performance.now() - started);
      if (this.timings.length > 2000) this.timings.splice(0, 1000);
    });
  }

  /** Say something beneath the list, read aloud. */
  say(text: string): void {
    this.status.textContent = text;
    clearTimeout(this.said);
    this.said = setTimeout(() => (this.status.textContent = ""), 6000);
  }

  /** The form's answer: closed once the solution is made, or why not, left open. */
  made(problem?: string): void {
    if (!problem) {
      this.closeForm();
      return;
    }
    const why = this.form.querySelector<HTMLElement>(".tma-form-problem");
    if (why) why.textContent = problem;
    this.form.querySelector<HTMLButtonElement>("button[type=submit]")?.removeAttribute("disabled");
  }

  /** The residuals shown: as a drag leaves them, or as Python gave them. For tests and agents. */
  get residuals(): TmaResiduals | undefined {
    return this.live ?? this.view?.residuals ?? undefined;
  }

  /** What the view shows now, as the host gave it. For tests. */
  get shown(): TmaView | undefined {
    return this.view;
  }

  /** The cuts of the period chosen, first to last. For tests. */
  chosenCuts(): Row[] {
    return this.chosenRows();
  }

  /** The plot as last drawn: its panes, axes, span, zoom and cue. For tests and agents. */
  get plotState() {
    const d = this.drawn_;
    return {
      panes: { ...this.panes },
      hold: this.hold,
      zoomed: isZoomed(this.zoom),
      zoom: this.zoom,
      span: d?.span,
      whole: this.coverage.whole,
      axes: d ? Object.fromEntries(d.panes.map((p) => [p.pane, p.range])) : {},
      /** Where each pane is drawn, in pixels from the canvas's top left. */
      boxes: d ? Object.fromEntries(d.panes.map((p) => [p.pane, { x: p.x, w: p.w, top: d.top, height: d.height }])) : {},
      speed: d?.speed,
      cue: d?.cue,
      coverage: this.coverage.rows.length,
    };
  }

  /**
   * Where a cut's dot is drawn in a pane, or the solution's at a time in the Course/Speed
   * pane, in pixels from the canvas's top left; undefined if it is not drawn. For tests.
   */
  pointOf(id: string, pane: Pane = "error", time?: string): { x: number; y: number } | undefined {
    const d = this.drawn_;
    const p = d?.panes.find((q) => q.pane === pane);
    if (!d || !p) return undefined;
    if (id === this.view?.solution_id && time) {
      // The solution at a fix: its course in the Course/Speed pane.
      const i = this.fixTimes.indexOf(Date.parse(time));
      const course = this.solutionRow()?.courses?.[i];
      if (pane !== "course" || i < 0 || course === undefined) return undefined;
      const value = about(course, d.courseReference);
      if (!inside(value, p.range)) return undefined;
      return { x: valueToX(value, p.range, p.x, p.w), y: timeToY(this.fixTimes[i], d.span, d.top, d.height) };
    }
    const report = this.residuals;
    const rows = report?.rows ?? [];
    const times = this.timesOf(rows);
    const i = rows.findIndex((r) => r.id === id);
    if (i >= 0) {
      const r = rows[i];
      const v = pane === "error" ? r.residual : pane === "bearing" ? r.measured : undefined;
      if (v === undefined || v === null) return undefined;
      const value = pane === "bearing" ? about(v, d.reference) : v;
      if (!inside(value, p.range) || times[i] < d.span[0] || times[i] > d.span[1]) return undefined;
      return { x: valueToX(value, p.range, p.x, p.w), y: timeToY(times[i], d.span, d.top, d.height) };
    }
    const k = this.coverage.rows.findIndex((c) => c.id === id);
    if (k >= 0 && pane === "bearing") {
      const c = this.coverage.rows[k];
      const value = about(c.resolved === "ambiguous_bearing" ? (c.ambiguous_bearing ?? c.bearing) : c.bearing, d.reference);
      if (!inside(value, p.range)) return undefined;
      return { x: valueToX(value, p.range, p.x, p.w), y: timeToY(this.coverage.times[k], d.span, d.top, d.height) };
    }
    return undefined;
  }

  // --- The rows -------------------------------------------------------------------------

  private mode(): "cuts" | "solution" | "none" {
    if (!this.view) return "none";
    if (this.view.solution_id && this.view.residuals) return "solution";
    return "cuts";
  }

  private rows(): Row[] {
    if (this.mode() === "solution") return this.residuals?.rows ?? [];
    return this.view?.cuts ?? [];
  }

  private keyOf(): string {
    const v = this.view;
    if (!v) return "";
    return this.mode() === "solution" ? `s:${v.solution_id}:${v.residuals?.rows.length}` : `c:${v.sensor_id}:${v.cuts?.length ?? 0}:${v.cuts?.[0]?.id ?? ""}`;
  }

  private activeId(view: TmaView): string | undefined {
    const rows = view.solution_id && view.residuals ? view.residuals.rows : (view.cuts ?? []);
    return rows[this.active]?.id;
  }

  private solutionRow(): TmaSolutionRow | undefined {
    return this.view?.solutions?.find((s) => s.id === this.view?.solution_id);
  }

  /** The period offered: the cuts in the time window (CAP-21: a solution is rooted in the window). */
  private followWindow(): void {
    if (this.mode() !== "cuts" || !this.window) return;
    const rows = this.rows();
    const lo = rows.findIndex((r) => r.time >= this.window!.start);
    let hi = -1;
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].time <= this.window!.end) {
        hi = i;
        break;
      }
    }
    if (lo >= 0 && hi >= lo) {
      this.anchor = lo;
      this.active = hi;
    } else {
      this.anchor = this.active = -1;
    }
  }

  private range(): [number, number] | undefined {
    if (this.active < 0) return undefined;
    const a = this.anchor < 0 ? this.active : this.anchor;
    return [Math.min(a, this.active), Math.max(a, this.active)];
  }

  private render(): void {
    const view = this.view;
    const open = !!view && ((view.sensors?.length ?? 0) > 0 || (view.solutions?.length ?? 0) > 0);
    this.empty.hidden = open;
    for (const part of [this.element.querySelector<HTMLElement>(".tma-head")!, this.element.querySelector<HTMLElement>(".tma-body")!]) part.hidden = !open;
    if (!open) {
      this.plot.hidden = this.tools.hidden = this.readout.hidden = this.cue.hidden = this.keyLine.hidden = true;
      this.element.classList.remove("tma-solution-shown");
      this.rmsLine.hidden = this.notes.hidden = this.actions.hidden = this.chosen.hidden = true;
      this.closeForm();
      return;
    }
    const sensors = view!.sensors ?? [];
    this.sensor.innerHTML = sensors
      .map((s) => `<option value="${escape(s.id)}">${escape(s.name)}${s.host ? ` on ${escape(s.host)}` : ""} (${s.cuts.toLocaleString("en-GB")} ${s.cuts === 1 ? "cut" : "cuts"}${s.ambiguous ? `, ${s.ambiguous} ambiguous` : ""})</option>`)
      .join("");
    this.sensor.value = view!.sensor_id ?? sensors[0]?.id ?? "";
    this.sensor.disabled = !sensors.length;
    const solutions = view!.solutions ?? [];
    this.solution.innerHTML =
      `<option value="">${solutions.length ? "None: list the sensor's cuts" : "None yet"}</option>` +
      solutions.map((s) => `<option value="${escape(s.id)}">${escape(s.name)}</option>`).join("");
    this.solution.value = view!.solution_id ?? "";
    this.solution.disabled = !solutions.length;
    const solution = this.mode() === "solution";
    this.list.setAttribute("aria-label", solution ? `Cuts of ${this.solutionRow()?.name ?? "the solution"}, with their residuals` : `Cuts of ${sensors.find((s) => s.id === this.sensor.value)?.name ?? "the sensor"}`);
    this.heading.classList.toggle("tma-with-residual", solution);
    this.list.classList.toggle("tma-with-residual", solution);
    this.plot.hidden = this.tools.hidden = this.readout.hidden = this.cue.hidden = this.keyLine.hidden = !solution;
    this.element.classList.toggle("tma-solution-shown", solution);
    this.renderTools();
    this.chosen.hidden = solution;
    if (solution) this.closeForm();
    this.renderResiduals();
    this.renderChosen();
  }

  /** Everything that changes with the residuals: the plots, the RMS, the notes, the rows, the buttons. */
  private renderResiduals(): void {
    const solution = this.mode() === "solution";
    const report = solution ? this.residuals : undefined;
    this.rmsLine.hidden = !solution;
    this.rmsLine.textContent = report ? `${describeRms(report, this.settings)}${this.live ? " (while dragging)" : ""}` : "";
    const notes = residualNotes(report);
    this.notes.hidden = !notes.length;
    this.notes.innerHTML = notes.map((n) => `<li>${escape(n)}</li>`).join("");
    this.spacer.style.height = `${this.rows().length * ROW_PX}px`;
    this.drawn.forEach((e) => e.remove());
    this.drawn.clear();
    this.renderRows();
    this.renderActions();
    this.drawPlot();
    this.renderCue();
  }

  /** The cut-off's state in words and a mark beside the Error pane, so colour is never all that says it. */
  private renderCue(): void {
    const cue = this.drawn_?.cue;
    if (this.mode() !== "solution" || !cue) return;
    this.cue.dataset.state = cue.state;
    this.cue.querySelector<HTMLElement>(".tma-cue-mark")!.textContent = cueMark(cue);
    this.cue.querySelector<HTMLElement>(".tma-cue-text")!.textContent = describeCue(cue, this.settings);
  }

  /** A frame of a drag: the RMS, the residual cells of the rows in the page, the plots; nothing rebuilt. */
  private renderLive(): void {
    const report = this.residuals;
    if (!report) return;
    // The plots first, then the words: nothing read from the page after it is written.
    this.drawPlot();
    // Said once the drag ends, not every frame.
    if (this.cue.getAttribute("aria-live") !== "off") this.cue.setAttribute("aria-live", "off");
    this.renderCue();
    this.rmsLine.textContent = `${describeRms(report, this.settings)} (while dragging)`;
    for (const [i, element] of this.drawn) {
      const row = report.rows[i];
      if (row) this.fillResidual(element, row);
    }
  }

  /** The rows in sight, and a few either side; the rest are not in the page, but for the cut chosen, so the list's active descendant is always there. */
  private renderRows(): void {
    const rows = this.rows();
    const { first, last } = rowsInSight(this.list.scrollTop, this.list.clientHeight || ROW_PX * 10, ROW_PX, rows.length);
    const range = this.range();
    const solution = this.mode() === "solution";
    const keep = (i: number) => (i >= first && i <= last) || i === this.active;
    for (const [i, element] of this.drawn) {
      if (!keep(i) || i >= rows.length) {
        element.remove();
        this.drawn.delete(i);
      }
    }
    const several = new Set(rows.map((r) => r.sensor_id)).size > 1;
    const wanted = [...Array(Math.max(0, last - first + 1)).keys()].map((k) => first + k);
    if (this.active >= 0 && this.active < rows.length && !wanted.includes(this.active)) wanted.push(this.active);
    for (const i of wanted) {
      const row = rows[i];
      if (!row) continue;
      const chosen = !!range && i >= range[0] && i <= range[1];
      let element = this.drawn.get(i);
      if (!element) {
        element = document.createElement("div");
        element.className = "tma-row";
        element.setAttribute("role", "option");
        element.id = `tma-row-${i}`;
        element.style.top = `${i * ROW_PX}px`;
        element.dataset.index = String(i);
        element.innerHTML = `<span class="tma-c-time"></span><span class="tma-c-brg"><span class="tma-swatch"></span><span class="tma-brg"></span> <span class="tma-flag"></span></span>` + (solution ? `<span class="tma-c-res"></span><span class="tma-c-in" data-toggle="1"></span>` : "");
        this.list.appendChild(element);
        this.drawn.set(i, element);
      }
      element.dataset.cut = row.id;
      element.setAttribute("aria-posinset", String(i + 1));
      element.setAttribute("aria-setsize", String(rows.length));
      element.setAttribute("aria-selected", String(chosen));
      element.classList.toggle("tma-active", i === this.active);
      element.classList.toggle("tma-chosen-row", chosen);
      element.classList.toggle("tma-hidden-cut", !!row.hidden);
      element.querySelector<HTMLElement>(".tma-c-time")!.textContent = cutWhen(row, this.settings);
      const swatch = element.querySelector<HTMLElement>(".tma-swatch")!;
      swatch.style.background = row.colour ?? "";
      swatch.title = several ? (row.sensor ?? "") : "";
      this.fillResidual(element, row, several);
    }
    if (this.active >= 0 && this.drawn.has(this.active)) this.list.setAttribute("aria-activedescendant", `tma-row-${this.active}`);
    else this.list.removeAttribute("aria-activedescendant");
  }

  /** A row's cells that change with the residuals: its bearing as measured, its flags, its residual, whether it counts, and what it says. */
  private fillResidual(element: HTMLElement, row: Row, several = false): void {
    const solution = this.mode() === "solution";
    const r = row as TmaResidualRow;
    // With a solution, the bearing measured (the nearer of an unresolved pair, ≈); else both.
    const bearing = solution && r.measured !== undefined && r.measured !== null ? bearingText(r.measured) : cutBearings(row);
    element.querySelector<HTMLElement>(".tma-brg")!.textContent = bearing;
    element.querySelector<HTMLElement>(".tma-flag")!.textContent = `${isAmbiguousRow(row) ? (solution && r.nearer_side ? "≈" : "?") : ""}${row.origin_derived ? "◇" : ""}${row.hidden ? "⊘" : ""}`;
    element.classList.toggle("tma-excluded", !!r.excluded);
    const res = element.querySelector<HTMLElement>(".tma-c-res");
    if (res) res.textContent = residualText(r.residual, this.settings);
    const toggle = element.querySelector<HTMLElement>(".tma-c-in");
    if (toggle) {
      toggle.textContent = r.excluded ? "☐" : "☑";
      toggle.title = r.excluded ? "Left out of the RMS: click, or press Space, to count it again" : "Counted in the RMS: click, or press Space, to leave it out";
    }
    element.setAttribute("aria-label", rowLabel(row, this.settings, several));
  }

  private renderChosen(): void {
    if (this.mode() !== "cuts") return;
    const range = this.range();
    const rows = this.rows();
    this.period.textContent = range ? describePeriod(rows, range[0], range[1], this.settings) : rows.length ? "Choose the period: click its first cut, then Shift-click its last (or Shift and the arrow keys)." : "This sensor has no cuts.";
    this.make.disabled = !range || range[0] === range[1] || !!this.view?.read_only;
    this.make.title = this.view?.read_only ? "An earlier revision is shown read-only" : "Make a TMA solution rooted in the cuts chosen, from a first guess";
  }

  /** The buttons for the cut chosen: its sides, whether it counts, where to split. */
  private renderActions(): void {
    const rows = this.rows();
    const row = rows[this.active];
    const readOnly = !!this.view?.read_only;
    const anyAmbiguous = rows.some(isAmbiguousRow);
    this.actions.hidden = !rows.length;
    this.buttons.prev.disabled = this.buttons.next.disabled = !anyAmbiguous;
    const ambiguous = !!row && row.ambiguous_bearing !== undefined && row.ambiguous_bearing !== null;
    const side = (which: Kept) => {
      const s = row ? sideOfRow(row, which) : undefined;
      return s ? ` (${s})` : "";
    };
    this.buttons.first.hidden = this.buttons.second.hidden = !ambiguous || !!row?.resolved;
    this.buttons.again.hidden = !ambiguous || !row?.resolved;
    if (ambiguous && row) {
      this.buttons.first.textContent = `Keep ${bearingText(row.bearing)}${side("bearing")}`;
      this.buttons.second.textContent = `Keep ${bearingText(row.ambiguous_bearing!)}${side("ambiguous_bearing")}`;
    }
    for (const b of [this.buttons.first, this.buttons.second, this.buttons.again]) b.disabled = readOnly;
    const solution = this.mode() === "solution";
    const chosenRows = this.chosenRows();
    this.buttons.exclude.hidden = !solution || !chosenRows.length;
    if (solution && chosenRows.length) {
      const out = chosenRows.every((r) => (r as TmaResidualRow).excluded);
      const what = chosenRows.length === 1 ? "this cut" : `${chosenRows.length} cuts`;
      this.buttons.exclude.textContent = out ? `Count ${what} in the RMS` : `Leave ${what} out of the RMS`;
      this.buttons.exclude.disabled = readOnly;
    }
    const at = this.splitTime();
    this.buttons.split.hidden = !solution || !at;
    if (at) {
      this.buttons.split.textContent = `Split into legs at ${formatTime(Date.parse(at), this.settings)}`;
      this.buttons.split.title = "Split the solution into legs here: each leg is dragged on its own (This leg, on the map), the other legs staying where they are";
      this.buttons.split.disabled = readOnly;
    }
  }

  private chosenRows(): Row[] {
    const range = this.range();
    return range ? this.rows().slice(range[0], range[1] + 1) : [];
  }

  /** Where a split goes: the cut chosen (a manoeuvre picked here), else current time. */
  private splitTime(): string | undefined {
    const row = this.rows()[this.active];
    const at = row ? row.time : this.current !== undefined ? new Date(this.current).toISOString() : undefined;
    // Only where the leg there keeps two fixes or more either side, as Python asks.
    const solution = this.solutionRow();
    const times = (solution?.times ?? []).map((x) => Date.parse(x));
    return at && splitAllowed(times, (solution?.leg_starts ?? []).map((x) => Date.parse(x)), Date.parse(at)) ? at : undefined;
  }

  // --- The keyboard and the pointer -----------------------------------------------------

  private setActive(index: number, extend: boolean, say = false): void {
    const rows = this.rows();
    if (!rows.length) return;
    const i = Math.max(0, Math.min(rows.length - 1, index));
    this.active = i;
    if (!extend) this.anchor = i;
    if (this.mode() === "cuts") this.chose = true;
    const height = this.list.clientHeight || ROW_PX * 10;
    this.list.scrollTop = scrollFor(i, this.list.scrollTop, height, ROW_PX);
    this.renderRows();
    this.renderActions();
    this.renderChosen();
    this.drawPlot();
    if (say) this.say(rowLabel(rows[i], this.settings));
  }

  private key(event: KeyboardEvent): void {
    const rows = this.rows();
    if (!rows.length) return;
    const page = Math.max(1, Math.floor((this.list.clientHeight || ROW_PX * 10) / ROW_PX) - 1);
    const at = this.active < 0 ? 0 : this.active;
    const moves: Record<string, number> = { ArrowDown: at + 1, ArrowUp: at - 1, PageDown: at + page, PageUp: at - page, Home: 0, End: rows.length - 1 };
    if (event.altKey && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      return this.ambiguous(event.key === "ArrowDown" ? 1 : -1);
    }
    if (event.key in moves) {
      event.preventDefault();
      return this.setActive(this.active < 0 ? 0 : moves[event.key], event.shiftKey);
    }
    if (event.key === "a" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.anchor = 0;
      return this.setActive(rows.length - 1, true);
    }
    if (event.key === "Enter" && this.active >= 0) {
      event.preventDefault();
      this.host.time(rows[this.active].time);
      return this.say(`Current time ${cutWhen(rows[this.active], this.settings)}.`);
    }
    if (event.key === " " && this.mode() === "solution" && this.active >= 0) {
      event.preventDefault();
      return this.toggleExcluded();
    }
  }

  private click(event: MouseEvent): void {
    const element = (event.target as HTMLElement).closest<HTMLElement>(".tma-row");
    if (!element) return;
    const index = Number(element.dataset.index);
    if ((event.target as HTMLElement).closest("[data-toggle]")) {
      this.setActive(index, false);
      return this.toggleExcluded();
    }
    this.setActive(index, event.shiftKey);
    this.list.focus({ preventScroll: true });
    // A cut clicked: current time to it, so the map emphasises it.
    if (!event.shiftKey) this.host.time(this.rows()[index].time);
  }

  private ambiguous(direction: 1 | -1): void {
    const rows = this.rows();
    const found = nextAmbiguous(rows, this.active < 0 ? (direction === 1 ? -1 : 0) : this.active, direction);
    if (found === undefined) return this.say("No ambiguous cut left to resolve here.");
    this.setActive(found, false, true);
    this.host.time(rows[found].time);
    this.list.focus({ preventScroll: true });
  }

  private keep(keep: Kept | "ambiguous"): void {
    const row = this.rows()[this.active];
    if (!row || this.view?.read_only) return;
    this.host.resolve(row.id, keep);
    const kept = keep === "ambiguous" ? "both bearings again" : `${bearingText(keep === "bearing" ? row.bearing : row.ambiguous_bearing!)} kept`;
    this.say(`${cutWhen(row, this.settings)}: ${kept}.`);
  }

  private toggleExcluded(): void {
    const solution = this.view?.solution_id;
    const chosenRows = this.chosenRows() as TmaResidualRow[];
    if (!solution || !chosenRows.length || this.view?.read_only) return;
    const out = !chosenRows.every((r) => r.excluded);
    this.host.exclude(solution, chosenRows.map((r) => r.id), out);
    const what = chosenRows.length === 1 ? `Cut at ${cutWhen(chosenRows[0], this.settings)}` : `${chosenRows.length} cuts`;
    this.say(`${what} ${out ? "left out of" : "counted again in"} the RMS.`);
  }

  private split(): void {
    const solution = this.view?.solution_id;
    const at = this.splitTime();
    if (solution && at && !this.view?.read_only) this.host.split(solution, at);
  }

  // --- The first guess --------------------------------------------------------------------

  private openForm(): void {
    const rows = this.rows();
    const range = this.range();
    if (!range || this.view?.read_only) return;
    const first = rows[range[0]];
    const ambiguous = isAmbiguousRow(first);
    const guess = guessDefaults(first, undefined, this.settings);
    const contact = nextContact(this.view?.solutions ?? []);
    const field = (name: string, label: string, value: string, hint: string) =>
      `<label class="tma-field"><span>${label}</span><input name="${name}" value="${escape(value)}" autocomplete="off" spellcheck="false" aria-describedby="tma-${name}-means"></label><span class="tma-means" id="tma-${name}-means">${escape(hint)}</span>`;
    const along = ambiguous
      ? `<label class="tma-field"><span>Along</span><select name="along">` +
        `<option value="bearing">${escape(bearingText(first.bearing))}${first.side ? ` (${first.side})` : ""}</option>` +
        `<option value="ambiguous_bearing">${escape(bearingText(first.ambiguous_bearing!))}${sideOfRow(first, "ambiguous_bearing") ? ` (${sideOfRow(first, "ambiguous_bearing")})` : ""}</option>` +
        `</select></label><span class="tma-means">The first cut is ambiguous: which of its bearings the solution starts on.</span>`
      : "";
    this.form.innerHTML =
      `<p class="tma-form-title">First guess for ${escape(describePeriod(rows, range[0], range[1], this.settings))}</p>` +
      field("contact", "Contact", contact, "What the solution is of; its track is named after it.") +
      field("range", "Range", guess.range, `Along the first cut's bearing, ${bearingText(guess.bearing ?? first.bearing)}, from where it was taken.`) +
      along +
      field("course", "Course", guess.course, "Degrees true; offered across the bearing.") +
      field("speed", "Speed", guess.speed, "Offered as 8 kn.") +
      `<p class="tma-form-problem" role="alert"></p>` +
      `<div class="tma-form-buttons"><button type="submit" class="primary">Make solution</button>` +
      `<button type="button" class="tma-clicks" title="Click on the first cut's line, then on the last's, on the map: the course and speed follow">Two clicks on the map instead</button>` +
      `<button type="button" class="tma-cancel">Cancel</button></div>`;
    this.form.hidden = false;
    this.formOpen = true;
    this.make.hidden = true;
    const along_ = this.form.querySelector<HTMLSelectElement>("select[name=along]");
    along_?.addEventListener("change", () => {
      const again = guessDefaults(first, along_.value as Kept, this.settings);
      const course = this.form.querySelector<HTMLInputElement>("input[name=course]")!;
      course.value = again.course;
      this.form.querySelector<HTMLElement>("#tma-range-means")!.textContent = `Along the first cut's bearing, ${bearingText(again.bearing ?? first.bearing)}, from where it was taken.`;
    });
    this.form.querySelectorAll<HTMLInputElement>("input").forEach((input) => input.addEventListener("input", () => this.checkForm(false)));
    this.form.onsubmit = (event) => {
      event.preventDefault();
      const request = this.checkForm(true);
      if (!request) return;
      this.form.querySelector<HTMLButtonElement>("button[type=submit]")!.disabled = true;
      this.host.create(request);
    };
    this.form.querySelector(".tma-clicks")!.addEventListener("click", () => {
      const request = this.requestOfRange();
      if (!request) return;
      const contact = this.form.querySelector<HTMLInputElement>("input[name=contact]")!.value.trim();
      this.host.guess({ ...request, ...(contact && { contact }) });
      this.say("Click on the first cut's line on the map, then on the last's. Escape cancels.");
    });
    this.form.querySelector(".tma-cancel")!.addEventListener("click", () => {
      this.closeForm();
      this.make.focus();
    });
    this.form.querySelector<HTMLInputElement>("input[name=range]")!.focus();
  }

  private closeForm(): void {
    if (!this.formOpen) return;
    this.formOpen = false;
    this.form.hidden = true;
    this.form.innerHTML = "";
    this.make.hidden = false;
  }

  private requestOfRange(): TmaRequest | undefined {
    const range = this.range();
    const period = range && periodOf(this.rows(), range[0], range[1]);
    const sensor = this.view?.sensor_id;
    if (!period || !sensor) return undefined;
    return { sensor_ids: [sensor], period };
  }

  /** The form read: what each field means, or what is wrong; the request when every field is right and asked for. */
  private checkForm(submit: boolean): TmaRequest | undefined {
    const value = (name: string) => this.form.querySelector<HTMLInputElement>(`input[name=${name}]`)?.value ?? "";
    const means = (name: string, text: string, problem = false) => {
      const element = this.form.querySelector<HTMLElement>(`#tma-${name}-means`);
      if (!element) return;
      element.textContent = text;
      element.classList.toggle("tma-problem", problem);
      this.form.querySelector(`input[name=${name}]`)?.setAttribute("aria-invalid", String(problem));
    };
    const range = readDistance(value("range"), this.settings);
    const course = readBearing(value("course"));
    const speed = readSpeed(value("speed"), this.settings);
    let ok = true;
    if ("problem" in range) {
      means("range", range.problem, true);
      ok = false;
    } else if (!range.value) {
      means("range", "The range is more than nothing.", true);
      ok = false;
    } else means("range", `Means ${describeDistance(range, this.settings)}.`);
    if (typeof course !== "number") {
      means("course", course.problem, true);
      ok = false;
    } else means("course", `Means ${bearingText(course)}T.`);
    if ("problem" in speed) {
      means("speed", speed.problem, true);
      ok = false;
    } else means("speed", `Means ${describeSpeed(speed, this.settings)}.`);
    if (!submit || !ok) return undefined;
    const base = this.requestOfRange();
    if (!base || typeof course !== "number" || "problem" in range || "problem" in speed) return undefined;
    const contact = value("contact").trim();
    const along = this.form.querySelector<HTMLSelectElement>("select[name=along]")?.value as Kept | undefined;
    return {
      ...base,
      ...(contact && { contact }),
      range: range as TmaRequest["range"],
      course: { value: course, unit: "deg" },
      speed: speed as TmaRequest["speed"],
      ...(along && { first_bearing: along }),
    };
  }


  // --- The plot: legacy's Bearing Residuals (Stacked Dots), as legacy laid it out ------------

  /** The coverage not rooted in the solution, its times, and the whole span plotted: once per view, never per frame. */
  private prepareCoverage(): void {
    const view = this.view;
    const solution = this.solutionRow();
    this.fixTimes = (solution?.times ?? []).map((t) => Date.parse(t));
    if (!view?.residuals || !view.solution_id) {
      this.coverage = { rows: [], times: [] };
      return;
    }
    const rooted = new Set(view.residuals.rows.map((r) => r.id));
    const rows = (view.coverage ?? []).filter((c) => !rooted.has(c.id) && !c.hidden);
    const times = rows.map((c) => Date.parse(c.time));
    const rowTimes = view.residuals.rows.map((r) => Date.parse(r.time));
    const period: Range | undefined = solution ? [Date.parse(solution.period.start), Date.parse(solution.period.end)] : undefined;
    this.coverage = { rows, times, whole: coverageSpan(times, rowTimes, period) };
  }

  private togglePane(pane: Pane): void {
    const next = togglePane(this.panes, pane);
    if (next === this.panes) return this.say("One pane at least stays shown.");
    this.panes = next;
    try {
      this.memory?.save({ panes: this.panes });
    } catch {
      // Not remembered: the choice holds for now.
    }
    this.renderTools();
    this.drawPlot();
    this.say(`${PANE_NAMES[pane]} pane ${next[pane] ? "shown" : "hidden"}.`);
  }

  private setHold(hold: boolean): void {
    this.hold = hold;
    // Held as it is drawn now; let go, it fits the errors again.
    this.heldError = hold ? this.drawn_?.panes.find((p) => p.pane === "error")?.range : undefined;
    this.renderTools();
    this.drawPlot();
    this.say(hold ? "Error scale held: it widens if an error falls outside it." : "Error scale fits the errors as they move.");
  }

  private setCutOff(degrees: number): void {
    if (!(degrees >= 0.1 && degrees <= 180)) {
      this.cutOffInput.value = String(this.cutOffDegrees);
      return this.say("The cut-off is from 0.1° to 180°.");
    }
    this.cutOffDegrees = degrees;
    this.host.cutOff(degrees);
    this.drawPlot();
    this.renderCue();
  }

  private resetZoom(): void {
    if (!isZoomed(this.zoom)) return;
    this.zoom = noZoom();
    this.renderTools();
    this.drawPlot();
    this.renderCue();
    this.say("Zoom reset: every cut of the sensors shown again.");
  }

  private setZoom(zoom: Zoom): void {
    this.zoom = zoom;
    this.renderTools();
    this.drawPlot();
    this.renderCue();
  }

  /** The toolbar as things stand: which panes show, whether the scale is held, whether there is a zoom to undo, the cut-off. */
  private renderTools(): void {
    this.tools.querySelectorAll<HTMLButtonElement>(".tma-pane").forEach((button) => button.setAttribute("aria-pressed", String(this.panes[button.dataset.pane as Pane])));
    this.tools.querySelector(".tma-hold")!.setAttribute("aria-pressed", String(this.hold));
    this.tools.querySelector<HTMLButtonElement>(".tma-reset")!.disabled = !isZoomed(this.zoom);
    if (document.activeElement !== this.cutOffInput) this.cutOffInput.value = String(this.cutOffDegrees);
    const course = this.panes.course;
    const unit = UNIT_LABELS[this.settings.speed_unit] ?? this.settings.speed_unit;
    this.keyLine.innerHTML =
      `<span>● measured</span><span>○ nearer of two</span><span class="tma-key-other">● other of two, faint</span><span>— calculated</span><span>◌ left out</span>` +
      (course ? `<span>— ownship course</span><span>— target course</span><span>┄ target speed (${escape(unit)})</span>` : "");
  }

  private geometry() {
    if (this.live && this.frozenGeometry) return this.frozenGeometry;
    const g = this.measure();
    this.frozenGeometry = this.live ? g : undefined;
    return g;
  }

  /** The plot's size: its box, as the panel lays it out (the canvas is laid over it, so never sizes it). */
  private measure() {
    const width = Math.max(120, this.plot.clientWidth || this.element.clientWidth || 300);
    const height = Math.max(160, this.plot.clientHeight || 300);
    return { width, height };
  }

  /** The rows' times, parsed once for each list (a drag's rows keep the base's order). */
  private timesOf(rows: Row[]): number[] {
    const key = (this.view?.residuals ?? this.view?.cuts) as TmaResiduals | TmaCut[] | undefined;
    let times = key ? this.rowTimes.get(key) : undefined;
    if (!times || times.length !== rows.length) {
      times = rows.map((r) => Date.parse(r.time));
      if (key) this.rowTimes.set(key, times);
    }
    return times;
  }

  /** The theme's colours and font, read once each time the view is shown. */
  private themeColours() {
    if (!this.colours) this.colours = this.readColours();
    return this.colours;
  }

  private readColours() {
    const css = getComputedStyle(this.element);
    const token = (...names: string[]) => names.map((n) => css.getPropertyValue(n).trim()).find(Boolean) ?? "";
    const muted = token("--vscode-descriptionForeground", "--vscode-foreground");
    const fg = token("--vscode-foreground", "--vscode-editor-foreground");
    const font = css.getPropertyValue("--vscode-font-family") || "sans-serif";
    // The time labels' width, measured once: never assumed of a font.
    const ctx = this.canvas.getContext("2d");
    let label = 44;
    if (ctx) {
      ctx.font = `10px ${font}`;
      label = Math.ceil(Math.max(ctx.measureText("00:00:00Z").width, ctx.measureText("00:00Z").width));
    }
    return {
      fg,
      muted,
      grid: token("--vscode-widget-border", "--vscode-panel-border") || muted,
      focus: token("--vscode-focusBorder", "--vscode-foreground"),
      font,
      label,
      // The cut-off's shades, as VS Code shades lines added and removed; in a high-contrast
      // theme, which has none, a border in its passed or failed colour (and always the words).
      within: token("--vscode-diffEditor-insertedTextBackground", "--vscode-diffEditor-insertedLineBackground"),
      beyond: token("--vscode-diffEditor-removedTextBackground", "--vscode-diffEditor-removedLineBackground"),
      withinEdge: token("--vscode-testing-iconPassed", "--vscode-charts-green", "--vscode-focusBorder"),
      beyondEdge: token("--vscode-testing-iconFailed", "--vscode-errorForeground"),
      highContrast: !!token("--vscode-contrastBorder") && token("--vscode-contrastBorder") !== "transparent",
    };
  }

  /** How many faint other bearings the plot drew last: for tests. */
  faintDrawn = 0;

  /** The panes shown, side by side, sharing time up the left. */
  private layoutPanes(width: number, height: number) {
    const { label } = this.themeColours();
    const shown = PANES.filter((p) => this.panes[p]);
    const left = label + 8;
    const right = 4;
    const gap = 8;
    // Each pane's name, then its axis's ticks, above; Speed's ticks below the Course/Speed pane.
    const top = 28;
    const bottom = this.panes.course ? 26 : 6;
    const w = Math.max(20, (width - left - right - gap * (shown.length - 1)) / shown.length);
    return {
      top,
      height: Math.max(40, height - top - bottom),
      left,
      panes: shown.map((pane, k) => ({ pane, x: left + k * (w + gap), w })),
    };
  }

  private drawPlot(): void {
    if (this.mode() !== "solution" || this.plot.hidden) return;
    const report = this.residuals;
    const whole = this.coverage.whole;
    const g = this.geometry();
    const ratio = window.devicePixelRatio || 1;
    const w = Math.round(g.width * ratio);
    const h = Math.round(g.height * ratio);
    // Resized only when the size changes: setting a canvas's size clears and reallocates it.
    if (this.canvas.width !== w || this.canvas.height !== h) {
      for (const c of [this.canvas, this.overlay]) {
        c.width = w;
        c.height = h;
        c.style.width = `${g.width}px`;
        c.style.height = `${g.height}px`;
      }
    }
    const ctx = this.canvas.getContext("2d");
    if (!ctx || !report || !whole) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, g.width, g.height);
    const colours = this.themeColours();
    const { fg, muted, grid, focus, font } = colours;
    const solution = this.solutionRow();
    const lineColour = solution?.colour ?? fg;
    ctx.font = `10px ${font}`;
    const rows = report.rows as TmaResidualRow[];
    const times = this.timesOf(rows);
    const span: Range = this.zoom.time ?? whole;
    const layout = this.layoutPanes(g.width, g.height);
    const { top, height } = layout;
    const y = (t: number) => timeToY(t, span, top, height);
    const inSpan = (t: number) => t >= span[0] && t <= span[1];
    const has = (v: number | null | undefined): v is number => v !== undefined && v !== null;
    const otherOf = (r: TmaResidualRow) => (r.nearer_side && has(r.ambiguous_bearing) ? (r.used === "ambiguous_bearing" ? r.bearing : r.ambiguous_bearing) : undefined);
    const coverage = this.coverage;

    // --- The axes: Bearing kept while a drag goes on, Error fitted every frame (or held), Course fitted.
    let reference = this.frozen?.reference;
    if (reference === undefined) {
      const calculated = rows.filter((r) => has(r.calculated));
      reference = calculated.length ? calculated[Math.floor(calculated.length / 2)].calculated! : (rows[0]?.bearing ?? coverage.rows[0]?.bearing ?? 0);
    }
    const ref = reference;
    let bLo = Infinity;
    let bHi = -Infinity;
    const takeB = (v: number) => {
      const u = about(v, ref);
      if (u < bLo) bLo = u;
      if (u > bHi) bHi = u;
    };
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.hidden || !inSpan(times[i])) continue;
      if (has(r.measured)) takeB(r.measured);
      else takeB(r.resolved === "ambiguous_bearing" ? (r.ambiguous_bearing ?? r.bearing) : r.bearing);
      if (has(r.calculated)) takeB(r.calculated);
      const other = otherOf(r);
      if (other !== undefined) takeB(other);
    }
    for (let i = 0; i < coverage.rows.length; i++) {
      if (!inSpan(coverage.times[i])) continue;
      const c = coverage.rows[i];
      if (c.resolved !== "ambiguous_bearing") takeB(c.bearing);
      if (has(c.ambiguous_bearing) && c.resolved !== "bearing") takeB(c.ambiguous_bearing);
    }
    const bearingExtent = bLo === Infinity ? undefined : { lo: bLo, hi: bHi };
    let bearingRange = bearingExtent ? fitRange(bLo, bHi, { least: 4, margin: 0.06 }) : ([ref - 10, ref + 10] as Range);
    if (this.live) {
      // Kept as the drag found it, widened (never clamped) if the calculated bearings leave it.
      this.frozen = this.frozen ? { reference: ref, bearing: widen(this.frozen.bearing, bearingExtent) } : { reference: ref, bearing: bearingRange };
      bearingRange = this.frozen.bearing;
    }
    const errorFound = errorExtent(rows, times, span);
    let errorRange = fitErrors(errorFound);
    if (this.hold) {
      this.heldError = this.heldError ? widen(this.heldError, errorFound) : errorRange;
      errorRange = this.heldError;
    }
    // The course pane: ownship's courses, the solution's (its DR legs; worked out again from a drag's fixes), its speeds.
    let courses = solution?.courses ?? undefined;
    let speeds = solution?.speeds ?? undefined;
    if (this.live && this.pending && this.panes.course && this.pending.length === this.fixTimes.length) {
      const legs = legCourses(this.pending, this.fixTimes);
      courses = legs.courses;
      speeds = legs.speeds;
    }
    const perSecond = convert({ value: 1, unit: "m/s" }, this.settings.speed_unit).value;
    const ownship = this.view?.ownship ?? [];
    let courseRange: Range = [0, 360];
    let speedRange: Range = [0, 10];
    let courseRef = 0;
    if (this.panes.course) {
      courseRef = courses?.[0] ?? ownship[0]?.courses[0] ?? 0;
      let cLo = Infinity;
      let cHi = -Infinity;
      let sHi = 0;
      const takeC = (v: number) => {
        const u = about(v, courseRef);
        if (u < cLo) cLo = u;
        if (u > cHi) cHi = u;
      };
      for (let i = 0; i < this.fixTimes.length; i++) {
        if (!inSpan(this.fixTimes[i])) continue;
        if (courses && has(courses[i])) takeC(courses[i]);
        if (speeds && has(speeds[i]) && speeds[i] * perSecond > sHi) sHi = speeds[i] * perSecond;
      }
      for (const own of ownship) {
        const ts = this.ownTimes(own);
        for (let i = 0; i < ts.length; i++) if (inSpan(ts[i])) takeC(own.courses[i]);
      }
      courseRange = cLo === Infinity ? [courseRef - 10, courseRef + 10] : fitRange(cLo, cHi, { least: 10, margin: 0.06 });
      speedRange = fitRange(0, sHi, { includeZero: true, least: 1, margin: 0.08 });
    }
    // A zoom wins over each.
    const zoomed = this.zoom.values;
    const ranges: Record<Pane, Range> = {
      bearing: zoomed.bearing ?? bearingRange,
      error: zoomed.error ?? errorRange,
      course: zoomed.course ?? courseRange,
    };
    if (zoomed.course) {
      // The speed axis zoomed in proportion with the course axis it shares the pane with.
      const f0 = (zoomed.course[0] - courseRange[0]) / (courseRange[1] - courseRange[0] || 1);
      const f1 = (zoomed.course[1] - courseRange[0]) / (courseRange[1] - courseRange[0] || 1);
      speedRange = [speedRange[0] + f0 * (speedRange[1] - speedRange[0]), speedRange[0] + f1 * (speedRange[1] - speedRange[0])];
    }
    const cue: Cue = errorCue(rows, this.cutOffDegrees);
    const panes = layout.panes.map((p) => ({ ...p, range: ranges[p.pane] }));
    this.drawn_ = { span, top, height, panes, reference: ref, courseReference: courseRef, speed: speedRange, cue };
    const pane = (name: Pane) => panes.find((p) => p.pane === name);
    const xOf = (p: { x: number; w: number; range: Range }, v: number) => valueToX(v, p.range, p.x, p.w);

    // --- The frames, the cut-off's shade, the grid and the labels.
    const errorPane = pane("error");
    if (errorPane) {
      const { fill, edge } = cueStyle(cue.state, colours);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fillRect(errorPane.x, top, errorPane.w, height);
      }
      // A high-contrast theme shades nothing: its passed or failed colour round the pane instead.
      if (edge) {
        ctx.strokeStyle = edge;
        ctx.lineWidth = 2;
        ctx.strokeRect(errorPane.x + 1, top + 1, errorPane.w - 2, height - 2);
      }
    }
    const ticks = timeTicks(span[0], span[1], Math.max(2, Math.floor(height / 30)));
    const seconds = ticks.length > 1 && ticks[1] - ticks[0] < 60000;
    ctx.lineWidth = 1;
    ctx.strokeStyle = grid;
    ctx.beginPath();
    for (const p of panes) {
      ctx.rect(Math.round(p.x) + 0.5, top + 0.5, Math.round(p.w), height);
      for (const t of ticks) {
        const ty = Math.round(y(t)) + 0.5;
        ctx.moveTo(p.x, ty);
        ctx.lineTo(p.x + p.w, ty);
      }
    }
    ctx.stroke();
    ctx.fillStyle = muted;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (const t of ticks) ctx.fillText(tickTime(t, seconds, this.settings), layout.left - 4, y(t));
    const unit = UNIT_LABELS[this.settings.speed_unit] ?? this.settings.speed_unit;
    const titles: Record<Pane, string> = { bearing: "Bearing (°)", error: "Error (°)", course: "Course (°)" };
    const errorSpan = Math.abs(ranges.error[1] - ranges.error[0]);
    const degreesText = (v: number, p: Pane) => (p === "error" ? fixed(v, errorSpan < 1 ? 2 : errorSpan < 5 ? 1 : 0) : fixed(((v % 360) + 360) % 360, 0));
    for (const p of panes) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(p.x - 4, 0, p.w + 8, g.height);
      ctx.clip();
      ctx.fillStyle = fg;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(titles[p.pane], p.x + p.w / 2, 1);
      ctx.fillStyle = muted;
      ctx.textBaseline = "bottom";
      // Each tick's label over it, kept within the pane, and left out where it would run into the one before.
      const labels = (values: number[], toX: (v: number) => number, text: (v: number) => string, y0: number) => {
        let after = -Infinity;
        ctx.textAlign = "left";
        for (const v of values) {
          const label = text(v);
          const width = ctx.measureText(label).width;
          const lx = Math.max(p.x - 2, Math.min(p.x + p.w + 2 - width, toX(v) - width / 2));
          if (lx < after + 3) continue;
          ctx.fillText(label, lx, y0);
          after = lx + width;
        }
      };
      const valueTicks = niceTicks(p.range[0], p.range[1], Math.max(3, Math.floor(p.w / 26)));
      ctx.strokeStyle = grid;
      ctx.beginPath();
      for (const v of valueTicks) {
        const tx = Math.round(xOf(p, v)) + 0.5;
        ctx.moveTo(tx, top);
        ctx.lineTo(tx, top + height);
      }
      ctx.stroke();
      labels(valueTicks, (v) => xOf(p, v), (v) => degreesText(v, p.pane), top - 2);
      if (p.pane === "course") {
        ctx.textBaseline = "top";
        labels(niceTicks(speedRange[0], speedRange[1], Math.max(3, Math.floor(p.w / 26))), (v) => valueToX(v, speedRange, p.x, p.w), (v) => fixed(v, 0), top + height + 2);
        ctx.fillStyle = fg;
        ctx.textAlign = "center";
        ctx.fillText(`Speed (${unit}) ┄`, p.x + p.w / 2, top + height + 13);
      }
      ctx.restore();
    }
    // The Error pane's zero, strong as legacy drew it.
    if (errorPane && inside(0, errorPane.range)) {
      const zx = Math.round(xOf(errorPane, 0)) + 0.5;
      ctx.strokeStyle = fg;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(zx, top);
      ctx.lineTo(zx, top + height);
      ctx.stroke();
    }
    // Legs: a dashed line across every pane where each later leg starts.
    const across = (t: number, colour: string, dash: number[], width = 1) => {
      if (!inSpan(t)) return;
      const ly = Math.round(y(t)) + 0.5;
      ctx.setLineDash(dash);
      ctx.strokeStyle = colour;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (const p of panes) {
        ctx.moveTo(p.x, ly);
        ctx.lineTo(p.x + p.w, ly);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };
    for (const start of solution?.leg_starts ?? []) across(Date.parse(start), muted, [3, 3]);
    if (this.current !== undefined) across(this.current, focus, []);

    // --- The dots and lines, each pane clipped to itself.
    const clip = (p: { x: number; w: number }) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(p.x, top, p.w, height);
      ctx.clip();
    };
    type Dots = Map<string, number[]>;
    const seen = new Set<string>();
    const put = (dots: Dots, kind: string, colour: string, px: number, py: number) => {
      // A dot where one of its kind and colour is already drawn, to the half pixel, adds nothing: left out.
      const key = `${kind}${colour}${Math.round(px * 2)},${Math.round(py * 2)}`;
      if (seen.has(key)) return;
      seen.add(key);
      let list = dots.get(colour);
      if (!list) dots.set(colour, (list = []));
      list.push(px, py);
    };
    const path = (points: number[], radius: number) => {
      ctx.beginPath();
      for (let k = 0; k < points.length; k += 2) {
        ctx.moveTo(points[k] + radius, points[k + 1]);
        ctx.arc(points[k], points[k + 1], radius, 0, Math.PI * 2);
      }
    };
    const drawDots = (filled: Dots, rings: Dots, faints: Dots, out: number[]) => {
      ctx.globalAlpha = 0.3;
      for (const [colour, points] of faints) {
        ctx.fillStyle = colour;
        path(points, 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      for (const [colour, points] of filled) {
        ctx.fillStyle = colour;
        path(points, 2.4);
        ctx.fill();
      }
      ctx.lineWidth = 1.2;
      for (const [colour, points] of rings) {
        ctx.strokeStyle = colour;
        path(points, 2.4);
        ctx.stroke();
      }
      if (out.length) {
        ctx.setLineDash([1.5, 1.5]);
        ctx.strokeStyle = muted;
        ctx.lineWidth = 1;
        path(out, 2.4);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    };
    let faint = 0;
    const bearing = pane("bearing");
    if (bearing) {
      clip(bearing);
      // The calculated bearings: the solution's line, only where the solution is.
      ctx.strokeStyle = lineColour;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let pen = false;
      let last: number | undefined;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (!has(r.calculated)) {
          pen = false;
          continue;
        }
        const px = xOf(bearing, about(r.calculated, ref));
        const py = y(times[i]);
        if (pen && last !== undefined && Math.abs(px - last) > bearing.w / 2) pen = false;
        if (pen) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
        pen = true;
        last = px;
      }
      ctx.stroke();
      const filled: Dots = new Map();
      const rings: Dots = new Map();
      const faints: Dots = new Map();
      const out: number[] = [];
      // The sensors' coverage outside the solution: each measured bearing; an unresolved pair's both, faint.
      for (let i = 0; i < coverage.rows.length; i++) {
        const t = coverage.times[i];
        if (!inSpan(t)) continue;
        const c = coverage.rows[i];
        const colour = c.colour ?? fg;
        const py = y(t);
        if (has(c.ambiguous_bearing) && !c.resolved) {
          put(faints, "o", colour, xOf(bearing, about(c.bearing, ref)), py);
          put(faints, "o", colour, xOf(bearing, about(c.ambiguous_bearing, ref)), py);
        } else put(filled, "f", colour, xOf(bearing, about(c.resolved === "ambiguous_bearing" ? (c.ambiguous_bearing ?? c.bearing) : c.bearing, ref)), py);
      }
      // The rooted cuts: measured, the nearer of a pair a ring, its other faint, one left out a dotted ring.
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r.hidden || !inSpan(times[i])) continue;
        const colour = r.colour ?? fg;
        const py = y(times[i]);
        const measured = has(r.measured) ? r.measured : r.resolved === "ambiguous_bearing" ? (r.ambiguous_bearing ?? r.bearing) : r.bearing;
        const px = xOf(bearing, about(measured, ref));
        const other = otherOf(r);
        if (other !== undefined) {
          put(faints, "o", colour, xOf(bearing, about(other, ref)), py);
          faint++;
        }
        if (r.excluded) out.push(px, py);
        else put(r.nearer_side ? rings : filled, r.nearer_side ? "r" : "f", colour, px, py);
      }
      drawDots(filled, rings, faints, out);
      ctx.restore();
    }
    let outside = 0;
    if (errorPane) {
      clip(errorPane);
      const filled: Dots = new Map();
      const rings: Dots = new Map();
      const faints: Dots = new Map();
      const out: number[] = [];
      const range = errorPane.range;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r.hidden || !has(r.residual) || !inSpan(times[i])) continue;
        // Never drawn at an edge it is not at: outside the axis (only ever a zoom's), not drawn.
        if (!inside(r.residual, range)) {
          outside++;
          continue;
        }
        const colour = r.colour ?? fg;
        const py = y(times[i]);
        if (has(r.other_residual) && inside(r.other_residual, range)) put(faints, "o", colour, xOf(errorPane, r.other_residual), py);
        const px = xOf(errorPane, r.residual);
        if (r.excluded) out.push(px, py);
        else put(r.nearer_side ? rings : filled, r.nearer_side ? "r" : "f", colour, px, py);
      }
      drawDots(filled, rings, faints, out);
      ctx.restore();
      if (this.live) {
        this.errorAxes.push({ lo: range[0], hi: range[1], outside: this.zoom.values.error ? 0 : outside });
        if (this.errorAxes.length > 2000) this.errorAxes.splice(0, 1000);
      }
    }
    const coursePane = pane("course");
    if (coursePane) {
      clip(coursePane);
      const line = (ts: ArrayLike<number>, values: ArrayLike<number>, colour: string, toX: (v: number) => number, dash: number[], width: number) => {
        ctx.strokeStyle = colour;
        ctx.lineWidth = width;
        ctx.setLineDash(dash);
        ctx.beginPath();
        let pen = false;
        let last = 0;
        for (let i = 0; i < ts.length; i++) {
          const v = values[i];
          if (v === undefined || v === null || !Number.isFinite(v)) {
            pen = false;
            continue;
          }
          const px = toX(v);
          const py = y(ts[i]);
          if (pen && Math.abs(px - last) > coursePane.w / 2) pen = false;
          if (pen) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
          pen = true;
          last = px;
        }
        ctx.stroke();
        ctx.setLineDash([]);
      };
      const toCourse = (v: number) => xOf(coursePane, about(v, courseRef));
      for (const own of ownship) line(this.ownTimes(own), own.courses, own.colour ?? muted, toCourse, [], 1.5);
      if (courses) line(this.fixTimes, courses, lineColour, toCourse, [], 1.5);
      if (speeds) line(this.fixTimes, speeds, lineColour, (v) => valueToX(v * perSecond, speedRange, coursePane.x, coursePane.w), [4, 3], 1.5);
      ctx.restore();
    }
    this.faintDrawn = faint;
    // The cut chosen: ringed in each pane it is drawn in.
    const chosen = rows[this.active];
    if (chosen && inSpan(times[this.active])) {
      const py = y(times[this.active]);
      ctx.strokeStyle = focus;
      ctx.lineWidth = 1.5;
      const ring = (p: { x: number; w: number; range: Range } | undefined, v: number | undefined) => {
        if (!p || v === undefined || !inside(v, p.range)) return;
        ctx.beginPath();
        ctx.arc(xOf(p, v), py, 5, 0, Math.PI * 2);
        ctx.stroke();
      };
      ring(bearing, has(chosen.measured) ? about(chosen.measured, ref) : undefined);
      ring(errorPane, has(chosen.residual) ? chosen.residual : undefined);
    }
    if (!this.live) {
      const others = faint ? ` The other bearing of ${faint.toLocaleString("en-GB")} ambiguous ${faint === 1 ? "cut is" : "cuts are"} drawn faint, not counted.` : "";
      const names = panes.map((p) => PANE_NAMES[p.pane]).join(", ");
      this.canvas.setAttribute(
        "aria-label",
        `Bearings and residuals of ${solution?.name ?? "the solution"}, time upward from ${formatTime(span[0], this.settings)} to ${formatTime(span[1], this.settings)}; panes ${names}: ${describeRms(report, this.settings)}. ${describeCue(cue, this.settings)}.${others} The list gives each cut's residual; Up and Down choose a cut here, Enter selects it.`,
      );
    }
    this.drawOverlay();
  }

  /** Ownship's times, parsed once for each series. */
  private ownTimesOf = new WeakMap<object, number[]>();
  private ownTimes(own: { times: string[] }): number[] {
    let times = this.ownTimesOf.get(own);
    if (!times) this.ownTimesOf.set(own, (times = own.times.map((t) => Date.parse(t))));
    return times;
  }

  // --- Pointing at the plot: a crosshair and readout, a box to zoom, a dot to select --------

  /** The pane at a point, and its place. */
  private paneAt(x: number): PlotLayout["panes"][number] | undefined {
    return this.drawn_?.panes.find((p) => x >= p.x - 4 && x <= p.x + p.w + 4);
  }

  /** The crosshair and readout, or the box being dragged: on the overlay, never the plot, so the plot is not drawn again. */
  private drawOverlay(): void {
    const ctx = this.overlay.getContext("2d");
    const d = this.drawn_;
    if (!ctx) return;
    const ratio = window.devicePixelRatio || 1;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, this.overlay.width / ratio, this.overlay.height / ratio);
    if (!d) return;
    const { focus, muted } = this.themeColours();
    if (this.box) {
      const p = d.panes.find((q) => q.pane === this.box!.pane);
      if (!p) return;
      const x0 = Math.max(p.x, Math.min(p.x + p.w, Math.min(this.box.x0, this.box.x1)));
      const x1 = Math.max(p.x, Math.min(p.x + p.w, Math.max(this.box.x0, this.box.x1)));
      const y0 = Math.max(d.top, Math.min(this.box.y0, this.box.y1));
      const y1 = Math.min(d.top + d.height, Math.max(this.box.y0, this.box.y1));
      ctx.strokeStyle = focus;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 2]);
      ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0);
      ctx.setLineDash([]);
      return;
    }
    if (!this.pointer) return;
    const { x, y } = this.pointer;
    if (y < d.top || y > d.top + d.height) return;
    const p = this.paneAt(x);
    ctx.strokeStyle = muted;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    const ly = Math.round(y) + 0.5;
    for (const q of d.panes) {
      ctx.moveTo(q.x, ly);
      ctx.lineTo(q.x + q.w, ly);
    }
    if (p) {
      const lx = Math.round(Math.max(p.x, Math.min(p.x + p.w, x))) + 0.5;
      ctx.moveTo(lx, d.top);
      ctx.lineTo(lx, d.top + d.height);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /** The time and value under the pointer, as words above the plot. */
  private readAt(x: number, y: number): string {
    const d = this.drawn_;
    if (!d || y < d.top - 2 || y > d.top + d.height + 2) return "";
    const t = yToTime(y, d.span, d.top, d.height);
    const p = this.paneAt(x);
    const when = formatTime(t, this.settings);
    if (!p) return when;
    const v = xToValue(Math.max(p.x, Math.min(p.x + p.w, x)), p.range, p.x, p.w);
    if (p.pane === "bearing") return `${when} · Bearing ${bearingText(((v % 360) + 360) % 360)}`;
    if (p.pane === "error") return `${when} · Error ${residualText(v, this.settings)}`;
    const speed = xToValue(Math.max(p.x, Math.min(p.x + p.w, x)), d.speed, p.x, p.w);
    const unit = UNIT_LABELS[this.settings.speed_unit] ?? this.settings.speed_unit;
    return `${when} · Course ${bearingText(((v % 360) + 360) % 360)} · Speed ${fixed(speed, this.settings.speed_decimals)} ${unit}`;
  }

  private local(event: PointerEvent | MouseEvent): { x: number; y: number } {
    const box = this.canvas.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  }

  private pointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    const { x, y } = this.local(event);
    const p = this.paneAt(x);
    const d = this.drawn_;
    if (!p || !d || y < d.top || y > d.top + d.height) return;
    this.box = { pane: p.pane, x0: x, y0: y, x1: x, y1: y };
    this.canvas.setPointerCapture?.(event.pointerId);
  }

  private pointerMove(event: PointerEvent): void {
    const { x, y } = this.local(event);
    this.pointer = { x, y };
    if (this.box) {
      this.box.x1 = x;
      this.box.y1 = y;
    }
    this.readout.textContent = this.readAt(x, y) || " ";
    this.drawOverlay();
  }

  private pointerUp(event: PointerEvent): void {
    const box = this.box;
    this.box = undefined;
    const d = this.drawn_;
    if (!box || !d) return;
    const p = d.panes.find((q) => q.pane === box.pane)!;
    if (Math.abs(box.x1 - box.x0) >= BOX_PX && Math.abs(box.y1 - box.y0) >= BOX_PX) {
      // A box: time to its height, the pane's values to its width.
      const clampX = (v: number) => Math.max(p.x, Math.min(p.x + p.w, v));
      const clampY = (v: number) => Math.max(d.top, Math.min(d.top + d.height, v));
      const times: Range = [yToTime(clampY(box.y0), d.span, d.top, d.height), yToTime(clampY(box.y1), d.span, d.top, d.height)];
      const values: Range = [xToValue(clampX(box.x0), p.range, p.x, p.w), xToValue(clampX(box.x1), p.range, p.x, p.w)];
      this.setZoom(zoomBox(this.zoom, box.pane, times, values));
      this.say(`Zoomed: ${formatTime(Math.min(...times), this.settings)} to ${formatTime(Math.max(...times), this.settings)}. Double-click, or Reset zoom, to see it all.`);
      return;
    }
    this.pick(box.pane, box.x1, box.y1, event.detail <= 1);
  }

  private pointerGone(): void {
    this.pointer = undefined;
    this.readout.textContent = " ";
    this.drawOverlay();
  }

  /**
   * A click on the plot: the nearest dot within reach selects its cut, or the solution at a
   * fix (the calculated line, the Course/Speed pane), and moves current time to it, as
   * legacy's Stacked Dots selected the cut or fix clicked. Nothing near: current time only.
   */
  private pick(pane: Pane, x: number, y: number, single: boolean): void {
    const d = this.drawn_;
    const report = this.residuals;
    if (!d || !report || !single) return;
    const p = d.panes.find((q) => q.pane === pane)!;
    const rows = report.rows as TmaResidualRow[];
    const times = this.timesOf(rows);
    const xs: number[] = [];
    const ys: number[] = [];
    const what: { id: string; time: string; row?: number }[] = [];
    const add = (v: number | undefined | null, t: number, item: { id: string; time: string; row?: number }) => {
      if (v === undefined || v === null || !inside(v, p.range) || t < d.span[0] || t > d.span[1]) return;
      xs.push(valueToX(v, p.range, p.x, p.w));
      ys.push(timeToY(t, d.span, d.top, d.height));
      what.push(item);
    };
    const solutionId = this.view?.solution_id;
    const fixAt = (t: number) => ({ id: solutionId ?? "", time: new Date(t).toISOString() });
    if (pane === "bearing") {
      rows.forEach((r, i) => {
        if (r.hidden) return;
        add(r.measured === undefined || r.measured === null ? undefined : about(r.measured, d.reference), times[i], { id: r.id, time: r.time, row: i });
      });
      this.coverage.rows.forEach((c, i) => add(about(c.resolved === "ambiguous_bearing" ? (c.ambiguous_bearing ?? c.bearing) : c.bearing, d.reference), this.coverage.times[i], { id: c.id, time: c.time }));
      // The calculated line: the solution's fix at that cut's time.
      rows.forEach((r, i) => add(r.calculated === undefined || r.calculated === null ? undefined : about(r.calculated, d.reference), times[i], { ...fixAt(times[i]), row: i }));
    } else if (pane === "error") {
      rows.forEach((r, i) => {
        if (r.hidden) return;
        add(r.residual, times[i], { id: r.id, time: r.time, row: i });
        add(r.other_residual, times[i], { id: r.id, time: r.time, row: i });
      });
    } else {
      const solution = this.solutionRow();
      const perSecond = convert({ value: 1, unit: "m/s" }, this.settings.speed_unit).value;
      this.fixTimes.forEach((t, i) => {
        const c = solution?.courses?.[i];
        add(c === undefined ? undefined : about(c, d.courseReference), t, fixAt(t));
        const s = solution?.speeds?.[i];
        // Speed shares the pane on its own axis: placed by it, then read back on the course axis's scale.
        if (s !== undefined) add(xToValue(valueToX(s * perSecond, d.speed, p.x, p.w), p.range, p.x, p.w), t, fixAt(t));
      });
    }
    const hit = nearestPoint(xs, ys, x, y, HIT_PX);
    if (hit < 0) {
      // No dot near: current time to the time pointed at, as a click on the plot did before.
      const t = yToTime(y, d.span, d.top, d.height);
      const index = nearestRow(rows, t);
      if (index >= 0) this.setActive(index, false);
      this.host.time(new Date(t).toISOString());
      return;
    }
    const item = what[hit];
    if (item.row !== undefined) this.setActive(item.row, false);
    if (item.id) this.host.select(item.id, item.time);
    const isFix = item.id === solutionId;
    this.say(isFix ? `${this.solutionRow()?.name ?? "The solution"}'s fix at ${formatTime(Date.parse(item.time), this.settings)} selected.` : `Cut at ${formatTime(Date.parse(item.time), this.settings)} selected.`);
  }

  /** The cut chosen, read out above the plot when the keyboard is on it. */
  private sayActive(): void {
    const rows = this.rows() as TmaResidualRow[];
    const r = rows[this.active];
    if (!r) {
      this.readout.textContent = "Up and Down choose a cut; Enter selects it; + and − zoom time, [ and ] the errors; 0 resets.";
      return;
    }
    const parts = [cutWhen(r, this.settings), `Bearing ${bearingText(r.measured ?? r.bearing)}`];
    if (r.residual !== undefined && r.residual !== null) parts.push(`Error ${residualText(r.residual, this.settings)}`);
    this.readout.textContent = parts.join(" · ");
  }

  /** The plot from the keyboard: Up and Down choose a cut (Up later, as time runs up), Enter selects it; + and − zoom time about it, [ and ] the Error pane; Page Up and Page Down move along a zoom; 0 resets. */
  private plotKey(event: KeyboardEvent): void {
    const rows = this.rows();
    const d = this.drawn_;
    const whole = this.coverage.whole;
    if (!d || !whole) return;
    const at = rows[this.active] ? Date.parse(rows[this.active].time) : this.current;
    const done = () => {
      event.preventDefault();
      this.sayActive();
    };
    if ((event.key === "ArrowUp" || event.key === "ArrowDown") && rows.length) {
      this.setActive(this.active < 0 ? 0 : this.active + (event.key === "ArrowUp" ? 1 : -1), false);
      return done();
    }
    if (event.key === "Enter" && rows[this.active]) {
      const r = rows[this.active];
      this.host.select(r.id, r.time);
      this.say(`Cut at ${cutWhen(r, this.settings)} selected.`);
      return done();
    }
    if (event.key === "+" || event.key === "=") {
      this.setZoom(zoomTime(this.zoom, d.span, whole, 0.5, at));
      return done();
    }
    if (event.key === "-" || event.key === "_") {
      this.setZoom(zoomTime(this.zoom, d.span, whole, 2, at));
      return done();
    }
    if (event.key === "]" || event.key === "[") {
      const p = d.panes.find((q) => q.pane === "error") ?? d.panes[0];
      this.setZoom(zoomValues(this.zoom, p.pane, p.range, event.key === "]" ? 0.5 : 2));
      return done();
    }
    if (event.key === "PageUp" || event.key === "PageDown") {
      this.setZoom(panTime(this.zoom, whole, event.key === "PageUp" ? 0.5 : -0.5));
      return done();
    }
    if (event.key === "0") {
      this.resetZoom();
      return done();
    }
  }
}

/** Where the plot's panes were last drawn, and their axes. */
interface PlotLayout {
  span: Range;
  top: number;
  height: number;
  panes: { pane: Pane; x: number; w: number; range: Range }[];
  /** The bearing the Bearing pane is unwrapped about, and the course the Course pane is. */
  reference: number;
  courseReference: number;
  /** The Course/Speed pane's speed axis, in the analyst's speed unit. */
  speed: Range;
  cue: Cue;
}
