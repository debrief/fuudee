/**
 * TMA (CAP-21; product owner, 24 Oct 2026): the bearing view's reckoning, free of the DOM,
 * Leaflet and VS Code so it can be tested.
 *
 * - Residuals while a solution is dragged: each rooted cut's bearing measured less the
 *   bearing, along the geodesic, from where it was taken to where the solution is at its
 *   time (as the map places it, along the geodesic between fixes), within (-180, 180]; an
 *   ambiguous cut not yet resolved measured by the nearer of its bearings. The same as
 *   debrief_kernel.tma, held to schemas/vectors/tma-residuals.json; Python's are shown
 *   again, exact, once the drag ends (NFR-04).
 * - The first guess's defaults and the two clicks taken onto their cuts' lines.
 * - The cut list: which rows are in sight (it is virtualised, so thousands scroll as
 *   quickly as tens), the period chosen, and the next or previous ambiguous cut.
 */
import { convert, DEFAULT_SETTINGS, fixed, formatQuantity, formatTime, UNIT_LABELS, type FormatSettings } from "@debrief/kernel";
import type { DebriefFeatureCollection, TimeRange, TmaCut, TmaRequest, TmaResidualRow, TmaResiduals, TmaSensorRow, TmaSolutionRow } from "@debrief/schemas";
import geodesic from "geographiclib-geodesic";
import { pointAt, rangeBearing, travel, type LonLat } from "./geodesic.js";
import { bearingText, sensorsOf, type Kept } from "./sensors.js";

const WGS84 = geodesic.Geodesic.WGS84;

/** A row of the bearing view's list: a cut, or a cut with its residual. */
export type CutRow = TmaCut | TmaResidualRow;

/** The first guess by form unless the analyst says otherwise (product owner, 24 Oct 2026). */
export const DEFAULT_RANGE = { value: 10000, unit: "[yd_i]" };
export const DEFAULT_SPEED = { value: 8, unit: "[kn_i]" };

/** An angle within (-180, 180]. */
export function wrap(degrees: number): number {
  let value = degrees % 360;
  if (value <= -180) value += 360;
  else if (value > 180) value -= 360;
  return value;
}

/** The default course of a first guess: across the line of sight, a quarter turn clockwise of the bearing. */
export const across = (bearing: number): number => (((bearing + 90) % 360) + 360) % 360;

export interface CutBearing {
  time: number;
  origin?: LonLat | null;
  bearing: number;
  ambiguous?: number | null;
  resolved?: string | null;
}

export interface Residual {
  calculated?: number;
  measured?: number;
  used?: Kept;
  nearer_side: boolean;
  residual?: number;
}

function choose(cut: CutBearing, calculated: number): Residual {
  if (cut.ambiguous === undefined || cut.ambiguous === null || cut.resolved === "bearing") {
    return { calculated, measured: cut.bearing, used: "bearing", nearer_side: false, residual: wrap(cut.bearing - calculated) };
  }
  if (cut.resolved === "ambiguous_bearing") {
    return { calculated, measured: cut.ambiguous, used: "ambiguous_bearing", nearer_side: false, residual: wrap(cut.ambiguous - calculated) };
  }
  const first = wrap(cut.bearing - calculated);
  const second = wrap(cut.ambiguous - calculated);
  return Math.abs(second) < Math.abs(first)
    ? { calculated, measured: cut.ambiguous, used: "ambiguous_bearing", nearer_side: true, residual: second }
    : { calculated, measured: cut.bearing, used: "bearing", nearer_side: true, residual: first };
}

/** The bearing from a to b, degrees true in [0, 360), along the geodesic. */
function azimuth(a: LonLat, b: LonLat): number {
  const g = WGS84.Inverse(a[1], a[0], b[1], b[0], geodesic.Geodesic.AZIMUTH);
  return (((g.azi1 ?? 0) % 360) + 360) % 360;
}

/** Each cut's residual against a solution (its fixes' positions and times), in the cuts' order. */
export function residuals(cuts: CutBearing[], coordinates: LonLat[], times: number[]): Residual[] {
  return cuts.map((cut) => {
    const where = cut.origin ? pointAt(coordinates, times, cut.time, false)?.position : undefined;
    if (!cut.origin || !where) return { nearer_side: false };
    return choose(cut, azimuth(cut.origin, where));
  });
}

