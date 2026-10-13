/**
 * Moving, rotating, shearing and stretching a track on the map (CAP-01, CAP-02, CAP-21, NFR-13): what a drag or
 * a run of arrow keys makes, what the map says meanwhile, how a run of presses
 * becomes one change, and what the analyst types in "Move track…" and "Rotate
 * track…". The Leaflet side is played in the playground test.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, formatBearing, formatQuantity } from "@debrief/kernel";
import { checkMessage } from "../../src/messages.js";
import { rangeBearing, travel, type LonLat } from "../../webview/geodesic.js";
import {
  changesNothing,
  defaultPivotIndex,
  describeSpeed,
  describeTurn,
  dragGesture,
  endPlaces,
  endsOf,
  frameXY,
  fromFrame,
  gestureChange,
  handlePlaces,
  KeyRun,
  legNow,
  legOf,
  mergedName,
  mergePlan,
  moveEdit,
  moveReadout,
  NUDGE_PX,
  periodIndices,
  pivotReadout,
  pressKey,
  readBearing,
  readDistance,
  readSpeed,
  readTurn,
  rotateEdit,
  rotateReadout,
  SETTLE_MS,
  sheared,
  shifted,
  stretched,
  stretchFactor,
  stretchReadout,
  startGesture,
  turnBetween,
  turned,
  type Screen,
  type Target,
} from "../../webview/trackedit.js";

const MINUTE = 60_000;
const T0 = Date.parse("2026-10-11T09:00:00.000Z");
const TIMES = [0, 10, 20, 30, 40, 50].map((m) => T0 + m * MINUTE);
const BLUE: LonLat[] = [0, 1, 2, 3, 4, 5].map((i) => [-4 + 0.05 * i, 50]);
/** A plain screen for the keyboard: 1 pixel is 0.001° each way, y down. */
const SCREEN: Screen = { toPoint: ([lon, lat]) => [lon * 1000, -lat * 1000], toLonLat: ([x, y]) => [x / 1000, -y / 1000] };
const target = (over: Partial<Target> = {}): Target => ({ name: "BLUE ONE", positions: BLUE, times: TIMES, indices: [0, 1, 2, 3, 4, 5], part: false, pivot: BLUE[0], ...over });

