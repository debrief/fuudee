/**
 * The Bearings view's plot as legacy Debrief's Bearing Residuals (Stacked Dots) laid it out
 * (product owner, 25 Oct 2026), free of the DOM so it can be tested:
 *
 * - Time is vertical, on the left, increasing upward (the latest at the top), and the panes
 *   stand side by side sharing it: Bearing, Error and Course/Speed, each value axis
 *   horizontal, increasing to the right. Which panes show is the analyst's, at least one.
 * - The time span is the sensors' whole coverage shown on the map: every measured bearing,
 *   the calculated bearings and errors only where the solution is.
 * - The Error axis fits its dots every frame, as legacy's auto-resize did; held, it stays
 *   put but widens to take in a dot outside it. No dot is ever drawn at an edge it is not at.
 * - The Error pane is green while every error counted is within the analyst's cut-off,
 *   pink otherwise, as legacy shaded it; a word and a mark say so too.
 * - A box dragged zooms; double-click or Reset undoes it; a zoom stays while dragging.
 */
import { DEFAULT_SETTINGS, fixed, formatTime, type FormatSettings } from "@debrief/kernel";
import type { TmaCut, TmaResidualRow } from "@debrief/schemas";
import type { LonLat } from "./geodesic.js";
import { wrap } from "./tma.js";

export type Pane = "bearing" | "error" | "course";
/** The panes, left to right, as legacy laid them out. */
export const PANES: readonly Pane[] = ["bearing", "error", "course"];
export type PanesShown = Record<Pane, boolean>;
/**
 * Bearing and Error by default; Course/Speed off (product owner, 25 Oct 2026, the default
 * left to engineering): the view is a column 270 to 380 px wide beside the map, or VS Code's
 * side bar, where two panes keep about 120 px each to read dots in and three would leave 80.
 */
export const DEFAULT_PANES: PanesShown = { bearing: true, error: true, course: false };
export const PANE_NAMES: Record<Pane, string> = { bearing: "Bearing", error: "Error", course: "Course/Speed" };

/** The panes remembered, if they are panes and one at least is shown; else the default. */
export function readPanes(raw: unknown): PanesShown {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PANES };
  const r = raw as Record<string, unknown>;
  if (!PANES.every((p) => typeof r[p] === "boolean")) return { ...DEFAULT_PANES };
  const shown = { bearing: r.bearing, error: r.error, course: r.course } as PanesShown;
  return PANES.some((p) => shown[p]) ? shown : { ...DEFAULT_PANES };
}

/** A pane shown or hidden: never the last one shown. */
export function togglePane(shown: PanesShown, pane: Pane): PanesShown {
  const next = { ...shown, [pane]: !shown[pane] };
  return PANES.some((p) => next[p]) ? next : shown;
}

/**
 * The panes drawn: those shown, but with a sensor's coverage and no solution (product owner, 27
 * Oct 2026) no Error pane, which needs a solution; Bearing then if nothing else is left.
 */
export function panesDrawn(shown: PanesShown, solution: boolean): Pane[] {
  const panes = PANES.filter((p) => shown[p] && (solution || p !== "error"));
  return panes.length ? panes : ["bearing"];
}

export type Range = [number, number];

// --- Mapping -------------------------------------------------------------------------------

/** Where a time is drawn: the span's start at the bottom, its end at the top. */
export function timeToY(t: number, span: Range, top: number, height: number): number {
  return top + height - ((t - span[0]) / (span[1] - span[0] || 1)) * height;
}

/** The time drawn at a height. */
export function yToTime(y: number, span: Range, top: number, height: number): number {
  return span[0] + ((top + height - y) / (height || 1)) * (span[1] - span[0]);
}

/** Where a value is drawn across a pane: its axis's low end on the left. */
export function valueToX(v: number, range: Range, left: number, width: number): number {
  return left + ((v - range[0]) / (range[1] - range[0] || 1)) * width;
}

/** The value drawn across a pane at x. */
export function xToValue(x: number, range: Range, left: number, width: number): number {
  return range[0] + ((x - left) / (width || 1)) * (range[1] - range[0]);
}

// --- The time span ----------------------------------------------------------------------