/** The root mean square of the residuals given (undefined for one that has none, not counted). */
export function rms(values: (number | undefined | null)[]): number | undefined {
  let sum = 0;
  let n = 0;
  for (const v of values) {
    if (v === undefined || v === null) continue;
    sum += v * v;
    n++;
  }
  return n ? Math.sqrt(sum / n) : undefined;
}

/** A click taken onto a cut's line: the point along it level with the click; the nearer of an unresolved pair; none behind the sensor. As debrief_kernel.tma.onto_line. */
export function ontoLine(origin: LonLat, bearing: number, ambiguous: number | null | undefined, resolved: string | null | undefined, click: LonLat): { position: LonLat; used: Kept; rangeM: number; bearing: number } | undefined {
  const { metres, bearing: towards } = rangeBearing(origin, click);
  let choices: [number, Kept][] = [[bearing, "bearing"]];
  if (ambiguous !== undefined && ambiguous !== null) {
    if (resolved === "ambiguous_bearing") choices = [[ambiguous, "ambiguous_bearing"]];
    else if (!resolved) choices.push([ambiguous, "ambiguous_bearing"]);
  }
  const [line, used] = choices.reduce((best, c) => (Math.abs(wrap(towards - c[0])) < Math.abs(wrap(towards - best[0])) ? c : best));
  const along = metres * Math.cos((wrap(towards - line) * Math.PI) / 180);
  if (along <= 0) return undefined;
  return { position: travel(origin, line, along), used, rangeM: along, bearing: line };
}

/** The course (degrees true) and speed (metres a second) from a to b in the time given. */
export function courseSpeed(a: LonLat, b: LonLat, seconds: number): { course: number; metresPerSecond: number } {
  const { metres, bearing } = rangeBearing(a, b);
  return { course: bearing, metresPerSecond: seconds > 0 ? metres / seconds : 0 };
}

// --- Residuals while dragging --------------------------------------------------------

const cutOf = (row: CutRow): CutBearing => ({
  time: Date.parse(row.time),
  origin: (row.origin as LonLat | null | undefined) ?? null,
  bearing: row.bearing,
  ambiguous: row.ambiguous_bearing ?? null,
  resolved: row.resolved ?? null,
});

/**
 * The residuals as a solution dragged on the map now leaves them: the rows Python gave,
 * each worked out again against the solution's fixes where the map draws them (its times
 * from the solution row). Counts, left out and RMS as Python counts them.
 */
export function liveResiduals(base: TmaResiduals, solution: TmaSolutionRow, coordinates: LonLat[]): TmaResiduals {
  const times = (solution.times ?? []).map((t) => Date.parse(t));
  if (times.length !== coordinates.length) return base;
  const found = residuals(base.rows.map(cutOf), coordinates, times);
  const counted: number[] = [];
  const rows = base.rows.map((row, i): TmaResidualRow => {
    const r = found[i];
    const next: TmaResidualRow = { ...row };
    delete next.measured;
    delete next.used;
    delete next.calculated;
    delete next.residual;
    delete next.nearer_side;
    if (r.residual !== undefined) {
      Object.assign(next, { measured: r.measured, used: r.used, calculated: r.calculated, residual: r.residual });
      if (r.nearer_side) next.nearer_side = true;
      if (!row.excluded) counted.push(r.residual);
    }
    return next;
  });
  // Rooted cuts no longer in the plot have no row; Python counted them among those without.
  const missing = base.without - base.rows.filter((r) => r.residual === undefined || r.residual === null).length;
  const out: TmaResiduals = {
    ...base,
    rows,
    counted: counted.length,
    without: missing + found.filter((r) => r.residual === undefined).length,
    nearer_side: rows.filter((r) => r.nearer_side).length,
  };
  const value = rms(counted);
  if (value === undefined) delete out.rms;
  else out.rms = value;
  return out;
}

// --- Words ---------------------------------------------------------------------------

const count = (n: number, noun: string, plural = `${noun}s`) => `${n.toLocaleString("en-GB")} ${n === 1 ? noun : plural}`;

/** A residual as the view writes it: "+1.4°", "−0.6°". */
export function residualText(value: number | undefined | null, settings: FormatSettings = DEFAULT_SETTINGS): string {
  if (value === undefined || value === null) return "—";
  const text = fixed(Math.abs(value), settings.angle_decimals);
  return `${value < 0 && Number(text) !== 0 ? "−" : "+"}${text}°`;
}

