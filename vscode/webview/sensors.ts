/**
 * Sensors and their cuts (CAP-22): what the map draws and the hosts say of them, kept free
 * of Leaflet and VS Code so it can be tested.
 *
 * A cut is drawn from its host track's position at its time, as the map places tracks
 * (pointAt, along the geodesic between fixes), or from the position recorded with it,
 * along the geodesic at its bearing: to its range, or else past the edge of the view
 * (twice the view's larger side, at most five degrees of arc), as legacy Debrief drew it.
 * None is drawn outside its host's span, as legacy drew none. A towed array's cut carries
 * two bearings until the analyst keeps one; which side of the host's course a bearing is
 * on is legacy relBearing's: the bearing less the course, within ±180°, port when below
 * zero; keeping port or starboard asks only of the bearing recorded first, as legacy's
 * ditchBearing did. The same rules as debrief_kernel.sensors, held to
 * schemas/vectors/sensor-cuts.json.
 */
import { DEFAULT_SETTINGS, formatTime, fixed, formatRange, type FormatSettings } from "@debrief/kernel";
import type { AmbiguityResolution, DebriefFeatureCollection } from "@debrief/schemas";
import { pointAt, rangeBearing, travel, type LonLat } from "./geodesic.js";

type Feature = DebriefFeatureCollection["features"][number];
export type SensorFeature = Extract<Feature, { properties: { kind: "sensor" } }>;
export type CutFeature = Extract<Feature, { properties: { kind: "sensor_cut" } }>;
type Track = Extract<Feature, { properties: { kind: "track" } }>;
export type Side = "port" | "starboard";
export type Kept = "bearing" | "ambiguous_bearing";
export type Keep = Side | Kept | "ambiguous";

/** Legacy MAXIMUM_SENSOR_BEARING_RANGE: five degrees of arc, 300 nmi. */
export const DEFAULT_LENGTH_CAP_M = 5 * 60 * 1852;

/** The bearing relative to the course, within ±180°: legacy relBearing. */
export function relativeBearing(course: number, bearing: number): number {
  let relative = bearing - course;
  while (relative > 180) relative -= 360;
  while (relative < -180) relative += 360;
  return relative;
}

/** Port when the bearing is to the left of the course (legacy isBearingToPort). */
export function sideOf(course: number, bearing: number): Side {
  return relativeBearing(course, bearing) < 0 ? "port" : "starboard";
}

/** How far a cut without a range is drawn: twice the view's larger side, at most five degrees of arc. */
export function defaultLengthM(viewWidthM: number, viewHeightM: number): number {
  return Math.min(2 * Math.max(viewWidthM, viewHeightM), DEFAULT_LENGTH_CAP_M);
}

/** Which bearing keeping port, starboard, the first or the ambiguous one keeps; none without an ambiguous bearing, or without a course to tell sides by. */
export function keptFor(keep: Keep, bearing: number, ambiguous: number | undefined, course: number | undefined): Kept | undefined {
  if (ambiguous === undefined || keep === "ambiguous") return undefined;
  if (keep === "bearing" || keep === "ambiguous_bearing") return keep;
  if (course === undefined) return undefined;
  return sideOf(course, bearing) === keep ? "bearing" : "ambiguous_bearing";
}

/** The lines a cut is drawn as: both bearings until resolved, then the one kept; its bearing alone where it was never ambiguous. */
export function drawnBearings(bearing: number, ambiguous: number | undefined, resolved: string | null | undefined): { which: Kept; bearing: number }[] {
  if (ambiguous === undefined) return [{ which: "bearing", bearing }];
  if (resolved === "bearing") return [{ which: "bearing", bearing }];
  if (resolved === "ambiguous_bearing") return [{ which: "ambiguous_bearing", bearing: ambiguous }];
  return [
    { which: "bearing", bearing },
    { which: "ambiguous_bearing", bearing: ambiguous },
  ];
}