/**
 * The period plotted: the sensors' whole coverage shown on the map, and the solution's
 * rooted cuts and period, together (product owner, 25 Oct 2026). A minute either side of a
 * single time, so it has a height.
 */
export function coverageSpan(...lists: (ArrayLike<number> | Range | undefined)[]): Range | undefined {
  let lo = Infinity;
  let hi = -Infinity;
  for (const list of lists) {
    if (!list) continue;
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (!Number.isFinite(t)) continue;
      if (t < lo) lo = t;
      if (t > hi) hi = t;
    }
  }
  if (lo === Infinity) return undefined;
  if (hi - lo < 1000) return [lo - 60000, hi + 60000];
  return [lo, hi];
}

// --- The axes ----------------------------------------------------------------------------

/**
 * A value axis fitted to what it shows, as legacy's charts fitted theirs (JFreeChart's auto
 * range): zero included where asked, a margin of 5% either side, never narrower than least.
 */
export function fitRange(lo: number, hi: number, { includeZero = false, least = 0.2, margin = 0.05 } = {}): Range {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [-least, least];
  if (includeZero) {
    lo = Math.min(0, lo);
    hi = Math.max(0, hi);
  }
  if (hi - lo < least) {
    const middle = (lo + hi) / 2;
    lo = middle - least / 2;
    hi = middle + least / 2;
    if (includeZero && lo > 0) [lo, hi] = [0, least];
    if (includeZero && hi < 0) [lo, hi] = [-least, 0];
  }
  const pad = (hi - lo) * margin;
  return [lo - pad, hi + pad];
}

/** The least and most of the errors drawn in a period: residuals and an unresolved pair's other, of cuts shown on the map. */
export function errorExtent(rows: readonly TmaResidualRow[], times: ArrayLike<number>, span?: Range): { lo: number; hi: number } | undefined {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    // The errors counted only (product owner, 25 Oct 2026): an unresolved pair's other bearing,
    // and a cut left out, are drawn where they fall inside the axis, never fitted to.
    if (r.hidden || r.excluded || r.residual === undefined || r.residual === null) continue;
    if (span && (times[i] < span[0] || times[i] > span[1])) continue;
    if (r.residual < lo) lo = r.residual;
    if (r.residual > hi) hi = r.residual;
  }
  return lo === Infinity ? undefined : { lo, hi };
}

/** How many of the errors drawn but not counted (an unresolved pair's other bearing; a cut left out) fall outside the Error axis, in a period. */
export function offScale(rows: readonly TmaResidualRow[], times: ArrayLike<number>, range: Range, span?: Range): { others: number; leftOut: number } {
  let others = 0;
  let leftOut = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.hidden) continue;
    if (span && (times[i] < span[0] || times[i] > span[1])) continue;
    if (r.other_residual !== undefined && r.other_residual !== null && !inside(r.other_residual, range)) others++;
    if (r.excluded && r.residual !== undefined && r.residual !== null && !inside(r.residual, range)) leftOut++;
  }
  return { others, leftOut };
}

/** The note beside the cue when some errors drawn but not counted are off the axis: "3 other bearings off scale". */
export function describeOffScale(off: { others: number; leftOut: number }): string {
  const parts = [];
  if (off.others) parts.push(`${off.others.toLocaleString("en-GB")} other ${off.others === 1 ? "bearing" : "bearings"}`);
  if (off.leftOut) parts.push(`${off.leftOut.toLocaleString("en-GB")} left out`);
  return parts.length ? `${parts.join(" and ")} off scale` : "";
}

/** The Error axis as legacy fitted it: about the errors drawn, zero included. */
export function fitErrors(extent: { lo: number; hi: number } | undefined): Range {
  return extent ? fitRange(extent.lo, extent.hi, { includeZero: true, least: 0.2 }) : [-1, 1];
}

/**
 * A held axis that takes in what falls outside it (product owner, 25 Oct 2026): unchanged
 * while every value is inside, widened on that side, with a margin, when one is not. Never a
 * dot pinned at an edge it is not at.
 */
