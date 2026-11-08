/**
 * Dead reckoning, as debrief_stac.tracks and debrief_stac.reckoning do it, held to the vectors
 * they are (schemas/vectors/dead-reckoning.json): a track plotted by dead reckoning, and its
 * edits by origin, courses and speeds. Moved from the extension's webview/trackedit.ts, which
 * draws and describes these edits.
 */
import { convert } from "./units.js";
import { rangeBearing, travel, type LonLat } from "./geodesic.js";

/** Which end of the period a shear or a stretch holds fixed; the other end is dragged. */
export type Anchor = "start" | "end";

/** The fix a shear or a stretch holds and the fix it drags: undefined when the period's fixes are all at one time. */
export function endsOf(times: number[], indices: number[], anchor: Anchor): [number, number] | undefined {
  const first = indices[0];
  const last = indices[indices.length - 1];
  if (!(times[last] > times[first])) return undefined;
  return anchor === "start" ? [first, last] : [last, first];
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
