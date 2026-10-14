/**
 * Moving, rotating, shearing and stretching a track on the map, and reading the
 * values the analyst types for it (CAP-01, CAP-02, CAP-21, NFR-13), kept free of
 * Leaflet so it can be tested. The map's handles (trackmap.ts) and the "Move
 * track…", "Rotate track…", "Shear track…" and "Stretch track…" forms in VS Code
 * and the playground all describe a change as a TrackEdit; the tool service
 * makes it, as one recorded step.
 *
 * Geodesic, as debrief_stac.tracks does it (SUB-03): a move takes each fix in
 * the period the same range along the same true bearing; a rotation keeps each
 * fix's range from the pivot and turns its bearing from the pivot; a shear and a
 * stretch hold one end of the period and work in the azimuthal equidistant frame
 * about it (see sheared and stretched). What the
 * map shows while the analyst drags is worked out the same way, so what is
 * drawn is what is saved. Fixes outside the period stay put: the joins jump.
 */
import { convert, DEFAULT_SETTINGS, fixed, formatBearing, formatPosition, formatQuantity, formatTime, UNIT_LABELS, type FormatSettings } from "@debrief/kernel";
import type { TrackEdit } from "@debrief/schemas";
import { lengthIn, onTheGlobe } from "./drawing.js";
import { DR_TAG } from "./fixes.js";
import { rangeBearing, travel, type LonLat } from "./geodesic.js";

/** A span of time, in milliseconds. */
export interface Span {
  start: number;
  end: number;
}

/** The fixes a period takes in, ends included: every fix with no period. */
export function periodIndices(times: number[], period?: Span): number[] {
  const out: number[] = [];
  times.forEach((t, i) => {
    if (!period || (t >= period.start && t <= period.end)) out.push(i);
  });
  return out;
}

/** The track's positions with the fixes at indices taken metres along bearing (true), each along its own geodesic. */
export function shifted(positions: LonLat[], indices: number[], metres: number, bearing: number): LonLat[] {
  const out = positions.map((p) => [p[0], p[1]] as LonLat);
  if (!metres) return out;
  for (const i of indices) out[i] = travel(positions[i], bearing, metres);
  return out;
}

/** The track's positions with the fixes at indices turned about pivot by degrees (clockwise positive), each keeping its range from it. */
export function turned(positions: LonLat[], indices: number[], pivot: LonLat, degrees: number): LonLat[] {
  const out = positions.map((p) => [p[0], p[1]] as LonLat);
  if (!(degrees % 360)) return out;
  for (const i of indices) {
    const { metres, bearing } = rangeBearing(pivot, positions[i]);
    if (metres > 0) out[i] = travel(pivot, bearing + degrees, metres);
  }
  return out;
}

/**
 * Where a rotation turns about unless the analyst chooses: the fix in the period nearest
 * current time, when that is within the period's fixes; else the period's first fix.
 * Found by halving (times are in order), as it is worked out again each frame of playback.
 */
export function defaultPivotIndex(times: number[], indices: number[], current?: number): number {
  const last = indices.length - 1;
  if (current === undefined || !(times[indices[0]] <= current && current <= times[indices[last]])) return indices[0];
  // The first fix in the period at or after current time, then whichever of it and the one before is nearer (the earlier on a tie).
  let [lo, hi] = [0, last];
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[indices[mid]] < current) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && current - times[indices[lo - 1]] <= times[indices[lo]] - current) lo -= 1;
  return indices[lo];
}

/** The angle, in degrees in (-180, 180], from the bearing of `from` to that of `to`, seen from pivot: positive is clockwise. */
export function turnBetween(pivot: LonLat, from: LonLat, to: LonLat): number {
  const a = rangeBearing(pivot, from).bearing;
  const b = rangeBearing(pivot, to).bearing;
  let d = (((b - a) % 360) + 360) % 360;
  if (d > 180) d -= 360;
  return d;
}

/** Where the handles go: the move handle on a fix in the middle of the period, never the pivot's; the rotate handle beyond the fix farthest from the pivot, along the same bearing; none to rotate when every fix is at the pivot. */
export function handlePlaces(positions: LonLat[], indices: number[], pivot: LonLat, pivotIndex?: number): { move: LonLat; rotate?: LonLat } {
  let middle = indices[Math.floor((indices.length - 1) / 2)];
  if (middle === pivotIndex && indices.length > 1) middle = indices[Math.min(indices.length - 1, indices.indexOf(middle) + 1)];
  // The farthest fix, found on a flat approximation (cheap enough for every frame of playback
  // on a long track), then measured along the geodesic: only the handle's place depends on it.
  const cos = Math.cos((pivot[1] * Math.PI) / 180);
  let farthest = -1;
  let most = 0;
  for (const i of indices) {
    const dx = ((((positions[i][0] - pivot[0]) % 360) + 540) % 360 - 180) * cos;
    const dy = positions[i][1] - pivot[1];
    const d = dx * dx + dy * dy;
    if (d > most) [most, farthest] = [d, i];
  }
  const far = farthest < 0 ? { metres: 0, bearing: 0 } : rangeBearing(pivot, positions[farthest]);
  return { move: positions[middle], rotate: far.metres > 0 ? travel(pivot, far.bearing, far.metres * 1.15) : undefined };
}

const angleIn = (degrees: number, settings: FormatSettings) => Number(fixed(degrees, settings.angle_decimals));

/**
 * The move to save: the distance in the analyst's length unit and the bearing,
 * each to the decimals the map showed, so the step says what the map said.
 */
export function moveEdit(metres: number, bearing: number, period?: { start: string; end: string }, settings: FormatSettings = DEFAULT_SETTINGS): TrackEdit {
  const b = angleIn(((bearing % 360) + 360) % 360, settings) % 360;
  return { action: "move", distance: lengthIn(metres, settings.length_unit, settings) as never, bearing: { value: b, unit: "deg" }, ...(period && { period }) };
}

/** The rotation to save: the angle to the decimals the map showed, and the pivot. */
export function rotateEdit(degrees: number, pivot: LonLat, period?: { start: string; end: string }, settings: FormatSettings = DEFAULT_SETTINGS): TrackEdit {
  return { action: "rotate", angle: { value: angleIn(degrees, settings), unit: "deg" }, pivot: onTheGlobe(pivot), ...(period && { period }) };
}

/** Whether a change would move nothing, once rounded as it is saved. A stretch to the speed the period already makes, as shown, is said by the gesture (unchanged). */
export function changesNothing(edit: TrackEdit): boolean {
  if (edit.action === "move" || edit.action === "shear" || edit.action === "move_fix") return edit.distance ? !edit.distance.value : false;
  if (edit.action === "set_plotting_mode") return false;
  if (edit.action === "stretch") return false;
  return !(edit.angle?.value ?? 0) || (edit.angle?.value ?? 0) % 360 === 0;
}

// --- Shearing and stretching (TMA, CAP-21) --------------------------------------------

/** Which end of the period a shear or a stretch holds fixed; the other end is dragged. */
export type Anchor = "start" | "end";
/** What dragging an end of the period does: shear (course and speed change together) or stretch (speed only). */
export type EndMode = "shear" | "stretch";