export function widen(held: Range, extent: { lo: number; hi: number } | undefined, margin = 0.05): Range {
  if (!extent) return held;
  let [lo, hi] = held;
  const pad = Math.max(hi - lo, extent.hi - extent.lo) * margin;
  if (extent.lo < lo) lo = extent.lo - pad;
  if (extent.hi > hi) hi = extent.hi + pad;
  return lo === held[0] && hi === held[1] ? held : [lo, hi];
}

/** Whether a value is drawn inside an axis's range (to a hair). */
export const inside = (v: number, range: Range) => v >= range[0] - 1e-9 && v <= range[1] + 1e-9;

/** Ticks for a value axis: round numbers, about count of them. */
export function niceTicks(lo: number, hi: number, count: number): number[] {
  if (!(hi > lo) || count < 1) return [];
  const raw = (hi - lo) / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? 10 * power;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : Number(v.toPrecision(12)));
  return out;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const TIME_STEPS = [1, 2, 5, 10, 15, 30].map((s) => s * SECOND).concat([1, 2, 5, 10, 15, 30].map((m) => m * MINUTE), [1, 2, 3, 6, 12, 24].map((h) => h * HOUR));

/** Ticks for the time axis: whole seconds, minutes or hours, at most count of them. */
export function timeTicks(t0: number, t1: number, count: number): number[] {
  if (!(t1 > t0) || count < 1) return [];
  const step = TIME_STEPS.find((s) => (t1 - t0) / s <= count) ?? Math.ceil((t1 - t0) / count / (24 * HOUR)) * 24 * HOUR;
  const out: number[] = [];
  for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) out.push(t);
  return out;
}

/** A time tick as the axis writes it: hours and minutes, seconds where the ticks need them ("09:30Z", "09:30:15Z"). */
export function tickTime(t: number, withSeconds: boolean, settings: FormatSettings = DEFAULT_SETTINGS): string {
  // The time as the formatting service writes it, in the analyst's zone, its seconds left off where not needed.
  const text = formatTime(t, { ...settings, time_style: "time", show_milliseconds: false });
  return withSeconds ? text : text.replace(/(\d\d:\d\d):\d\d/, "$1");
}

// --- The cut-off --------------------------------------------------------------------------

export interface Cue {
  /** Within: every error counted is within the cut-off; beyond: one is not; none: none is counted. */
  state: "within" | "beyond" | "none";
  /** The largest error counted, signed. */
  largest?: number;
  /** How many errors are counted, and how many of them are beyond the cut-off. */
  counted?: number;
  beyond?: number;
  cutOff: number;
}

/**
 * Green or pink, as legacy shaded the Error pane (StackedDotHelper.calculateErrorShadeFor):
 * the largest error counted against the cut-off, and how many are beyond it (product owner,
 * 25 Oct 2026). Counted as the RMS counts: a residual, of a cut shown on the map, not left out.
 * An unresolved pair's other bearing is never counted, a deliberate departure from legacy, which
 * counted it (its ambiguous error series was in the shaded plot).
 */
export function errorCue(rows: readonly TmaResidualRow[], cutOff: number): Cue {
  let largest: number | undefined;
  let counted = 0;
  let beyond = 0;
  for (const r of rows) {
    if (r.residual === undefined || r.residual === null || r.excluded || r.hidden) continue;
    counted++;
    if (Math.abs(r.residual) > cutOff) beyond++;
    if (largest === undefined || Math.abs(r.residual) > Math.abs(largest)) largest = r.residual;
  }
  if (largest === undefined) return { state: "none", cutOff };
  return { state: Math.abs(largest) <= cutOff ? "within" : "beyond", largest, counted, beyond, cutOff };
}

/** The cue in words, beside its mark, so colour is never all that says it. */
export function describeCue(cue: Cue, settings: FormatSettings = DEFAULT_SETTINGS): string {
  const limit = `${fixed(cue.cutOff, Math.max(1, settings.angle_decimals))}°`;
  if (cue.state === "none") return `No errors to hold to the ${limit} cut-off`;
  if (cue.state === "within") return `Every error within ${limit}`;
  const largest = `${fixed(Math.abs(cue.largest!), settings.angle_decimals)}°`;
  return `${(cue.beyond ?? 0).toLocaleString("en-GB")} of ${(cue.counted ?? 0).toLocaleString("en-GB")} beyond ${limit}, the largest ${largest}`;
}

