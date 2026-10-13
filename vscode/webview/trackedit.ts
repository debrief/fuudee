/**
 * Moving and rotating a track on the map, and reading the values the analyst
 * types for it (CAP-01, CAP-02, NFR-13), kept free of Leaflet so it can be
 * tested. The map's handles (trackmap.ts) and the "Move track…" and "Rotate
 * track…" forms in VS Code and the playground all describe a change as a
 * TrackEdit; the tool service makes it, as one recorded step.
 *
 * Geodesic, as debrief_stac.tracks does it (SUB-03): a move takes each fix in
 * the period the same range along the same true bearing; a rotation keeps each
 * fix's range from the pivot and turns its bearing from the pivot. What the
 * map shows while the analyst drags is worked out the same way, so what is
 * drawn is what is saved. Fixes outside the period stay put: the joins jump.
 */
import { DEFAULT_SETTINGS, fixed, formatBearing, formatPosition, formatQuantity, formatTime, UNIT_LABELS, type FormatSettings } from "@debrief/kernel";
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

/** Where a rotation turns about unless the analyst chooses: the fix in the period nearest current time, when that is within the period's fixes; else the period's first fix. */
export function defaultPivotIndex(times: number[], indices: number[], current?: number): number {
  let choice = indices[0];
  if (current !== undefined && times[indices[0]] <= current && current <= times[indices[indices.length - 1]]) {
    let best = Infinity;
    for (const i of indices) {
      const d = Math.abs(times[i] - current);
      if (d < best) [best, choice] = [d, i];
    }
  }
  return choice;
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
  let far = { metres: 0, bearing: 0 };
  for (const i of indices) {
    const rb = rangeBearing(pivot, positions[i]);
    if (rb.metres > far.metres) far = rb;
  }
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

/** Whether a change would move nothing, once rounded as it is saved. */
export function changesNothing(edit: TrackEdit): boolean {
  if (edit.action === "move") return !edit.distance?.value;
  return !(edit.angle?.value ?? 0) || (edit.angle?.value ?? 0) % 360 === 0;
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

/** The handles on a selected track: move it, rotate it, or choose the pivot it rotates about. */
export type TrackRole = "move" | "rotate" | "pivot";

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
}

export function startGesture(role: TrackRole, origin: LonLat): Gesture {
  return { role, origin, at: origin, degrees: 0 };
}

/** The gesture with the handle dragged to `to`: the move handle and the pivot go there; the rotate handle turns as seen from the pivot. */
export function dragGesture(g: Gesture, to: LonLat, pivot: LonLat): Gesture {
  return g.role === "rotate" ? { ...g, degrees: turnBetween(pivot, g.origin, to) } : { ...g, at: to };
}

/** Screen positions for a map position, and back: so an arrow key moves a handle by pixels, as on the map. */
export interface Screen {
  toPoint(p: LonLat): [number, number];
  toLonLat(p: [number, number]): LonLat;
}

/** The gesture after one more arrow key. Right and Up turn the rotate handle clockwise. Other keys change nothing. */
export function pressKey(g: Gesture, key: string, shift: boolean, screen: Screen): Gesture {
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
  /** The fixes that change. */
  indices: number[];
  /** Whether that is fewer than all of them. */
  part: boolean;
  pivot: LonLat;
  /** The period sent, if only the fixes in the window change. */
  period?: { start: string; end: string };
}

/** What a gesture does to the track: its positions now, the change to save and what the map says. None for the pivot, which records nothing. */
export function gestureChange(g: Gesture, t: Target, settings: FormatSettings = DEFAULT_SETTINGS): { positions: LonLat[]; edit: TrackEdit; readout: string } | undefined {
  if (g.role === "move") {
    const { metres, bearing } = rangeBearing(g.origin, g.at);
    return { positions: shifted(t.positions, t.indices, metres, bearing), edit: moveEdit(metres, bearing, t.period, settings), readout: moveReadout(t.name, metres, bearing, t.part, settings) };
  }
  if (g.role === "rotate") {
    return { positions: turned(t.positions, t.indices, t.pivot, g.degrees), edit: rotateEdit(g.degrees, t.pivot, t.period, settings), readout: rotateReadout(t.name, g.degrees, t.pivot, t.part, settings) };
  }
  return undefined;
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

/** An angle to rotate by, as typed: "12" or "12 clockwise", "-12" or "12 anticlockwise". */
export function readTurn(text: string): number | { problem: string } {
  const match = /^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*°?\s*(clockwise|anticlockwise|cw|acw)?\s*$/i.exec(text);
  if (!match) return { problem: "Type an angle in degrees: positive or 'clockwise' turns clockwise, negative or 'anticlockwise' the other way." };
  let value = Number(match[1]);
  const sense = match[2]?.toLowerCase();
  if (sense === "anticlockwise" || sense === "acw") value = -Math.abs(value);
  if (Math.abs(value) >= 360) return { problem: "Type an angle of less than 360 degrees." };
  if (!value) return { problem: "An angle of 0 turns nothing." };
  return value;
}

/** What a distance typed means, for the form to say beneath it: "1.20 nmi". */
export function describeDistance(distance: { value: number; unit: string }, settings: FormatSettings = DEFAULT_SETTINGS): string {
  return formatQuantity(distance, settings);
}
