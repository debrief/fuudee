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
  if (edit.action === "move" || edit.action === "shear") return edit.distance ? !edit.distance.value : false;
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

// --- Gestures: a drag, or a run of arrow keys, on a handle ----------------------------

/** The handles on a selected track: move it, rotate it, choose the pivot it rotates about, or shear or stretch it from the start or the end of the period. */
export type TrackRole = "move" | "rotate" | "pivot" | Anchor;

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
}

export function startGesture(role: TrackRole, origin: LonLat, mode?: EndMode): Gesture {
  return { role, origin, at: origin, degrees: 0, ...(isEnd(role) && { mode: mode ?? "shear" }) };
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
  if (g.role === "move") {
    const { metres, bearing } = rangeBearing(g.origin, g.at);
    return { positions: shifted(t.positions, t.indices, metres, bearing), edit: moveEdit(metres, bearing, t.period, settings), readout: moveReadout(t.name, metres, bearing, t.part, settings) };
  }
  if (g.role === "rotate") {
    return { positions: turned(t.positions, t.indices, t.pivot, g.degrees), edit: rotateEdit(g.degrees, t.pivot, t.period, settings), readout: rotateReadout(t.name, g.degrees, t.pivot, t.part, settings) };
  }
  return undefined;
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
    const positions = stretched(t.positions, t.times, t.indices, anchor, factor);
    const readout = before.metres > 0 ? stretchReadout(t.name, before.speed * factor, before.speed, t.part, settings) : `${t.name} ends where it starts, so it cannot be stretched: shear it instead.`;
    return { positions, edit, readout, handle: positions[dragged], unchanged: before.metres === 0 || edit.speed!.value === was };
  }
  const { metres, bearing } = rangeBearing(t.positions[dragged], g.at);
  const edit = shearEdit(anchor, metres, bearing, t.period, settings);
  const to = travel(t.positions[dragged], edit.bearing!.value, convert(edit.distance!, "m").value);
  const positions = sheared(t.positions, t.times, t.indices, anchor, to);
  const readout = shearReadout(t.name, legOf(positions, t.times, t.indices), end, edit, t.part, settings);
  return { positions, edit, readout, handle: positions[dragged] };
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