/** The theme's colours for the cue: VS Code's shades for lines added and removed, its passed and failed colours. */
export interface CueTokens {
  within: string;
  beyond: string;
  withinEdge: string;
  beyondEdge: string;
  highContrast: boolean;
}

/**
 * How the Error pane shows the cue in a theme: shaded green or pink as VS Code shades lines
 * added and removed; where the theme has no such shade (a high-contrast theme), or is high
 * contrast, a border in its passed or failed colour as well. Never colour alone: the words too.
 */
export function cueStyle(state: Cue["state"], tokens: CueTokens): { fill?: string; edge?: string } {
  if (state === "none") return {};
  const fill = (state === "within" ? tokens.within : tokens.beyond) || undefined;
  const edge = !fill || tokens.highContrast ? (state === "within" ? tokens.withinEdge : tokens.beyondEdge) || undefined : undefined;
  return { ...(fill && { fill }), ...(edge && { edge }) };
}

/** The mark beside the words: a tick within, a cross beyond. */
export const cueMark = (cue: Cue): string => (cue.state === "within" ? "✓" : cue.state === "beyond" ? "✗" : "–");

// --- Zoom ---------------------------------------------------------------------------------

/** What is zoomed: the time shared by every pane, and each pane's values. */
export interface Zoom {
  time?: Range;
  values: Partial<Record<Pane, Range>>;
}

export const noZoom = (): Zoom => ({ values: {} });
export const isZoomed = (zoom: Zoom): boolean => !!zoom.time || Object.keys(zoom.values).length > 0;

const ordered = (a: number, b: number): Range => (a <= b ? [a, b] : [b, a]);

/** A box dragged in a pane: time to its height, that pane's values to its width. */
/**
 * The controls beside the plot, not above it, only where above it they would leave the plot's
 * panes under this height (product owner, 26 Oct 2026: on top at any size otherwise). 220 px is
 * about 60 cuts at a dot's 3.5 px pitch, the least the panel's review held readable (the VS Code
 * suite holds 200 px); VS Code's default bottom panel left 126 px with them on top (1440 × 900).
 */
export const SIDE_ENTER_PX = 220;
/** Back on top only once that leaves more than this: 30 px of hysteresis, about a toolbar row re-wrapping, so a resize never flickers between the two. */
export const SIDE_LEAVE_PX = 250;
/** The plot's own margins above and below its panes (drawPlot's top and bottom). */
export const PLOT_MARGINS_PX = 34;

/**
 * Whether the controls go beside the plot: from the height the view has and what the controls
 * took on top (measured when last there), and where they are now (the hysteresis). Nothing
 * measured yet, or no height: on top, the default, so the first layout is always on top and
 * measured there.
 */
export function controlsBeside(beside: boolean, available: number, chromeAbove: number): boolean {
  if (!(chromeAbove > 0) || !(available > 0)) return false;
  const onTop = available - chromeAbove - PLOT_MARGINS_PX;
  return beside ? onTop <= SIDE_LEAVE_PX : onTop < SIDE_ENTER_PX;
}

/** The least time a zoom shows: ten seconds, a few cuts at the usual rates. */
export const LEAST_SPAN_MS = 10_000;

/** A time range at least LEAST_SPAN_MS long, widened about its middle. */
const leastSpan = (r: Range): Range => {
  if (r[1] - r[0] >= LEAST_SPAN_MS) return r;
  const middle = (r[0] + r[1]) / 2;
  return [middle - LEAST_SPAN_MS / 2, middle + LEAST_SPAN_MS / 2];
};

export function zoomBox(zoom: Zoom, pane: Pane, times: Range, values: Range): Zoom {
  return { time: leastSpan(ordered(...times)), values: { ...zoom.values, [pane]: ordered(...values) } };
}

