/**
 * How often a track is labelled, marked with a symbol and given a direction arrow
 * (CAP-32): the intervals, the form's choices, and where the map draws them.
 *
 * - An interval is a whole number of seconds from 1 s to 24 h, or off; left out, Debrief's
 *   default (no labels or symbols; a few arrows along the track in the time window). Read
 *   and named as debrief_kernel.time does, held to schemas/vectors/fix-intervals.json.
 * - Times are the whole multiples of the interval of UTC within the track's span and the
 *   time window: every 10 min is 0900, 0910, 0920, wherever the track starts, as legacy
 *   Debrief's LightweightTrackWrapper.setFixes rounds the start up to a multiple of the
 *   frequency. A track too short to hold a multiple gets one, at its start, as there.
 *   None inside a gap in the data (a time between fixes more than ten times the track's
 *   median time between fixes apart, as smoothing treats a gap), so no position is
 *   made up where nothing was recorded.
 * - Thinned when zoomed out, so the map never draws more than it can show: the interval
 *   raised to the smallest clock-friendly multiple of it that leaves items far enough
 *   apart on screen (and at most a cap per track), so thinned labels still fall on round
 *   times; then any item too close to the last one kept is left out. The map says so.
 *
 * Pure: no Leaflet, no DOM. The map (map.ts) and the forms use it.
 */
import { wallClock, type FormatSettings } from "@debrief/kernel";
import type { Duration } from "@debrief/schemas";

export const FIELDS = ["label_interval", "symbol_interval", "arrow_interval"] as const;
export type Field = (typeof FIELDS)[number];
/** What each is called, as a heading in the form and in what the map says. */
export const FIELD_NAMES: Record<Field, string> = { label_interval: "Labels", symbol_interval: "Symbols", arrow_interval: "Arrows" };
export type Interval = Duration | "off" | "all" | null | undefined;
/** What a change sets a field to: a duration, off, at every fix, or null for Debrief's default. */
export type Setting = Duration | "off" | "all" | null;
/** The kinds that may be at every fix (legacy Debrief's "All"; product owner, 15 Oct 2026): labels and symbols, never arrows. */
export const AT_EVERY_FIX: readonly Field[] = ["label_interval", "symbol_interval"];
export const ALL_PROBLEM = "Arrows cannot be at every fix: give an interval, such as 10 min, or off.";

export const MIN_S = 1;
export const MAX_S = 86_400;
/** The intervals offered, in seconds: legacy Debrief's choices, from 1 second to 24 hours. */
export const PRESETS = [1, 5, 10, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21_600, 43_200, 86_400];

// --- Reading and naming intervals (shared vectors) ------------------------------------
const UNITS: Record<string, number> = {
  d: 86_400, day: 86_400, days: 86_400,
  h: 3600, hr: 3600, hrs: 3600, hour: 3600, hours: 3600,
  m: 60, min: 60, mins: 60, minute: 60, minutes: 60,
  s: 1, sec: 1, secs: 1, second: 1, seconds: 1,
};
const NEXT_UNIT: Record<number, number> = { 86400: 3600, 3600: 60, 60: 1 };
export const UNIT_PROBLEM = "Say the unit, such as 30 s, 10 min or 1 h 30 min.";
export const WHOLE_PROBLEM = "Give whole seconds: an interval is from 1 s to 24 h.";
export const RANGE_PROBLEM = "An interval is from 1 s to 24 h.";

/**
 * An interval as typed: seconds, "off" (for off or none), "all" (for all or every fix), or
 * what is wrong. Units short or
 * long ("90 s", "10 min", "2 hours", "1 day"), combined ("1 h 30 min"); a bare number after
 * one with a unit is in the next smaller unit ("1h30" is 1 h 30 min).
 */
