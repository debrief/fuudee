/**
 * The bearing view (CAP-21, CAP-22): legacy Debrief's Bearing Residuals (Stacked Dots) of the
 * TMA solution the Outline has selected, or the bearings of the sensor it has selected, live
 * while a solution is dragged on the map.
 *
 * One component for every host: VS Code shows it as the Bearings view in its panel
 * (webview/bearings.ts), the playground as a docked panel. The host asks Python for the cuts
 * and the residuals (debrief/sensors, debrief/tma_residuals) and makes every change; this
 * shows them, works the residuals out again while a drag moves the solution (tma.ts, held to
 * the vectors Python is), and says what the analyst asked for.
 *
 * - **No lists** (product owner, 27 Oct 2026): the cut list and the Sensor and Solution lists
 *   are gone, as the Outline lists a sensor's cuts and a solution's legs and fixes, and its
 *   selection says what the view shows: a solution, for it, a leg or a fix of it; a sensor's
 *   coverage, for it or some of its cuts. A one-line title says what is shown. What was done
 *   from the list (keep a side, leave out, split, a solution from a period) is in the Tools.
 * - A solution shown: legacy's Stacked Dots, as legacy laid it out (product owner, 25 Oct 2026;
 *   stackeddots.ts): time up the left, the latest at the top, and beside each other the
 *   Bearing, Error and Course/Speed panes, as the analyst chooses (remembered per browser, or as
 *   the VS Code view's state). Every measured bearing of the sensors shown on the map, over their
 *   whole coverage; the calculated bearings and the errors where the solution is; the Error pane
 *   green while every error counted is within the analyst's cut-off and pink otherwise, said in
 *   words beside it too, with the RMS. An ambiguous cut not yet resolved is measured by the
 *   bearing nearer the solution (≈); its other bearing is drawn faint, never counted. A cut
 *   hidden on the map is left out until shown again.
 * - A sensor shown: its bearings over its whole coverage, in the Bearing pane (and ownship's
 *   course in the Course/Speed pane, if shown); no Error pane without a solution.
 * - The compact toolbar: the panes, Hold, Reset, and ⋯ for the cut-off, the key and the notes.
 *   A box dragged in a pane zooms (double-click or Reset undoes it); a dot clicked selects its
 *   cut (in the Outline and on the map), or the solution's fix, and moves current time to it; a
 *   crosshair and a readout say the time and value under the pointer. The plot's keys stay:
 *   Up and Down choose a cut, Enter selects it, Space or Delete leaves it out, S splits, 1 and 2
 *   keep a side, the zoom keys.
 * - The first guess's form (TMA solution from cuts…, in the Tools): opened here for the cuts
 *   the host names (a TmaFocus with make), by form or by two clicks on the map.
 * - While a drag moves the solution, each frame works out the residuals again, writes the RMS
 *   and draws the plot: the Error axis fitted to the errors every frame, as legacy's auto-resize
 *   did, or held (Hold scale) and widened when an error falls outside, never a dot drawn at an
 *   edge it is not at; the Bearing axis kept as it was when the drag began, widened the same
 *   way; a zoom kept. The whole frame is timed (timings) against the drag budget (NFR-04).
 */
import { convert, DEFAULT_SETTINGS, fixed, formatTime, UNIT_LABELS, type FormatSettings } from "@debrief/kernel";
import type { AmbiguityResolution, TmaCut, TmaFocus, TmaRequest, TmaResidualRow, TmaResiduals, TmaSolutionRow, TmaView } from "@debrief/schemas";
import type { LonLat } from "./geodesic.js";
import { bearingText, type Kept } from "./sensors.js";
import {
  about,
  controlsBeside,
  coverageSpan,
  type Cue,
  cueStyle,
  cueMark,
  describeCue,
  describeOffScale,
  offScale,
  errorCue,
  errorExtent,
  fitErrors,
  fitRange,
  type BearingMarker,
  bearingMarkersOf,
  boxedSides,
  boxResolution,
  courseAxes,
  courseSeries,
  type CourseSeries,
  describeBoxed,
  inside,
  isZoomed,
  legCourses,
  nearestPoint,
  niceTicks,
  noZoom,
  type Pane,
  PANE_NAMES,
  panesDrawn,
  PANES,
  type PanesShown,
  panTime,
  type Range,
  readPanes,
  tickLabel,
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
  type CutRow,
  cutWhen,
  describePeriod,
  describeRms,
  focusChoice,
  guessDefaults,
  isAmbiguousRow,
  liveResiduals,
  primeLive,
  nearestRow,
  nextContact,
  residualNotes,
  residualText,
  rowLabel,
  sideOfRow,
  splitAllowed,
  coverageOutside,
} from "./tma.js";
import { describeDistance, describeSpeed, readBearing, readDistance, readSpeed } from "./trackedit.js";

export interface TmaControlHost {
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
  /** Keep the sides of the cuts boxed with Select bearings on, as one step (tma_resolve; debrief/resolve_ambiguity). */
  resolveCuts(resolution: AmbiguityResolution): void;
  /** Select a cut, or the solution at one of its fixes, and move current time to it: a dot clicked (tma_select). */
  select(featureId: string, time: string): void;
  /** The Outline's menu for a cut, or the solution at one of its fixes: a dot right-clicked (tma_menu), where (client pixels). */
  menu?(featureId: string, time: string, x?: number, y?: number): void;
  /** Remember the analyst's error cut-off, degrees, in their Debrief configuration (tma_cut_off). */
  cutOff(degrees: number): void;
  /** The plot as drawn, CSS pixels: its height and each pane's width, when either changes (tma_plot_drawn). */
  drawn?(height: number, paneWidths: number[]): void;
}

/** Where the view remembers which panes show: the browser's storage, or the VS Code view's state. */
export interface TmaControlMemory {
  load(): unknown;
  save(state: { panes: PanesShown }): void;
}

/** How near a click is to a dot to choose it, pixels. */
const HIT_PX = 7;
/** A drag shorter than this either way is a click, not a box. */
const BOX_PX = 5;
/** From this width the controls may go beside the plot (VS Code's bottom panel). */
const WIDE_PX = 640;
/** Below this height the view is short: no key, the readout over the panes' names. */
const SHORT_PX = 640;
const escape = (text: string) => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

type Row = CutRow;