describe("what moves", () => {
  it("is every fix, or those in the period, ends included", () => {
    expect(periodIndices(TIMES)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(periodIndices(TIMES, { start: TIMES[1], end: TIMES[3] })).toEqual([1, 2, 3]);
    expect(periodIndices(TIMES, { start: TIMES[5] + 1, end: TIMES[5] + 2 })).toEqual([]);
  });

  it("rotates about the fix nearest current time in the period, else its first fix", () => {
    const period = [1, 2, 3, 4];
    expect(defaultPivotIndex(TIMES, period, T0 + 24 * MINUTE)).toBe(2);
    expect(defaultPivotIndex(TIMES, period, T0 + 26 * MINUTE)).toBe(3);
    expect(defaultPivotIndex(TIMES, period, T0 + 55 * MINUTE)).toBe(1);
    expect(defaultPivotIndex(TIMES, period, undefined)).toBe(1);
    // Halfway between two fixes: the earlier, as the tool service chooses.
    expect(defaultPivotIndex(TIMES, period, T0 + 25 * MINUTE)).toBe(2);
    expect(defaultPivotIndex(TIMES, period, TIMES[4])).toBe(4);
    expect(defaultPivotIndex(TIMES, [3], TIMES[3])).toBe(3);
  });

  it("finds the pivot and the farthest fix of a long track as a fix-by-fix search would", () => {
    // Worked out again each frame of playback (current time moves the pivot), so it must stay cheap.
    const n = 5000;
    const times = Array.from({ length: n }, (_, i) => T0 + i * 7000 + (i % 3) * 1000);
    const positions: LonLat[] = times.map((_, i) => [179.5 + i * 0.0002, 60 + Math.sin(i / 300) * 0.2]);
    const indices = periodIndices(times, { start: times[100], end: times[4000] });
    for (const current of [times[100], times[2500] + 3000, times[2500] + 3500, times[4000], T0 + 999 * 7000 + 1234]) {
      let nearest = indices[0];
      for (const i of indices) if (Math.abs(times[i] - current) < Math.abs(times[nearest] - current)) nearest = i;
      expect(defaultPivotIndex(times, indices, current)).toBe(nearest);
      const pivot = positions[nearest];
      let far = { metres: 0, bearing: 0 };
      for (const i of indices) {
        const rb = rangeBearing(pivot, positions[i]);
        if (rb.metres > far.metres) far = rb;
      }
      const rotate = rangeBearing(pivot, handlePlaces(positions, indices, pivot, nearest).rotate!);
      expect(rotate.metres).toBeCloseTo(far.metres * 1.15, 0);
      expect(rotate.bearing).toBeCloseTo(far.bearing, 6);
    }
  });

  it("puts the move handle in the middle, never on the pivot, and the rotate handle beyond the farthest fix", () => {
    const places = handlePlaces(BLUE, [0, 1, 2, 3, 4, 5], BLUE[2], 2);
    expect(places.move).toEqual(BLUE[3]);
    const far = rangeBearing(BLUE[2], BLUE[5]);
    const rotate = rangeBearing(BLUE[2], places.rotate!);
    expect(rotate.metres).toBeCloseTo(far.metres * 1.15, 3);
    expect(rotate.bearing).toBeCloseTo(far.bearing, 9);
    // One fix, at the pivot: nothing to rotate.
    expect(handlePlaces(BLUE, [2], BLUE[2], 2).rotate).toBeUndefined();
  });
});

describe("geodesic, as the tool service makes it", () => {
  it("moves every fix the same range along the same bearing", () => {
    const moved = shifted(BLUE, [0, 1, 2, 3, 4, 5], 2222.4, 45);
    moved.forEach((p, i) => {
      const { metres, bearing } = rangeBearing(BLUE[i], p);
      expect(metres).toBeCloseTo(2222.4, 6);
      expect(bearing).toBeCloseTo(45, 9);
    });
  });

  it("moves only the fixes in the period: the joins jump", () => {
    const moved = shifted(BLUE, [2, 3], 5000, 180);
    expect(moved.map((p, i) => p !== BLUE[i] && (p[0] !== BLUE[i][0] || p[1] !== BLUE[i][1]))).toEqual([false, false, true, true, false, false]);
    expect(rangeBearing(moved[1], moved[2]).metres).toBeGreaterThan(rangeBearing(BLUE[1], BLUE[2]).metres);
  });

  it("works far north and across the antimeridian", () => {
    const north: LonLat[] = [[10, 88.5], [40, 88.7], [80, 88.6]];
    shifted(north, [0, 1, 2], 50_000, 300).forEach((p, i) => {
      expect(rangeBearing(north[i], p).metres).toBeCloseTo(50_000, 5);
      expect(rangeBearing(north[i], p).bearing).toBeCloseTo(300, 7);
    });
    const fiji: LonLat[] = [[179.8, -17], [179.95, -17.02]];
    const east = shifted(fiji, [0, 1], 30_000, 90);
    expect(rangeBearing(fiji[1], east[1]).metres).toBeCloseTo(30_000, 5);
  });

  it("rotates each fix about the pivot, keeping its range", () => {
    const pivot = BLUE[0];
    const out = turned(BLUE, [0, 1, 2, 3, 4, 5], pivot, 30);
    expect(out[0]).toEqual(pivot);
    for (let i = 1; i < 6; i++) {
      const before = rangeBearing(pivot, BLUE[i]);
      const after = rangeBearing(pivot, out[i]);
      expect(after.metres).toBeCloseTo(before.metres, 5);
      expect((after.bearing - before.bearing + 360) % 360).toBeCloseTo(30, 7);
    }
    expect(turned(BLUE, [1], pivot, 360)).toEqual(BLUE);
  });

  it("measures a turn as seen from the pivot, clockwise positive, the short way round", () => {
    const pivot: LonLat = [0, 0];
    expect(turnBetween(pivot, [0, 1], [1, 0])).toBeCloseTo(90, 6);
    expect(turnBetween(pivot, [0, 1], [-1, 0])).toBeCloseTo(-90, 6);
    expect(turnBetween(pivot, [-0.1, 1], [0.1, 1])).toBeCloseTo(11.5, 1);
  });
});

describe("what the map says, and what it sends", () => {
  it("says the range and bearing of a move, in the analyst's units", () => {
    expect(moveReadout("BLUE ONE", 2222.4, 45, false)).toBe("BLUE ONE: moving 1.20 nmi 045.0°T");
    expect(moveReadout("BLUE ONE", 2222.4, 45, true)).toBe("BLUE ONE: moving 1.20 nmi 045.0°T; only the fixes in the time window move, so the track jumps where they meet the rest");
  });

  it("says the angle and the pivot of a rotation", () => {
    expect(rotateReadout("BLUE ONE", 12.04, [-4.12, 50.335], false)).toBe("BLUE ONE: rotating 12.0° clockwise about 50°20.100'N 004°07.200'W");
    expect(rotateReadout("BLUE ONE", -3.26, [-4.12, 50.335], false)).toMatch(/^BLUE ONE: rotating 3\.3° anticlockwise about/);
    expect(pivotReadout("BLUE ONE", [-4.12, 50.335])).toBe("BLUE ONE: rotations turn about 50°20.100'N 004°07.200'W");
    expect(describeTurn(0.01)).toBe("0.0°");
  });

  it("sends what it said: distance in the analyst's unit and the bearing, to the decimals shown", () => {
    const edit = moveEdit(2222.4, 45.04, { start: "2026-10-11T09:15:00.000Z", end: "2026-10-11T09:30:00.000Z" });
    expect(edit).toEqual({
      action: "move",
      distance: { value: 1.2, unit: "[nmi_i]" },
      bearing: { value: 45, unit: "deg" },
      period: { start: "2026-10-11T09:15:00.000Z", end: "2026-10-11T09:30:00.000Z" },
    });
    expect(moveEdit(10, 359.99).bearing).toEqual({ value: 0, unit: "deg" });
    expect(rotateEdit(-12.04, [185, 50])).toEqual({ action: "rotate", angle: { value: -12, unit: "deg" }, pivot: [-175, 50] });
    expect(changesNothing(moveEdit(0, 90))).toBe(true);
    expect(moveEdit(1, 90).distance).toEqual({ value: 0.00054, unit: "[nmi_i]" }); // too small for the decimals shown: three figures
    expect(changesNothing(rotateEdit(0.04, [0, 0]))).toBe(true);
    expect(changesNothing(rotateEdit(-1, [0, 0]))).toBe(false);
  });

  it("sends messages the host accepts, and the host refuses an incomplete one", () => {
    for (const edit of [moveEdit(2222.4, 45), rotateEdit(10, BLUE[0])]) {
      expect(() => checkMessage({ kind: "edit_track", feature_id: "track-blue", track_edit: edit })).not.toThrow();
    }
    expect(() => checkMessage({ kind: "edit_track", feature_id: "track-blue" })).toThrow(/edit_track needs track_edit/);
    const fixtures = path.resolve(__dirname, "../../../schemas/fixtures/webview_message");
    for (const name of ["edit-track-move-without-bearing", "edit-track-rotate-with-distance", "edit-track-period-reversed", "edit-track-without-track-edit"]) {
      const raw = JSON.parse(readFileSync(path.join(fixtures, "invalid", "semantic", `${name}.json`), "utf8"));
      expect(() => checkMessage(raw), name).toThrow();
    }
  });
});

describe("gestures", () => {
  it("a drag of the move handle moves the track from where the drag began", () => {
    let g = startGesture("move", BLUE[2]);
    const to: LonLat = [BLUE[2][0] + 0.02, BLUE[2][1] + 0.02];
    g = dragGesture(g, [BLUE[2][0] + 0.01, BLUE[2][1]], BLUE[0]);
    g = dragGesture(g, to, BLUE[0]); // never applied twice: always from the start
    const change = gestureChange(g, target())!;
    const { metres, bearing } = rangeBearing(BLUE[2], to);
    expect(rangeBearing(BLUE[0], change.positions[0]).metres).toBeCloseTo(metres, 5);
    expect(change.edit).toEqual(moveEdit(metres, bearing));
    expect(change.readout).toBe(moveReadout("BLUE ONE", metres, bearing, false));
  });

  it("a drag of the rotate handle turns the track about the pivot", () => {
    const pivot = BLUE[0];
    const handle: LonLat = [-3.7, 50];
    const g = dragGesture(startGesture("rotate", handle), turned([handle], [0], pivot, 25)[0], pivot);
    expect(g.degrees).toBeCloseTo(25, 6);
    const change = gestureChange(g, target({ pivot }))!;
    expect(change.edit).toEqual({ action: "rotate", angle: { value: 25, unit: "deg" }, pivot });
  });

  it("arrow keys move the move handle by pixels and turn the rotate handle by degrees; a run adds up", () => {
    let move = startGesture("move", [-3.9, 50]);
    for (let i = 0; i < 3; i++) move = pressKey(move, "ArrowRight", false, SCREEN);
    move = pressKey(move, "ArrowUp", true, SCREEN);
    expect(move.at[0]).toBeCloseTo(-3.9 + (3 * NUDGE_PX) / 1000, 9);
    expect(move.at[1]).toBeCloseTo(50 + (5 * NUDGE_PX) / 1000, 9);
    expect(move.origin).toEqual([-3.9, 50]);
    let rotate = startGesture("rotate", [-3.7, 50]);
    rotate = pressKey(rotate, "ArrowRight", false, SCREEN);
    rotate = pressKey(rotate, "ArrowUp", false, SCREEN);
    rotate = pressKey(rotate, "ArrowLeft", true, SCREEN);
    expect(rotate.degrees).toBe(-8);
    expect(gestureChange(rotate, target())!.readout).toMatch(/rotating 8\.0° anticlockwise/);
    expect(pressKey(rotate, "Enter", false, SCREEN)).toEqual(rotate);
    // The pivot moves too, but records nothing.
    expect(gestureChange(pressKey(startGesture("pivot", BLUE[0]), "ArrowDown", false, SCREEN), target())).toBeUndefined();
  });

  it("a move of only the fixes in the window says so, and sends the window", () => {
    const window = { start: "2026-10-11T09:15:00.000Z", end: "2026-10-11T09:30:00.000Z" };
    const g = dragGesture(startGesture("move", BLUE[2]), [BLUE[2][0], BLUE[2][1] + 0.01], BLUE[0]);
    const change = gestureChange(g, target({ indices: [2, 3], part: true, period: window }))!;
    expect(change.edit.period).toEqual(window);
    expect(change.readout).toMatch(/only the fixes in the time window move/);
    expect(change.positions[1]).toEqual(BLUE[1]);
    expect(change.positions[4]).toEqual(BLUE[4]);
  });
});

describe("a run of arrow keys is one change", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("settles once the presses stop, not before", () => {
    const settled = vi.fn();
    const run = new KeyRun<string>(settled);
    run.press("ArrowRight");
    vi.advanceTimersByTime(SETTLE_MS - 100);
    run.press("ArrowRight");
    vi.advanceTimersByTime(SETTLE_MS - 100);
    run.press("ArrowRight");
    expect(settled).not.toHaveBeenCalled();
    expect(run.running).toBe(true);
    vi.advanceTimersByTime(SETTLE_MS);
    expect(settled).toHaveBeenCalledTimes(1);
    expect(run.running).toBe(false);
  });

  it("keeps the presses made while the change is being saved, for the next change", () => {
    const settled = vi.fn();
    const run = new KeyRun<string>(settled);
    run.saving = true;
    expect(run.press("ArrowLeft")).toBe("kept");
    expect(run.press("ArrowLeft")).toBe("kept");
    expect(run.keeping).toBe(true);
    vi.advanceTimersByTime(SETTLE_MS * 2);
    expect(settled).not.toHaveBeenCalled();
    expect(run.saved()).toEqual(["ArrowLeft", "ArrowLeft"]);
    expect(run.saving).toBe(false);
    expect(run.press("ArrowLeft")).toBe("run");
  });

  it("is put back, with nothing kept, by Escape", () => {
    const settled = vi.fn();
    const run = new KeyRun<string>(settled);
    run.press("ArrowUp");
    run.clear();
    vi.advanceTimersByTime(SETTLE_MS * 2);
    expect(settled).not.toHaveBeenCalled();
  });
});