export function readInterval(text: string): number | "off" | "all" | { problem: string } {
  const said = text.trim().toLowerCase();
  if (said === "off" || said === "none") return "off";
  if (said === "all" || said === "every fix" || said === "all fixes") return "all";
  const rest = said.replace(/,/g, " ");
  const part = /(\d+(?:\.\d+)?)\s*([a-z]*)/y;
  let total = 0;
  let previous: number | undefined;
  let position = 0;
  while (position < rest.length) {
    if (/\s/.test(rest[position])) {
      position++;
      continue;
    }
    part.lastIndex = position;
    const match = part.exec(rest);
    if (!match) return { problem: UNIT_PROBLEM };
    const [, number, unit] = match;
    let size: number | undefined;
    if (unit) {
      size = UNITS[unit];
      if (size === undefined || (previous !== undefined && size >= previous)) return { problem: UNIT_PROBLEM };
    } else if (previous !== undefined && NEXT_UNIT[previous]) {
      size = NEXT_UNIT[previous];
    } else {
      return { problem: UNIT_PROBLEM };
    }
    total += Number(number) * size;
    previous = size;
    position = part.lastIndex;
  }
  if (previous === undefined) return { problem: UNIT_PROBLEM };
  const seconds = Math.round(total);
  if (Math.abs(total - seconds) > 1e-6) return { problem: WHOLE_PROBLEM };
  if (seconds < MIN_S || seconds > MAX_S) return { problem: RANGE_PROBLEM };
  return seconds;
}

/** An interval in words, largest unit first: 90 is "1 min 30 s", 5400 "1 h 30 min". */
export function describeInterval(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const parts = [...(hours ? [`${hours} h`] : []), ...(minutes ? [`${minutes} min`] : [])];
  if (secs || !parts.length) parts.push(`${secs} s`);
  return parts.join(" ");
}

const SECONDS: Record<string, number> = { ms: 0.001, s: 1, min: 60, h: 3600 };
/** A stored interval in seconds. */
export const secondsOf = (duration: Duration): number => duration.value * SECONDS[duration.unit];
/** Seconds as a duration in the largest unit that holds it exactly: 600 is 10 min, 90 is 90 s. */
export function durationOf(seconds: number): Duration {
  if (seconds % 3600 === 0) return { value: seconds / 3600, unit: "h" };
  if (seconds % 60 === 0) return { value: seconds / 60, unit: "min" };
  return { value: seconds, unit: "s" };
}

// --- The form: what each field shows for the tracks chosen, and what to send ------------
/** A field's choice: Debrief's default, off, or every so many seconds. */
export type Choice = "default" | "off" | "all" | number;
/** A field's state for the tracks chosen: their choice, or "mixed" where they differ (left unchanged unless changed). */
export type FieldState = Choice | "mixed";

/** What a track's interval shows as. Labels and symbols by default are none, so they show as off; arrows show their default. */
export function choiceOf(field: Field, value: Interval): Choice {
  if (value === undefined || value === null) return field === "arrow_interval" ? "default" : "off";
  if (value === "off" || value === "all") return value;
  return Math.round(secondsOf(value));
}

type Presentation = Partial<Record<Field, Interval>>;
/** Each field's state for the tracks chosen. */
export function formState(tracks: Presentation[]): Record<Field, FieldState> {
  const state = {} as Record<Field, FieldState>;
  for (const field of FIELDS) {
    const choices = new Set(tracks.map((t) => choiceOf(field, t[field])));
    state[field] = choices.size === 1 ? [...choices][0] : "mixed";
  }
  return state;
}

/** The choices a field offers, in order: (mixed,) (the default,) off, (every fix, for labels and symbols,) the presets, then any other interval a track has. */
export function choicesFor(field: Field, state: FieldState): { value: string; label: string }[] {
  const out = state === "mixed" ? [{ value: "mixed", label: "Mixed (unchanged)" }] : [];
  if (field === "arrow_interval") out.push({ value: "default", label: "A few (default)" });
  out.push({ value: "off", label: "Off" });
  if (AT_EVERY_FIX.includes(field)) out.push({ value: "all", label: "All (every fix)" });
  const seconds = [...PRESETS];
  if (typeof state === "number" && !seconds.includes(state)) seconds.push(state);
  seconds.sort((a, b) => a - b);
  out.push(...seconds.map((s) => ({ value: String(s), label: `Every ${describeInterval(s)}` })));
  return out;
}

/** A choice from the form's value: "mixed" (unchanged), "default", "off", "all" or seconds. */
export function choiceFromValue(value: string): FieldState {
  return value === "mixed" || value === "default" || value === "off" || value === "all" ? value : Number(value);
}

/**
 * What to send for the choices made: each field changed from what at least one track shows,
 * as a duration, "off", "all", or null for Debrief's default. A field left mixed, or showing what
 * every track has already, is left out, so it stays as each track has it.
 */