/** An angle in degrees, whichever unit it is stored in. */
export function degrees(angle: { value: number; unit: string }): number {
  return angle.unit === "rad" ? (angle.value * 180) / Math.PI : angle.value;
}

const METRES: Record<string, number> = { m: 1, km: 1000, "[nmi_i]": 1852, "[yd_i]": 0.9144, "[ft_i]": 0.3048 };
/** A length in metres, whichever unit it is stored in. */
export function metres(length: { value: number; unit: string }): number {
  return length.value * (METRES[length.unit] ?? 1);
}

/** Where a cut is drawn from: the position recorded with it, or its host's position at its time; none outside the host's span. */
export function cutOrigin(hostCoordinates: LonLat[], hostTimes: number[], at: number, own?: LonLat): LonLat | undefined {
  const point = pointAt(hostCoordinates, hostTimes, at);
  if (!point) return undefined;
  return own ?? point.position;
}

/** The host's direction of travel at a cut's time, as the map's arrows show it; none outside its span or where it never moved. */
export function hostCourse(hostCoordinates: LonLat[], hostTimes: number[], at: number): number | undefined {
  return pointAt(hostCoordinates, hostTimes, at)?.course;
}

/** How a towed array follows the ship (ArrayModeEnum). */
export type ArrayMode = "worm_in_hole" | "plain";

/** A host track as cuts are placed on it: its fixes, their times, and the courses it records (degrees), if any. */
export interface HostPath {
  coordinates: LonLat[];
  times: number[];
  courses?: number[];
}

/** The first fix at or after a time (times.length if none). */
function atOrAfter(times: number[], at: number): number {
  let low = 0;
  let high = times.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (times[middle] < at) low = middle + 1;
    else high = middle;
  }
  return low;
}

/**
 * The course port and starboard are told by, as legacy Debrief's isBearingToPort took it:
 * the course recorded at the first fix at or after the time; where the track records no
 * courses, its direction of travel there (pointAt). None outside the track's span.
 */
export function reportedCourse(host: HostPath, at: number): number | undefined {
  const { times } = host;
  if (!times.length || at < times[0] || at > times[times.length - 1]) return undefined;
  if (host.courses) return ((host.courses[atOrAfter(times, at)] % 360) + 360) % 360;
  return pointAt(host.coordinates, times, at)?.course;
}

/** Where a cut is taken from, and the course its sides are told by (none where not known). */
export interface Place {
  position: LonLat;
  course?: number;
}

const SHORT_DEG = 0.01;
const SHORT_MARGIN_M = 0.01;
const A = 6378137.0;
const E2 = (1 / 298.257223563) * (2 - 1 / 298.257223563);

/**
 * The length of a short leg on the ellipsoid's local plane at its middle latitude (to a
 * part in 10^7), or undefined for a longer one: the worm skips a dense track's legs this
 * way and takes the geodesic of the one that holds the end, as the Python does.
 */
function shortLegM(a: LonLat, b: LonLat): number | undefined {
  const dLat = b[1] - a[1];
  const dLon = ((((b[0] - a[0] + 540) % 360) + 360) % 360) - 180;
  if (Math.abs(dLat) >= SHORT_DEG || Math.abs(dLon) >= SHORT_DEG || Math.abs(a[1]) > 89) return undefined;
  const phi = (((a[1] + b[1]) / 2) * Math.PI) / 180;
  const w = 1 - E2 * Math.sin(phi) ** 2;
  const north = ((dLat * Math.PI) / 180) * A * (1 - E2) / (w * Math.sqrt(w));
  const east = (((dLon * Math.PI) / 180) * A) / Math.sqrt(w) * Math.cos(phi);
  return Math.hypot(east, north);
}

