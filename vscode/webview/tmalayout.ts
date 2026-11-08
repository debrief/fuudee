/**
 * Where the Bearings plot (tmacontrol.ts) puts everything, worked out without a canvas: the
 * panes side by side and their boxes, the span of time up the left and its ticks, each pane's
 * axis (the Bearing axis kept while a drag goes on, the Error axis fitted or held, the
 * Course/Speed pane's courses and speeds), a zoom over each, and the cut-off's cue. TmaControl
 * draws what this returns and keeps what it says to keep (the axes frozen for a drag, the held
 * Error axis). Split out of TmaControl.drawPlot (review, 7 Nov 2026, finding 10) so the layout
 * is unit-tested; nothing in it changed.
 */
import type { TmaCut, TmaResidualRow, TmaSolutionRow } from "@debrief/schemas";
import { legCourses, type LonLat } from "@debrief/kernel";
import {
  about,
  courseAxes,
  courseSeries,
  type CourseSeries,
  type Cue,
  errorCue,
  errorExtent,
  fitErrors,
  fitRange,
  offScale,
  type Pane,
  panesDrawn,
  type PanesShown,
  type Range,
  timeTicks,
  widen,
  type Zoom,
} from "./stackeddots.js";

/** Where each pane was drawn, and its axis: for pointing at it. */
export interface PlotLayout {
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

/** What the Course/Speed pane draws, for the tests: each line, and its least and most in the span. */
export interface CourseShown {
  nothing: boolean;
  series: { id: string; name: string; colour: string; role: string; marked: boolean; courses?: [number, number]; speeds?: [number, number] }[];
}

export interface PlotInput {
  /** A solution shown (its rooted rows, an Error pane), or a sensor's cuts (coverage only). */
  mode: "solution" | "cuts";
  /** The plot's box, CSS pixels. */
  width: number;
  height: number;
  /** The widest time label, pixels. */
  label: number;
  panes: PanesShown;
  /** The solution's rooted cuts and their times (none with a sensor shown). */
  rows: readonly TmaResidualRow[];
  times: ArrayLike<number>;
  /** The cuts drawn beside the rows, their times, and the whole span plotted. */
  coverage: { rows: readonly TmaCut[]; times: ArrayLike<number>; whole: Range };
  zoom: Zoom;
  /** A drag on the map goes on: the Bearing axis is kept as the drag found it. */
  live: boolean;
  frozen?: { bearing: Range; reference: number };
  /** Hold scale, and the Error axis held. */
  hold: boolean;
  heldError?: Range;
  solution?: TmaSolutionRow;
  /** The solution's fixes' times, and where a drag puts its fixes now. */
  fixTimes: number[];
  pending?: LonLat[];
  /** Ownship's courses and speeds, times parsed. */
  ownship: readonly { id: string; name: string; colour?: string | null; times: ArrayLike<number>; courses: ArrayLike<number>; speeds?: ArrayLike<number> | null }[];
  /** A line's colour when its track has none. */
  muted: string;
  /** One metre a second in the analyst's speed unit. */
  perSecond: number;
  /** The analyst's error cut-off, degrees. */
  cutOff: number;
}

export interface PlotGeometry extends PlotLayout {
  /** Where the panes start: the time labels end 4 px before it. */
  left: number;
  /** Each pane's axis, shown or not: the analyst's zoom, else fitted. */
  ranges: Record<Pane, Range>;
  /** The time ticks up the left, and whether they are seconds apart. */
  ticks: number[];
  seconds: boolean;
  /** The Bearing axis for the drag to keep, and the Error axis held: the caller keeps them. */
  frozen?: { bearing: Range; reference: number };
  heldError?: Range;
  /** The Course/Speed pane's lines; none to plot at all, said rather than drawn. */
  series: CourseSeries[];
  nothingToPlot: boolean;
  courseShown?: CourseShown;
}

/** The panes shown, side by side, sharing time up the left. */
export function layoutPanes(panes: PanesShown, solution: boolean, label: number, width: number, height: number) {
  // No Error pane without a solution (a sensor's coverage shown).
  const shown = panesDrawn(panes, solution);
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

const has = (v: number | null | undefined): v is number => v !== undefined && v !== null;

/** An unresolved pair's other bearing, drawn faint: the one not used. */
export const otherOf = (r: TmaResidualRow) => (r.nearer_side && has(r.ambiguous_bearing) ? (r.used === "ambiguous_bearing" ? r.bearing : r.ambiguous_bearing) : undefined);

/** Where the plot puts everything, and the axes to keep. */
export function plotGeometry(input: PlotInput): PlotGeometry {
  const { rows, times, coverage, zoom, solution } = input;
  const span: Range = zoom.time ?? coverage.whole;
  const layout = layoutPanes(input.panes, input.mode === "solution", input.label, input.width, input.height);
  const { top, height } = layout;
  const inSpan = (t: number) => t >= span[0] && t <= span[1];

  // --- The axes: Bearing kept while a drag goes on, Error fitted every frame (or held), Course fitted.
  let reference = input.frozen?.reference;
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
  let frozen = input.frozen;
  if (input.live) {
    // Kept as the drag found it, widened (never clamped) if the calculated bearings leave it.
    frozen = frozen ? { reference: ref, bearing: widen(frozen.bearing, bearingExtent) } : { reference: ref, bearing: bearingRange };
    bearingRange = frozen.bearing;
  }
  const errorFound = errorExtent(rows, times, span);
  let errorRange = fitErrors(errorFound);
  let heldError = input.heldError;
  if (input.hold) {
    heldError = heldError ? widen(heldError, errorFound) : errorRange;
    errorRange = heldError;
  }
  // The course pane: ownship's courses, the solution's (its DR legs; worked out again from a drag's fixes), its speeds.
  let courses = solution?.courses ?? undefined;
  let speeds = solution?.speeds ?? undefined;
  if (input.live && input.pending && input.panes.course && input.pending.length === input.fixTimes.length) {
    const legs = legCourses(input.pending, input.fixTimes);
    courses = legs.courses;
    speeds = legs.speeds;
  }
  const perSecond = input.perSecond;
  // Ownship's course and speed, always; the target's (the solution's DR legs) with a solution; each in its track's colour (product owner, 28 Oct 2026).
  const series: CourseSeries[] = input.panes.course
    ? courseSeries(input.ownship, solution && (courses || speeds) ? { id: solution.id, name: solution.name, colour: solution.colour, times: input.fixTimes, courses, speeds } : undefined, input.muted)
    : [];
  const axes = input.panes.course ? courseAxes(series, span, perSecond) : undefined;
  const nothingToPlot = !!input.panes.course && !axes;
  const courseRange: Range = axes?.course ?? [0, 360];
  let speedRange: Range = axes?.speed ?? [0, 10];
  const courseRef = axes?.reference ?? 0;
  let courseShown: CourseShown | undefined;
  if (input.panes.course) {
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
    courseShown = { nothing: !axes, series: series.map((s) => ({ id: s.id, name: s.name, colour: s.colour, role: s.role, marked: s.marked, courses: extent(s, s.courses, true), speeds: extent(s, s.speeds, false) })) };
  }
  // A zoom wins over each.
  const zoomed = zoom.values;
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
  const cue: Cue = errorCue(rows as TmaResidualRow[], input.cutOff);
  const panes = layout.panes.map((p) => ({ ...p, range: ranges[p.pane] }));
  const ticks = timeTicks(span[0], span[1], Math.max(2, Math.floor(height / 30)));
  return {
    span,
    top,
    height,
    left: layout.left,
    ranges,
    panes,
    reference: ref,
    courseReference: courseRef,
    speed: speedRange,
    cue,
    off: layout.panes.some((p) => p.pane === "error") ? offScale(rows, times, ranges.error, span) : { others: 0, leftOut: 0 },
    ticks,
    seconds: ticks.length > 1 && ticks[1] - ticks[0] < 60000,
    frozen,
    heldError,
    series,
    nothingToPlot,
    courseShown,
  };
}