/** Time zoomed in (factor below 1) or out about a time; out past the whole span, unzoomed. */
export function zoomTime(zoom: Zoom, shown: Range, whole: Range, factor: number, about?: number): Zoom {
  const half = Math.max(LEAST_SPAN_MS / 2, ((shown[1] - shown[0]) / 2) * factor);
  if (half * 2 >= whole[1] - whole[0]) {
    const { time: _time, ...rest } = zoom;
    return { ...rest, values: zoom.values };
  }
  const centre = Math.min(whole[1] - half, Math.max(whole[0] + half, about ?? (shown[0] + shown[1]) / 2));
  return { ...zoom, time: [centre - half, centre + half] };
}

/** Time moved along by a share of what is shown (positive: later), within the whole span. */
export function panTime(zoom: Zoom, whole: Range, share: number): Zoom {
  if (!zoom.time) return zoom;
  const width = zoom.time[1] - zoom.time[0];
  const start = Math.min(whole[1] - width, Math.max(whole[0], zoom.time[0] + width * share));
  return { ...zoom, time: [start, start + width] };
}

/** A pane's values zoomed in or out about their middle. */
export function zoomValues(zoom: Zoom, pane: Pane, shown: Range, factor: number): Zoom {
  const middle = (shown[0] + shown[1]) / 2;
  const half = ((shown[1] - shown[0]) / 2) * factor;
  return { ...zoom, values: { ...zoom.values, [pane]: [middle - half, middle + half] } };
}

// --- Pointing -----------------------------------------------------------------------------

/** The nearest of the points to (px, py) within radius pixels, by index; -1 if none. */
export function nearestPoint(xs: ArrayLike<number>, ys: ArrayLike<number>, px: number, py: number, radius: number): number {
  let best = -1;
  let gap = radius * radius;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - px;
    const dy = ys[i] - py;
    const d = dx * dx + dy * dy;
    if (d <= gap) {
      gap = d;
      best = i;
    }
  }
  return best;
}

// --- Course and speed -----------------------------------------------------------------------

/**
 * A solution's course and speed at each fix as its DR legs give them (product owner, 25 Oct
 * 2026): from each fix to the next, the last fix keeping the one before's. Metres a second.
 */
export function legCourses(coordinates: readonly LonLat[], times: ArrayLike<number>): { courses: number[]; speeds: number[] } {
  const courses: number[] = [];
  const speeds: number[] = [];
  for (let i = 0; i + 1 < coordinates.length; i++) {
    // Fixes sharing a time: from this fix to the next at a later time (the first fixes too), else the leg before's.
    let j = i + 1;
    while (j < coordinates.length && times[j] - times[i] <= 0) j++;
    if (j < coordinates.length) {
      const { course, metresPerSecond } = localCourse(coordinates[i], coordinates[j], (times[j] - times[i]) / 1000);
      courses.push(course);
      speeds.push(metresPerSecond);
    } else {
      courses.push(i > 0 ? courses[i - 1] : 0);
      speeds.push(i > 0 ? speeds[i - 1] : 0);
    }
  }
  if (coordinates.length) {
    courses.push(courses.length ? courses[courses.length - 1] : 0);
    speeds.push(speeds.length ? speeds[speeds.length - 1] : 0);
  }
  return { courses, speeds };
}

const RAD = Math.PI / 180;
/** WGS84: the equatorial radius, metres, and the first eccentricity squared. */
const WGS84_A = 6378137;
const WGS84_E2 = 0.00669437999014;

/**
 * The course and speed from a to b on the WGS84 ellipsoid, locally: the radii of curvature in the
 * meridian (M) and the prime vertical (N) at the leg's middle latitude, so north and east are
 * metres. Drawn while a drag goes on, a frame at a time, where the ellipsoid's geodesic
 * (tma.courseSpeed, geographiclib) would cost a third of a frame's budget at 2,000 fixes. The
 * course is the middle's less half the meridians' convergence, so the course from a. Against
 * geographiclib (stackeddots.test.ts): within 0.0001° and 0.0001% for legs to 10 km at latitudes
 * to 70°; the worst case measured there, a 20 km leg at 75°, 0.0002° and 0.0006%. The pane draws
 * the track's own courses and speeds again once the drag is saved.
 */
