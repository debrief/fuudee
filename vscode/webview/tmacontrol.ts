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
 *   or counts them again, one step each time.
 * - No solution shown: the sensor's cuts, the period chosen (by default the cuts in the
 *   time window, as CAP-21 roots a solution in the window), and Make solution…: a form for
 *   the first guess (a range along the first cut's bearing, a course and a speed, offered
 *   as 10,000 yd, across the bearing, 8 kn, in the analyst's units), or two clicks on the
 *   map instead.
 * - A solution shown: its bearings measured and calculated over time, its residuals
 *   beneath, the RMS error, its legs, and the list of its cuts with each residual. An
 *   ambiguous cut not yet resolved is measured by the bearing nearer the solution, and
 *   the view says so (≈). A point clicked on the plots chooses its cut, a manoeuvre where
 *   the solution can be split into legs.
 */
import { DEFAULT_SETTINGS, fixed, formatTime, type FormatSettings } from "@debrief/kernel";
import type { TimeRange, TmaCut, TmaRequest, TmaResidualRow, TmaResiduals, TmaSolutionRow, TmaView } from "@debrief/schemas";
import type { LonLat } from "./geodesic.js";
import { bearingText, type Kept } from "./sensors.js";
import {
  cutBearings,
  type CutRow,
  cutWhen,
  describePeriod,
  describeRms,
  guessDefaults,
  isAmbiguousRow,
  liveResiduals,
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
}

/** One row of the list, of one height whatever the font: the list scrolls by it. */
export const ROW_PX = 22;
/** The plots' height, at most; less beside the list in a short panel, never below PLOT_LEAST_PX. */
const PLOT_PX = 196;
const PLOT_LEAST_PX = 110;
/** From this width the view lays the plots beside the list (the strip under the map). */
const WIDE_PX = 640;
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
  /** How long each live recompute took, ms: for the playground's tests and the drag budget (NFR-04). */
  readonly timings: number[] = [];
  private readonly sensor: HTMLSelectElement;
  private readonly solution: HTMLSelectElement;
  private readonly plot: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
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
  ) {
    element.classList.add("tma");
    element.setAttribute("role", "group");
    element.setAttribute("aria-label", "Bearings");
    element.innerHTML =
      `<p class="tma-empty">Open a plot with sensor bearings to list its cuts and make a TMA solution from them.</p>` +
      `<div class="tma-head">` +
      `<label class="tma-pick"><span>Sensor</span><select class="tma-sensor" aria-label="Sensor whose cuts are listed"></select></label>` +
      `<label class="tma-pick"><span>Solution</span><select class="tma-solution" aria-label="TMA solution shown"></select></label>` +
      `</div>` +
      `<div class="tma-body"><div class="tma-left">` +
      `<div class="tma-plot" hidden><canvas class="tma-canvas" role="img"></canvas>` +
      `<p class="tma-key" aria-hidden="true"><span>● measured</span><span>○ nearer of two</span><span>— calculated</span><span>◌ left out</span></p></div>` +
      `<p class="tma-rms" hidden></p>` +
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
      `</div><div class="tma-right">` +
      `<div class="tma-columns" aria-hidden="true"><span class="tma-c-time">Time</span><span class="tma-c-sensor">Sensor</span><span class="tma-c-brg">Bearing</span><span class="tma-c-res">Residual</span></div>` +
      `<div class="tma-list" role="listbox" tabindex="0" aria-multiselectable="true"><div class="tma-spacer"></div></div>` +
      `</div></div>`;
    const q = <T extends HTMLElement>(s: string) => element.querySelector<T>(s)!;
    this.empty = q(".tma-empty");
    this.sensor = q(".tma-sensor");
    this.solution = q(".tma-solution");
    this.plot = q(".tma-plot");
    this.canvas = q(".tma-canvas");
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
    this.canvas.addEventListener("click", (e) => this.plotClick(e));
    this.buttons.prev.addEventListener("click", () => this.ambiguous(-1));
    this.buttons.next.addEventListener("click", () => this.ambiguous(1));
    this.buttons.first.addEventListener("click", () => this.keep("bearing"));
    this.buttons.second.addEventListener("click", () => this.keep("ambiguous_bearing"));
    this.buttons.again.addEventListener("click", () => this.keep("ambiguous"));
    this.buttons.exclude.addEventListener("click", () => this.toggleExcluded());
    this.buttons.split.addEventListener("click", () => this.split());
    this.make.addEventListener("click", () => this.openForm());
    // Wide and short (the strip under the map): the plots and buttons beside the list, not above it.
    new ResizeObserver(() => {
      element.classList.toggle("tma-wide", element.clientWidth >= WIDE_PX);
      this.renderRows();
      this.drawPlot();
    }).observe(element);
    this.render();
  }

  // --- What the host says -------------------------------------------------------------

  /** Everything the view shows; nothing for no plot. */
  show(view: TmaView | undefined): void {
    const before = this.view;
    this.view = view;
    this.live = undefined;
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
      if (this.live) {
        this.live = undefined;
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
      this.timings.push(performance.now() - started);
      if (this.timings.length > 2000) this.timings.splice(0, 1000);
      this.renderResiduals();
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
      this.plot.hidden = this.rmsLine.hidden = this.notes.hidden = this.actions.hidden = this.chosen.hidden = true;
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
    this.plot.hidden = !solution;
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
    this.list.setAttribute("aria-rowcount", String(this.rows().length));
    this.drawn.forEach((e) => e.remove());
    this.drawn.clear();
    this.renderRows();
    this.renderActions();
    this.drawPlot();
  }

  /** The rows in sight, and a few either side; the rest are not in the page. */
  private renderRows(): void {
    const rows = this.rows();
    const { first, last } = rowsInSight(this.list.scrollTop, this.list.clientHeight || ROW_PX * 10, ROW_PX, rows.length);
    const range = this.range();
    const solution = this.mode() === "solution";
    for (const [i, element] of this.drawn) {
      if (i < first || i > last) {
        element.remove();
        this.drawn.delete(i);
      }
    }
    for (let i = first; i <= last; i++) {
      const row = rows[i];
      const chosen = !!range && i >= range[0] && i <= range[1];
      let element = this.drawn.get(i);
      if (!element) {
        element = document.createElement("div");
        element.className = "tma-row";
        element.setAttribute("role", "option");
        element.id = `tma-row-${i}`;
        element.style.top = `${i * ROW_PX}px`;
        element.dataset.index = String(i);
        this.list.appendChild(element);
        this.drawn.set(i, element);
      }
      element.dataset.cut = row.id;
      element.setAttribute("aria-posinset", String(i + 1));
      element.setAttribute("aria-setsize", String(rows.length));
      element.setAttribute("aria-selected", String(chosen));
      element.setAttribute("aria-label", rowLabel(row, this.settings));
      element.classList.toggle("tma-active", i === this.active);
      element.classList.toggle("tma-chosen-row", chosen);
      const r = row as TmaResidualRow;
      element.classList.toggle("tma-excluded", !!r.excluded);
      const flags = `${isAmbiguousRow(row) ? (solution && r.nearer_side ? "≈" : "?") : ""}${row.origin_derived ? "◇" : ""}`;
      const swatch = row.colour ? `<span class="tma-swatch" style="background:${escape(row.colour)}"></span>` : `<span class="tma-swatch"></span>`;
      const residual = solution
        ? `<span class="tma-c-res">${escape(residualText(r.residual, this.settings))}</span><span class="tma-c-in" data-toggle="1" title="${r.excluded ? "Left out of the RMS: click, or press Space, to count it again" : "Counted in the RMS: click, or press Space, to leave it out"}">${r.excluded ? "☐" : "☑"}</span>`
        : "";
      element.innerHTML =
        `<span class="tma-c-time">${escape(cutWhen(row, this.settings))}</span>` +
        `<span class="tma-c-sensor">${swatch}${escape(row.sensor ?? "")}</span>` +
        `<span class="tma-c-brg">${escape(cutBearings(row))}${flags ? ` <span class="tma-flag">${flags}</span>` : ""}</span>` +
        residual;
    }
    if (this.active >= 0 && this.drawn.has(this.active)) this.list.setAttribute("aria-activedescendant", `tma-row-${this.active}`);
    else this.list.removeAttribute("aria-activedescendant");
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
      this.buttons.split.title = "Split the solution into legs here: each leg is dragged on its own (This leg, on the map), the later legs following on, joined";
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
    // Only where each leg keeps two fixes or more, as Python asks: nowhere else to split it.
    const times = (this.solutionRow()?.times ?? []).map((x) => Date.parse(x));
    if (!at || times.length < 4) return undefined;
    const t = Date.parse(at);
    const before = times.filter((x) => x < t).length;
    return before >= 2 && times.length - before >= 2 ? at : undefined;
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

  private plotClick(event: MouseEvent): void {
    const rows = this.rows();
    const t = this.timeAtX(event.offsetX);
    if (t === undefined || !rows.length) return;
    const index = nearestRow(rows, t);
    if (index < 0) return;
    this.setActive(index, false, true);
    this.host.time(rows[index].time);
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

  // --- The plots: bearings over time, residuals beneath (legacy Stacked Dots) ---------------

  private geometry() {
    const width = Math.max(120, this.plot.clientWidth || this.element.clientWidth || 300);
    // Beside the list in a short panel: as tall as the panel leaves room for, the RMS and buttons beneath.
    const head = this.element.querySelector<HTMLElement>(".tma-head")?.offsetHeight ?? 0;
    const room = this.element.clientHeight - head - 74;
    const height = this.element.classList.contains("tma-wide") && room > 0 ? Math.max(PLOT_LEAST_PX, Math.min(PLOT_PX, room)) : PLOT_PX;
    const left = 40;
    const right = 8;
    const top = 6;
    const gap = 16;
    const bottom = 14;
    const residuals = Math.round((height - top - gap - bottom) * 0.4);
    const bearings = height - top - gap - bottom - residuals;
    return { width, height, left, right, top, bearings, gap, residuals, plotWidth: width - left - right };
  }

  private span(): [number, number] | undefined {
    const solution = this.solutionRow();
    const rows = this.rows();
    if (solution) return [Date.parse(solution.period.start), Date.parse(solution.period.end)];
    if (!rows.length) return undefined;
    return [Date.parse(rows[0].time), Date.parse(rows[rows.length - 1].time)];
  }

  private timeAtX(x: number): number | undefined {
    const span = this.span();
    if (!span) return undefined;
    const g = this.geometry();
    const f = (x - g.left) / g.plotWidth;
    return span[0] + Math.max(0, Math.min(1, f)) * (span[1] - span[0]);
  }

  private drawPlot(): void {
    if (this.mode() !== "solution" || this.plot.hidden) return;
    const report = this.residuals;
    const span = this.span();
    const g = this.geometry();
    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(g.width * ratio);
    this.canvas.height = Math.round(g.height * ratio);
    this.canvas.style.width = `${g.width}px`;
    this.canvas.style.height = `${g.height}px`;
    const ctx = this.canvas.getContext("2d");
    if (!ctx || !report || !span) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, g.width, g.height);
    const css = getComputedStyle(this.element);
    const token = (name: string, fallback: string) => css.getPropertyValue(name).trim() || css.getPropertyValue(fallback).trim();
    const fg = token("--vscode-foreground", "--vscode-editor-foreground");
    const muted = token("--vscode-descriptionForeground", "--vscode-foreground");
    const grid = token("--vscode-widget-border", "--vscode-panel-border") || muted;
    const focus = token("--vscode-focusBorder", "--vscode-foreground");
    const solution = this.solutionRow();
    const lineColour = solution?.colour ?? fg;
    ctx.font = `10px ${css.getPropertyValue("--vscode-font-family") || "sans-serif"}`;
    const rows = report.rows;
    const x = (t: number) => g.left + ((t - span[0]) / Math.max(1, span[1] - span[0])) * g.plotWidth;
    // Bearings: unwrapped about the middle calculated bearing, so a line through north stays one line.
    const calcs = rows.map((r) => r.calculated).filter((v): v is number => v !== undefined && v !== null);
    const reference = calcs.length ? calcs[Math.floor(calcs.length / 2)] : (rows[0]?.bearing ?? 0);
    const unwrap = (v: number) => reference + wrap(v - reference);
    const values = rows.flatMap((r) => [r.measured, r.calculated].filter((v): v is number => v !== undefined && v !== null).map(unwrap));
    let lo = values.length ? Math.min(...values) : reference - 10;
    let hi = values.length ? Math.max(...values) : reference + 10;
    if (hi - lo < 4) {
      lo -= 2;
      hi += 2;
    }
    const pad = (hi - lo) * 0.08;
    lo -= pad;
    hi += pad;
    const yB = (v: number) => g.top + g.bearings - ((unwrap(v) - lo) / (hi - lo)) * g.bearings;
    const resTop = g.top + g.bearings + g.gap;
    const biggest = Math.max(2, ...rows.map((r) => Math.abs(r.residual ?? 0)));
    const limit = Math.min(180, Math.ceil(biggest * 1.15));
    const yR = (v: number) => resTop + g.residuals / 2 - (v / limit) * (g.residuals / 2);
    // Frames, the zero line, labels.
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    ctx.strokeRect(g.left + 0.5, g.top + 0.5, g.plotWidth, g.bearings);
    ctx.strokeRect(g.left + 0.5, resTop + 0.5, g.plotWidth, g.residuals);
    ctx.beginPath();
    ctx.moveTo(g.left, Math.round(yR(0)) + 0.5);
    ctx.lineTo(g.left + g.plotWidth, Math.round(yR(0)) + 0.5);
    ctx.stroke();
    ctx.fillStyle = muted;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const degreesText = (v: number) => `${fixed(((v % 360) + 360) % 360, 0).padStart(3, "0")}°`;
    ctx.fillText(degreesText(hi), g.left - 4, g.top + 6);
    ctx.fillText(degreesText(lo), g.left - 4, g.top + g.bearings - 6);
    ctx.fillText(`+${limit}°`, g.left - 4, resTop + 6);
    ctx.fillText("0°", g.left - 4, yR(0));
    ctx.fillText(`−${limit}°`, g.left - 4, resTop + g.residuals - 6);
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText(formatTime(span[0], this.settings), g.left, resTop + g.residuals + 3);
    ctx.textAlign = "right";
    ctx.fillText(formatTime(span[1], this.settings), g.left + g.plotWidth, resTop + g.residuals + 3);
    ctx.textAlign = "left";
    ctx.fillText("Residual", g.left + 4, resTop + 2);
    // Legs: a dashed line where each later leg starts.
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = muted;
    for (const start of solution?.leg_starts ?? []) {
      const lx = Math.round(x(Date.parse(start))) + 0.5;
      ctx.beginPath();
      ctx.moveTo(lx, g.top);
      ctx.lineTo(lx, resTop + g.residuals);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // The calculated bearings: the solution's line.
    ctx.strokeStyle = lineColour;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let pen = false;
    let last: number | undefined;
    for (const r of rows) {
      if (r.calculated === undefined || r.calculated === null) {
        pen = false;
        continue;
      }
      const px = x(Date.parse(r.time));
      const py = yB(r.calculated);
      if (pen && last !== undefined && Math.abs(py - last) > g.bearings / 2) pen = false;
      if (pen) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
      pen = true;
      last = py;
    }
    ctx.stroke();
    // Measured bearings and residuals: dots in the cut's colour; the nearer of an unresolved
    // pair a ring; one left out a dotted ring in the quiet colour.
    const dot = (px: number, py: number, row: TmaResidualRow) => {
      const colour = row.colour ?? fg;
      ctx.beginPath();
      ctx.arc(px, py, 2.4, 0, Math.PI * 2);
      if (row.excluded) {
        ctx.setLineDash([1.5, 1.5]);
        ctx.strokeStyle = muted;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (row.nearer_side) {
        ctx.strokeStyle = colour;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      } else {
        ctx.fillStyle = colour;
        ctx.fill();
      }
    };
    for (const r of rows) {
      if (r.measured === undefined || r.measured === null) continue;
      const px = x(Date.parse(r.time));
      dot(px, yB(r.measured), r);
      if (r.residual !== undefined && r.residual !== null) dot(px, Math.max(resTop + 1, Math.min(resTop + g.residuals - 1, yR(r.residual))), r);
    }
    // Current time, and the cut chosen.
    if (this.current !== undefined && this.current >= span[0] && this.current <= span[1]) {
      const cx = Math.round(x(this.current)) + 0.5;
      ctx.strokeStyle = focus;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, g.top);
      ctx.lineTo(cx, resTop + g.residuals);
      ctx.stroke();
    }
    const chosen = rows[this.active];
    if (chosen && chosen.measured !== undefined && chosen.measured !== null) {
      const px = x(Date.parse(chosen.time));
      ctx.strokeStyle = focus;
      ctx.lineWidth = 1.5;
      for (const py of [yB(chosen.measured), chosen.residual !== undefined && chosen.residual !== null ? yR(chosen.residual) : undefined]) {
        if (py === undefined) continue;
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    this.canvas.setAttribute(
      "aria-label",
      `Bearings and residuals of ${solution?.name ?? "the solution"} over time: ${describeRms(report, this.settings)}. The list below gives each cut's residual.`,
    );
  }
}