describe("what the analyst types", () => {
  it("reads a distance with its unit, or in the analyst's", () => {
    expect(readDistance("1.2 nmi")).toEqual({ value: 1.2, unit: "[nmi_i]" });
    expect(readDistance("2000yd")).toEqual({ value: 2000, unit: "[yd_i]" });
    expect(readDistance(" 3 KM ")).toEqual({ value: 3, unit: "km" });
    expect(readDistance("1.5")).toEqual({ value: 1.5, unit: DEFAULT_SETTINGS.length_unit });
    expect(readDistance("1.5 nm")).toEqual({ value: 1.5, unit: "[nmi_i]" });
    expect(readDistance("far")).toEqual({ problem: "Type a distance, such as 1.2 nmi; the units are nmi, yd, m, km, ft." });
    expect(readDistance("-2 nmi")).toHaveProperty("problem");
    expect(readDistance("2 furlongs")).toHaveProperty("problem");
  });

  it("reads a bearing in degrees true", () => {
    expect(readBearing("045")).toBe(45);
    expect(readBearing("45°T")).toBe(45);
    expect(readBearing("360")).toBe(0);
    expect(readBearing("400")).toEqual({ problem: "A bearing is from 000 to 360 degrees true." });
    expect(readBearing("NE")).toHaveProperty("problem");
  });

  it("reads an angle to rotate by, with its sense", () => {
    expect(readTurn("12")).toBe(12);
    expect(readTurn("-12")).toBe(-12);
    expect(readTurn("12 anticlockwise")).toBe(-12);
    expect(readTurn("12° clockwise")).toBe(12);
    // A sense given wins over a sign: "-12 clockwise" turns clockwise, as it says.
    expect(readTurn("-12 clockwise")).toBe(12);
    expect(readTurn("-12 anticlockwise")).toBe(-12);
    expect(readTurn("0")).toEqual({ problem: "An angle of 0 turns nothing." });
    expect(readTurn("400")).toHaveProperty("problem");
  });
});