/**
 * Where a sensor offsetM astern of the ship was at a time, and the course there; none
 * outside the host's span. Worm in the hole (legacy's default): back along the ship's own
 * past track, leg by leg along geodesics, then astern of the first fix along its course;
 * plain: straight astern along the course then. As debrief_kernel.sensors.array_place,
 * held to schemas/vectors/sensor-cuts.json.
 */
export function arrayPlace(host: HostPath, at: number, offsetM = 0, mode: ArrayMode = "worm_in_hole"): Place | undefined {
  const point = pointAt(host.coordinates, host.times, at);
  if (!point) return undefined;
  if (!(offsetM > 0)) return { position: point.position, course: reportedCourse(host, at) };
  if (mode === "plain") {
    const course = reportedCourse(host, at);
    if (course === undefined) return { position: point.position };
    return { position: travel(point.position, (course + 180) % 360, offsetM), course };
  }
  const { coordinates, times } = host;
  let remaining = offsetM;
  let behind = point.position;
  let behindAt = at;
  for (let j = atOrAfter(times, at) - 1; j >= 0; j--) {
    const short = shortLegM(behind, coordinates[j]);
    if (short !== undefined && short < remaining - SHORT_MARGIN_M) {
      remaining -= short;
      behind = coordinates[j];
      behindAt = times[j];
      continue;
    }
    const leg = rangeBearing(behind, coordinates[j]);
    if (leg.metres >= remaining) {
      const when = behindAt - (behindAt - times[j]) * (remaining / leg.metres);
      return { position: travel(behind, leg.bearing, remaining), course: reportedCourse(host, Math.round(when)) };
    }
    remaining -= leg.metres;
    behind = coordinates[j];
    behindAt = times[j];
  }
  const course = reportedCourse(host, times[0]);
  if (course === undefined) return { position: behind };
  return { position: travel(behind, (course + 180) % 360, remaining), course };
}

/**
 * Where a cut is drawn from, and the course its sides are told by: the position recorded
 * with it, wherever its host is (legacy's absolute origin, never moved with the track),
 * its course the host's then if known; or else where its sensor was (arrayPlace).
 */
export function cutPlace(host: HostPath | undefined, at: number, own?: LonLat | null, offsetM = 0, mode: ArrayMode = "worm_in_hole"): Place | undefined {
  if (own) return { position: own, course: host ? reportedCourse(host, at) : undefined };
  if (!host) return undefined;
  return arrayPlace(host, at, offsetM, mode);
}

/** A track feature as a HostPath, its times parsed and courses in degrees. */
export function hostPathOf(track: Track): HostPath {
  const courses = track.properties.courses;
  const radians = courses?.unit === "rad";
  return {
    coordinates: track.geometry.coordinates as LonLat[],
    times: track.properties.times.map(Date.parse),
    ...(courses && { courses: courses.values.map((c) => (radians ? (c * 180) / Math.PI : c)) }),
  };
}

/** A sensor's array offset in metres and its mode (worm in the hole unless it says plain). */
export function arrayOf(sensor: SensorFeature): { offsetM: number; mode: ArrayMode } {
  const props = sensor.properties;
  return { offsetM: props.array_offset ? metres(props.array_offset) : 0, mode: props.array_mode === "plain" ? "plain" : "worm_in_hole" };
}

/** The place a cut is drawn from, for a sensor entry: its own position, or its sensor's at its time. */
export function placeOfCut(entry: SensorEntry, cut: CutFeature, host?: HostPath): Place | undefined {
  const path = host ?? (entry.host?.geometry ? hostPathOf(entry.host) : undefined);
  const { offsetM, mode } = arrayOf(entry.sensor);
  return cutPlace(path, Date.parse(cut.properties.time), (cut.properties.origin as LonLat | null | undefined) ?? undefined, offsetM, mode);
}

/** Where a cut's line ends: along the geodesic from its origin at its bearing. */
export function cutEnd(origin: LonLat, bearing: number, lengthM: number): LonLat {
  return travel(origin, bearing, lengthM);
}