/** A position as x east and y north, in metres, in the azimuthal equidistant frame about anchor: its geodesic range and bearing from it. As debrief_stac.tracks.AnchorFrame. */
export function frameXY(anchor: LonLat, p: LonLat): [number, number] {
  const { metres, bearing } = rangeBearing(anchor, p);
  const b = (bearing * Math.PI) / 180;
  return [metres * Math.sin(b), metres * Math.cos(b)];
}

/** The position at x east and y north, in metres, in the frame about anchor. */
export function fromFrame(anchor: LonLat, [x, y]: [number, number]): LonLat {
  const r = Math.hypot(x, y);
  return r ? travel(anchor, (Math.atan2(x, y) * 180) / Math.PI, r) : [anchor[0], anchor[1]];
}

/** The fix a shear or a stretch holds and the fix it drags: undefined when the period's fixes are all at one time. */
export function endsOf(times: number[], indices: number[], anchor: Anchor): [number, number] | undefined {
  const first = indices[0];
  const last = indices[indices.length - 1];
  if (!(times[last] > times[first])) return undefined;
  return anchor === "start" ? [first, last] : [last, first];
}

/** What a period makes good: the true bearing, at its first fix, of the geodesic to its last; the range; the seconds; and the speed, in metres a second. */
export interface Leg {
  course: number;
  metres: number;
  seconds: number;
  speed: number;
}

export function legOf(positions: LonLat[], times: number[], indices: number[]): Leg {
  const first = indices[0];
  const last = indices[indices.length - 1];
  const { metres, bearing } = rangeBearing(positions[first], positions[last]);
  const seconds = (times[last] - times[first]) / 1000;
  return { course: bearing, metres, seconds, speed: seconds > 0 ? metres / seconds : 0 };
}

/**
 * The positions sheared, as debrief_stac.tracks.sheared: the anchor held, the other
 * end dragged to `to`, and each fix at indices moved by that displacement (in the
 * anchor's frame) times its fraction of the time from the anchor to the dragged end.
 */
export function sheared(positions: LonLat[], times: number[], indices: number[], anchor: Anchor, to: LonLat): LonLat[] {
  const out = positions.map((p) => [p[0], p[1]] as LonLat);
  const ends = endsOf(times, indices, anchor);
  if (!ends) return out;
  const [held, dragged] = ends;
  const a = positions[held];
  const e = frameXY(a, positions[dragged]);
  const t = frameXY(a, to);
  const [dx, dy] = [t[0] - e[0], t[1] - e[1]];
  if (Math.hypot(dx, dy) < 1e-6) return out;
  const span = times[dragged] - times[held];
  for (const i of indices) {
    const f = (times[i] - times[held]) / span;
    const [x, y] = frameXY(a, positions[i]);
    out[i] = fromFrame(a, [x + f * dx, y + f * dy]);
  }
  return out;
}

/** The positions stretched, as debrief_stac.tracks.stretched: the anchor held, and each fix at indices taken along its bearing from it to factor times its range. */
export function stretched(positions: LonLat[], times: number[], indices: number[], anchor: Anchor, factor: number): LonLat[] {
  const out = positions.map((p) => [p[0], p[1]] as LonLat);
  const ends = endsOf(times, indices, anchor);
  if (!ends || factor <= 0 || factor === 1) return out;
  const a = positions[ends[0]];
  for (const i of indices) {
    const [x, y] = frameXY(a, positions[i]);
    out[i] = fromFrame(a, [x * factor, y * factor]);
  }
  return out;
}

/** How far a drag takes a stretch: the drag of the end projected on to the line from the anchor to the end, as the factor ranges from the anchor are scaled by. */
export function stretchFactor(anchor: LonLat, end: LonLat, to: LonLat): number {
  const e = frameXY(anchor, end);
  const t = frameXY(anchor, to);
  const ee = e[0] * e[0] + e[1] * e[1];
  return ee ? (e[0] * t[0] + e[1] * t[1]) / ee : 1;
}

/** A speed in metres a second in the analyst's unit, to the decimals shown. */
export function speedIn(metresPerSecond: number, settings: FormatSettings = DEFAULT_SETTINGS): number {
  return Number(fixed(convert({ value: metresPerSecond, unit: "m/s" }, settings.speed_unit).value, settings.speed_decimals));
}

/** The smallest change of speed shown: one step of the arrow keys on a stretch handle (ten with Shift). */
export const speedStep = (settings: FormatSettings = DEFAULT_SETTINGS) => 10 ** -settings.speed_decimals;

const toMetresPerSecond = (speed: number, settings: FormatSettings) => convert({ value: speed, unit: settings.speed_unit }, "m/s").value;
const speedText = (metresPerSecond: number, settings: FormatSettings) => formatQuantity({ value: metresPerSecond, unit: "m/s" }, settings);
const courseSpeed = (leg: Leg, settings: FormatSettings) => `${formatBearing({ value: leg.course, unit: "deg" }, settings)} ${speedText(leg.speed, settings)}`;

/** The shear to save from a drag: the end's displacement in the analyst's length unit and its bearing, each to the decimals the map showed. */
export function shearEdit(anchor: Anchor, metres: number, bearing: number, period?: { start: string; end: string }, settings: FormatSettings = DEFAULT_SETTINGS): TrackEdit {
  const { distance, bearing: b } = moveEdit(metres, bearing, undefined, settings);
  return { action: "shear", anchor, distance, bearing: b, ...(period && { period }) };
}

/** The stretch to save: the speed made good, in the analyst's unit, to the decimals shown. */
export function stretchEdit(anchor: Anchor, speed: number, period?: { start: string; end: string }, settings: FormatSettings = DEFAULT_SETTINGS): TrackEdit {
  return { action: "stretch", anchor, speed: { value: Number(fixed(speed, settings.speed_decimals)), unit: settings.speed_unit as never }, ...(period && { period }) };
}

const PART_CHANGES = "only the fixes in the time window change, so the track jumps where they meet the rest";

/** What the map says while an end is sheared: "BLUE ONE: shearing to 087.2°T 12.4 kn; end moved 1.20 nmi 045.0°T". */
export function shearReadout(name: string, leg: Leg, end: Anchor, edit: TrackEdit, part: boolean, settings: FormatSettings = DEFAULT_SETTINGS): string {
  const text = `${name}: shearing to ${courseSpeed(leg, settings)}; ${end} moved ${formatQuantity(edit.distance!, settings)} ${formatBearing(edit.bearing!, settings)}`;
  return part ? `${text}; ${PART_CHANGES}` : text;
}

/** What the map says while an end is stretched: "BLUE ONE: stretching to 12.4 kn (was 11.6 kn)". */
export function stretchReadout(name: string, metresPerSecond: number, wasMetresPerSecond: number, part: boolean, settings: FormatSettings = DEFAULT_SETTINGS): string {
  const text = `${name}: stretching to ${speedText(metresPerSecond, settings)} (was ${speedText(wasMetresPerSecond, settings)})`;
  return part ? `${text}; ${PART_CHANGES}` : text;
}

/** Where a shear's or a stretch's handles go: on the period's first and last fixes, when they are at different times. */
export function endPlaces(positions: LonLat[], times: number[], indices: number[]): { start?: LonLat; end?: LonLat } {
  if (!endsOf(times, indices, "start")) return {};
  return { start: positions[indices[0]], end: positions[indices[indices.length - 1]] };
}