describe("merging", () => {
  const track = (name: string, start: number, has: { courses?: boolean; depths?: boolean } = {}) => ({
    properties: {
      name,
      times: [T0 + start * MINUTE, T0 + (start + 10) * MINUTE].map((t) => new Date(t).toISOString()),
      speeds: { unit: "[kn_i]", values: [1, 2] },
      ...(has.courses !== false && { courses: { unit: "deg", values: [0, 0] } }),
      ...(has.depths && { depths: { unit: "m", values: [5, 5] } }),
    },
  });

  it("calls parts of one split track by the track's name again, else the earliest's", () => {
    expect(mergedName(["BLUE ONE (1)", "BLUE ONE (2)"])).toBe("BLUE ONE");
    expect(mergedName(["BLUE ONE (1)", "RED ONE (2)"])).toBe("BLUE ONE (1)");
    expect(mergedName(["BLUE ONE", "BLUE TWO"])).toBe("BLUE ONE");
  });

  it("says, before merging, what would not be kept, in time order", () => {
    const later = track("BLUE TWO", 30, { courses: false });
    const plan = mergePlan([later, track("BLUE ONE", 0, { depths: true })]);
    expect(plan.ordered.map((t) => t.properties.name)).toEqual(["BLUE ONE", "BLUE TWO"]);
    expect(plan.lost).toEqual(["Courses not kept: BLUE TWO had none", "Depths not kept: BLUE TWO had none"]);
    expect(mergePlan([track("A", 0), track("B", 20)]).lost).toEqual([]);
  });
});