export class TmaControl {
  private view?: TmaView;
  /** The plot's size last told the host. */
  private drawnSize = "";
  /** The residuals as a drag on the map now leaves them; undefined when not dragging. */
  private live?: TmaResiduals;
  private pending?: LonLat[];
  private frame?: number;
  /** The cut chosen in the plot (from the keyboard, a click, or the Outline's selection), ringed in each pane. */
  private active = -1;
  private current?: number;
  private rowsKey = "";
  private formOpen = false;
  /** The cuts the first guess's form is for, and what it asks to be made of. */
  private formFor?: { rows: Row[]; request: TmaRequest };
  private said?: ReturnType<typeof setTimeout>;
  /** How long each frame of a drag took, ms, the residuals worked out and everything drawn: for the tests and the drag budget (NFR-04). */
  readonly timings: number[] = [];
  /** The Bearing axis while a drag goes on: kept as it was when the drag began (widened, never clamped), and the bearing it is unwrapped about. */
  private frozen?: { bearing: Range; reference: number };
  /** The plots' size while a drag goes on: read once a drag. */
  private frozenGeometry?: ReturnType<TmaControl["measure"]>;
  /** Each base's rows' times, parsed once. */
  private rowTimes = new WeakMap<object, number[]>();
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
  /** The coverage drawn beside the rows (cuts not rooted in the solution; a sensor's cuts shown, with none), their times, and the whole span plotted: worked out once per view. */
  private coverage: { rows: TmaCut[]; times: number[]; whole?: Range } = { rows: [], times: [] };
  /** A sensor's cuts shown on the map, the plot's rows with no solution: worked out once per view. */
  private shownCuts: TmaCut[] = [];
  /** The solution's fixes' times, parsed once per view. */
  private fixTimes: number[] = [];
  /** Where each pane was last drawn, and its axis: for pointing at it. */
  private drawn_?: PlotLayout;
  /** A box being dragged in a pane, in the canvas's pixels; resolve, with Select bearings on in the Bearing pane. */
  private box?: { pane: Pane; x0: number; y0: number; x1: number; y1: number; resolve?: boolean };
  /** Select bearings: a box in the Bearing pane keeps the sides boxed instead of zooming (product owner, 28 Oct 2026). */
  private selecting = false;
  /** The Course/Speed pane's legend as last written. */
  private legendKey = "";
  /** What the Course/Speed pane last drew: for the tests. */
  private courseShown?: { nothing: boolean; series: { id: string; name: string; colour: string; role: string; marked: boolean; courses?: [number, number]; speeds?: [number, number] }[] };
  private pointer?: { x: number; y: number };
  /** Each frame's Error axis and how many errors fell outside it (never any): for the tests. */
  readonly errorAxes: { lo: number; hi: number; outside: number }[] = [];
  private readonly title: HTMLElement;
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
  private readonly form: HTMLFormElement;
  private readonly status: HTMLElement;
  private readonly empty: HTMLElement;

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
      `<p class="tma-empty">Select a sensor or a TMA solution in the Outline to see its bearings here.</p>` +
      `<div class="tma-body"><div class="tma-left">` +
      `<p class="tma-title" aria-live="polite"></p>` +
      `<div class="tma-tools" role="toolbar" aria-label="The plot's panes and scale">` +
      `<span class="tma-panes" role="group" aria-label="Panes shown">${PANES.map(paneButton).join("")}</span>` +
      `<button type="button" class="tma-select" aria-pressed="false" title="Select bearings: drag a box over dots in the Bearing pane: an ambiguous cut keeps the side boxed, a resolved one is made ambiguous again, one step. Off, a box zooms.">Select bearings</button>` +
      `<button type="button" class="tma-hold" aria-pressed="false" aria-label="Hold scale" title="Hold scale: keep the Error axis as it is while dragging; it still widens to take in an error outside it">Hold</button>` +
      `<button type="button" class="tma-reset" disabled aria-label="Reset zoom" title="Reset zoom: undo the zoom (double-click the plot, or press 0 in it)" aria-keyshortcuts="0">Reset</button>` +
      `<button type="button" class="tma-more-button" aria-expanded="false" aria-controls="tma-more" aria-label="More: the cut-off, the key and the notes" title="More: the cut-off, the key and the notes">⋯</button>` +
      `</div>` +
      `<div class="tma-more" id="tma-more" role="group" aria-label="More" hidden>` +
      `<label class="tma-cutoff" title="The Error pane is green while every error counted is within this, pink otherwise; kept with your Debrief settings"><span>Cut-off</span><input type="number" class="tma-cutoff-input" min="0.01" max="180" step="0.5" inputmode="decimal" aria-label="Error cut-off, degrees"><span aria-hidden="true">°</span></label>` +
      `<p class="tma-key" aria-hidden="true"></p>` +
      `<ul class="tma-legend" aria-label="The Course/Speed pane's lines" hidden></ul>` +
      `<ul class="tma-notes" hidden></ul>` +
      `</div>` +
      `<div class="tma-plot" hidden><canvas class="tma-canvas" role="img" tabindex="0" aria-keyshortcuts="ArrowUp ArrowDown Enter Space Delete S 1 2 + - [ ] 0 PageUp PageDown"></canvas><canvas class="tma-overlay" aria-hidden="true"></canvas><p class="tma-readout" aria-hidden="true"></p></div>` +
      `<div class="tma-statusline">` +
      `<p class="tma-cue" hidden aria-live="polite"><span class="tma-cue-mark" aria-hidden="true"></span> <span class="tma-cue-text"></span></p>` +
      `<p class="tma-rms" hidden></p>` +
      `<p class="tma-offscale"></p>` +
      `<p class="tma-select-hint" hidden>Select bearings: box the Bearing pane's dots; an ambiguous cut keeps the side boxed, a resolved one is made ambiguous again.</p>` +
      `</div>` +
      `<div class="tma-below">` +
      `<form class="tma-form" hidden novalidate aria-label="First guess"></form>` +
      `<p class="tma-status" aria-live="polite"></p>` +
      `</div></div></div>`;
    const q = <T extends HTMLElement>(s: string) => element.querySelector<T>(s)!;
    this.empty = q(".tma-empty");
    this.title = q(".tma-title");
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
    this.form = q(".tma-form");
    this.status = q(".tma-status");
    this.canvas.addEventListener("pointerdown", (e) => this.pointerDown(e));
    this.canvas.addEventListener("pointermove", (e) => this.pointerMove(e));
    this.canvas.addEventListener("pointerup", (e) => this.pointerUp(e));
    this.canvas.addEventListener("pointercancel", () => this.pointerGone());
    this.canvas.addEventListener("pointerleave", () => !this.box && this.pointerGone());
    this.canvas.addEventListener("dblclick", () => this.resetZoom());
    this.canvas.addEventListener("contextmenu", (e) => this.menuAt(e));
    this.canvas.addEventListener("keydown", (e) => this.plotKey(e));
    this.canvas.addEventListener("focus", () => this.sayActive());
    this.canvas.addEventListener("blur", () => this.pointerGone());
    this.tools.querySelectorAll<HTMLButtonElement>(".tma-pane").forEach((button) => button.addEventListener("click", () => this.togglePane(button.dataset.pane as Pane)));
    q<HTMLButtonElement>(".tma-hold").addEventListener("click", () => this.setHold(!this.hold));
    q<HTMLButtonElement>(".tma-select").addEventListener("click", () => this.setSelecting(!this.selecting));
    q<HTMLButtonElement>(".tma-reset").addEventListener("click", () => this.resetZoom());
    const more = q<HTMLButtonElement>(".tma-more-button");
    more.addEventListener("click", () => {
      const open = more.getAttribute("aria-expanded") !== "true";
      more.setAttribute("aria-expanded", String(open));
      q<HTMLElement>(".tma-more").hidden = !open;
      if (open) this.element.querySelector<HTMLElement>(".tma-more input")?.focus();
    });
    const closeMore = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || more.getAttribute("aria-expanded") !== "true") return;
      event.preventDefault();
      event.stopPropagation();
      // The keyboard back on ⋯ first: a field left so commits what was typed in it.
      more.focus();
      more.setAttribute("aria-expanded", "false");
      q<HTMLElement>(".tma-more").hidden = true;
    };
    more.addEventListener("keydown", closeMore);
    q<HTMLElement>(".tma-more").addEventListener("keydown", closeMore);
    this.cutOffInput.addEventListener("change", () => this.setCutOff(Number(this.cutOffInput.value)));
    const resized = new ResizeObserver(() => {
      element.classList.toggle("tma-wide", element.clientWidth >= WIDE_PX);
      // Short (Bearings above the walkthroughs at a laptop's height): the plot keeps the room; the key goes.
      // Only where the panel's height is the layout's (a docked group, VS Code's view), never where the view grows to fit (a phone's column).
      const bound = element.closest<HTMLElement>(".dock-panel") ?? (element.closest(".tma-root") ? document.documentElement : null);
      element.classList.toggle("tma-short", !!bound && bound.clientHeight > 0 && bound.clientHeight < SHORT_PX);
      this.placeControls(bound);
      // Not mid-drag: the plot's size is read once a drag.
      if (!this.live) this.frozenGeometry = undefined;
      this.drawPlot();
    });
    resized.observe(element);
    // The plot's own box too: what is beneath it (the form, a note) can take its height without the panel changing.
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
    // Another solution or sensor: its own zoom and held scale; the same one shown again (a step saved) keeps them.
    if (before?.solution_id !== view?.solution_id || before?.plot_id !== view?.plot_id || (!view?.solution_id && before?.sensor_id !== view?.sensor_id)) {
      this.zoom = noZoom();
      this.heldError = undefined;
    }
    this.shownCuts = view && !view.solution_id ? (view.cuts ?? []).filter((c) => !c.hidden) : [];
    this.prepareCoverage();
    const key = this.keyOf();
    if (key !== this.rowsKey) {
      // Another plot shown: the cut chosen starts again, but the same one's keeps its cut.
      const kept = before && view && this.sameShown(before, view) ? this.activeId(before) : undefined;
      this.rowsKey = key;
      this.active = kept ? this.rows().findIndex((r) => r.id === kept) : -1;
    }
    if (this.mode() !== "cuts" || !view?.focus?.make) this.closeForm();
    this.render();
    // Ready for a drag: its first frame then costs no more than the rest (NFR-04).
    const solution = this.solutionRow();
    if (view?.residuals && solution) {
      primeLive(view.residuals, solution);
      this.timesOf(view.residuals.rows);
    }
    if (view?.focus) this.applyFocus(view.focus);
  }

  private sameShown(a: TmaView, b: TmaView): boolean {
    return a.plot_id === b.plot_id && (a.solution_id ?? "") === (b.solution_id ?? "") && (a.solution_id ? true : a.sensor_id === b.sensor_id);
  }

  /**
   * Something chosen for the analyst, once, as the Outline's selection or a command asks (CAP-25):
   * the cut at or nearest a time, ringed in the plot (a fix selected in the Outline, a cut there,
   * a walkthrough's step); the cuts of a period, or those named, and the first guess's form for
   * them; or the counted cut with the largest residual. The host moves current time as it needs.
   */
  private applyFocus(focus: TmaFocus): void {
    const rows = this.rows();
    if (focus.make && this.mode() === "cuts") {
      const all = this.view?.cuts ?? [];
      let chosen: Row[] = [];
      let request: TmaRequest | undefined;
      if (focus.cut_ids?.length) {
        const ids = new Set(focus.cut_ids);
        chosen = all.filter((c) => ids.has(c.id));
        request = { cut_ids: [...focus.cut_ids] };
      } else if (focus.period && this.view?.sensor_id) {
        const choice = focusChoice(all, focus, "cuts");
        if (choice && "problem" in choice) return this.say(choice.problem);
        if (choice && "period" in choice) chosen = all.slice(choice.period[0], choice.period[1] + 1);
        request = { sensor_ids: [this.view.sensor_id], period: focus.period };
      }
      if (!request || !chosen.length) return this.say("There are no cuts to make a solution of.");
      const first = rows.findIndex((r) => r.id === chosen[0].id);
      if (first >= 0) this.setActive(first);
      return this.openForm(chosen, request);
    }
    const choice = focusChoice(rows, focus, this.mode() === "solution" ? "solution" : "cuts");
    if (!choice || !("row" in choice)) return;
    this.setActive(choice.row);
    if (focus.largest) this.host.time(rows[choice.row].time);
  }

  /** Current time and the time window: a line at current time across the plot. */
  setTime(current: number | undefined, _window?: unknown): void {
    this.current = current;
    this.drawPlot();
  }

  /** The theme changed (VS Code's, wherever the view is, popped out too): its colours read again and the plot drawn in them. */
  themeChanged(): void {
    this.colours = undefined;
    this.render();
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

  /** Say something beneath the plot, read aloud. */
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

  /** The cut chosen in the plot (ringed), if any. For tests. */
  get chosen(): Row | undefined {
    return this.rows()[this.active];
  }

  /** Whether the first guess's form is open, and the request it would send. For tests. */
  get formRequest(): TmaRequest | undefined {
    return this.formOpen ? this.formFor?.request : undefined;
  }

  /** The plot as last drawn: its panes, axes, span, zoom and cue. For tests and agents. */
  get plotState() {
    const d = this.drawn_;
    return {
      panes: { ...this.panes },
      drawn: d ? d.panes.map((p) => p.pane) : [],
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
      /** The Bearing pane's bearings are unwrapped about this. */
      reference: d?.reference,
      /** Select bearings on. */
      selecting: this.selecting,
      /** The Course/Speed pane's lines (each its track, colour and role, and its courses' least and most in the span), or nothing to plot. */
      course: this.courseShown,
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
    const report = this.mode() === "solution" ? this.residuals : undefined;
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

  // --- The rows: the solution's rooted cuts, or the sensor's cuts shown -------------------------

  private mode(): "cuts" | "solution" | "none" {
    if (!this.view) return "none";
    if (this.view.solution_id && this.view.residuals) return "solution";
    if (this.view.sensor_id && this.view.cuts) return "cuts";
    return "none";
  }

  /** The cuts the plot's keys step through: the solution's rooted cuts, or the sensor's shown on the map. */
  private rows(): Row[] {
    if (this.mode() === "solution") return this.residuals?.rows ?? [];
    if (this.mode() === "cuts") return this.shownCuts;
    return [];
  }

  private keyOf(): string {
    const v = this.view;
    if (!v) return "";
    return this.mode() === "solution" ? `s:${v.solution_id}:${v.residuals?.rows.length}` : `c:${v.sensor_id}:${this.shownCuts.length}:${this.shownCuts[0]?.id ?? ""}`;
  }

  private activeId(view: TmaView): string | undefined {
    const rows = view.solution_id && view.residuals ? view.residuals.rows : (view.cuts ?? []).filter((c) => !c.hidden);
    return rows[this.active]?.id;
  }

  private solutionRow(): TmaSolutionRow | undefined {
    return this.view?.solutions?.find((s) => s.id === this.view?.solution_id);
  }

  private render(): void {
    const mode = this.mode();
    const open = mode !== "none";
    this.empty.hidden = open;
    this.element.querySelector<HTMLElement>(".tma-body")!.hidden = !open;
    this.element.classList.toggle("tma-solution-shown", mode === "solution");
    this.element.classList.toggle("tma-cuts-shown", mode === "cuts");
    if (!open) {
      this.plot.hidden = this.cue.hidden = this.rmsLine.hidden = true;
      this.closeForm();
      return;
    }
    this.title.textContent = this.view?.title ?? (mode === "solution" ? (this.solutionRow()?.name ?? "") : (this.view?.sensors?.find((s) => s.id === this.view?.sensor_id)?.name ?? ""));
    this.plot.hidden = false;
    this.cue.hidden = mode !== "solution";
    this.renderTools();
    this.renderResiduals();
  }

  /** Everything that changes with the residuals: the plots, the RMS, the notes. */
  private renderResiduals(): void {
    const solution = this.mode() === "solution";
    const report = solution ? this.residuals : undefined;
    this.rmsLine.hidden = false;
    if (report) this.rmsLine.textContent = `${describeRms(report, this.settings)}${this.live ? " (while dragging)" : ""}`;
    else {
      const all = this.view?.cuts ?? [];
      const hidden = all.length - this.shownCuts.length;
      const ambiguous = this.shownCuts.filter(isAmbiguousRow).length;
      this.rmsLine.textContent = `${this.shownCuts.length.toLocaleString("en-GB")} ${this.shownCuts.length === 1 ? "cut" : "cuts"} plotted${ambiguous ? `, ${ambiguous} ambiguous (both bearings, faint)` : ""}${hidden ? `; ${hidden} hidden on the map, not plotted` : ""}. No solution: no errors.`;
    }
    const notes = residualNotes(report);
    this.notes.hidden = !notes.length;
    this.notes.innerHTML = notes.map((n) => `<li>${escape(n)}</li>`).join("");
    this.drawPlot();
    this.renderCue();
  }

  /** The cut-off's state in words and a mark beside the Error pane, so colour is never all that says it. */
  private renderCue(): void {
    const cue = this.drawn_?.cue;
    const offscale = this.element.querySelector<HTMLElement>(".tma-offscale")!;
    if (this.mode() !== "solution" || !cue) {
      offscale.textContent = "";
      return;
    }
    this.cue.dataset.state = cue.state;
    this.cue.querySelector<HTMLElement>(".tma-cue-mark")!.textContent = cueMark(cue);
    this.cue.querySelector<HTMLElement>(".tma-cue-text")!.textContent = describeCue(cue, this.settings);
    // Drawn but not counted, and off the axis fitted to the errors counted: said, never pinned at an edge.
    offscale.textContent = this.drawn_ ? describeOffScale(this.drawn_.off) : "";
  }

  /** A frame of a drag: the RMS and the plots; nothing rebuilt. */
  private renderLive(): void {
    const report = this.residuals;
    if (!report) return;
    // The plots first, then the words: nothing read from the page after it is written.
    this.drawPlot();
    // Said once the drag ends, not every frame.
    if (this.cue.getAttribute("aria-live") !== "off") this.cue.setAttribute("aria-live", "off");
    this.renderCue();
    this.rmsLine.textContent = `${describeRms(report, this.settings)} (while dragging)`;
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

  /** The cut chosen in the plot: ringed in each pane. */
  private setActive(index: number): void {
    const rows = this.rows();
    if (!rows.length) return;
    this.active = Math.max(0, Math.min(rows.length - 1, index));
    this.drawPlot();
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
    const row = this.rows()[this.active] as TmaResidualRow | undefined;
    if (!solution || !row || this.view?.read_only) return;
    const out = !row.excluded;
    this.host.exclude(solution, [row.id], out);
    this.say(`Cut at ${cutWhen(row, this.settings)} ${out ? "left out of" : "counted again in"} the RMS.`);
  }

  private split(): void {
    const solution = this.view?.solution_id;
    const at = this.splitTime();
    if (solution && at && !this.view?.read_only) this.host.split(solution, at);
  }

  // --- The first guess --------------------------------------------------------------------

  /** The first guess's form for the cuts named (TMA solution from cuts…, in the Tools). */
  private openForm(rows: Row[], request: TmaRequest): void {
    if (this.view?.read_only || !rows.length) return;
    this.formFor = { rows, request };
    const first = rows[0];
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
      `<p class="tma-form-title">First guess for ${escape(describePeriod(rows, 0, rows.length - 1, this.settings))}</p>` +
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
      const made = this.checkForm(true);
      if (!made) return;
      this.form.querySelector<HTMLButtonElement>("button[type=submit]")!.disabled = true;
      this.host.create(made);
    };
    this.form.querySelector(".tma-clicks")!.addEventListener("click", () => {
      const contact = this.form.querySelector<HTMLInputElement>("input[name=contact]")!.value.trim();
      this.host.guess({ ...request, ...(contact && { contact }) });
      this.say("Click on the first cut's line on the map, then on the last's. Escape cancels.");
    });
    this.form.querySelector(".tma-cancel")!.addEventListener("click", () => {
      this.closeForm();
      this.canvas.focus();
    });
    this.form.querySelector<HTMLInputElement>("input[name=range]")!.focus();
  }

  private closeForm(): void {
    if (!this.formOpen) return;
    this.formOpen = false;
    this.formFor = undefined;
    this.form.hidden = true;
    this.form.innerHTML = "";
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
    const base = this.formFor?.request;
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

  /** What the controls take above the plot, measured there. */
  private chromeAbove = 0;

  /**
   * The controls on top of the plot, or in a column beside it (tma-side): beside it only where the
   * view is wide and on top they would leave the plot's panes under SIDE_ENTER_PX; back on top once
   * they would leave SIDE_LEAVE_PX. Never where the view grows to fit (a phone's column: no bound).
   */
  private placeControls(bound: HTMLElement | null): void {
    const element = this.element;
    const side = element.classList.contains("tma-side");
    // What the controls take on top, measured on top at every resize: laid out so for the reading
    // only, nothing painted between. Measured only while on top, a size it last had (a window
    // opening tiny, everything wrapped) kept them beside at any size (product owner, 29 Oct 2026).
    // The status line under them never counts: a message would move them to and fro, the plot with them.
    if (side) element.classList.remove("tma-side");
    const status = element.querySelector<HTMLElement>(".tma-status")?.offsetHeight ?? 0;
    if (this.plot.clientHeight > 0) this.chromeAbove = Math.max(0, element.scrollHeight - this.plot.clientHeight - status);
    // The height the view has: the window's in VS Code (the page's own height grows with what
    // overflows it, so never that), the docked panel's in the playground; from the view's top.
    const bottom = !bound ? 0 : bound === document.documentElement ? window.innerHeight : bound.getBoundingClientRect().bottom;
    const available = bottom - element.getBoundingClientRect().top;
    element.classList.toggle("tma-side", !!bound && controlsBeside(side, available, this.chromeAbove));
  }

  /** The coverage drawn beside the rows, its times, and the whole span plotted: once per view, never per frame. */
  private prepareCoverage(): void {
    const view = this.view;
    const solution = this.solutionRow();
    this.fixTimes = (solution?.times ?? []).map((t) => Date.parse(t));
    if (view && !view.solution_id) {
      // A sensor shown: its cuts on the map are the coverage, and the rows the keys step through.
      const times = this.shownCuts.map((c) => Date.parse(c.time));
      this.coverage = { rows: this.shownCuts, times, whole: coverageSpan(times) };
      return;
    }
    if (!view?.residuals || !view.solution_id) {
      this.coverage = { rows: [], times: [] };
      return;
    }
    const rooted = new Set(view.residuals.rows.map((r) => r.id));
    const rows = coverageOutside(view.coverage, rooted);
    const times = rows.map((c) => Date.parse(c.time));
    const rowTimes = view.residuals.rows.map((r) => Date.parse(r.time));
    const period: Range | undefined = solution ? [Date.parse(solution.period.start), Date.parse(solution.period.end)] : undefined;
    this.coverage = { rows, times, whole: coverageSpan(times, rowTimes, period) };
  }

  private remember(): void {
    try {
      this.memory?.save({ panes: this.panes });
    } catch {
      // Not remembered: the choice holds for now.
    }
  }

  private togglePane(pane: Pane): void {
    const next = togglePane(this.panes, pane);
    if (next === this.panes) return this.say("One pane at least stays shown.");
    this.panes = next;
    this.remember();
    this.renderTools();
    this.drawPlot();
    this.say(`${PANE_NAMES[pane]} pane ${next[pane] ? "shown" : "hidden"}.${pane === "error" && this.mode() !== "solution" ? " It is drawn once a solution is shown." : ""}`);
  }

  /** Select bearings on or off: on, a box in the Bearing pane keeps the sides of the cuts it takes in. */
  private setSelecting(on: boolean): void {
    this.selecting = on;
    this.tools.querySelector(".tma-select")!.setAttribute("aria-pressed", String(on));
    this.plot.classList.toggle("tma-selecting", on);
    this.element.querySelector<HTMLElement>(".tma-select-hint")!.hidden = !on;
    // On, the hint beside the plot says what a box does: the status says only that it is on, so the hint is not shown twice.
    this.say(on ? "Select bearings on." : "Select bearings off: a box zooms.");
  }

  /** The Course/Speed pane's lines named, in ⋯: each track's colour, course solid and speed dashed. */
  private showLegend(series: readonly CourseSeries[]): void {
    const key = series.map((s) => `${s.id}${s.colour}${s.marked}${!!s.courses}${!!s.speeds}`).join("|");
    if (key === this.legendKey) return;
    this.legendKey = key;
    const legend = this.element.querySelector<HTMLElement>(".tma-legend")!;
    legend.hidden = !series.length;
    legend.replaceChildren(
      ...series.map((s) => {
        const li = document.createElement("li");
        const swatch = document.createElement("span");
        swatch.className = "tma-legend-swatch";
        swatch.setAttribute("aria-hidden", "true");
        swatch.style.color = s.colour;
        swatch.textContent = s.marked ? "━■┄" : "━ ┄";
        const words = s.role === "ownship" ? `${s.name} (ownship)` : `${s.name} (target)`;
        li.append(swatch, ` ${words}: course solid, speed dashed${s.marked ? ", marked at each fix" : ""}`);
        return li;
      }),
    );
  }

  /** The dots of resolvable cuts as the Bearing pane draws them: an unresolved pair's two, a resolved cut's one; never a hidden cut's. */
  private bearingMarkers(): BearingMarker[] {
    if (this.mode() !== "solution") return bearingMarkersOf(this.coverage);
    const rows = (this.residuals?.rows ?? []) as TmaResidualRow[];
    return bearingMarkersOf(this.coverage, { rows, times: this.timesOf(rows) });
  }

  /** A box drawn in the Bearing pane with Select bearings on: the sides boxed kept and the resolved cuts boxed made ambiguous again, one step, or said why nothing changed. The zoom stays. */
  private resolveBox(times: Range, values: Range): void {
    const d = this.drawn_;
    if (!d) return;
    if (this.view?.read_only) return this.say("An earlier revision is shown read-only: nothing is changed.");
    const boxed = boxedSides(this.bearingMarkers(), times, values, d.reference);
    const resolution = boxResolution(boxed);
    this.say(describeBoxed(boxed));
    if (resolution) this.host.resolveCuts(resolution);
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
    if (!(degrees >= 0.01 && degrees <= 180)) {
      this.cutOffInput.value = String(this.cutOffDegrees);
      return this.say("The cut-off is from 0.01° to 180°.");
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
    const solution = this.mode() === "solution";
    this.tools.querySelectorAll<HTMLButtonElement>(".tma-pane").forEach((button) => {
      const pane = button.dataset.pane as Pane;
      button.setAttribute("aria-pressed", String(this.panes[pane]));
      // The Error pane needs a solution: still the analyst's to choose, said in its title.
      button.title = pane === "error" && !solution ? "Show or hide the Error pane: drawn once a TMA solution is shown" : `Show or hide the ${PANE_NAMES[pane]} pane`;
    });
    this.tools.querySelector(".tma-hold")!.setAttribute("aria-pressed", String(this.hold));
    this.tools.querySelector<HTMLButtonElement>(".tma-hold")!.disabled = !solution;
    this.tools.querySelector<HTMLButtonElement>(".tma-reset")!.disabled = !isZoomed(this.zoom);
    if (document.activeElement !== this.cutOffInput) this.cutOffInput.value = String(this.cutOffDegrees);
    const course = this.panes.course;
    const unit = UNIT_LABELS[this.settings.speed_unit] ?? this.settings.speed_unit;
    this.keyLine.innerHTML =
      `<span>● measured</span><span>○ nearer of two</span><span class="tma-key-other">● other of two, faint</span><span>▲ calculated</span><span>◌ left out</span>` +
      (course ? `<span>— course, ┄ speed (${escape(unit)}), each in its track's colour</span>` : "");
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
    const key = (this.mode() === "solution" ? this.view?.residuals : this.shownCuts) as object | undefined;
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
      background: token("--vscode-sideBar-background", "--vscode-editor-background", "--vscode-panel-background") || "transparent",
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
    // No Error pane without a solution (a sensor's coverage shown).
    const shown = panesDrawn(this.panes, this.mode() === "solution");
    const left = label + 8;
    const right = 4;
    const gap = 8;
    // Each pane's name, then its axis's ticks, above; Speed's ticks below the Course/Speed pane.
    const top = 28;
    const bottom = shown.includes("course") ? 26 : 6;
    const w = Math.max(20, (width - left - right - gap * (shown.length - 1)) / shown.length);
    return {
      top,
      height: Math.max(40, height - top - bottom),
      left,
      panes: shown.map((pane, k) => ({ pane, x: left + k * (w + gap), w })),
    };
  }

  private drawPlot(): void {
    const mode = this.mode();
    if (mode === "none" || this.plot.hidden) return;
    // A sensor's coverage shown: no rooted rows, its cuts drawn as coverage (product owner, 27 Oct 2026).
    const report: Pick<TmaResiduals, "rows"> | undefined = mode === "solution" ? this.residuals : { rows: [] };
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
    const times = mode === "solution" ? this.timesOf(rows) : [];
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
    // Ownship's course and speed, always; the target's (the solution's DR legs) with a solution; each in its track's colour (product owner, 28 Oct 2026).
    const series: CourseSeries[] = this.panes.course
      ? courseSeries(
          (this.view?.ownship ?? []).map((o) => ({ ...o, times: this.ownTimes(o) })),
          solution && (courses || speeds) ? { id: solution.id, name: solution.name, colour: solution.colour, times: this.fixTimes, courses, speeds } : undefined,
          muted,
        )
      : [];
    const axes = this.panes.course ? courseAxes(series, span, perSecond) : undefined;
    const nothingToPlot = this.panes.course && !axes;
    let courseRange: Range = axes?.course ?? [0, 360];
    let speedRange: Range = axes?.speed ?? [0, 10];
    const courseRef = axes?.reference ?? 0;
    this.showLegend(series);
    if (this.panes.course) {
      const extent = (s: CourseSeries, values: ArrayLike<number> | undefined, unwrap: boolean): [number, number] | undefined => {
        let lo = Infinity;
        let hi = -Infinity;
        for (let i = 0; values && i < s.times.length; i++) {
          if (!inSpan(s.times[i]) || !Number.isFinite(values[i])) continue;
          const v = unwrap ? about(values[i], courseRef) : values[i] * perSecond;
          lo = Math.min(lo, v);
          hi = Math.max(hi, v);
        }
        return lo === Infinity ? undefined : [lo, hi];
      };
      this.courseShown = { nothing: !axes, series: series.map((s) => ({ id: s.id, name: s.name, colour: s.colour, role: s.role, marked: s.marked, courses: extent(s, s.courses, true), speeds: extent(s, s.speeds, false) })) };
    } else this.courseShown = undefined;
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
    this.drawn_ = { span, top, height, panes, reference: ref, courseReference: courseRef, speed: speedRange, cue, off: layout.panes.some((p) => p.pane === "error") ? offScale(rows, times, ranges.error, span) : { others: 0, leftOut: 0 } };
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
      if (p.pane === "course" && nothingToPlot) {
        // No course or speed at all: said, not drawn as empty axes.
        ctx.fillStyle = muted;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("No course or speed to plot", p.x + p.w / 2, top + height / 2);
        ctx.restore();
        continue;
      }
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
        const speedTicks = niceTicks(speedRange[0], speedRange[1], Math.max(3, Math.floor(p.w / 26)));
        labels(speedTicks, (v) => valueToX(v, speedRange, p.x, p.w), (v) => tickLabel(v, speedTicks), top + height + 2);
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
      // The calculated bearings again over the dots, as legacy's triangles: in sight where the dots lie on the line.
      ctx.beginPath();
      let marked = -Infinity;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (!has(r.calculated) || !inSpan(times[i])) continue;
        const py = y(times[i]);
        if (Math.abs(py - marked) < 4) continue;
        marked = py;
        const px = xOf(bearing, about(r.calculated, ref));
        ctx.moveTo(px, py - 3);
        ctx.lineTo(px + 2.6, py + 1.6);
        ctx.lineTo(px - 2.6, py + 1.6);
        ctx.closePath();
      }
      ctx.fillStyle = lineColour;
      ctx.strokeStyle = colours.background;
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.fill();
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
        const colour = r.colour ?? fg;
        const py = y(times[i]);
        // An unresolved pair's other bearing drawn only inside the axis, fitted to the errors counted.
        if (has(r.other_residual) && inside(r.other_residual, range)) put(faints, "o", colour, xOf(errorPane, r.other_residual), py);
        // Never drawn at an edge it is not at: outside the axis (a zoom's; a cut left out), not drawn.
        if (!inside(r.residual, range)) {
          if (!r.excluded) outside++;
          continue;
        }
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
      const toSpeed = (v: number) => valueToX(v * perSecond, speedRange, coursePane.x, coursePane.w);
      for (const s of series) {
        // Course solid, speed dashed, each in its track's colour; the target wider, and marked at its fixes where its colour is near ownship's.
        const width = s.role === "target" ? 2 : 1.5;
        if (s.courses) line(s.times, s.courses, s.colour, toCourse, [], width);
        if (s.speeds) line(s.times, s.speeds, s.colour, toSpeed, [4, 3], width);
        if (s.marked) {
          ctx.fillStyle = s.colour;
          for (let i = 0; i < s.times.length; i++) {
            const t = s.times[i];
            if (!inSpan(t)) continue;
            const c = s.courses?.[i];
            if (c !== undefined && Number.isFinite(c)) ctx.fillRect(toCourse(c) - 2, y(t) - 2, 4, 4);
            const v = s.speeds?.[i];
            if (v !== undefined && Number.isFinite(v)) ctx.fillRect(toSpeed(v) - 2, y(t) - 2, 4, 4);
          }
        }
      }
      ctx.restore();
    }
    this.faintDrawn = faint;
    // The cut chosen (the keyboard's, a dot clicked, the Outline's): ringed in each pane it is drawn in.
    const chosen = this.rows()[this.active] as TmaResidualRow | undefined;
    const chosenAt = chosen ? (mode === "solution" ? times[this.active] : coverage.times[this.active]) : NaN;
    if (chosen && inSpan(chosenAt)) {
      const py = y(chosenAt);
      ctx.strokeStyle = focus;
      ctx.lineWidth = 1.5;
      const ring = (p: { x: number; w: number; range: Range } | undefined, v: number | undefined) => {
        if (!p || v === undefined || !inside(v, p.range)) return;
        ctx.beginPath();
        ctx.arc(xOf(p, v), py, 5, 0, Math.PI * 2);
        ctx.stroke();
      };
      const shownBearing = has(chosen.measured) ? chosen.measured : chosen.resolved === "ambiguous_bearing" ? (chosen.ambiguous_bearing ?? chosen.bearing) : chosen.bearing;
      ring(bearing, about(shownBearing, ref));
      // An unresolved pair with no solution: both its bearings ringed.
      if (mode === "cuts" && isAmbiguousRow(chosen)) ring(bearing, about(chosen.ambiguous_bearing!, ref));
      ring(errorPane, has(chosen.residual) ? chosen.residual : undefined);
    }
    if (!this.live) {
      const others = faint ? ` The other bearing of ${faint.toLocaleString("en-GB")} ambiguous ${faint === 1 ? "cut is" : "cuts are"} drawn faint, not counted.` : "";
      const size = `${Math.round(height)}:${panes.map((p) => Math.round(p.w)).join(",")}`;
      if (size !== this.drawnSize) {
        this.drawnSize = size;
        this.host.drawn?.(Math.round(height), panes.map((p) => Math.round(p.w)));
      }
      const names = panes.map((p) => PANE_NAMES[p.pane]).join(", ");
      const offNote = describeOffScale(this.drawn_.off);
      const off = offNote ? ` ${offNote[0].toUpperCase()}${offNote.slice(1)}.` : "";
      const when = `time upward from ${formatTime(span[0], this.settings)} to ${formatTime(span[1], this.settings)}`;
      this.canvas.setAttribute(
        "aria-label",
        mode === "solution"
          ? `Bearings and residuals of ${solution?.name ?? "the solution"}, ${when}; panes ${names}: ${describeRms(this.residuals, this.settings)}. ${describeCue(cue, this.settings)}.${others}${off} The Outline lists each cut and fix; Up and Down choose a cut here, Enter selects it; Space or Delete leaves it out, S splits there, 1 and 2 keep an ambiguous cut's bearing.`
          : `Bearings of ${this.title.textContent || "the sensor"}, ${when}; panes ${names}. An ambiguous cut's two bearings are drawn faint. No solution is shown, so no errors. Up and Down choose a cut here, Enter selects it, 1 and 2 keep an ambiguous cut's bearing.`,
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
      if (this.box.resolve) {
        // Selecting bearings: a solid box, lightly filled, unlike the dashed one that zooms.
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = focus;
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
        ctx.globalAlpha = 1;
        ctx.lineWidth = 1.5;
      } else ctx.setLineDash([4, 2]);
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
    this.box = { pane: p.pane, x0: x, y0: y, x1: x, y1: y, resolve: this.selecting && p.pane === "bearing" };
    this.canvas.setPointerCapture?.(event.pointerId);
  }

  private pointerMove(event: PointerEvent): void {
    const { x, y } = this.local(event);
    this.pointer = { x, y };
    if (this.box) {
      this.box.x1 = x;
      this.box.y1 = y;
    }
    this.readout.textContent = this.readAt(x, y);
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
      if (box.resolve) {
        this.drawOverlay();
        return this.resolveBox(times, values);
      }
      this.setZoom(zoomBox(this.zoom, box.pane, times, values));
      this.say(`Zoomed: ${formatTime(Math.min(...times), this.settings)} to ${formatTime(Math.max(...times), this.settings)}. Double-click, or Reset zoom, to see it all.`);
      return;
    }
    this.pick(box.pane, box.x1, box.y1, event.detail <= 1);
  }

  private pointerGone(): void {
    this.pointer = undefined;
    this.readout.textContent = "";
    this.drawOverlay();
  }

  /**
   * A click on the plot: the nearest dot within reach selects its cut, or the solution at a
   * fix (the calculated line, the Course/Speed pane), and moves current time to it, as
   * legacy's Stacked Dots selected the cut or fix clicked. Nothing near: current time only.
   */
  private pick(pane: Pane, x: number, y: number, single: boolean): void {
    const d = this.drawn_;
    if (!d || this.mode() === "none" || !single) return;
    const item = this.dotAt(pane, x, y);
    if (!item) {
      // No dot near: current time to the time pointed at, as a click on the plot did before.
      const t = yToTime(y, d.span, d.top, d.height);
      const index = nearestRow(this.rows(), t);
      if (index >= 0) this.setActive(index);
      this.host.time(new Date(t).toISOString());
      return;
    }
    if (item.row !== undefined) this.setActive(item.row);
    if (item.id) this.host.select(item.id, item.time);
    const isFix = item.id === this.view?.solution_id;
    this.say(isFix ? `${this.solutionRow()?.name ?? "The solution"}'s fix at ${formatTime(Date.parse(item.time), this.settings)} selected.` : `Cut at ${formatTime(Date.parse(item.time), this.settings)} selected.`);
  }

  /**
   * A right-click on the plot (product owner, 29 Oct 2026): the nearest dot's menu, the Outline's
   * for its cut or the solution's fix there (split before or after it, leave it out, keep a side,
   * hide, select…), the dot ringed. Nothing near: the browser's own menu, as before.
   */
  private menuAt(event: MouseEvent): void {
    const d = this.drawn_;
    if (!d || this.mode() === "none" || !this.host.menu) return;
    const { x, y } = this.local(event);
    const p = this.paneAt(x);
    if (!p || y < d.top || y > d.top + d.height) return;
    const item = this.dotAt(p.pane, x, y);
    if (!item?.id) return;
    event.preventDefault();
    if (item.row !== undefined) this.setActive(item.row);
    this.host.menu(item.id, item.time, event.clientX, event.clientY);
  }

  /** The dot nearest a point in a pane, within reach: its cut, or the solution at a fix (the calculated line, the Course/Speed pane). */
  private dotAt(pane: Pane, x: number, y: number): { id: string; time: string; row?: number } | undefined {
    const d = this.drawn_;
    const mode = this.mode();
    if (!d || mode === "none") return undefined;
    const p = d.panes.find((q) => q.pane === pane)!;
    // With no solution, the sensor's cuts are the coverage: a dot of it chooses its row too.
    const rows = (mode === "solution" ? (this.residuals?.rows ?? []) : []) as TmaResidualRow[];
    const times = mode === "solution" ? this.timesOf(rows) : [];
    const cutsRow = (i: number) => (mode === "cuts" ? i : undefined);
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
      this.coverage.rows.forEach((c, i) => {
        const item = { id: c.id, time: c.time, row: cutsRow(i) };
        if (c.ambiguous_bearing !== undefined && c.ambiguous_bearing !== null && !c.resolved) {
          // An unresolved pair, both drawn: either of its dots chooses it.
          add(about(c.bearing, d.reference), this.coverage.times[i], item);
          add(about(c.ambiguous_bearing, d.reference), this.coverage.times[i], item);
        } else add(about(c.resolved === "ambiguous_bearing" ? (c.ambiguous_bearing ?? c.bearing) : c.bearing, d.reference), this.coverage.times[i], item);
      });
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
    return hit < 0 ? undefined : what[hit];
  }

  /** The cut chosen, read out above the plot when the keyboard is on it. */
  private sayActive(): void {
    const rows = this.rows() as TmaResidualRow[];
    const r = rows[this.active];
    if (!r) {
      this.readout.textContent = "Up and Down choose a cut; Enter selects it; Space leaves it out; S splits; + and − zoom time, [ and ] the errors; 0 resets.";
      return;
    }
    const bearings = r.measured !== undefined && r.measured !== null ? bearingText(r.measured) : isAmbiguousRow(r) ? `${bearingText(r.bearing)} or ${bearingText(r.ambiguous_bearing!)}` : bearingText(r.resolved === "ambiguous_bearing" ? (r.ambiguous_bearing ?? r.bearing) : r.bearing);
    const parts = [cutWhen(r, this.settings), `Bearing ${bearings}`];
    if (r.residual !== undefined && r.residual !== null) parts.push(`Error ${residualText(r.residual, this.settings)}`);
    if (r.excluded) parts.push("left out");
    this.readout.textContent = parts.join(" · ");
    // Said in the live region too: the readout is drawn for the eye only.
    this.say(parts.join(", "));
  }

  /** The zoom as it now is, said in the live region. */
  private sayZoom(): void {
    const d = this.drawn_;
    if (!d) return;
    this.say(isZoomed(this.zoom) ? `Zoomed: ${formatTime(d.span[0], this.settings)} to ${formatTime(d.span[1], this.settings)}.` : "Zoom reset: every cut of the sensors shown again.");
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
      this.setActive(this.active < 0 ? 0 : this.active + (event.key === "ArrowUp" ? 1 : -1));
      return done();
    }
    if (event.key === "Enter" && rows[this.active]) {
      const r = rows[this.active];
      this.host.select(r.id, r.time);
      event.preventDefault();
      return this.say(`Cut at ${cutWhen(r, this.settings)} selected.`);
    }
    const zoomed = () => {
      event.preventDefault();
      this.sayZoom();
    };
    if (event.key === "+" || event.key === "=") {
      this.setZoom(zoomTime(this.zoom, d.span, whole, 0.5, at));
      return zoomed();
    }
    if (event.key === "-" || event.key === "_") {
      this.setZoom(zoomTime(this.zoom, d.span, whole, 2, at));
      return zoomed();
    }
    if (event.key === "]" || event.key === "[") {
      const p = d.panes.find((q) => q.pane === "error") ?? d.panes[0];
      this.setZoom(zoomValues(this.zoom, p.pane, p.range, event.key === "]" ? 0.5 : 2));
      event.preventDefault();
      return this.say(`${PANE_NAMES[p.pane]} pane zoomed ${event.key === "]" ? "in" : "out"}.`);
    }
    if (event.key === "PageUp" || event.key === "PageDown") {
      this.setZoom(panTime(this.zoom, whole, event.key === "PageUp" ? 0.5 : -0.5));
      return zoomed();
    }
    if (event.key === "0") {
      event.preventDefault();
      return this.resetZoom();
    }
    // The cut chosen's buttons, from the plot (product owner, 25 Oct 2026, the panel's M3):
    // Space or Delete leaves it out of the RMS or counts it again, as Space does in the list;
    // S splits the solution into legs there; 1 and 2 keep an ambiguous cut's first or second bearing.
    const row = rows[this.active];
    if (!row) return;
    if (event.key === " " || event.key === "Delete") {
      event.preventDefault();
      if (this.mode() !== "solution") return this.say("No solution is shown to leave the cut out of: select one in the Outline.");
      return this.toggleExcluded();
    }
    if (event.key === "s" || event.key === "S") {
      event.preventDefault();
      if (this.mode() !== "solution") return this.say("No solution is shown to split: select one in the Outline.");
      if (this.splitTime()) return this.split();
      return this.say("No split here: each leg needs two fixes or more either side.");
    }
    if ((event.key === "1" || event.key === "2") && row.ambiguous_bearing !== undefined && row.ambiguous_bearing !== null && !row.resolved) {
      event.preventDefault();
      return this.keep(event.key === "1" ? "bearing" : "ambiguous_bearing");
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
  /** Errors drawn but not counted that fall off the Error axis. */
  off: { others: number; leftOut: number };
}