export function changesOf(tracks: Presentation[], chosen: Partial<Record<Field, FieldState>>): Partial<Record<Field, Setting>> {
  const out: Partial<Record<Field, Setting>> = {};
  for (const field of FIELDS) {
    const choice = chosen[field];
    if (choice === undefined || choice === "mixed") continue;
    if (tracks.every((t) => choiceOf(field, t[field]) === choice)) continue;
    out[field] = choice === "default" ? null : choice === "off" || choice === "all" ? choice : durationOf(choice);
  }
  return out;
}

/** What a change says, as its step will be named: "Labels every 10 min, arrows off on 2 tracks". */
export function describeChanges(changes: Partial<Record<Field, Setting>>, names: string[]): string {
  const said = FIELDS.filter((f) => f in changes)
    .map((f) => {
      const value = changes[f];
      const noun = FIELD_NAMES[f].toLowerCase();
      if (value === null || value === undefined) return f === "arrow_interval" ? `${noun} back to the default` : `${noun} off`;
      if (value === "off") return `${noun} off`;
      if (value === "all") return `${noun} at every fix`;
      return `${noun} every ${describeInterval(Math.round(secondsOf(value)))}`;
    })
    .join(", ");
  const who = names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.length} tracks`;
  return said ? `${said[0].toUpperCase()}${said.slice(1)} on ${who}` : "";
}

/**
 * A track's intervals in words, as its details show them (product owner, 15 Oct 2026):
 * "Labels every 10 min · Symbols off · Arrows default". Left out is "off" for labels
 * and symbols (none are drawn) and "default" for arrows (product owner, 16 Oct 2026). As
 * debrief_stac.frequencies.describe_track says it, held to the shared vectors.
 */
export function describeFrequencies(track: Presentation): string {
  return FIELDS.map((field) => {
    const value = track[field];
    const said = value === undefined || value === null ? (field === "arrow_interval" ? "default" : "off") : value === "off" ? "off" : value === "all" ? "at every fix" : `every ${describeInterval(Math.round(secondsOf(value)))}`;
    return `${FIELD_NAMES[field]} ${said}`;
  }).join(" · ");
}

/** Only the intervals set (not left out), in words; empty when none is set. */
export function describeSetFrequencies(track: Presentation): string {
  return FIELDS.map((field, i) => (track[field] === undefined || track[field] === null ? "" : describeFrequencies(track).split(" · ")[i]))
    .filter(Boolean)
    .join(" · ");
}

/**
 * A track's details, line by line, as the outline shows them when pointed at (VS Code's
 * tooltip, the playground's row): its name and span, how it is plotted where by dead
 * reckoning, and its labels, symbols and arrows.
 */
export function trackDetails(props: Presentation & { name: string }, when: string, deadReckoned = false): string {
  return [[props.name, when].filter(Boolean).join(": "), deadReckoned ? "Plotted by dead reckoning (DR), from its first fix by each fix's course and speed" : "", describeFrequencies(props)]
    .filter(Boolean)
    .join("\n");
}

// --- Times on the map -----------------------------------------------------------------
/** Milliseconds between items; or none to draw (off), at every fix (all), or the default (left out). */
export function intervalMs(value: Interval): number | "off" | "all" | undefined {
  if (value === undefined || value === null) return undefined;
  if (value === "off" || value === "all") return value;
  return Math.round(secondsOf(value)) * 1000;
}

/** Time spans [start, end] in which no item is drawn: legs between fixes more than ten times the median time between fixes apart. */
export function gaps(times: number[]): [number, number][] {
  const steps = times.slice(1).map((t, i) => t - times[i]).filter((d) => d > 0).sort((a, b) => a - b);
  if (steps.length < 3) return [];
  const median = steps[Math.floor(steps.length / 2)];
  const out: [number, number][] = [];
  for (let i = 1; i < times.length; i++) if (times[i] - times[i - 1] > GAP_FACTOR * median) out.push([times[i - 1], times[i]]);
  return out;
}
/** A gap in the data: more than this many times the track's median time between fixes, as smoothing treats one. */
export const GAP_FACTOR = 10;

/**
 * The times to draw at, every `every` ms, within the spans given (each [start, end],
 * already within the track's span and the time window, in order): the whole multiples of
 * `every` since 1970 in UTC, which has no daylight saving, so a day is always 86,400 s.
 * None strictly inside a gap. Where the track's whole span holds no multiple, its start
 * alone (legacy Debrief's short track), if it is in a span. At most `limit` times.
 */
export function gridTimes(spans: [number, number][], every: number, track: { start: number; end: number }, gapSpans: [number, number][] = [], limit = Infinity): number[] {
  const out: number[] = [];
  const inGap = (t: number) => gapSpans.some(([a, b]) => t > a && t < b);
  if (Math.ceil(track.start / every) * every > track.end) {
    if (spans.some(([a, b]) => track.start >= a && track.start <= b)) out.push(track.start);
    return out;
  }
  let last = -Infinity;
  for (const [start, end] of spans) {
    for (let t = Math.max(Math.ceil(start / every) * every, last + every); t <= end; t += every) {
      if (inGap(t)) continue;
      out.push(t);
      last = t;
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/**
 * Labels or symbols at every fix ("all"): the times of the track's fixes within the spans
 * (in order, each once, at most `cap`); or, where they would crowd (the fixes' median time
 * apart crossing less than `spacingPx` on screen at `pxPerMs`) or number more than `cap`,
 * none, and the interval to draw at instead, so a track zoomed out is thinned to round
 * times as any interval is: the smallest preset at least the fixes' median time apart.
 */
export function everyFix(times: number[], spans: [number, number][], pxPerMs: number, spacingPx: number, cap = Infinity, median = medianStep(times)): { times: number[] } | { every: number } {
  const out: number[] = [];
  let count = 0;
  for (const t of times) {
    if (t === out[out.length - 1] || !spans.some(([a, b]) => t >= a && t <= b)) continue;
    count++;
    if (out.length < cap) out.push(t);
  }
  if (median && (median * pxPerMs < spacingPx || count > cap)) {
    const preset = PRESETS.find((s) => s * 1000 >= median);
    return { every: (preset ?? PRESETS[PRESETS.length - 1]) * 1000 };
  }
  return { times: out };
}

/** The median time between a track's fixes, in ms (fixes sharing a time aside); 0 with fewer than two times. */
export function medianStep(times: number[]): number {
  const steps = times
    .slice(1)
    .map((t, i) => t - times[i])
    .filter((d) => d > 0)
    .sort((x, y) => x - y);
  return steps.length ? steps[Math.floor(steps.length / 2)] : 0;
}

/** How many grid times the spans hold at `every` ms, without listing them. */
export function gridCount(spans: [number, number][], every: number): number {
  let count = 0;
  let last = -Infinity;
  for (const [start, end] of spans) {
    const first = Math.max(Math.ceil(start / every) * every, last + every);
    if (first > end) continue;
    const n = Math.floor((end - first) / every) + 1;
    count += n;
    last = first + (n - 1) * every;
  }
  return count;
}

/** Merge time spans, each [start, end], into as few as cover them, in order. */
export function mergeSpans(spans: [number, number][]): [number, number][] {
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/**
 * The interval drawn: the interval set, or, where its items would be closer than `spacingPx`
 * on screen (the track crossing `pxPerMs` pixels a millisecond, on average) or more than
 * `cap` of them would be drawn, the smallest clock-friendly multiple of it that is not: a
 * preset that is a multiple of it, or 2, 5 or 10 times it, that a day divides into evenly
 * (so 10 min goes to 30 min or 1 h, never 50 min); past those, doubling.
 */
const DAY_MS = 86_400_000;
export function thinnedInterval(every: number, pxPerMs: number, spacingPx: number, count: (every: number) => number = () => 0, cap = Infinity): number {
  const fits = (candidate: number) => candidate * pxPerMs >= spacingPx && count(candidate) <= cap;
  if (!(pxPerMs > 0) || fits(every)) return every;
  const candidates = [...new Set([...PRESETS.map((s) => s * 1000), every * 2, every * 5, every * 10])].filter((c) => c > every && c % every === 0 && (DAY_MS % c === 0 || c % DAY_MS === 0)).sort((a, b) => a - b);
  for (const candidate of candidates) if (fits(candidate)) return candidate;
  let candidate = candidates[candidates.length - 1] ?? every;
  for (let i = 0; i < 40 && !fits(candidate); i++) candidate *= 2;
  return candidate;
}

/** Of points in order on screen, those at least `spacingPx` from the last one kept: the indices kept. */
export function declutter(points: { x: number; y: number }[], spacingPx: number): number[] {
  const kept: number[] = [];
  let last: { x: number; y: number } | undefined;
  points.forEach((p, i) => {
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < spacingPx) return;
    kept.push(i);
    last = p;
  });
  return kept;
}

/**
 * The times of fixes whose time label or symbol is always shown (a FixMark's show_label,
 * show_symbol; decision, product owner, 15 Oct 2026: force on only), by kind; arrows have
 * none. In time order.
 */
export function forcedTimes(marks: { time: string; show_label?: boolean | null; show_symbol?: boolean | null }[] | null | undefined): Record<Field, number[]> {
  const of = (member: "show_label" | "show_symbol") => (marks ?? []).filter((m) => m[member]).map((m) => Date.parse(m.time)).sort((a, b) => a - b);
  return { label_interval: of("show_label"), symbol_interval: of("show_symbol"), arrow_interval: [] };
}

/** The interval's times with the forced ones added, in order, each once: a fix forced where the interval falls is drawn once. */
export function withForced(regular: number[], forced: number[]): number[] {
  return [...new Set([...regular, ...forced])].sort((a, b) => a - b);
}

/** How far apart on screen, in pixels, items of each kind are kept, and the most drawn on one track. */
export const SPACING_PX: Record<Field, number> = { label_interval: 44, symbol_interval: 10, arrow_interval: 28 };
export const CAP: Record<Field, number> = { label_interval: 100, symbol_interval: 400, arrow_interval: 150 };

// --- Labels: legacy Debrief's time labels ------------------------------------------------
const pad = (n: number) => String(n).padStart(2, "0");
/**
 * A time label, as legacy Debrief labels fixes: HHmm (its default, FormatRNDateTime's short
 * form), with .ss where the interval drawn is not whole minutes, and the day first, ddHHmm,
 * on the first label of each day, so a label never leaves the day in doubt. In the
 * analyst's time zone (Zulu by default), with no zone letter, as on a chart.
 */
export function fixLabel(ms: number, everyMs: number, settings: Pick<FormatSettings, "time_zone">, withDay: boolean): string {
  const t = wallClock(ms, settings.time_zone);
  const day = withDay ? pad(t.day) : "";
  const seconds = everyMs % 60_000 ? `.${pad(t.second)}` : "";
  return `${day}${pad(t.hour)}${pad(t.minute)}${seconds}`;
}
/** Which labels carry the day: the first of each day, in the analyst's time zone. */
export function labelsWithDay(times: number[], settings: Pick<FormatSettings, "time_zone">): boolean[] {
  let previous = "";
  return times.map((ms) => {
    const t = wallClock(ms, settings.time_zone);
    const day = `${t.year}-${t.month}-${t.day}`;
    const first = day !== previous;
    previous = day;
    return first;
  });
}

/**
 * Where a label goes beside its point: to port of the direction of travel, as legacy
 * Debrief places a fix's label (FixWrapper.orientationFor), so labels keep to one side of
 * the track and never sit on it. The unit vector on screen (x right, y down) towards it,
 * for a course in degrees true on a north-up map.
 */
export function portSide(course: number | undefined): { x: number; y: number } {
  const port = (((course ?? 0) - 90) * Math.PI) / 180;
  return { x: Math.sin(port), y: -Math.cos(port) };
}

// --- Labels kept clear of one another --------------------------------------------------
/** A box on screen, in pixels: left, top, right, bottom. */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
/** How far a time label stands off its point, along its leader, and how tall it is (map.css .fix-time-text). */
export const LEADER_PX = 9;
export const LABEL_HEIGHT_PX = 12;
/** Where a label's text sits about its point, to the side given: as map.ts lays it out (timeLabel) and map.css draws it. */
export function labelBox(at: { x: number; y: number }, side: { x: number; y: number }, width: number): Box {
  const across = (d: number, size: number) => (d > 0.38 ? 0 : d < -0.38 ? -size : -size / 2);
  const x0 = at.x + side.x * LEADER_PX + across(side.x, width);
  const y0 = at.y + side.y * LEADER_PX + across(side.y, LABEL_HEIGHT_PX);
  return { x0, y0, x1: x0 + width, y1: y0 + LABEL_HEIGHT_PX };
}

/** Boxes taken on screen, found by a coarse grid of cells, so each test looks at a few neighbours only. */
export class Occupied {
  private cells = new Map<string, Box[]>();
  constructor(private cell = 48) {}
  private keys(box: Box): string[] {
    const out: string[] = [];
    for (let i = Math.floor(box.x0 / this.cell); i <= Math.floor(box.x1 / this.cell); i++)
      for (let j = Math.floor(box.y0 / this.cell); j <= Math.floor(box.y1 / this.cell); j++) out.push(`${i},${j}`);
    return out;
  }
  add(box: Box): void {
    for (const key of this.keys(box)) {
      const list = this.cells.get(key);
      if (list) list.push(box);
      else this.cells.set(key, [box]);
    }
  }
  /** Whether the box overlaps one taken, with `gap` pixels to spare around it. */
  hits(box: Box, gap = 1): boolean {
    for (const key of this.keys({ x0: box.x0 - gap, y0: box.y0 - gap, x1: box.x1 + gap, y1: box.y1 + gap }))
      for (const b of this.cells.get(key) ?? []) if (box.x0 < b.x1 + gap && box.x1 + gap > b.x0 && box.y0 < b.y1 + gap && box.y1 + gap > b.y0) return true;
    return false;
  }
}

/**
 * Which side each time label goes so that none overlaps another or anything already taken
 * (the tracks' names, fixes' own labels, the ends of tracks): to port, as legacy Debrief
 * places them; where that is taken, to starboard; where both are, left out. A fix's label
 * always shown (forced) is placed first, so it wins, and is never left out: to port where
 * both sides are taken. Otherwise first come, first placed, so the caller orders them
 * (earliest time first: where tracks cross, the later label gives way). The side chosen for
 * each, or undefined where left out; each placed is added to what is taken.
 */
export function placeLabels(
  labels: { at: { x: number; y: number }; side: { x: number; y: number }; width: number; forced?: boolean }[],
  taken: Occupied,
): ({ x: number; y: number } | undefined)[] {
  const out: ({ x: number; y: number } | undefined)[] = new Array(labels.length).fill(undefined);
  const order = [...labels.keys()].sort((a, b) => Number(!!labels[b].forced) - Number(!!labels[a].forced));
  for (const k of order) {
    const { at, side, width, forced } = labels[k];
    const starboard = { x: -side.x || 0, y: -side.y || 0 };
    const port = labelBox(at, side, width);
    const other = labelBox(at, starboard, width);
    const chosen = !taken.hits(port) ? side : !taken.hits(other) ? starboard : forced ? side : undefined;
    if (!chosen) continue;
    taken.add(chosen === side ? port : other);
    out[k] = chosen;
  }
  return out;
}

/** Tracks named in a note: one or two by name, more by count. */
const whom = (names: string[]) => (names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.length} tracks`);