/** An angle as the map and the step say it: "12.0° clockwise". */
export function describeTurn(degrees: number, settings: FormatSettings = DEFAULT_SETTINGS): string {
  const text = fixed(Math.abs(degrees), settings.angle_decimals);
  if (!Number(text)) return `${text}°`;
  return `${text}° ${degrees > 0 ? "clockwise" : "anticlockwise"}`;
}

const PART = "only the fixes in the time window move, so the track jumps where they meet the rest";

/** What the map says while a track is dragged: "BLUE ONE: moving 1.20 nmi 045.0°T". */
export function moveReadout(name: string, metres: number, bearing: number, part: boolean, settings: FormatSettings = DEFAULT_SETTINGS): string {
  const edit = moveEdit(metres, bearing, undefined, settings);
  const text = `${name}: moving ${formatQuantity(edit.distance!, settings)} ${formatBearing(edit.bearing!, settings)}`;
  return part ? `${text}; ${PART}` : text;
}

/** What the map says while a track is turned: "BLUE ONE: rotating 12.0° clockwise about 50°20.120'N 004°07.210'W". */
export function rotateReadout(name: string, degrees: number, pivot: LonLat, part: boolean, settings: FormatSettings = DEFAULT_SETTINGS): string {
  const text = `${name}: rotating ${describeTurn(angleIn(degrees, settings), settings)} about ${formatPosition({ longitude: pivot[0], latitude: pivot[1] }, settings)}`;
  return part ? `${text}; ${PART}` : text;
}

/** What the map says of the pivot as it is moved: no step, only where the next rotation turns about. */
export function pivotReadout(name: string, pivot: LonLat, settings: FormatSettings = DEFAULT_SETTINGS): string {
  return `${name}: rotations turn about ${formatPosition({ longitude: pivot[0], latitude: pivot[1] }, settings)}`;
}

/** What a period is called in the interface: "09:30:00Z to 10:15:00Z". */
export function describeSpan(span: Span, settings: FormatSettings = DEFAULT_SETTINGS): string {
  return `${formatTime(span.start, settings)} to ${formatTime(span.end, settings)}`;
}

// --- A single fix moved (CAP-01) --------------------------------------------------------
//
// As legacy Debrief: only that fix moves, along the geodesic from where it was; its time is
// unchanged and its neighbours stay. Its recorded course and speed are kept (they are what
// the platform logged, not worked out from the plotted positions), as for a move of the
// whole track; what the positions now imply, the speed to reach the fix and to go on from
// it, is said while it is dragged, so the analyst sees whether it has become a jump.

/** The fix at a time: where two fixes share it, the first, as for a mark. -1 if none. */
export function fixIndexAt(times: string[], time: string): number {
  const at = Date.parse(time);
  return times.findIndex((t) => Date.parse(t) === at);
}

/** The track's positions with the fix at index put at `to`; every other fix where it was. */
export function fixMoved(positions: LonLat[], index: number, to: LonLat): LonLat[] {
  const out = positions.map((p) => [p[0], p[1]] as LonLat);
  out[index] = [to[0], to[1]];
  return out;
}

/** A speed the positions imply between a fix and its neighbour. */
export interface ImpliedSpeed {
  /** The neighbour's time, in milliseconds. */
  time: number;
  /** Metres a second; null for no time between them. */
  speed: number | null;
}

/** The speeds the positions imply to reach the fix at index from the fix before, and from it to the fix after: geodesic range over elapsed time; none at an end. As debrief_stac.tracks.implied_speeds. */
export function impliedSpeeds(positions: LonLat[], times: number[], index: number): { into?: ImpliedSpeed; out?: ImpliedSpeed } {
  const between = (a: number, b: number, other: number): ImpliedSpeed => {
    const seconds = Math.abs(times[b] - times[a]) / 1000;
    return { time: times[other], speed: seconds > 0 ? rangeBearing(positions[a], positions[b]).metres / seconds : null };
  };
  return {
    ...(index > 0 && { into: between(index - 1, index, index - 1) }),
    ...(index + 1 < times.length && { out: between(index, index + 1, index + 1) }),
  };
}

const KNOT = 1852 / 3600;
/** Above this speed (metres a second), to reach a fix or go on from it, the readout says it is as fast as a jump: as jump removal's default, three times the track's median speed between fixes, and at least 10 kn. */
export function jumpSpeed(positions: LonLat[], times: number[]): number {
  const speeds: number[] = [];
  for (let i = 0; i + 1 < times.length; i++) {
    const seconds = (times[i + 1] - times[i]) / 1000;
    if (seconds > 0) speeds.push(rangeBearing(positions[i], positions[i + 1]).metres / seconds);
  }
  speeds.sort((a, b) => a - b);
  const n = speeds.length;
  const median = n ? (n % 2 ? speeds[(n - 1) / 2] : (speeds[n / 2 - 1] + speeds[n / 2]) / 2) : 0;
  return Math.max(3 * median, 10 * KNOT);
}

/** The single fix moved, to save: its time, and the distance in the analyst's length unit and the bearing, each to the decimals the map showed. */
export function fixEdit(time: string, metres: number, bearing: number, settings: FormatSettings = DEFAULT_SETTINGS): TrackEdit {
  const { distance, bearing: b } = moveEdit(metres, bearing, undefined, settings);
  return { action: "move_fix", fix_time: time, distance, bearing: b };
}

/** The single fix put at a position, as the forms send it. */
export function fixToEdit(time: string, position: LonLat): TrackEdit {
  return { action: "move_fix", fix_time: time, position: onTheGlobe(position) };
}

/** Where a fix goes for an edit: the distance and bearing (as rounded) from where it is, or the position. */
export function fixTarget(from: LonLat, edit: TrackEdit): LonLat {
  if (edit.position) return [edit.position[0], edit.position[1]];
  return travel(from, edit.bearing!.value, convert(edit.distance!, "m").value);
}

const speedSaid = (implied: ImpliedSpeed, settings: FormatSettings) => (implied.speed === null ? "no time at all" : speedText(implied.speed, settings));

/**
 * What the map and the forms say of a fix moved: "RED ONE fix at 09:31:00Z: moving 0.42 nmi
 * 045.0°T; 37.2 kn from 09:30:00Z, 13.2 kn on to 09:32:00Z", and, when either is faster than
 * `jump` (metres a second), that it is as fast as a jump.
 */
export function fixReadout(
  name: string,
  time: number,
  metres: number,
  bearing: number,
  implied: { into?: ImpliedSpeed; out?: ImpliedSpeed },
  jump?: number,
  settings: FormatSettings = DEFAULT_SETTINGS,
  verb = "moving",
): string {
  const edit = moveEdit(metres, bearing, undefined, settings);
  const speeds = [
    ...(implied.into ? [`${speedSaid(implied.into, settings)} from ${formatTime(implied.into.time, settings)}`] : []),
    ...(implied.out ? [`${speedSaid(implied.out, settings)} on to ${formatTime(implied.out.time, settings)}`] : []),
  ];
  let text = `${name} fix at ${formatTime(time, settings)}: ${verb} ${formatQuantity(edit.distance!, settings)} ${formatBearing(edit.bearing!, settings)}`;
  if (speeds.length) text += `; ${speeds.join(", ")}`;
  const fast = [implied.into, implied.out].some((i) => i && (i.speed === null || (jump !== undefined && i.speed > jump)));
  if (fast && jump !== undefined) text += `: faster than ${speedText(jump, settings)}, as a jump would be`;
  return text;
}

