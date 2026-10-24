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
import { pointAt, travel, type LonLat } from "./geodesic.js";

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
  for (const entry of context.entries) {
    if (scope === "all") out.push(...entry.cuts);
    else if (scope === "selected") out.push(...entry.cuts.filter((c) => selected.has(c.id)));
    else if (context.window) {
      const { start, end } = context.window;
      if (scope === "window") {
        const [first, last] = inPeriod(entry.times, start, end);
        out.push(...entry.cuts.slice(first, last));
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
  if (!cuts.length) return scope === "current" ? "No cut is at the current time." : scope === "selected" ? "Select cuts on the map first (Ctrl-click a line)." : "No cuts are in the time window.";
  if (!cuts.some((c) => !!c.properties.ambiguous_bearing)) return "None of these cuts has two bearings.";
  const sensor_ids = context.entries.map((e) => e.sensor.id);
  if (scope === "all") return { keep, sensor_ids };
  if (scope === "window" && context.window) return { keep, sensor_ids, period: { start: iso(context.window.start), end: iso(context.window.end) } };
  return { keep, cut_ids: cuts.map((c) => c.id) };
}