// --- Shearing and stretching (TMA, CAP-21) ------------------------------------------------

const KNOT = 1852 / 3600;
/** A straight leg at a steady speed, along the geodesic from start at course, a fix every 10 minutes. */
function leg(start: LonLat, course: number, knots: number, n = 6): LonLat[] {
  return Array.from({ length: n }, (_, i) => travel(start, course, knots * KNOT * 600 * i));
}
const LEG = leg([-4, 50], 90, 10);
const ALL = [0, 1, 2, 3, 4, 5];
const legTarget = (over: Partial<Target> = {}): Target => target({ positions: LEG, pivot: LEG[0], ...over });

describe("shearing and stretching, as the tool service does", () => {
  it("shears a straight, steady leg into another, the held end fixed", () => {
    const to = travel(LEG[0], 45, 14 * KNOT * 3000);
    const after = sheared(LEG, TIMES, ALL, "start", to);
    expect(after[0]).toEqual(LEG[0]);
    const made = legOf(after, TIMES, ALL);
    expect(made.course).toBeCloseTo(45, 6);
    expect(made.speed / KNOT).toBeCloseTo(14, 6);
    // Every fix on the new leg, where its time puts it.
    for (let i = 0; i < 6; i++) expect(rangeBearing(after[i], travel(LEG[0], 45, 14 * KNOT * 600 * i)).metres).toBeLessThan(1e-3);
  });

  it("moves each fix by its fraction of the time from the held end", () => {
    const minutes = [0, 7, 15, 40, 60];
    const times = minutes.map((m) => T0 + m * MINUTE);
    const track: LonLat[] = [
      [-4, 50],
      [-3.95, 50.02],
      [-3.93, 50.06],
      [-3.97, 50.1],
      [-4.02, 50.11],
    ];
    const to = travel(track[4], 200, 3000);
    const after = sheared(track, times, [0, 1, 2, 3, 4], "start", to);
    const end = frameXY(track[0], track[4]);
    const d = frameXY(track[0], to).map((v, k) => v - end[k]);
    minutes.forEach((m, i) => {
      const was = frameXY(track[0], track[i]);
      const moved = frameXY(track[0], after[i]).map((v, k) => v - was[k]);
      expect(moved[0]).toBeCloseTo((m / 60) * d[0], 4);
      expect(moved[1]).toBeCloseTo((m / 60) * d[1], 4);
    });
    expect(fromFrame(track[0], frameXY(track[0], track[3]))[1]).toBeCloseTo(track[3][1], 9);
  });

  it("stretches a leg along its own line, the held end fixed", () => {
    const after = stretched(LEG, TIMES, ALL, "end", 1.5);
    expect(after[5]).toEqual(LEG[5]);
    expect(legOf(after, TIMES, ALL).speed / KNOT).toBeCloseTo(15, 6);
    for (let i = 0; i < 5; i++) expect(rangeBearing(LEG[5], after[i]).bearing).toBeCloseTo(rangeBearing(LEG[5], LEG[i]).bearing, 6);
    // A drag counts only as far as it goes along the leg.
    const sideways = travel(travel(LEG[5], 90, 2000), 0, 5000);
    expect(stretchFactor(LEG[0], LEG[5], sideways)).toBeCloseTo(1 + 2000 / rangeBearing(LEG[0], LEG[5]).metres, 2);
  });

  it("works far north and across the antimeridian", () => {
    for (const [start, course] of [
      [[20, 84], 60],
      [[179.7, -30], 80],
    ] as [LonLat, number][]) {
      const track = leg(start, course, 10);
      const after = sheared(track, TIMES, ALL, "start", travel(start, course + 30, 12 * KNOT * 3000));
      const made = legOf(after, TIMES, ALL);
      expect(made.course).toBeCloseTo((course + 30) % 360, 5);
      expect(made.speed / KNOT).toBeCloseTo(12, 5);
    }
  });

  it("needs fixes at two times, and places its handles on the period's ends", () => {
    expect(endsOf(TIMES, [3], "start")).toBeUndefined();
    expect(endsOf(TIMES, [1, 2, 3], "end")).toEqual([3, 1]);
    expect(endPlaces(BLUE, TIMES, [1, 2, 3])).toEqual({ start: BLUE[1], end: BLUE[3] });
    expect(endPlaces(BLUE, TIMES, [3])).toEqual({});
  });
});