/**
 * What the map and the forms say of a fix of a DR track moved: "RED ONE (DR) fix at 09:43:00Z:
 * moving 0.42 nmi 045.0°T; leg into it now 056.5°T 12.1 kn; the fixes after follow", and, when
 * that leg is faster than `jump`, that it is as fast as a jump. The first fix moved moves where
 * dead reckoning starts.
 */
export function drFixReadout(name: string, time: number, metres: number, bearing: number, leg: DrLeg | undefined, jump?: number, settings: FormatSettings = DEFAULT_SETTINGS, verb = "moving"): string {
  const edit = moveEdit(metres, bearing, undefined, settings);
  let text = `${drName(name)} fix at ${formatTime(time, settings)}: ${verb} ${formatQuantity(edit.distance!, settings)} ${formatBearing(edit.bearing!, settings)}`;
  if (!leg) return `${text}; dead reckoning starts here, so every fix follows`;
  text += `; leg into it now ${drCourseSpeed(leg.course, leg.speed, settings)} (was ${drCourseSpeed(leg.wasCourse, leg.wasSpeed, settings)}); the fixes after follow`;
  if (jump !== undefined && leg.speed > jump) text += `: faster than ${speedText(jump, settings)}, as a jump would be`;
  return text;
}

/** What "Move a fix…" asks: over the ground, only that fix moves; plotted by dead reckoning, the leg into it changes and the fixes after follow. */
export const FIX_PROMPT = "Where it goes: only this fix moves; its time, recorded course and speed stay";
export const FIX_PROMPT_DR = "Where it goes: plotted by dead reckoning, the leg into this fix changes so it goes there, and the fixes after it follow";

/** What a form says of a fix put at `to`, as the map says it while dragging: over the ground, the speeds to reach it and go on; plotted by dead reckoning, the leg into it. */
export function fixMeans(name: string, positions: LonLat[], times: number[], index: number, to: LonLat, jump: number, reckoning?: Reckoning, settings: FormatSettings = DEFAULT_SETTINGS): string {
  const { metres, bearing } = rangeBearing(positions[index], to);
  if (reckoning) {
    const made = drFixMoved(positions, times, reckoning, index, to);
    if (!made) return sameTime(name, times[index], settings);
    return drFixReadout(name, times[index], metres, bearing, made.leg, jump, settings, "moves");
  }
  return fixReadout(name, times[index], metres, bearing, impliedSpeeds(fixMoved(positions, index, to), times, index), jump, settings, "moves");
}

/** The most fixes given handles of their own at once; and how far apart on the screen, in pixels, neighbouring fixes must be: closer, the map says to zoom in. */
export const MOST_FIX_HANDLES = 60;
export const FIX_SPACING_PX = 14;

/**
 * Which fixes get a handle of their own: those on the screen (within `size`, and a small
 * margin), when there are few enough and they are far enough apart to grab one (the median
 * gap on the screen between neighbours, among those shown, at least FIX_SPACING_PX).
 * Otherwise none, and whether zooming in would show them.
 */
export function fixHandleIndices(points: [number, number][], size: [number, number]): { indices: number[]; zoomIn?: boolean } {
  const margin = 8;
  const on = (p: [number, number]) => p[0] >= -margin && p[1] >= -margin && p[0] <= size[0] + margin && p[1] <= size[1] + margin;
  const indices = points.flatMap((p, i) => (on(p) ? [i] : []));
  if (!indices.length) return { indices: [] };
  if (indices.length > MOST_FIX_HANDLES) return { indices: [], zoomIn: true };
  const gaps: number[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    if (on(points[i]) || on(points[i + 1])) gaps.push(Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]));
  }
  gaps.sort((a, b) => a - b);
  const median = gaps.length ? gaps[Math.floor(gaps.length / 2)] : Infinity;
  return median >= FIX_SPACING_PX ? { indices } : { indices: [], zoomIn: true };
}

/** The fixes at indices plotted by dead reckoning, as debrief_stac.tracks.dead_reckoned_positions: the first stays; each after it is placed from the one before by that fix's course (degrees true) and speed (metres a second) over the time between, along the geodesic. */
export function deadReckoned(positions: LonLat[], times: number[], indices: number[], courses: number[], speeds: number[]): LonLat[] {
  const out = positions.map((p) => [p[0], p[1]] as LonLat);
  for (let k = 1; k < indices.length; k++) {
    const [a, b] = [indices[k - 1], indices[k]];
    out[b] = travel(out[a], courses[a], (speeds[a] * (times[b] - times[a])) / 1000);
  }
  return out;
}

// --- Editing a track plotted by dead reckoning (decision, product owner, 14 Oct 2026) ---
//
// As debrief_stac.reckoning: on a DR track the truth is its origin (the first fix's
// position) and each fix's course and speed, the leg from it to the next fix; positions are
// always worked out from them. A move of the whole track moves the origin; a fix dragged
// changes the leg into it; a rotation turns the courses in the period; a stretch scales the
// speeds; a shear adds one set and drift to every leg in the period. The fixes after follow
// on: there is no jump where the period meets the rest. The map previews exactly what the
// tool service will make (the shared vectors, schemas/vectors/dead-reckoning.json).

/** A DR track's courses (degrees true) and speeds (metres a second), one of each per fix. */
export interface Reckoning {
  courses: number[];
  speeds: number[];
}

/** The leg into a fix, changed so dead reckoning puts the fix somewhere else: as it now is and as it was. */
export interface DrLeg {
  index: number;
  course: number;
  speed: number;
  wasCourse: number;
  wasSpeed: number;
}

/** A DR edit: the positions worked out, the courses and speeds, and what it changed. */
export interface DrResult extends Reckoning {
  positions: LonLat[];
  /** The leg into the fix moved (none when the origin moved). */
  leg?: DrLeg;
  /** A shear's set and drift, east and north, metres a second. */
  added?: [number, number];
}

/** How close a solved end comes to where it was dragged, in metres, as debrief_stac.reckoning.SOLVED_M. */
const SOLVED_M = 1e-4;
const ITERATIONS = 40;

/** The fixes worked out from the origin by dead reckoning, up to and including fix upto. */
export function reckon(origin: LonLat, times: number[], r: Reckoning, upto = times.length - 1): LonLat[] {
  const out: LonLat[] = [[origin[0], origin[1]]];
  for (let i = 1; i <= upto; i++) {
    const metres = (r.speeds[i - 1] * (times[i] - times[i - 1])) / 1000;
    out.push(metres ? travel(out[i - 1], r.courses[i - 1], metres) : [out[i - 1][0], out[i - 1][1]]);
  }
  return out;
}