/** "RMS 1.4° over 118 cuts; 2 left out", or why there is none. */
export function describeRms(report: TmaResiduals | undefined, settings: FormatSettings = DEFAULT_SETTINGS): string {
  if (!report) return "";
  const out = report.excluded ? `; ${count(report.excluded, "cut")} left out` : "";
  if (report.rms === undefined || report.rms === null) return `No RMS: no rooted cut gives a residual${out}`;
  return `RMS ${fixed(report.rms, settings.angle_decimals)}° over ${count(report.counted, "cut")}${out}`;
}

/** What the view says beneath the RMS, where it applies: ambiguous cuts measured by the nearer bearing, cuts with no residual, origins Debrief worked out. */
export function residualNotes(report: TmaResiduals | undefined): string[] {
  if (!report) return [];
  const notes: string[] = [];
  if (report.nearer_side) notes.push(`${count(report.nearer_side, "ambiguous cut")} not yet resolved: each is measured by the bearing nearer the solution (marked ≈).`);
  if (report.without) notes.push(`${count(report.without, "cut")} ${report.without === 1 ? "gives" : "give"} no residual: outside the track's fixes or the solution's.`);
  if (report.derived_origins) notes.push(`${count(report.derived_origins, "cut")} taken from where Debrief worked out the sensor was, when its track was split (marked ◇).`);
  return notes;
}

/** A cut's row in the list: "09:21:00Z  Towed array  045.0° / 135.0°". */
export function cutWhen(row: CutRow, settings: FormatSettings = DEFAULT_SETTINGS): string {
  return formatTime(Date.parse(row.time), settings);
}

/** A cut's bearings as the list shows them: one, the kept one with the other struck, or both. */
export function cutBearings(row: CutRow): string {
  if (row.ambiguous_bearing === undefined || row.ambiguous_bearing === null) return bearingText(row.bearing);
  if (row.resolved === "bearing") return `${bearingText(row.bearing)} kept`;
  if (row.resolved === "ambiguous_bearing") return `${bearingText(row.ambiguous_bearing)} kept`;
  return `${bearingText(row.bearing)} / ${bearingText(row.ambiguous_bearing)}`;
}

/** Whether a cut is ambiguous and not yet resolved. */
export const isAmbiguousRow = (row: CutRow): boolean => row.ambiguous_bearing !== undefined && row.ambiguous_bearing !== null && !row.resolved;

/** The side a bearing of the cut is on, where it can be told: the first's is given, its twin's is the other. */
export function sideOfRow(row: CutRow, which: Kept): "port" | "starboard" | undefined {
  if (!row.side) return undefined;
  if (which === "bearing") return row.side;
  return row.side === "port" ? "starboard" : "port";
}

/** A row read aloud: its time, sensor, bearings, side, residual and whether it is counted. */
export function rowLabel(row: CutRow, settings: FormatSettings = DEFAULT_SETTINGS): string {
  const parts = [cutWhen(row, settings), row.sensor ?? "", cutBearings(row)];
  if (isAmbiguousRow(row) && row.side) parts.push(`${bearingText(row.bearing)} is to ${row.side}`);
  const r = row as TmaResidualRow;
  if ("residual" in r || "excluded" in r || "measured" in r) {
    if (r.residual !== undefined && r.residual !== null) parts.push(`residual ${residualText(r.residual, settings)}${r.nearer_side ? ", by the nearer bearing" : ""}`);
    else parts.push("no residual");
    if (r.excluded) parts.push("left out of the RMS");
    if (r.leg && r.leg > 1) parts.push(`leg ${r.leg}`);
  }
  if (row.origin_derived) parts.push("from a position Debrief worked out");
  if (row.label) parts.push(`label ${row.label}`);
  return parts.filter(Boolean).join(", ");
}

// --- The first guess --------------------------------------------------------------------

/** The first guess by form, as the form offers it: in the analyst's units, the course across the first cut's bearing (product owner, 24 Oct 2026). */
export function guessDefaults(first: CutRow | undefined, which: Kept | undefined, settings: FormatSettings = DEFAULT_SETTINGS): { range: string; course: string; speed: string; bearing?: number } {
  const range = convert(DEFAULT_RANGE, settings.length_unit);
  const speed = convert(DEFAULT_SPEED, settings.speed_unit);
  const bearing = first ? (which === "ambiguous_bearing" && first.ambiguous_bearing !== undefined && first.ambiguous_bearing !== null ? first.ambiguous_bearing : first.resolved === "ambiguous_bearing" ? (first.ambiguous_bearing ?? first.bearing) : first.bearing) : undefined;
  const course = bearing === undefined ? "" : fixed(across(bearing), settings.angle_decimals).padStart(3 + (settings.angle_decimals ? settings.angle_decimals + 1 : 0), "0");
  return {
    range: `${fixed(range.value, settings.length_decimals)} ${UNIT_LABELS[settings.length_unit] ?? settings.length_unit}`,
    course,
    speed: `${fixed(speed.value, settings.speed_decimals)} ${UNIT_LABELS[settings.speed_unit] ?? settings.speed_unit}`,
    ...(bearing !== undefined && { bearing }),
  };
}