describe("dragging an end", () => {
  it("a shear says the new course and speed and how far the end went, and sends the end's move", () => {
    const g = dragGesture(startGesture("end", LEG[5], "shear"), travel(LEG[5], 0, 1852), LEG[0]);
    const change = gestureChange(g, legTarget())!;
    expect(change.edit).toEqual({ action: "shear", anchor: "start", distance: { value: 1, unit: "[nmi_i]" }, bearing: { value: 0, unit: "deg" } });
    expect(change.positions[0]).toEqual(LEG[0]);
    expect(change.handle).toEqual(change.positions[5]);
    const made = legOf(change.positions, TIMES, ALL);
    expect(change.readout).toBe(`BLUE ONE: shearing to ${formatBearing({ value: made.course, unit: "deg" })} ${formatQuantity({ value: made.speed, unit: "m/s" })}; end moved 1.00 nmi 000.0°T`);
    expect(change.readout).toMatch(/^BLUE ONE: shearing to 0[78]\d\.\d°T 10\.\d kn; end/);
    expect(() => checkMessage({ kind: "edit_track", feature_id: "track-blue", track_edit: change.edit })).not.toThrow();
  });

  it("a shear from the start holds the end", () => {
    const g = dragGesture(startGesture("start", LEG[0], "shear"), travel(LEG[0], 180, 1852), LEG[0]);
    const change = gestureChange(g, legTarget())!;
    expect(change.edit).toMatchObject({ action: "shear", anchor: "end" });
    expect(change.positions[5]).toEqual(LEG[5]);
    expect(change.readout).toMatch(/; start moved 1\.00 nmi 180\.0°T$/);
  });

  it("a stretch says the new speed, takes only the drag along the leg, and sends the speed", () => {
    const along = travel(travel(LEG[5], 90, 1852 * 2), 0, 1852 * 3); // 2 nmi on, 3 nmi off to the side
    const change = gestureChange(dragGesture(startGesture("end", LEG[5], "stretch"), along, LEG[0]), legTarget())!;
    const was = legOf(LEG, TIMES, ALL).speed;
    const asked = Number(((rangeBearing(LEG[0], LEG[5]).metres + 1852 * 2) / 3000 / KNOT).toFixed(1));
    expect(change.edit).toEqual({ action: "stretch", anchor: "start", speed: { value: asked, unit: "[kn_i]" } });
    expect(change.readout).toBe(stretchReadout("BLUE ONE", asked * KNOT, was, false));
    expect(change.readout).toMatch(/^BLUE ONE: stretching to 12\.\d kn \(was 10\.0 kn\)$/);
    // Still on the leg's line.
    expect(rangeBearing(LEG[0], change.positions[5]).bearing).toBeCloseTo(rangeBearing(LEG[0], LEG[5]).bearing, 6);
    expect(() => checkMessage({ kind: "edit_track", feature_id: "track-blue", track_edit: change.edit })).not.toThrow();
  });

  it("a stretch never goes to nothing, and one to the speed shown changes nothing", () => {
    const back = gestureChange(dragGesture(startGesture("end", LEG[5], "stretch"), travel(LEG[0], 270, 5000), LEG[0]), legTarget())!;
    expect(back.edit.speed).toEqual({ value: 0.1, unit: "[kn_i]" });
    const none = gestureChange(dragGesture(startGesture("end", LEG[5], "stretch"), LEG[5], LEG[0]), legTarget())!;
    expect(none.unchanged).toBe(true);
  });

  it("only the fixes in the window change, and the readout says so", () => {
    const window = { start: "2026-10-11T09:10:00.000Z", end: "2026-10-11T09:30:00.000Z" };
    const g = dragGesture(startGesture("end", LEG[3], "shear"), travel(LEG[3], 0, 1000), LEG[0]);
    const change = gestureChange(g, legTarget({ indices: [1, 2, 3], part: true, period: window }))!;
    expect(change.edit.period).toEqual(window);
    expect(change.positions[0]).toEqual(LEG[0]);
    expect(change.positions[1]).toEqual(LEG[1]);
    expect(change.positions[4]).toEqual(LEG[4]);
    expect(change.readout).toMatch(/only the fixes in the time window change/);
  });
});