class DrState {
  origin: LonLat;
  courses: number[];
  speeds: number[];
  constructor(
    readonly here: LonLat[],
    readonly times: number[],
    r: Reckoning,
  ) {
    this.origin = [here[0][0], here[0][1]];
    this.courses = r.courses.map((c) => ((c % 360) + 360) % 360);
    this.speeds = [...r.speeds];
  }
  set(i: number, course: number, speed: number): void {
    this.courses[i] = ((course % 360) + 360) % 360;
    this.speeds[i] = speed;
  }
  positions(upto?: number): LonLat[] {
    return reckon(this.origin, this.times, this, upto);
  }
  result(extra: Partial<DrResult> = {}): DrResult {
    return { positions: this.positions(), courses: this.courses, speeds: this.speeds, ...extra };
  }
  /** Change the course and speed of the fix before index so dead reckoning from it reaches `to`; undefined for two fixes at one time. */
  legInto(index: number, to: LonLat): DrLeg | undefined {
    const seconds = (this.times[index] - this.times[index - 1]) / 1000;
    if (!(seconds > 0)) return undefined;
    const { metres, bearing } = rangeBearing(this.here[index - 1], to);
    const [wasCourse, wasSpeed] = [this.courses[index - 1], this.speeds[index - 1]];
    this.set(index - 1, metres > 0 ? bearing : wasCourse, metres / seconds);
    return { index, course: this.courses[index - 1], speed: this.speeds[index - 1], wasCourse, wasSpeed };
  }
  /** Put fix start at `to`: the origin, or the leg into it. False when it cannot be. */
  moveStart(start: number, to: LonLat): DrLeg | null | false {
    if (start === 0) {
      this.origin = [to[0], to[1]];
      return null;
    }
    return this.legInto(start, to) ?? false;
  }
}

const velocity = (course: number, speed: number): [number, number] => [speed * Math.sin((course * Math.PI) / 180), speed * Math.cos((course * Math.PI) / 180)];

/** One velocity (east, north) added to the course and speed of every fix at indices, found so fix last lands at target: as debrief_stac.reckoning._solve_set. */
function solveSet(s: DrState, indices: number[], last: number, target: LonLat): [number, number] {
  const base = new Map(indices.map((i) => [i, velocity(s.courses[i], s.speeds[i])]));
  const kept = new Map(indices.map((i) => [i, s.courses[i]]));
  const seconds = (s.times[last] - s.times[indices[0]]) / 1000;
  let [east, north] = [0, 0];
  for (let k = 0; k < ITERATIONS; k++) {
    for (const i of indices) {
      const [ve, vn] = [base.get(i)![0] + east, base.get(i)![1] + north];
      const speed = Math.hypot(ve, vn);
      s.set(i, speed > 0 ? (Math.atan2(ve, vn) * 180) / Math.PI : kept.get(i)!, speed);
    }
    const end = s.positions(last)[last];
    const { metres, bearing } = rangeBearing(end, target);
    if (metres < SOLVED_M) break;
    const [de, dn] = velocity(bearing, metres);
    [east, north] = [east + de / seconds, north + dn / seconds];
  }
  return [east, north];
}

/** Move fix start (the origin, or by the leg into it) so fix last lands at held: holding a period's end. */
function placeStartForEnd(s: DrState, start: number, last: number, held: LonLat): boolean {
  let at: LonLat = [s.here[start][0], s.here[start][1]];
  for (let k = 0; k < ITERATIONS; k++) {
    if (s.moveStart(start, at) === false) return false;
    const end = s.positions(last)[last];
    const { metres, bearing } = rangeBearing(end, held);
    if (metres < SOLVED_M) return true;
    at = travel(at, bearing, metres);
  }
  return true;
}

/** One fix dragged to `to`: the leg into it changed (the origin moved, for the first fix); later fixes follow. Undefined at the time of the fix before. */
export function drFixMoved(positions: LonLat[], times: number[], r: Reckoning, index: number, to: LonLat): DrResult | undefined {
  const s = new DrState(positions, times, r);
  const leg = s.moveStart(index, to);
  return leg === false ? undefined : s.result(leg ? { leg } : {});
}

/** A move of the fixes at indices: of the origin when they start at the first fix; otherwise of the leg into the first of them. */
export function drMoved(positions: LonLat[], times: number[], r: Reckoning, indices: number[], metres: number, bearing: number): DrResult | undefined {
  const s = new DrState(positions, times, r);
  if (!metres) return s.result();
  const leg = s.moveStart(indices[0], travel(positions[indices[0]], bearing, metres));
  return leg === false ? undefined : s.result(leg ? { leg } : {});
}

/** What a DR rotation of the fixes at indices turns about: the pivot when they start at the first fix; otherwise their own first fix. */
export const drPivot = (positions: LonLat[], indices: number[], pivot: LonLat): LonLat => (indices[0] === 0 ? pivot : positions[indices[0]]);

/** The courses of the fixes at indices turned by degrees (clockwise positive); the origin turned about the pivot when they start at the first fix. */
export function drTurned(positions: LonLat[], times: number[], r: Reckoning, indices: number[], pivot: LonLat, degrees: number): DrResult {
  const s = new DrState(positions, times, r);
  if (!(degrees % 360)) return s.result();
  for (const i of indices) s.set(i, s.courses[i] + degrees, s.speeds[i]);
  if (indices[0] === 0) {
    const { metres, bearing } = rangeBearing(pivot, s.origin);
    if (metres > 0) s.origin = travel(pivot, bearing + degrees, metres);
  }
  return s.result();
}

/** The speeds of the fixes at indices multiplied by factor; held at the end, the start moved so the end stays. */
export function drStretched(positions: LonLat[], times: number[], r: Reckoning, indices: number[], anchor: Anchor, factor: number): DrResult | undefined {
  const s = new DrState(positions, times, r);
  if (!endsOf(times, indices, anchor) || factor <= 0 || factor === 1) return s.result();
  for (const i of indices) s.set(i, s.courses[i], s.speeds[i] * factor);
  const last = indices[indices.length - 1];
  if (anchor === "end" && !placeStartForEnd(s, indices[0], last, positions[last])) return undefined;
  return s.result();
}

/** The period's dragged end to `to`, by one set and drift added to every leg in it; held at the end, the start put at `to` and the set found so the end stays. */
export function drSheared(positions: LonLat[], times: number[], r: Reckoning, indices: number[], anchor: Anchor, to: LonLat): DrResult | undefined {
  const s = new DrState(positions, times, r);
  const ends = endsOf(times, indices, anchor);
  if (!ends || rangeBearing(positions[ends[1]], to).metres < 1e-6) return s.result();
  const last = indices[indices.length - 1];
  if (anchor === "start") return s.result({ added: solveSet(s, indices, last, to) });
  if (s.moveStart(indices[0], to) === false) return undefined;
  return s.result({ added: solveSet(s, indices, last, positions[last]) });
}

/** A DR track's courses and speeds in degrees true and metres a second, from its properties; undefined unless it is plotted by dead reckoning with both recorded. */
export function reckoningOf(props: { plotting_mode?: string | null; courses?: { unit: string; values: number[] } | null; speeds?: { unit: string; values: number[] } | null }): Reckoning | undefined {
  if (props.plotting_mode !== "dr" || !props.courses || !props.speeds) return undefined;
  const { courses, speeds } = props;
  return {
    courses: courses.values.map((v) => convert({ value: v, unit: courses.unit }, "deg").value),
    speeds: speeds.values.map((v) => convert({ value: v, unit: speeds.unit }, "m/s").value),
  };
}

const drName = (name: string) => `${name} (${DR_TAG})`;
const DR_FOLLOW_ON = "the fixes after follow on, by dead reckoning";

