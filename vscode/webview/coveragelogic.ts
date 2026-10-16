/**
 * Collation's logic shared by TypeScript (CAP-05, CAP-08, CAP-09), free of the page so it
 * is tested: the periods a track has data for, worked out as Python's debrief_stac.collation
 * does, held to the same vectors (schemas/vectors/collation.json); a platform's name as
 * collation matches it; a platform's time cut where the sources with data change; and where
 * each lies on the Coverage view's bars. What the view shows is worked out in Python: this
 * only draws it, and gives the Timeline its rows of data coverage without asking.
 */
import type { CoveragePeriod, CoveragePlatform, CoverageReport, CoverageSource, DebriefFeatureCollection, TimeRange, TrackSupply } from "@debrief/schemas";

/** A gap in the data: more than GAP_FACTOR times the median time between fixes, and more than MIN_GAP_MS. */
export const GAP_FACTOR = 10;
export const MIN_GAP_MS = 5 * 60_000;
const MIN_STEPS = 3;

export type Span = [number, number];

/** A track's name as collation matches platforms: case and runs of spaces ignored. */
export function platformKey(name: string): string {
  return name.split(/\s+/).filter(Boolean).join(" ").toLowerCase();
}

/** How long a time between fixes must be to be a gap: ten times the median step (the upper of the middle two), and more than five minutes; with fewer than three steps, none is. */
export function gapMs(times: readonly number[]): number {
  const steps: number[] = [];
  for (let i = 1; i < times.length; i++) if (times[i] > times[i - 1]) steps.push(times[i] - times[i - 1]);
  if (steps.length < MIN_STEPS) return Infinity; // no median to judge by: no gap
  steps.sort((a, b) => a - b);
  return Math.max(GAP_FACTOR * steps[Math.floor(steps.length / 2)], MIN_GAP_MS);
}

/** The periods a track has data for, from its fixes' times in order: broken at each gap. */
export function spans(times: readonly number[]): Span[] {
  if (!times.length) return [];
  const gap = gapMs(times);
  const out: Span[] = [];
  let start = times[0];
  for (let i = 1; i < times.length; i++) {
    if (times[i] - times[i - 1] > gap) {
      out.push([start, times[i - 1]]);
      start = times[i];
    }
  }
  out.push([start, times[times.length - 1]]);
  return out;
}

export interface Period {
  start: number;
  end: number;
  sources: number[];
}

/** A platform's time cut where the sources with data change, as Python's collation.periods. */
export function periods(sources: readonly (readonly Span[])[]): Period[] {
  const bounds = [...new Set(sources.flatMap((s) => s.flatMap((span) => span)))].sort((a, b) => a - b);
  const out: Period[] = [];
  for (let k = 1; k < bounds.length; k++) {
    const a = bounds[k - 1];
    const b = bounds[k];
    const covering = sources.flatMap((spans_, i) => (spans_.some(([s, e]) => s <= a && b <= e && s < e) ? [i] : []));
    if (!covering.length) continue;
    const last = out.at(-1);
    if (last && last.end === a && last.sources.join() === covering.join()) last.end = b;
    else out.push({ start: a, end: b, sources: covering });
  }
  sources.forEach((spans_, i) => {
    for (const [s, e] of spans_) {
      if (s !== e || out.some((p) => p.start <= s && s <= p.end)) continue;
      const at = sources.flatMap((other, j) => (other.some(([x, y]) => x <= s && s <= y) ? [j] : []));
      out.push({ start: s, end: s, sources: at.length ? at : [i] });
    }
  });
  return out.sort((p, q) => p.start - q.start || p.end - q.end);
}

/** A track's data coverage for the Timeline: each period it has data for, cut where the item supplying it changes. */
export interface CoveragePiece {
  start: number;
  end: number;
  /** The item supplying it, by title; undefined for the plot's own data. */
  source?: string;
  fixes: number;
}

/** Which item supplies each fix, by time: as the track's supplies say, or none (the plot's own). */
function supplierAt(supplies: readonly TrackSupply[] | null | undefined): (ms: number) => TrackSupply | undefined {
  const ranges = (supplies ?? []).map((s) => ({ s, start: Date.parse(s.start), end: Date.parse(s.end) }));
  return (ms) => ranges.find((r) => r.start <= ms && ms <= r.end)?.s;
}

/**
 * A track's coverage, piece by piece: its spans (gaps broken as everywhere), each cut where
 * the supplying item changes. The plot's own data has no source; the caller names it.
 * The supplying item is found for each fix in a short list, a few periods at most.
 */
export function coveragePieces(times: readonly string[], supplies: readonly TrackSupply[] | null | undefined): CoveragePiece[] {
  const ms = times.map((t) => Date.parse(t));
  const supplier = supplierAt(supplies);
  const out: CoveragePiece[] = [];
  // Another item's period carries the revision taken; the plot's own has none.
  const own = (s: TrackSupply | undefined) => (s?.revision ? s.title : undefined);
  for (const [start, end] of spans(ms)) {
    let piece: CoveragePiece | undefined;
    for (let i = 0; i < ms.length; i++) {
      if (ms[i] < start || ms[i] > end) continue;
      const source = own(supplier(ms[i]));
      if (piece && piece.source === source) {
        piece.end = ms[i];
        piece.fixes++;
      } else {
        piece = { start: ms[i], end: ms[i], ...(source !== undefined && { source }), fixes: 1 };
        out.push(piece);
      }
    }
  }
  return out;
}

/** The plot's own title, as collation names its data. */
export function plotTitleOf(plot: DebriefFeatureCollection, fallback = "This plot"): string {
  const details = plot.features.find((f) => f.properties.kind === "plot");
  return (details?.properties as { title?: string } | undefined)?.title ?? fallback;
}

// --- Drawing the Coverage view's bars -----------------------------------------------------

/** Where a time lies along a bar from start to end, as a fraction from 0 to 1. */
export function along(ms: number, range: { start: number; end: number }): number {
  const width = range.end - range.start;
  if (width <= 0) return 0;
  return Math.min(1, Math.max(0, (ms - range.start) / width));
}

/** The period the whole report covers, as numbers: what each bar runs over. */
export function extentOf(report: Pick<CoverageReport, "start" | "end"> | undefined): { start: number; end: number } | undefined {
  if (!report?.start || !report.end) return undefined;
  return { start: Date.parse(report.start), end: Date.parse(report.end) };
}

/** The periods in which a platform has a choice to make: more than one source has data. */
export const choices = (platform: CoveragePlatform): CoveragePeriod[] => platform.periods.filter((p) => p.sources.length > 1);

/** Periods with data none of the plot's fixes come from yet: the plot has not taken it. */
export const untaken = (platform: CoveragePlatform): CoveragePeriod[] => platform.periods.filter((p) => p.chosen === undefined || p.chosen === null);

/** How a source is known to be the platform, in words for its row. */
export function linkWords(source: CoverageSource): string {
  return { plot: "this plot", linked: "linked", proposed: "proposed: same name" }[source.link] ?? source.link;
}

/** A period as a range of times, for the message saying which source supplies it. */
export const rangeOf = (period: CoveragePeriod): TimeRange => ({ start: period.start, end: period.end });

/** The next source to offer for a period (the keyboard's way round them), after the one chosen. */
export function nextSource(period: CoveragePeriod, step: 1 | -1 = 1): number {
  const at = period.chosen === undefined || period.chosen === null ? -1 : period.sources.indexOf(period.chosen);
  const n = period.sources.length;
  return period.sources[(((at + step) % n) + n) % n];
}