describe("the keyboard on an end", () => {
  it("moves a shear handle by pixels, as the move handle", () => {
    let g = startGesture("end", LEG[5], "shear");
    g = pressKey(g, "ArrowUp", false, SCREEN);
    g = pressKey(g, "ArrowUp", true, SCREEN);
    expect(g.at[1]).toBeCloseTo(LEG[5][1] + (6 * NUDGE_PX) / 1000, 9);
    expect(gestureChange(g, legTarget())!.edit.action).toBe("shear");
  });

  it("changes a stretch's speed by steps, from the speed shown; a run adds up", () => {
    let g = startGesture("end", LEG[5], "stretch");
    g = pressKey(g, "ArrowUp", false, SCREEN, 10);
    g = pressKey(g, "ArrowUp", true, SCREEN, 10);
    g = pressKey(g, "ArrowLeft", false, SCREEN, 10);
    expect(g.speed).toBe(11);
    expect(gestureChange(g, legTarget())!.edit.speed).toEqual({ value: 11, unit: "[kn_i]" });
    expect(pressKey(g, "Enter", false, SCREEN, 10)).toEqual(g);
    // Never below one step.
    for (let i = 0; i < 30; i++) g = pressKey(g, "ArrowDown", true, SCREEN, 10);
    expect(g.speed).toBe(0.1);
  });
});