// --- Gestures: a drag, or a run of arrow keys, on a handle ----------------------------

/** The handles on a selected track: move it, rotate it, choose the pivot it rotates about, shear or stretch it from the start or the end of the period, or move one fix. */
export type TrackRole = "move" | "rotate" | "pivot" | "fix" | Anchor;

/** Whether a handle is on an end of the period (shear or stretch). */
export const isEnd = (role: TrackRole): role is Anchor => role === "start" || role === "end";

/** Pixels an arrow key moves the move handle or the pivot; with Shift, five times as far. As for an annotation's handles. */
export const NUDGE_PX = 5;
/** Degrees an arrow key turns the rotate handle; with Shift, ten times as far. */
export const TURN_STEP = 1;

/** One drag or one run of arrow keys on a handle, from where it began. */
export interface Gesture {
  role: TrackRole;
  /** Where the handle was when the gesture began. */
  origin: LonLat;
  /** Where the move handle or the pivot is now. */
  at: LonLat;
  /** How far the rotate handle has turned, clockwise positive. */
  degrees: number;
  /** On an end of the period: shear or stretch. */
  mode?: EndMode;
  /** A stretch made with the arrow keys: the speed made good asked for, in the analyst's unit. */
  speed?: number;
  /** On a fix's own handle: the fix's time, as the track writes it. */
  fixTime?: string;
}

export function startGesture(role: TrackRole, origin: LonLat, mode?: EndMode, fixTime?: string): Gesture {
  return { role, origin, at: origin, degrees: 0, ...(isEnd(role) && { mode: mode ?? "shear" }), ...(fixTime !== undefined && { fixTime }) };
}

/** The gesture with the handle dragged to `to`: the move handle, the pivot and an end go there (a stretch takes only how far along the leg); the rotate handle turns as seen from the pivot. */
export function dragGesture(g: Gesture, to: LonLat, pivot: LonLat): Gesture {
  return g.role === "rotate" ? { ...g, degrees: turnBetween(pivot, g.origin, to) } : { ...g, at: to, speed: undefined };
}

/** Screen positions for a map position, and back: so an arrow key moves a handle by pixels, as on the map. */
export interface Screen {
  toPoint(p: LonLat): [number, number];
  toLonLat(p: [number, number]): LonLat;
}

/**
 * The gesture after one more arrow key. Right and Up turn the rotate handle clockwise; on a
 * stretch handle, Up and Right are faster by one step of speed, Down and Left slower, from
 * `speed` (the speed the period makes good, for the first press). Other keys change nothing.
 */