/**
 * What the map says when it thins: "Labels every 1 h, arrows every 30 min at this zoom; zoom
 * in for more". Each entry is a track's kind thinned: to the interval drawn, or, with none,
 * only some left out where they would crowd. Where only some of the tracks drawing a kind
 * were thinned (`drawing` says how many draw each), it says which, so a track drawn at its
 * own interval beside one thinned is not misdescribed: "Labels every 20 min on RED ONE at
 * this zoom; zoom in for more".
 */
export function thinningNote(thinned: { field: Field; drawn?: number; track?: string }[], drawing: Partial<Record<Field, number>> = {}): string {
  if (!thinned.length) return "";
  const parts = FIELDS.flatMap((field) => {
    const mine = thinned.filter((t) => t.field === field);
    if (!mine.length) return [];
    const noun = FIELD_NAMES[field].toLowerCase();
    const drawn = [...new Set(mine.flatMap((t) => (t.drawn ? [t.drawn] : [])))].sort((a, b) => a - b);
    const names = [...new Set(mine.flatMap((t) => (t.track ? [t.track] : [])))];
    const on = names.length && names.length < (drawing[field] ?? 0) ? ` on ${whom(names)}` : "";
    const what = drawn.length ? `${noun} every ${describeInterval(Math.round(drawn[0] / 1000))}${drawn.length > 1 ? " or more" : ""}` : `some ${noun} left out`;
    return [{ what, on }];
  });
  // Said once, at the end, where every part is on the same tracks.
  const same = parts.every((p) => p.on === parts[0].on);
  const said = same ? parts.map((p) => p.what).join(", ") + parts[0].on : parts.map((p) => p.what + p.on).join(", ");
  return `${said[0].toUpperCase()}${said.slice(1)} at this zoom; zoom in for more`;
}