describe("what the analyst types for a shear or a stretch", () => {
  it("reads a speed with its unit, or in the analyst's", () => {
    expect(readSpeed("12.4")).toEqual({ value: 12.4, unit: "[kn_i]" });
    expect(readSpeed("6 m/s")).toEqual({ value: 6, unit: "m/s" });
    expect(readSpeed("20 km/h")).toEqual({ value: 20, unit: "km/h" });
    expect(readSpeed("12 kts")).toEqual({ value: 12, unit: "[kn_i]" });
    expect(readSpeed("fast")).toHaveProperty("problem");
    expect(readSpeed("0", DEFAULT_SETTINGS, true)).toEqual({ problem: "A stretch needs a speed of more than nothing." });
    expect(describeSpeed({ value: 6, unit: "m/s" })).toBe("11.7 kn");
  });

  it("offers what the track makes good now", () => {
    expect(legNow(LEG, TIMES, ALL)).toEqual({ course: "090.0", speed: "10.0", said: "090.0°T 10.0 kn", moves: true });
    expect(legNow(LEG, TIMES, [2])).toBeUndefined();
  });

  it("the host refuses a shear or a stretch that says too little or too much", () => {
    const fixtures = path.resolve(__dirname, "../../../schemas/fixtures/webview_message");
    for (const name of ["edit-track-shear-without-anchor", "edit-track-shear-dragged-and-steered", "edit-track-stretch-with-course", "edit-track-stretch-to-no-speed", "edit-track-move-with-anchor"]) {
      const raw = JSON.parse(readFileSync(path.join(fixtures, "invalid", "semantic", `${name}.json`), "utf8"));
      expect(() => checkMessage(raw), name).toThrow();
    }
    for (const name of ["edit-track-shear-drag", "edit-track-shear-course-speed-period", "edit-track-stretch"]) {
      const raw = JSON.parse(readFileSync(path.join(fixtures, "valid", `${name}.json`), "utf8"));
      expect(() => checkMessage(raw), name).not.toThrow();
    }
  });
});