export function pressKey(g: Gesture, key: string, shift: boolean, screen: Screen, speed?: number, settings: FormatSettings = DEFAULT_SETTINGS): Gesture {
  if (g.mode === "stretch") {
    const sense = key === "ArrowRight" || key === "ArrowUp" ? 1 : key === "ArrowLeft" || key === "ArrowDown" ? -1 : 0;
    const from = g.speed ?? speed;
    if (!sense || from === undefined) return g;
    const step = speedStep(settings);
    return { ...g, speed: Math.max(step, Number(fixed(from + sense * step * (shift ? 10 : 1), settings.speed_decimals))) };
  }
  if (g.role === "rotate") {
    const sense = key === "ArrowRight" || key === "ArrowUp" ? 1 : key === "ArrowLeft" || key === "ArrowDown" ? -1 : 0;
    return { ...g, degrees: g.degrees + sense * TURN_STEP * (shift ? 10 : 1) };
  }
  const step = shift ? NUDGE_PX * 5 : NUDGE_PX;
  const d = ({ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<string, [number, number]>)[key];
  if (!d) return g;
  const [x, y] = screen.toPoint(g.at);
  return { ...g, at: screen.toLonLat([x + d[0], y + d[1]]) };
}

/** A track, and what of it a gesture changes. */
export interface Target {
  name: string;
  positions: LonLat[];
  /** The fixes' times, in milliseconds. */
  times: number[];
  /** The fixes that change. */
  indices: number[];
  /** Whether that is fewer than all of them. */
  part: boolean;
  pivot: LonLat;
  /** The period sent, if only the fixes in the window change. */
  period?: { start: string; end: string };
  /** The fixes' times as the track writes them: to find a fix by its time. */
  fixTimes?: string[];
  /** Above this speed (metres a second), a fix moved is said to be as fast as a jump. */
  jump?: number;
  /** Plotted by dead reckoning: its courses and speeds, which every gesture but a move of the whole track changes. */
  reckoning?: Reckoning;
}

/** What a gesture changes: the positions now, the change to save, what the map says, where the handle in use is drawn, and whether it would change nothing as shown. */
export interface GestureChange {
  positions: LonLat[];
  edit: TrackEdit;
  readout: string;
  handle?: LonLat;
  unchanged?: boolean;
}

/** What a gesture does to the track. None for the pivot, which records nothing, or an end when the period's fixes are all at one time. */
export function gestureChange(g: Gesture, t: Target, settings: FormatSettings = DEFAULT_SETTINGS): GestureChange | undefined {
  if (isEnd(g.role)) return endChange(g, g.role, t, settings);
  if (g.role === "fix") return fixChange(g, t, settings);
  if (t.reckoning) return drChange(g, t, t.reckoning, settings);
  if (g.role === "move") {
    const { metres, bearing } = rangeBearing(g.origin, g.at);
    return { positions: shifted(t.positions, t.indices, metres, bearing), edit: moveEdit(metres, bearing, t.period, settings), readout: moveReadout(t.name, metres, bearing, t.part, settings) };
  }
  if (g.role === "rotate") {
    return { positions: turned(t.positions, t.indices, t.pivot, g.degrees), edit: rotateEdit(g.degrees, t.pivot, t.period, settings), readout: rotateReadout(t.name, g.degrees, t.pivot, t.part, settings) };
  }
  return undefined;
}

/** A move or a rotation of a DR track: the origin moved, the leg into the period changed, or the courses turned; the fixes after follow on. */
function drChange(g: Gesture, t: Target, r: Reckoning, settings: FormatSettings): GestureChange | undefined {
  const name = drName(t.name);
  if (g.role === "move") {
    const { metres, bearing } = rangeBearing(g.origin, g.at);
    const edit = moveEdit(metres, bearing, t.period, settings);
    const made = drMoved(t.positions, t.times, r, t.indices, convert(edit.distance!, "m").value, edit.bearing!.value);
    if (!made) return refusedLeg(t, edit, settings);
    let readout = `${name}: moving ${formatQuantity(edit.distance!, settings)} ${formatBearing(edit.bearing!, settings)}`;
    const into = made.leg && formatTime(t.times[made.leg.index], settings);
    if (made.leg) readout += `; leg into ${into} now ${drCourseSpeed(made.leg.course, made.leg.speed, settings)}; it and the fixes after follow, by dead reckoning`;
    else if (t.part) readout += `; dead reckoning starts from the first fix, so every fix follows`;
    return { positions: made.positions, edit, readout };
  }
  if (g.role === "rotate") {
    const pivot = drPivot(t.positions, t.indices, t.pivot);
    const edit = rotateEdit(g.degrees, pivot, t.period, settings);
    const made = drTurned(t.positions, t.times, r, t.indices, pivot, edit.angle!.value);
    const after = t.indices[t.indices.length - 1] < t.times.length - 1;
    let readout = `${name}: rotating ${describeTurn(angleIn(g.degrees, settings), settings)} about ${formatPosition({ longitude: pivot[0], latitude: pivot[1] }, settings)}`;
    if (t.part) readout += `; the courses in the time window turn${after ? `, and ${DR_FOLLOW_ON}` : ""}`;
    return { positions: made.positions, edit, readout };
  }
  return undefined;
}

const drCourseSpeed = (course: number, speed: number, settings: FormatSettings) => `${formatBearing({ value: course, unit: "deg" }, settings)} ${speedText(speed, settings)}`;

/** A DR change that cannot be made: the fix is at the time of the fix before, so no leg reaches it. Nothing moves. */
function refusedLeg(t: Target, edit: TrackEdit, settings: FormatSettings): GestureChange {
  return { positions: t.positions, edit, readout: sameTime(t.name, t.times[t.indices[0]], settings), unchanged: true };
}

/** Why a fix of a DR track at the time of the fix before cannot be put anywhere else, as debrief_stac.reckoning says it. */
function sameTime(name: string, time: number, settings: FormatSettings): string {
  return `${drName(name)}: its fix at ${formatTime(time, settings)} is at the same time as the fix before it, so dead reckoning cannot put it anywhere else: move the fix before it.`;
}

/** A shear or a stretch from dragging (or nudging) an end of the period. The change is worked out from the values as saved (rounded as shown), so what the map draws is what the step makes. */
function endChange(g: Gesture, end: Anchor, t: Target, settings: FormatSettings): GestureChange | undefined {
  const anchor: Anchor = end === "start" ? "end" : "start";
  const ends = endsOf(t.times, t.indices, anchor);
  if (!ends) return undefined;
  const [held, dragged] = ends;
  const before = legOf(t.positions, t.times, t.indices);
  if (g.mode === "stretch") {
    const was = speedIn(before.speed, settings);
    const asked = g.speed ?? speedIn(stretchFactor(t.positions[held], t.positions[dragged], g.at) * before.speed, settings);
    const speed = Math.max(speedStep(settings), asked);
    const edit = stretchEdit(anchor, speed, t.period, settings);
    const factor = before.speed > 0 ? toMetresPerSecond(edit.speed!.value, settings) / before.speed : 1;
    if (t.reckoning) {
      const made = drStretched(t.positions, t.times, t.reckoning, t.indices, anchor, factor);
      if (!made) return refusedLeg(t, edit, settings);
      const readout = before.metres > 0 ? `${stretchReadout(drName(t.name), before.speed * factor, before.speed, false, settings)}; ${drTail("every speed", "is scaled", t)}` : `${drName(t.name)} ends where it starts, so it cannot be stretched: shear it instead.`;
      return { positions: made.positions, edit, readout, handle: made.positions[dragged], unchanged: before.metres === 0 || edit.speed!.value === was };
    }
    const positions = stretched(t.positions, t.times, t.indices, anchor, factor);
    const readout = before.metres > 0 ? stretchReadout(t.name, before.speed * factor, before.speed, t.part, settings) : `${t.name} ends where it starts, so it cannot be stretched: shear it instead.`;
    return { positions, edit, readout, handle: positions[dragged], unchanged: before.metres === 0 || edit.speed!.value === was };
  }
  const { metres, bearing } = rangeBearing(t.positions[dragged], g.at);
  const edit = shearEdit(anchor, metres, bearing, t.period, settings);
  const to = travel(t.positions[dragged], edit.bearing!.value, convert(edit.distance!, "m").value);
  if (t.reckoning) {
    const made = drSheared(t.positions, t.times, t.reckoning, t.indices, anchor, to);
    if (!made) return refusedLeg(t, edit, settings);
    const readout = `${shearReadout(drName(t.name), legOf(made.positions, t.times, t.indices), end, edit, false, settings)}; ${drTail("one set and drift is added to every leg", "", t)}`;
    return { positions: made.positions, edit, readout, handle: made.positions[dragged] };
  }
  const positions = sheared(t.positions, t.times, t.indices, anchor, to);
  const readout = shearReadout(t.name, legOf(positions, t.times, t.indices), end, edit, t.part, settings);
  return { positions, edit, readout, handle: positions[dragged] };
}

/** How a DR shear or stretch ends what it says: "every speed is scaled"; for the time window, "every speed in the time window is scaled, and the fixes after follow on, by dead reckoning". */
function drTail(what: string, verb: string, t: Target): string {
  const after = t.indices[t.indices.length - 1] < t.times.length - 1;
  const text = `${what}${t.part ? " in the time window" : ""}${verb ? ` ${verb}` : ""}`;
  return t.part && after ? `${text}, and ${DR_FOLLOW_ON}` : text;
}

/** A single fix dragged (or nudged): it alone goes, by the distance and bearing as saved (rounded as shown), so what the map draws is what the step makes. */
function fixChange(g: Gesture, t: Target, settings: FormatSettings): GestureChange | undefined {
  const index = g.fixTime !== undefined && t.fixTimes ? fixIndexAt(t.fixTimes, g.fixTime) : -1;
  if (index < 0) return undefined;
  const { metres, bearing } = rangeBearing(g.origin, g.at);
  const edit = fixEdit(t.fixTimes![index], metres, bearing, settings);
  const to = fixTarget(t.positions[index], edit);
  if (t.reckoning) {
    const made = drFixMoved(t.positions, t.times, t.reckoning, index, to);
    if (!made) return { ...refusedLeg({ ...t, indices: [index] }, edit, settings), handle: t.positions[index] };
    return { positions: made.positions, edit, readout: drFixReadout(t.name, t.times[index], metres, bearing, made.leg, t.jump, settings), handle: made.positions[index] };
  }
  const positions = fixMoved(t.positions, index, to);
  const readout = fixReadout(t.name, t.times[index], metres, bearing, impliedSpeeds(positions, t.times, index), t.jump, settings);
  return { positions, edit, readout, handle: to };
}

/** How long after the last arrow key a run of presses is sent as one change, as for an annotation's handles. */
export const SETTLE_MS = 800;

/**
 * A run of arrow-key presses sent as one change: settled once the presses stop
 * for SETTLE_MS, or at once on Enter or when the keyboard moves on. Presses made
 * while that change is being saved are kept, to be made as the next change.
 */
export class KeyRun<K> {
  private timer?: ReturnType<typeof setTimeout>;
  private kept: K[] = [];
  /** A change has been sent and not yet come back. */
  saving = false;

  constructor(private readonly settled: () => void, private readonly ms = SETTLE_MS) {}

  /** A press: "run" if it joins the run (which settles SETTLE_MS from now), "kept" if a change is being saved. */
  press(key: K): "run" | "kept" {
    if (this.saving) {
      this.kept.push(key);
      return "kept";
    }
    this.stop();
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.settled();
    }, this.ms);
    return "run";
  }

  /** Whether a run is waiting to settle. */
  get running(): boolean {
    return this.timer !== undefined;
  }

  /** Stop waiting (the run was sent now, or put back). */
  stop(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  /** The change came back (or was refused): the presses kept meanwhile, to make now. */
  saved(): K[] {
    this.saving = false;
    const kept = this.kept;
    this.kept = [];
    return kept;
  }

  /** Forget the run and anything kept. */
  clear(): void {
    this.stop();
    this.kept = [];
  }

  get keeping(): boolean {
    return this.kept.length > 0;
  }
}