export function localCourse(a: LonLat, b: LonLat, seconds: number): { course: number; metresPerSecond: number } {
  const phi = ((a[1] + b[1]) / 2) * RAD;
  const s = Math.sin(phi);
  const w = 1 - WGS84_E2 * s * s;
  const m = (WGS84_A * (1 - WGS84_E2)) / (w * Math.sqrt(w));
  const n = WGS84_A / Math.sqrt(w);
  const north = (b[1] - a[1]) * RAD * m;
  const east = wrap(b[0] - a[0]) * RAD * n * Math.cos(phi);
  // The course at the leg's middle, less half the meridians' convergence over it: the course from a, as the geodesic's.
  const course = (((Math.atan2(east, north) - (wrap(b[0] - a[0]) * RAD * s) / 2) / RAD) % 360 + 360) % 360;
  const metres = Math.hypot(north, east);
  return { course, metresPerSecond: seconds > 0 ? metres / seconds : 0 };
}

/** An angle as near a reference as it goes round: so a course through north stays one line. */
export const about = (v: number, reference: number): number => reference + wrap(v - reference);

// --- Select bearings: a box in the Bearing pane keeps the sides boxed ------------------------

/** One dot of a resolvable cut as the Bearing pane draws it: the bearing it is, and which of the cut's two. */
export interface BearingMarker {
  id: string;
  /** Its time, ms. */
  time: number;
  /** The bearing drawn, degrees true. */
  value: number;
  /** Which of the cut's bearings the dot is. */
  keep: "bearing" | "ambiguous_bearing";
  /** Which the cut keeps now, if resolved. */
  resolved?: "bearing" | "ambiguous_bearing" | null;
  /** The side of the host's course its first bearing is on, where told. */
  side?: "port" | "starboard" | null;
}

/**
 * The dots of resolvable cuts as the Bearing pane draws them, for a box to take (product owner, 28
 * Oct 2026): of the sensors' coverage, an unresolved pair's two and a resolved cut's kept one; of a
 * solution's rooted cuts, the bearing measured (the kept one, if resolved) and, where measured by the
 * nearer of two, its other. Never a hidden cut's, nor one never ambiguous (one bearing only, as a bow
 * sonar's): a box leaves those alone.
 */
export function bearingMarkersOf(coverage: { rows: readonly TmaCut[]; times: ArrayLike<number> }, rooted?: { rows: readonly TmaResidualRow[]; times: ArrayLike<number> }): BearingMarker[] {
  const out: BearingMarker[] = [];
  const has = (v: number | null | undefined): v is number => v !== undefined && v !== null;
  coverage.rows.forEach((c, i) => {
    if (c.hidden || !has(c.ambiguous_bearing)) return;
    const base = { id: c.id, time: coverage.times[i], resolved: c.resolved, side: c.side };
    if (!c.resolved || c.resolved === "bearing") out.push({ ...base, value: c.bearing, keep: "bearing" });
    if (!c.resolved || c.resolved === "ambiguous_bearing") out.push({ ...base, value: c.ambiguous_bearing, keep: "ambiguous_bearing" });
  });
  rooted?.rows.forEach((r, i) => {
    if (r.hidden || !has(r.ambiguous_bearing)) return;
    const base = { id: r.id, time: rooted.times[i], resolved: r.resolved, side: r.side };
    const kept = has(r.measured) ? (r.used ?? "bearing") : r.resolved === "ambiguous_bearing" ? "ambiguous_bearing" : "bearing";
    out.push({ ...base, value: has(r.measured) ? r.measured : kept === "bearing" ? r.bearing : r.ambiguous_bearing, keep: kept });
    // The other of an unresolved pair, drawn faint beside the one measured.
    if (r.nearer_side) out.push({ ...base, value: kept === "bearing" ? r.ambiguous_bearing : r.bearing, keep: kept === "bearing" ? "ambiguous_bearing" : "bearing" });
  });
  return out;
}

/** What a box takes in: the cuts to keep on their first bearing and on their twin, those resolved to make ambiguous again, and those boxed on both sides. */
export interface Boxed {
  first: string[];
  other: string[];
  /** Resolved cuts whose kept dot was boxed: made ambiguous again (product owner, 28 Oct 2026). */
  clear: string[];
  both: string[];
  /** Of the cuts that change, how many end on each side, where told. */
  sides: { port: number; starboard: number; untold: number };
}