/** A sensor with its cuts in time order and their times, and its host track if the plot has it. */
export interface SensorEntry {
  sensor: SensorFeature;
  cuts: CutFeature[];
  times: number[];
  host?: Track;
}

/** The plot's sensors, each with its cuts in time order (plot order at one time). */
export function sensorsOf(plot: DebriefFeatureCollection): SensorEntry[] {
  const entries = new Map<string, SensorEntry>();
  const tracks = new Map<string, Track>();
  for (const f of plot.features) {
    if (f.properties.kind === "track") tracks.set(f.id, f as Track);
    if (f.properties.kind === "sensor") entries.set(f.id, { sensor: f as SensorFeature, cuts: [], times: [] });
  }
  for (const f of plot.features) {
    if (f.properties.kind === "sensor_cut") entries.get(f.properties.sensor_id)?.cuts.push(f as CutFeature);
  }
  for (const entry of entries.values()) {
    const keyed = entry.cuts.map((cut, i) => ({ cut, i, t: Date.parse(cut.properties.time) }));
    keyed.sort((a, b) => a.t - b.t || a.i - b.i);
    entry.cuts = keyed.map((k) => k.cut);
    entry.times = keyed.map((k) => k.t);
    entry.host = tracks.get(entry.sensor.properties.host_track_id);
  }
  return [...entries.values()];
}