// --- Values the analyst types: "Move track…" and "Rotate track…" ------------------

/** The units a distance may be typed in, and what the analyst types for each. */
const LENGTHS = ["[nmi_i]", "[yd_i]", "m", "km", "[ft_i]"];
const LENGTH_UNITS: Record<string, string> = { nm: "[nmi_i]", ...Object.fromEntries(LENGTHS.flatMap((unit) => [[UNIT_LABELS[unit], unit], [unit, unit]])) };

/** A distance as typed: "1.2 nmi", "2000 yd", or a number in the analyst's unit. */
export function readDistance(text: string, settings: FormatSettings = DEFAULT_SETTINGS): { value: number; unit: string } | { problem: string } {
  const match = /^\s*(\d+(?:\.\d*)?|\.\d+)\s*([a-z[\]_]*)\s*$/i.exec(text);
  const say = `Type a distance, such as 1.2 ${UNIT_LABELS[settings.length_unit] ?? settings.length_unit}; the units are ${LENGTHS.map((u) => UNIT_LABELS[u]).join(", ")}.`;
  if (!match) return { problem: say };
  const unit = match[2] ? LENGTH_UNITS[match[2].toLowerCase()] : settings.length_unit;
  if (!unit) return { problem: say };
  return { value: Number(match[1]), unit };
}

/** A bearing as typed, true: "045", "45°T", "45.5". */
export function readBearing(text: string): number | { problem: string } {
  const match = /^\s*(\d+(?:\.\d*)?|\.\d+)\s*(?:°|deg)?\s*T?\s*$/i.exec(text);
  if (!match) return { problem: "Type a bearing in degrees true, such as 045." };
  const value = Number(match[1]);
  if (value > 360) return { problem: "A bearing is from 000 to 360 degrees true." };
  return value % 360;
}

/** The units a speed may be typed in, and what the analyst types for each. */
const SPEEDS = ["[kn_i]", "m/s", "km/h"];
const SPEED_UNITS: Record<string, string> = { kt: "[kn_i]", kts: "[kn_i]", knots: "[kn_i]", ...Object.fromEntries(SPEEDS.flatMap((unit) => [[UNIT_LABELS[unit], unit], [unit, unit]])) };

/** A speed as typed: "12.4", "12.4 kn", "6 m/s", "20 km/h"; a number alone is in the analyst's unit. More than nothing when `positive`. */
export function readSpeed(text: string, settings: FormatSettings = DEFAULT_SETTINGS, positive = false): { value: number; unit: string } | { problem: string } {
  const match = /^\s*(\d+(?:\.\d*)?|\.\d+)\s*([a-z/[\]_]*)\s*$/i.exec(text);
  const say = `Type a speed, such as 12.4 ${UNIT_LABELS[settings.speed_unit] ?? settings.speed_unit}; the units are ${SPEEDS.map((u) => UNIT_LABELS[u]).join(", ")}.`;
  if (!match) return { problem: say };
  const unit = match[2] ? SPEED_UNITS[match[2].toLowerCase()] : settings.speed_unit;
  if (!unit) return { problem: say };
  const value = Number(match[1]);
  if (positive && !value) return { problem: "A stretch needs a speed of more than nothing." };
  return { value, unit };
}

/** What a speed typed means, for the form to say beneath it: "12.4 kn". */
export function describeSpeed(speed: { value: number; unit: string }, settings: FormatSettings = DEFAULT_SETTINGS): string {
  return formatQuantity(speed, settings);
}

/** What the period of a track makes good, as the forms offer it: its course and speed, in the analyst's notation ("090.0°T", "11.6"), and how it is said ("090.0°T 11.6 kn"). Undefined when its fixes are all at one time. */
export function legNow(
  positions: LonLat[],
  times: number[],
  indices: number[],
  settings: FormatSettings = DEFAULT_SETTINGS,
): { course: string; speed: string; said: string; moves: boolean } | undefined {
  if (!indices.length || !endsOf(times, indices, "start")) return undefined;
  const leg = legOf(positions, times, indices);
  const course = fixed(leg.course, settings.angle_decimals).padStart(3 + (settings.angle_decimals ? settings.angle_decimals + 1 : 0), "0");
  return { course, speed: fixed(convert({ value: leg.speed, unit: "m/s" }, settings.speed_unit).value, settings.speed_decimals), said: courseSpeed(leg, settings), moves: leg.metres > 0 };
}

/** An angle to rotate by, as typed: "12" or "12 clockwise", "-12" or "12 anticlockwise". */
export function readTurn(text: string): number | { problem: string } {
  const match = /^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*°?\s*(clockwise|anticlockwise|cw|acw)?\s*$/i.exec(text);
  if (!match) return { problem: "Type an angle in degrees: positive or 'clockwise' turns clockwise, negative or 'anticlockwise' the other way." };
  let value = Number(match[1]);
  const sense = match[2]?.toLowerCase();
  if (sense === "anticlockwise" || sense === "acw") value = -Math.abs(value);
  else if (sense) value = Math.abs(value); // "-10 clockwise" is clockwise, as it says
  if (Math.abs(value) >= 360) return { problem: "Type an angle of less than 360 degrees." };
  if (!value) return { problem: "An angle of 0 turns nothing." };
  return value;
}

// --- Merging: what the merged track is called, and what of the tracks it does not keep ------

/** What merged tracks are called unless the analyst says: the earliest's name; or, for parts of one split track ("BLUE ONE (1)", "BLUE ONE (2)"), the track's own. As debrief_stac.tracks.merged_name. */
export function mergedName(names: string[]): string {
  const parts = names.map((n) => /^(.*\S) \((\d+)\)$/.exec(n));
  const bases = new Set(parts.map((m) => m?.[1]));
  return parts.every((m) => m) && bases.size === 1 ? parts[0]![1] : names[0];
}

interface Mergeable {
  properties: { name: string; times: string[]; speeds?: unknown; courses?: unknown; depths?: unknown };
}

/** The tracks in the order a merge joins them, and what of them it would not keep, said as the step's notes say it: "Courses not kept: BLUE TWO had none". As debrief_stac.tracks.merge. */
export function mergePlan<T extends Mergeable>(tracks: T[]): { ordered: T[]; lost: string[] } {
  const span = (t: T) => [Date.parse(t.properties.times[0]), Date.parse(t.properties.times[t.properties.times.length - 1])];
  const ordered = [...tracks].sort((a, b) => span(a)[0] - span(b)[0] || span(a)[1] - span(b)[1]);
  const lost: string[] = [];
  for (const [member, title] of [["speeds", "Speeds"], ["courses", "Courses"], ["depths", "Depths"]] as const) {
    const missing = ordered.filter((t) => t.properties[member] == null).map((t) => t.properties.name);
    if (missing.length && missing.length < ordered.length) lost.push(`${title} not kept: ${missing.join(", ")} had none`);
  }
  return { ordered, lost };
}

/** What a distance typed means, for the form to say beneath it: "1.20 nmi". */
export function describeDistance(distance: { value: number; unit: string }, settings: FormatSettings = DEFAULT_SETTINGS): string {
  return formatQuantity(distance, settings);
}