/**
 * The cuts a box drawn in the Bearing pane takes in, with Select bearings on (product owner, 28 Oct
 * 2026), each toggled: an unresolved cut with a dot inside it keeps the bearing of the dot boxed; a
 * resolved cut whose kept dot is inside is made ambiguous again; an unresolved cut with dots inside on
 * both sides is left as it is. Only the dots drawn are given (an unresolved pair's two, a resolved
 * cut's one; a cut never ambiguous and a hidden cut none), so only what the analyst sees is boxed.
 * The box's values are the pane's, unwrapped about its reference, as the dots are drawn.
 */
export function boxedSides(markers: Iterable<BearingMarker>, times: Range, values: Range, reference: number): Boxed {
  const [t0, t1] = times[0] <= times[1] ? times : [times[1], times[0]];
  const [v0, v1] = values[0] <= values[1] ? values : [values[1], values[0]];
  const boxed = new Map<string, { marker: BearingMarker; keeps: Set<string> }>();
  for (const m of markers) {
    if (m.time < t0 || m.time > t1) continue;
    const v = about(m.value, reference);
    if (v < v0 || v > v1) continue;
    const seen = boxed.get(m.id);
    if (seen) seen.keeps.add(m.keep);
    else boxed.set(m.id, { marker: m, keeps: new Set([m.keep]) });
  }
  const out: Boxed = { first: [], other: [], clear: [], both: [], sides: { port: 0, starboard: 0, untold: 0 } };
  const flip = { port: "starboard", starboard: "port" } as const;
  for (const [id, { marker, keeps }] of boxed) {
    if (keeps.size > 1) {
      out.both.push(id);
      continue;
    }
    const keep = keeps.values().next().value as BearingMarker["keep"];
    if (marker.resolved) {
      // A resolved cut draws only its kept dot: boxed, it is made ambiguous again.
      out.clear.push(id);
      continue;
    }
    (keep === "bearing" ? out.first : out.other).push(id);
    const side = marker.side ? (keep === "bearing" ? marker.side : flip[marker.side]) : undefined;
    if (side) out.sides[side]++;
    else out.sides.untold++;
  }
  return out;
}

/** The step a box asks for (debrief/resolve_ambiguity's request): none when nothing would change. */
export function boxResolution(boxed: Boxed): { keep: "bearing"; cut_ids: string[]; other_cut_ids: string[]; clear_cut_ids: string[] } | undefined {
  if (!boxed.first.length && !boxed.other.length && !boxed.clear.length) return undefined;
  return { keep: "bearing", cut_ids: [...boxed.first, ...boxed.both], other_cut_ids: [...boxed.other, ...boxed.both], clear_cut_ids: [...boxed.clear] };
}

/** What a box did, or why it did nothing, in words for the status line. */
export function describeBoxed(boxed: Boxed): string {
  const count = (n: number) => `${n.toLocaleString("en-GB")} cut${n === 1 ? "" : "s"}`;
  const kept = boxed.first.length + boxed.other.length;
  const cleared = boxed.clear.length;
  const { port, starboard, untold } = boxed.sides;
  const after = boxed.both.length ? ` ${count(boxed.both.length)} boxed on both sides, left as ${boxed.both.length === 1 ? "it was" : "they were"}.` : "";
  if (!kept && !cleared) return boxed.both.length ? `Nothing to change:${after}` : "Nothing to change: no ambiguous or resolved cut's dot in the box.";
  const to = port && !starboard && !untold ? "to port" : starboard && !port && !untold ? "to starboard" : "to the sides boxed";
  const did = !cleared ? `Kept ${count(kept)} ${to}` : !kept ? `Made ${count(cleared)} ambiguous again` : `Kept ${count(kept)} ${to} and made ${cleared.toLocaleString("en-GB")} ambiguous again`;
  return `${did}, one step (Ctrl+Z undoes it).${after}`;
}

// --- Course and speed of ownship and the target -------------------------------------------