/** The first cut at or after t (times.length if none). */
function firstFrom(times: number[], t: number): number {
  let low = 0;
  let high = times.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (times[middle] < t) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** The cuts within a period, ends included: [first, last + 1). */
export function inPeriod(times: number[], start: number, end: number): [number, number] {
  const first = firstFrom(times, start);
  let last = firstFrom(times, end);
  while (last < times.length && times[last] === end) last++;
  return [first, last];
}

/** The cut current time is at: the last at or before it, within the window; -1 if none. */
export function currentCut(times: number[], at: number, start: number, end: number): number {
  if (!(at >= start)) return -1;
  let last = firstFrom(times, at);
  while (last < times.length && times[last] === at) last++;
  last--;
  return last >= 0 && times[last] >= start && times[last] <= end ? last : -1;
}

export function isAmbiguous(cut: CutFeature): boolean {
  return !!cut.properties.ambiguous_bearing && !cut.properties.resolved;
}

/** A cut as a step or a menu names it: "Towed array cut at 09:31:00Z". */
export function cutTitle(cut: CutFeature, sensorName: string, settings: FormatSettings = DEFAULT_SETTINGS): string {
  return `${sensorName} cut at ${formatTime(Date.parse(cut.properties.time), settings)}`;
}

/** A bearing as the analyst reads it: 045.0°. */
export function bearingText(value: number): string {
  return `${fixed(((value % 360) + 360) % 360, 1).padStart(5, "0")}°`;
}

/** What a cut says when pointed at: its sensor and time, its bearings and which side each is on, which was kept, its range, label and comment. */
export function describeCut(cut: CutFeature, sensorName: string, course: number | undefined, settings: FormatSettings = DEFAULT_SETTINGS): string {
  const props = cut.properties;
  const first = degrees(props.bearing);
  const side = (b: number) => (course === undefined ? "" : ` (${sideOf(course, b)})`);
  const lines = [cutTitle(cut, sensorName, settings)];
  if (props.ambiguous_bearing) {
    const twin = degrees(props.ambiguous_bearing);
    if (!props.resolved) lines.push(`Ambiguous: ${bearingText(first)}${side(first)} or ${bearingText(twin)}${side(twin)}`);
    else {
      const kept = props.resolved === "bearing" ? first : twin;
      const other = props.resolved === "bearing" ? twin : first;
      lines.push(`Bearing ${bearingText(kept)}${side(kept)} kept; ${bearingText(other)} discarded`);
    }
  } else lines.push(`Bearing ${bearingText(first)}`);
  if (props.range) lines.push(`Range ${formatRange({ value: metres(props.range), unit: "m" }, settings)}`);
  if (props.label) lines.push(`Label: ${props.label}`);
  if (props.comment) lines.push(`Comment: ${props.comment}`);
  return lines.join("\n");
}

/** A sensor's details in a list: "132 cuts · 40 ambiguous · 92 resolved". */
export function sensorDetail(entry: SensorEntry): string {
  const ambiguous = entry.cuts.filter(isAmbiguous).length;
  const resolved = entry.cuts.filter((c) => !!c.properties.resolved).length;
  const parts = [`${entry.cuts.length} ${entry.cuts.length === 1 ? "cut" : "cuts"}`];
  if (ambiguous) parts.push(`${ambiguous} ambiguous`);
  if (resolved) parts.push(`${resolved} resolved`);
  return parts.join(" · ");
}

/** Any feature's name as a list or a step says it: a cut by its sensor and time. */
export function featureName(feature: Feature, plot?: DebriefFeatureCollection): string {
  const props = feature.properties as { kind: string; name?: string; sensor_id?: string; time?: string; source?: string; title?: string };
  if (props.kind === "sensor_cut") {
    const sensor = plot?.features.find((f) => f.id === props.sensor_id);
    const name = sensor && sensor.properties.kind === "sensor" ? sensor.properties.name : "Sensor";
    return cutTitle(feature as CutFeature, name);
  }
  return props.name ?? props.source ?? props.title ?? feature.id;
}

/** A cut's own menu, as both hosts offer it: either bearing it has not kept, with its side; ambiguous again once resolved. */
export function cutChoices(cut: CutFeature, course: number | undefined): { label: string; keep: Kept | "ambiguous"; detail?: string }[] {
  const props = cut.properties;
  if (!props.ambiguous_bearing) return [];
  const side = (b: number) => (course === undefined ? "" : ` (${sideOf(course, b)})`);
  const first = degrees(props.bearing);
  const twin = degrees(props.ambiguous_bearing);
  const out: { label: string; keep: Kept | "ambiguous"; detail?: string }[] = [];
  if (props.resolved !== "bearing") out.push({ label: `Keep ${bearingText(first)}${side(first)}`, keep: "bearing" });
  if (props.resolved !== "ambiguous_bearing") out.push({ label: `Keep ${bearingText(twin)}${side(twin)}`, keep: "ambiguous_bearing" });
  if (props.resolved) out.push({ label: "Make ambiguous again", keep: "ambiguous", detail: "Draw both bearings again" });
  return out;
}

/**
 * What a click on a cut's line does (CAP-22; product owner, 24 Oct 2026): a plain click,
 * or a tap, selects the cut and shows its choices beside it; Ctrl (or Cmd) adds it to the
 * selection; Alt on one of an ambiguous cut's two lines keeps that line's bearing, one
 * step. The clicks of a double-click after the first do nothing, so zooming with one on a
 * line never changes it twice.
 */
export type CutClick = "ignore" | "keep" | "add" | "select";
export function cutClick(click: { detail: number; alt: boolean; add: boolean }, ambiguous: boolean, readOnly: boolean): CutClick {
  if (click.detail > 1) return "ignore";
  if (click.add) return "add";
  if (click.alt && ambiguous && !readOnly) return "keep";
  return "select";
}

/** The cut current time is at for a sensor, within the window (or its last at or before current time, without one). */
export function cutNow(entry: SensorEntry, at: number, window?: { start: number; end: number }): CutFeature | undefined {
  const index = currentCut(entry.times, at, window?.start ?? -Infinity, window?.end ?? Infinity);
  return index >= 0 ? entry.cuts[index] : undefined;
}

/** Keeping a side, as the menus offer it: port and starboard for every cut, as legacy offered them, or both again. */
export const KEEP_CHOICES: { keep: Keep; label: string; detail: string }[] = [
  { keep: "port", label: "Keep port bearing", detail: "Keep the bearing to port of the host's course; the other is no longer drawn" },
  { keep: "starboard", label: "Keep starboard bearing", detail: "Keep the bearing to starboard of the host's course; the other is no longer drawn" },
  { keep: "ambiguous", label: "Make ambiguous again", detail: "Draw both bearings again, as they were read in" },
];

/** Which cuts a resolution is for: the current cut, those in the time window, those selected, or all. */
export type CutScope = "current" | "window" | "selected" | "all";

/** What the analyst is looking at when keeping a side: the sensors asked about, the selection, the time window and current time. */
export interface ResolveContext {
  entries: SensorEntry[];
  selected: readonly string[];
  window?: { start: number; end: number };
  at?: number;
}

/** The cuts a scope means, in time order within each sensor; none if it means none. */
export function cutsInScope(scope: CutScope, context: ResolveContext): CutFeature[] {
  const out: CutFeature[] = [];
  const selected = new Set(context.selected);
  const shown = (c: CutFeature) => !c.properties.hidden;
  for (const entry of context.entries) {
    if (scope === "selected") {
      out.push(...entry.cuts.filter((c) => selected.has(c.id)));
      continue;
    }
    // A hidden sensor's cuts, or a hidden cut, are left out of a period or all, as the
    // service leaves them (they are named to be resolved: select them).
    if (entry.sensor.properties.hidden) continue;
    if (scope === "all") out.push(...entry.cuts.filter(shown));
    else if (context.window) {
      const { start, end } = context.window;
      if (scope === "window") {
        const [first, last] = inPeriod(entry.times, start, end);
        out.push(...entry.cuts.slice(first, last).filter(shown));
      } else {
        const now = currentCut(entry.times, context.at ?? end, start, end);
        if (now >= 0) out.push(entry.cuts[now]);
      }
    }
  }
  return out;
}

const SCOPE_WORDS: Record<CutScope, string> = {
  current: "The cut at the current time",
  window: "Cuts in the time window",
  selected: "Selected cuts",
  all: "All cuts",
};

/** The scopes a menu offers, each with how many cuts it holds and how many have two bearings; scopes holding none are left out. */
export function scopeChoices(context: ResolveContext): { scope: CutScope; label: string; detail: string; cuts: number }[] {
  return (["current", "window", "selected", "all"] as CutScope[])
    .map((scope) => {
      const cuts = cutsInScope(scope, context);
      const twins = cuts.filter((c) => !!c.properties.ambiguous_bearing).length;
      return { scope, label: SCOPE_WORDS[scope], detail: `${cuts.length} ${cuts.length === 1 ? "cut" : "cuts"}, ${twins} with two bearings`, cuts: cuts.length };
    })
    .filter((c) => c.cuts > 0);
}

/**
 * The resolution the service is asked for: the cuts named, or for the time window or all
 * cuts the sensors and the period, so the History and an agent read what was meant. A
 * string says why there is nothing to resolve.
 */
export function resolutionFor(scope: CutScope, keep: Keep, context: ResolveContext, iso: (t: number) => string = (t) => new Date(t).toISOString()): AmbiguityResolution | string {
  const cuts = cutsInScope(scope, context);
  if (!cuts.length) return scope === "current" ? "No cut is at the current time." : scope === "selected" ? "Select cuts on the map first (click a line; Ctrl-click for more)." : "No cuts are in the time window.";
  if (!cuts.some((c) => !!c.properties.ambiguous_bearing)) return "None of these cuts has two bearings.";
  const sensor_ids = context.entries.filter((e) => !e.sensor.properties.hidden).map((e) => e.sensor.id);
  if (scope === "all") return { keep, sensor_ids };
  if (scope === "window" && context.window) return { keep, sensor_ids, period: { start: iso(context.window.start), end: iso(context.window.end) } };
  return { keep, cut_ids: cuts.map((c) => c.id) };
}