/** The contact a new solution is of, as Debrief offers it: the first of Contact 1, Contact 2... not in use (debrief_stac.tma.next_contact). */
export function nextContact(solutions: { contact: string }[]): string {
  const used = new Set(solutions.map((s) => /^Contact (\d+)$/.exec(s.contact.trim())?.[1]).filter(Boolean).map(Number));
  let n = 1;
  while (used.has(n)) n++;
  return `Contact ${n}`;
}

/** A request for a solution of the cuts chosen: the sensors and the period, and the guess if given. */
export function requestFor(sensorIds: string[], period: TimeRange, guess?: Partial<TmaRequest>): TmaRequest {
  return { sensor_ids: sensorIds, period, ...(guess ?? {}) };
}

/** What two clicks make, said as the map draws them: "Course 135.0°T, 8.0 kn". */
export function describeTwoClicks(first: LonLat, last: LonLat, seconds: number, settings: FormatSettings = DEFAULT_SETTINGS): string {
  const { course, metresPerSecond } = courseSpeed(first, last, seconds);
  const course3 = fixed(course, settings.angle_decimals).padStart(3 + (settings.angle_decimals ? settings.angle_decimals + 1 : 0), "0");
  return `${course3}°T ${formatQuantity(convert({ value: metresPerSecond, unit: "m/s" }, settings.speed_unit), settings)}`;
}

// --- The cut list ---------------------------------------------------------------------

/** The rows in sight of a list of rows of one height, with some either side so a scroll shows no gap. */
export function rowsInSight(scrollTop: number, height: number, rowHeight: number, count: number, overscan = 8): { first: number; last: number } {
  if (count <= 0 || rowHeight <= 0) return { first: 0, last: -1 };
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const last = Math.min(count - 1, Math.ceil((scrollTop + height) / rowHeight) + overscan);
  return { first, last };
}

/** Where to scroll so a row is in sight: unchanged if it is. */
export function scrollFor(index: number, scrollTop: number, height: number, rowHeight: number): number {
  const top = index * rowHeight;
  if (top < scrollTop) return top;
  if (top + rowHeight > scrollTop + height) return top + rowHeight - height;
  return scrollTop;
}

/** The next (direction 1) or previous (-1) ambiguous cut not yet resolved from a row, round the list; undefined if none. */
export function nextAmbiguous(rows: CutRow[], from: number, direction: 1 | -1): number | undefined {
  const n = rows.length;
  for (let step = 1; step <= n; step++) {
    const i = (((from + direction * step) % n) + n) % n;
    if (isAmbiguousRow(rows[i])) return i;
  }
  return undefined;
}

/** The period the rows from a to b hold (either order), ends included. */
export function periodOf(rows: CutRow[], a: number, b: number): TimeRange | undefined {
  if (!rows.length) return undefined;
  const lo = Math.max(0, Math.min(a, b));
  const hi = Math.min(rows.length - 1, Math.max(a, b));
  return { start: rows[lo].time, end: rows[hi].time };
}

/** "120 cuts 09:00:00Z–09:59:30Z, 40 ambiguous". */
export function describePeriod(rows: CutRow[], a: number, b: number, settings: FormatSettings = DEFAULT_SETTINGS): string {
  if (!rows.length) return "";
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const chosen = rows.slice(lo, hi + 1);
  const ambiguous = chosen.filter(isAmbiguousRow).length;
  const times = `${cutWhen(rows[lo], settings)}–${cutWhen(rows[hi], settings)}`;
  return `${count(chosen.length, "cut")} ${times}${ambiguous ? `, ${ambiguous} ambiguous` : ""}`;
}

/** The leg, from 1, a time falls in. */
export function legOf(legStarts: string[] | null | undefined, time: string): number {
  return 1 + (legStarts ?? []).filter((s) => s <= time).length;
}