/** One line of the Course/Speed pane's: a track's courses and speeds over time, in its colour. */
export interface CourseSeries {
  id: string;
  name: string;
  colour: string;
  /** Ownship (the sensor's host) or the target (the solution's DR legs). */
  role: "ownship" | "target";
  times: ArrayLike<number>;
  courses?: ArrayLike<number>;
  /** Metres a second. */
  speeds?: ArrayLike<number>;
  /** Drawn with a marker at each fix as well: its colour too near another line's to tell them apart by colour alone. */
  marked: boolean;
}

/** How far apart two colours look, roughly (the "redmean" distance, 0 to about 765). */
export function colourDistance(a: string, b: string): number {
  const channels = (c: string) => {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c);
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [128, 128, 128];
  };
  const [r1, g1, b1] = channels(a);
  const [r2, g2, b2] = channels(b);
  const r = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt((2 + r / 256) * dr * dr + 4 * dg * dg + (2 + (255 - r) / 256) * db * db);
}

/** Below this, two lines' colours are too near to tell apart: the target's is marked at each fix too. */
export const NEAR_COLOURS = 120;

/**
 * The Course/Speed pane's lines (product owner, 28 Oct 2026): ownship's (each sensor host's logged
 * course and speed, or as its fixes imply), always; the target's (the solution's DR legs), when a
 * solution is shown. Each in its track's colour; course solid, speed dashed; the target marked at its
 * fixes where its colour is too near ownship's.
 */
export function courseSeries(
  ownship: readonly { id: string; name: string; colour?: string | null; times: ArrayLike<number>; courses: ArrayLike<number>; speeds?: ArrayLike<number> | null }[],
  target: { id: string; name: string; colour?: string | null; times: ArrayLike<number>; courses?: ArrayLike<number>; speeds?: ArrayLike<number> } | undefined,
  fallback: string,
): CourseSeries[] {
  const out: CourseSeries[] = ownship.map((o) => ({ id: o.id, name: o.name, colour: o.colour ?? fallback, role: "ownship", times: o.times, courses: o.courses, ...(o.speeds && { speeds: o.speeds }), marked: false }));
  if (target && (target.courses || target.speeds)) {
    const colour = target.colour ?? fallback;
    out.push({ ...target, colour, role: "target", marked: out.some((o) => colourDistance(o.colour, colour) < NEAR_COLOURS) });
  }
  return out;
}

/**
 * The Course/Speed pane's axes, fitted to what is drawn in the span (product owner, 28 Oct 2026):
 * courses unwrapped about the first (as the Bearing pane's bearings are), at least 10° wide; speeds
 * from zero, in the analyst's unit, at least 1 wide. None when there is nothing to draw: the pane
 * says so instead of drawing empty axes.
 */
export function courseAxes(series: readonly CourseSeries[], span: Range, perSecond: number): { course: Range; speed: Range; reference: number } | undefined {
  let reference: number | undefined;
  let cLo = Infinity;
  let cHi = -Infinity;
  let sHi = -Infinity;
  for (const s of series) {
    for (let i = 0; i < s.times.length; i++) {
      const t = s.times[i];
      if (t < span[0] || t > span[1]) continue;
      const c = s.courses?.[i];
      if (c !== undefined && c !== null && Number.isFinite(c)) {
        if (reference === undefined) reference = c;
        const u = about(c, reference);
        if (u < cLo) cLo = u;
        if (u > cHi) cHi = u;
      }
      const v = s.speeds?.[i];
      if (v !== undefined && v !== null && Number.isFinite(v) && v * perSecond > sHi) sHi = v * perSecond;
    }
  }
  if (reference === undefined && sHi === -Infinity) return undefined;
  const ref = reference ?? 0;
  return {
    reference: ref,
    course: cLo === Infinity ? [ref - 10, ref + 10] : fitRange(cLo, cHi, { least: 10, margin: 0.06 }),
    speed: fitRange(0, Math.max(0, sHi), { includeZero: true, least: 1, margin: 0.08 }),
  };
}

/** A tick's label on an axis of these ticks: as many decimals as their step needs. */
export function tickLabel(v: number, ticks: readonly number[]): string {
  const step = ticks.length > 1 ? Math.abs(ticks[1] - ticks[0]) : 1;
  const decimals = step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step) - 1e-9));
  return fixed(v, decimals);
}