/** The index of the row whose time is nearest the time given (the first of ties). */
export function nearestRow(rows: { time: string }[], at: number): number {
  let best = -1;
  let gap = Infinity;
  for (let i = 0; i < rows.length; i++) {
    const d = Math.abs(Date.parse(rows[i].time) - at);
    if (d < gap) {
      gap = d;
      best = i;
    }
  }
  return best;
}

// --- What the hosts send the view --------------------------------------------------------

type PlotFeature = DebriefFeatureCollection["features"][number];
type TrackFeature = Extract<PlotFeature, { properties: { kind: "track" } }>;

/** The plot's sensors as the view lists them. */
export function tmaSensorRows(plot: DebriefFeatureCollection): TmaSensorRow[] {
  return sensorsOf(plot).map((e) => ({
    id: e.sensor.id,
    name: e.sensor.properties.name,
    ...(e.host && { host: e.host.properties.name }),
    colour: e.sensor.properties.colour,
    cuts: e.cuts.length,
    ambiguous: e.cuts.filter((c) => !!c.properties.ambiguous_bearing && !c.properties.resolved).length,
  }));
}

/** The plot's TMA solutions as the view lists and draws them. */
export function tmaSolutionRows(plot: DebriefFeatureCollection): TmaSolutionRow[] {
  return plot.features
    .filter((f): f is TrackFeature => f.properties.kind === "track" && !!(f as TrackFeature).properties.tma)
    .map((t) => {
      const tag = t.properties.tma!;
      return {
        id: t.id,
        name: t.properties.name,
        contact: tag.contact,
        ...(t.properties.style?.colour && { colour: t.properties.style.colour }),
        period: tag.period,
        times: t.properties.times,
        ...(tag.leg_starts?.length && { leg_starts: tag.leg_starts }),
        cuts: tag.cut_ids.length,
      };
    });
}

/** A cut as debrief/sensors lists it (its cuts: true answer). */
export interface ListedCut {
  id: string;
  time: string;
  bearing: number;
  ambiguous_bearing?: number;
  resolved?: string | null;
  side?: "port" | "starboard";
  origin?: LonLat | null;
  origin_derived?: boolean;
  label?: string;
  hidden?: boolean;
}

/** A sensor's cuts as debrief/sensors lists them, as the view's rows. */
export function cutRowsOf(sensor: TmaSensorRow, listed: ListedCut[], colours: Map<string, string> = new Map()): TmaCut[] {
  return listed.map((c) => {
    const colour = colours.get(c.id) ?? sensor.colour ?? undefined;
    return {
      id: c.id,
      sensor_id: sensor.id,
      sensor: sensor.name,
      ...(colour && { colour }),
      time: c.time,
      bearing: c.bearing,
      ...(c.ambiguous_bearing !== undefined && { ambiguous_bearing: c.ambiguous_bearing }),
      ...(c.resolved && { resolved: c.resolved as Kept }),
      ...(c.side && { side: c.side }),
      ...(c.origin && { origin: c.origin }),
      ...(c.origin_derived && { origin_derived: true }),
      ...(c.label && { label: c.label }),
      ...(c.hidden && { hidden: true }),
    };
  });
}

/** The cuts' own colours, by id, for the rows. */
export function cutColours(plot: DebriefFeatureCollection): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of plot.features) if (f.properties.kind === "sensor_cut" && f.properties.colour) out.set(f.id, f.properties.colour);
  return out;
}

/** The solution a selection shows: one solution track selected alone. */
export function solutionOfSelection(plot: DebriefFeatureCollection, selection: string[]): string | undefined {
  if (selection.length !== 1) return undefined;
  const f = plot.features.find((g) => g.id === selection[0]);
  return f && f.properties.kind === "track" && (f as TrackFeature).properties.tma ? f.id : undefined;
}

/** The sensor a selection points at: a sensor, a cut's sensor, or a track's first sensor. */
export function sensorOfSelection(plot: DebriefFeatureCollection, selection: string[]): string | undefined {
  for (const id of selection) {
    const f = plot.features.find((g) => g.id === id);
    if (!f) continue;
    if (f.properties.kind === "sensor") return f.id;
    if (f.properties.kind === "sensor_cut") return f.properties.sensor_id;
    if (f.properties.kind === "track") {
      const carried = plot.features.find((g) => g.properties.kind === "sensor" && g.properties.host_track_id === id);
      if (carried) return carried.id;
    }
  }
  return undefined;
}
